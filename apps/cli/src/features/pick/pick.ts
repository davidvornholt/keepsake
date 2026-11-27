import { Effect, Option, Schema } from 'effect';
import {
  type LeftOut,
  Pick,
  PickList,
  type Verdict,
} from '../../shared/domain.ts';
import { StepMissing } from '../../shared/errors/errors.ts';
import { withChoice } from '../../shared/lock.ts';
import { inSteps } from '../../shared/progress.ts';
import { type OpenShoot, readJson, writeJson } from '../../shared/store.ts';
import { verdicts } from '../../shared/verdicts.ts';
import { Vision } from '../../shared/vision.ts';
import { askOnce, forgetAnswers } from './asked.ts';
import { withoutSameMotifs } from './motifs.ts';
import { bestOf } from './ranking.ts';

/** How many new photos one question asks about. */
const mostCandidates = 12;
/** How many photos kept just before are shown along. */
const shownBefore = 6;
const pictureSide = 640;

const role =
  'You put together the album of a private shoot from photos that already passed the first selection. Leave out a photo only when another one shows the same subject in the same way, so that nobody would want both. Photos of the same subject belong in the album together when they differ clearly in the pose, what the subject does, how close it is, the viewpoint, or the light.';

const Answer = Schema.Struct({
  leaveOut: Schema.Array(
    Schema.Struct({
      photo: Schema.Int,
      /** The number of the photo that shows the same better. */
      insteadOf: Schema.Int,
    }),
  ),
});

const question = (before: number, total: number) =>
  before === 0
    ? `Which of these ${total} photos, in the order they were taken, should be left out because another one of them shows the same and is better? Give the number of each photo to leave out, and of the one that stays instead. Leave out none if all of them belong in the album.`
    : `Photos 1 to ${before} are in the album already. Which of photos ${before + 1} to ${total}, in the order they were taken, should be left out because an earlier one, or another one of them that is better, shows the same? Give the number of each photo to leave out, and of the one that stays instead. Leave out none if all of them belong in the album.`;

/** The best photo of a moment and those that belong next to it, in order. */
const asPicks = (verdict: Verdict): ReadonlyArray<Pick> => {
  const { moment, photos, best, score, subject, description } = verdict;
  return best
    .slice(0, 1)
    .map((photo) => ({ photo, score, description }))
    .concat(verdict.further)
    .map((one) => ({ ...one, moment, subject }))
    .toSorted(
      (left, right) => photos.indexOf(left.photo) - photos.indexOf(right.photo),
    );
};

/**
 * The numbers, counted from 1, of the photos to leave out, each with that of
 * the photo that stays instead.
 */
export const leftOut = (
  answer: typeof Answer.Type,
  before: number,
  total: number,
): ReadonlyMap<number, number> => {
  const out = new Map<number, number>();
  for (const { photo, insteadOf } of answer.leaveOut) {
    const isCandidate = photo > before && photo <= total;
    const stays =
      insteadOf >= 1 &&
      insteadOf <= total &&
      insteadOf !== photo &&
      !out.has(insteadOf);
    // Two photos that are each left out for the other would both be lost.
    if (isCandidate && stays) {
      out.set(photo, insteadOf);
    }
  }
  return out;
};

const withoutRepeats = Effect.fn('withoutRepeats')(function* (
  open: OpenShoot,
  candidates: ReadonlyArray<Pick>,
) {
  const kept: Array<Pick> = [];
  const repeats: Array<LeftOut> = [];
  const rounds = Array.from(
    { length: Math.ceil(candidates.length / mostCandidates) },
    (_, index) =>
      candidates.slice(index * mostCandidates, (index + 1) * mostCandidates),
  );
  // One after the other, since each looks at what the one before kept.
  yield* inSteps('pick', rounds, 1, (round) =>
    Effect.gen(function* () {
      const before = kept.slice(-shownBefore);
      const shown = [...before, ...round];
      if (shown.length < 2) {
        kept.push(...round);
        return;
      }
      const answer = yield* askOnce(open, {
        role,
        name: 'album',
        schema: Answer,
        pieces: [
          ...shown.flatMap(({ photo, score }, index) => [
            `Photo ${index + 1}, score ${score}:`,
            { photo, longSide: pictureSide },
          ]),
          question(before.length, shown.length),
        ],
      });
      const out = leftOut(answer, before.length, shown.length);
      for (const [index, candidate] of round.entries()) {
        const insteadOf = out.get(before.length + index + 1);
        if (insteadOf === undefined) {
          kept.push(candidate);
        } else {
          repeats.push({
            photo: candidate.photo,
            insteadOf: shown[insteadOf - 1]?.photo ?? null,
          });
        }
      }
    }),
  );
  return { kept, repeats };
});

type PickOptions = {
  readonly minimumScore: number;
  readonly maximum: Option.Option<number>;
  /** Asks about repeats again even when nothing changed. */
  readonly again: boolean;
};

const samePhotos = Schema.toEquivalence(Schema.Array(Pick));

const pickNow = Effect.fn('pick')(function* (
  open: OpenShoot,
  options: PickOptions,
) {
  const { model } = yield* Vision;
  const { name } = open.shoot;
  if (options.again) {
    // Starting over means not taking the answers of a pick that stopped.
    yield* forgetAnswers(open);
  }
  const judged = yield* verdicts(open, model);
  if (judged.length === 0) {
    return yield* new StepMissing({
      message: `${model} has judged no photos of ${name} yet. Run \`keepsake cull ${name}\` first.`,
    });
  }
  const candidates = judged
    .flatMap(asPicks)
    .filter(({ score }) => score >= options.minimumScore);
  const maximum = Option.getOrNull(options.maximum);
  const before = yield* readJson(PickList, open.files.picks);
  const isSame =
    Option.isSome(before) &&
    !options.again &&
    before.value.model === model &&
    before.value.minimumScore === options.minimumScore &&
    before.value.maximum === maximum &&
    samePhotos(before.value.candidates, candidates);
  const list = isSame
    ? before.value
    : yield* Effect.gen(function* () {
        const first = yield* withoutRepeats(open, candidates);
        const { kept, repeats } = yield* withoutSameMotifs(open, first.kept);
        const picks =
          maximum === null ? kept : yield* bestOf(open, kept, maximum);
        const noRoom = kept
          .filter((one) => !picks.includes(one))
          .map(({ photo }): LeftOut => ({ photo, insteadOf: null }));
        return {
          model,
          minimumScore: options.minimumScore,
          maximum,
          candidates,
          picks,
          leftOut: [...first.repeats, ...repeats, ...noRoom],
        };
      });
  yield* writeJson(PickList, open.files.picks, list);
  yield* forgetAnswers(open);
  return {
    shoot: name,
    candidates: candidates.length,
    repeats: list.leftOut.filter(({ insteadOf }) => insteadOf !== null).length,
    noRoom: list.leftOut.filter(({ insteadOf }) => insteadOf === null).length,
    picked: list.picks.length,
    notJudged: open.moments.length - judged.length,
  };
});

/**
 * Chooses the photos worth editing. The owner's choices on the page wait
 * meanwhile, since this one replaces the choice.
 */
export const pick = (open: OpenShoot, options: PickOptions) =>
  pickNow(open, options).pipe(withChoice(open.files));
