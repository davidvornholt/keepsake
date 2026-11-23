import { Effect, Option } from 'effect';
import { developed } from '../../shared/develop.ts';
import { type Box, type Moment, Verdict } from '../../shared/domain.ts';
import { ModelFailed } from '../../shared/errors/errors.ts';
import { rendered } from '../../shared/pictures.ts';
import { inSteps } from '../../shared/progress.ts';
import { type OpenShoot, writeJson } from '../../shared/store.ts';
import { verdictOn } from '../../shared/verdicts.ts';
import { type Piece, Vision } from '../../shared/vision.ts';
import { chunks } from './chunks.ts';
import { closeUpOf } from './close-up.ts';
import {
  Check,
  checkQuestion,
  closeUpName,
  frameName,
  introduction,
  Judgement,
  judgementQuestion,
  mostRanked,
  role,
  Shortlist,
  shortlistQuestion,
} from './questions.ts';

/** How many frames fit into one question. */
const mostFrames = 10;
const shortlistSize = 3;
const frameSide = 1024;
const closeUpSide = 1024;
const closeUpQuality = 90;
/** Close-ups decide only between frames that are good enough to keep. */
const checkedFrom = 5;
const concurrency = 6;

const lowestScore = 1;
const highestScore = 10;
const inRange = (score: number) =>
  Math.min(highestScore, Math.max(lowestScore, score));

/** The items a model's numbers, counted from 1, mean; each once. */
export const chosen = <A>(
  items: ReadonlyArray<A>,
  numbers: ReadonlyArray<number>,
): ReadonlyArray<A> =>
  [...new Set(numbers)].flatMap((number) => {
    const item = items[number - 1];
    return item === undefined ? [] : [item];
  });

const framesOf = Effect.fn('framesOf')(function* (
  open: OpenShoot,
  photos: ReadonlyArray<string>,
) {
  const pictures = yield* Effect.forEach(
    photos,
    (photo) => rendered(open.files.preview(photo), { longSide: frameSide }),
    { concurrency: 2 },
  );
  return pictures.flatMap(
    (picture, index): Array<Piece> => [frameName(index), picture],
  );
});

/** Narrows a long burst down until what is left fits into one question. */
const shortlist = Effect.fn('shortlist')(function* (
  open: OpenShoot,
  photos: ReadonlyArray<string>,
) {
  const vision = yield* Vision;
  let left = photos;
  while (left.length > mostFrames) {
    const rounds = yield* Effect.forEach(chunks(left, mostFrames), (group) =>
      Effect.gen(function* () {
        const answer = yield* vision.ask({
          role,
          name: 'shortlist',
          schema: Shortlist,
          pieces: [
            introduction(open.shoot, group.length),
            ...(yield* framesOf(open, group)),
            shortlistQuestion,
          ],
        });
        const best = chosen(group, answer.best).slice(0, shortlistSize);
        return best.length === 0 ? group.slice(0, shortlistSize) : best;
      }),
    );
    left = rounds.flat();
  }
  return left;
});

type Contender = { readonly photo: string; readonly focus: Box };

/** Each contender whole again, with a close-up from the full-size photo. */
const contenderPieces = Effect.fn('contenderPieces')(function* (
  open: OpenShoot,
  contenders: ReadonlyArray<Contender>,
) {
  const pieces = yield* Effect.forEach(
    contenders,
    ({ photo: id, focus }, index) =>
      Effect.gen(function* () {
        const photo = open.photos.get(id);
        if (photo === undefined) {
          return [];
        }
        const whole = yield* rendered(open.files.preview(id), {
          longSide: frameSide,
        });
        const closeUp = yield* developed(open.shoot, photo, {
          box: closeUpOf(focus),
          longSide: closeUpSide,
          quality: closeUpQuality,
        });
        return [
          frameName(index),
          whole,
          closeUpName(index),
          closeUp,
        ] satisfies Array<Piece>;
      }),
    { concurrency: 2 },
  );
  return pieces.flat();
});

/** What the model thinks of one moment. */
const judge = Effect.fn('judge')(function* (open: OpenShoot, moment: Moment) {
  const vision = yield* Vision;
  const candidates = yield* shortlist(open, moment.photos);
  const answer = yield* vision.ask({
    role,
    name: 'judgement',
    schema: Judgement,
    pieces: [
      introduction(open.shoot, candidates.length),
      ...(yield* framesOf(open, candidates)),
      judgementQuestion,
    ],
  });
  const contenders = answer.ranking
    .flatMap(({ frame, focus }): Array<Contender> => {
      const photo = candidates[frame - 1];
      return photo === undefined ? [] : [{ photo, focus }];
    })
    .filter(
      ({ photo }, index, all) =>
        all.findIndex((other) => other.photo === photo) === index,
    )
    .slice(0, mostRanked);
  const ranked = contenders.map(({ photo }) => photo);
  if (ranked.length === 0) {
    return yield* new ModelFailed({
      message: `${vision.model} chose no frame of ${moment.id}.`,
    });
  }
  const verdict: Verdict = {
    moment: moment.id,
    photos: moment.photos,
    model: vision.model,
    best: ranked,
    score: inRange(answer.score),
    subject: answer.subject,
    description: answer.description,
    reason: answer.reason,
  };
  if (ranked.length === 1 || answer.score < checkedFrom) {
    return verdict;
  }
  const check = yield* vision.ask({
    role,
    name: 'check',
    schema: Check,
    pieces: [
      introduction(open.shoot, ranked.length),
      ...(yield* contenderPieces(open, contenders)),
      checkQuestion(answer.score, answer.reason),
    ],
  });
  return {
    ...verdict,
    // A frame the second answer leaves out keeps its place at the end.
    best: [...new Set([...chosen(ranked, check.ranking), ...ranked])],
    score: inRange(check.score),
    reason: check.reason,
  };
});

/** Asks the model about the moments it hasn't judged yet. */
export const judgeMoments = Effect.fn('judgeMoments')(function* (
  open: OpenShoot,
  moments: ReadonlyArray<Moment>,
  again: boolean,
) {
  const { model } = yield* Vision;
  const outcomes = yield* inSteps('cull', moments, concurrency, (moment) =>
    Effect.gen(function* () {
      const before = yield* verdictOn(open, model, moment);
      if (Option.isSome(before) && !again) {
        return { verdict: before.value };
      }
      const verdict = yield* judge(open, moment);
      yield* writeJson(Verdict, open.files.verdict(model, moment.id), verdict);
      return { verdict };
    }).pipe(
      // One moment a model can't answer for doesn't stop the others.
      Effect.catchTag(['ModelFailed', 'ToolFailed'], ({ message }) =>
        Effect.succeed({ moment: moment.id, reason: message }),
      ),
    ),
  );
  const verdicts = outcomes.flatMap((outcome) =>
    'verdict' in outcome ? [outcome.verdict] : [],
  );
  const failed = outcomes.flatMap((outcome) =>
    'verdict' in outcome ? [] : [outcome],
  );
  const [first] = failed;
  if (verdicts.length === 0 && first !== undefined) {
    return yield* new ModelFailed({
      message: `No moment could be judged. The first problem: ${first.reason}`,
    });
  }
  return { verdicts, failed };
});

/** How many moments got each score, the highest first. */
export const scoreCounts = (verdicts: ReadonlyArray<Verdict>) =>
  Object.fromEntries(
    Array.from(
      { length: highestScore },
      (_, index) => highestScore - index,
    ).map((score) => [
      `score ${score}`,
      verdicts.filter((verdict) => verdict.score === score).length,
    ]),
  );

/** Finds the best frames of every moment and scores them. */
export const cull = Effect.fn('cull')(function* (
  open: OpenShoot,
  again: boolean,
) {
  const { model } = yield* Vision;
  const { verdicts, failed } = yield* judgeMoments(open, open.moments, again);
  return {
    shoot: open.shoot.name,
    model,
    moments: open.moments.length,
    scores: scoreCounts(verdicts),
    failed,
  };
});
