import { Effect, Option, Schema, type Semaphore } from 'effect';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { judgeOf } from '../../shared/judge.ts';
import { RatingAnswer, saveRating } from '../../shared/ratings.ts';
import { standings } from '../../shared/standing.ts';
import { type OpenShoot, openShoot } from '../../shared/store.ts';
import { startAgent } from './agent.ts';
import { pictureWidths } from './contract.ts';
import { setFavorite } from './favorites.ts';
import { type Folders, lookAtFolder } from './folders.ts';
import { claimUnsettled, handOver } from './hand-over.ts';
import { release } from './handed.ts';
import { saveLabels } from './labels.ts';
import { makeMark, seeMark, takeBack } from './marks.ts';
import { forgetShoot, makeShoot } from './new-shoot.ts';
import { fullSize, isCurrent, smaller } from './pictures.ts';
import type { Preparations } from './preparation.ts';
import { Favorite, HandOver, NewLabels, NewMark, NewShoot } from './schemas.ts';
import type { Shoots } from './shoots.ts';
import { agentWaitsSince } from './waiting.ts';

const noContent = 204;
const notFound = 404;

const forever = 'private, max-age=31536000, immutable';

const nothing = () => new Response(null, { status: noContent });

/** What the page sent. */
const sent = <S extends Schema.Constraint>(schema: S, request: Request) =>
  Effect.tryPromise(() => request.json()).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError(
      () =>
        new InvalidInput({ message: 'The page sent something unexpected.' }),
    ),
  );

/** Everything about a shoot, unless the browser has it already. */
const shootAnswer = Effect.fn('shootAnswer')(function* (
  shoots: Shoots,
  name: string,
  request: Request,
) {
  const view = yield* shoots.view(name);
  const etag = `"${view.etag}"`;
  const headers = {
    etag,
    'cache-control': 'private, no-cache',
    'content-type': 'application/json',
    'content-encoding': 'gzip',
  };
  return request.headers.get('if-none-match') === etag
    ? new Response(null, { status: 304, headers })
    : new Response(view.json, { headers });
});

type Named = {
  readonly shoot: string;
  readonly photo: string;
  readonly kind: string;
  readonly version: string;
};

/** A picture in full size, or a smaller copy of it. */
const pictureAnswer = Effect.fn('pictureAnswer')(function* (
  shoots: Shoots,
  { shoot, photo, kind, version }: Named,
  request: Request,
) {
  const gallery = yield* shoots.galleryOf(shoot);
  const asked = Number(new URL(request.url).searchParams.get('width'));
  const width = pictureWidths.find((one) => one === asked);
  const isKnown = gallery.open.photos.has(photo);
  const found = isKnown
    ? yield* width === undefined
        ? fullSize(gallery, photo, kind)
        : smaller(gallery, photo, kind, width)
    : undefined;
  if (found === undefined) {
    return new Response(null, { status: notFound });
  }
  // Stands in for a photo that can't be read now, so it isn't kept.
  const isStandIn =
    width === undefined && kind === 'preview' && typeof found === 'string';
  // A newer picture took the place of the one asked for, so it isn't kept
  // under the old one's address.
  const isOther = !(yield* isCurrent(gallery, photo, kind, version));
  const headers = {
    'cache-control': isStandIn || isOther ? 'no-store' : forever,
  };
  return typeof found === 'string'
    ? new Response(Bun.file(found), { headers })
    : new Response(found, {
        headers: { ...headers, 'content-type': 'image/jpeg' },
      });
});

/** What the answers need. */
export type Has = {
  readonly shoots: Shoots;
  readonly folders: Folders;
  readonly preparations: Preparations;
  readonly workers: Semaphore.Semaphore;
  /** The program that starts an agent, if there is one. */
  readonly agent: string | undefined;
};

const standingsOf = (open: OpenShoot) =>
  Effect.flatMap(judgeOf(open, Option.none()), (model) =>
    standings(open, model),
  );

/**
 * Starts an agent for what is handed over, unless one waits for it or took it
 * already.
 */
const callAgent = Effect.fn('callAgent')(function* (
  open: OpenShoot,
  program: string,
) {
  const { files, shoot } = open;
  if ((yield* agentWaitsSince(files)) !== null) {
    return;
  }
  const taken = yield* claimUnsettled(files, yield* standingsOf(open), 'page');
  if (taken.length > 0) {
    const giveBack = Effect.forEach(taken, (id) => release(files, id), {
      discard: true,
    });
    yield* startAgent(
      files,
      { name: shoot.name, handOvers: taken, program },
      giveBack,
    );
  }
});

/** Hands everything over, and has an agent act on it. */
const handOverAnswer = Effect.fn('handOverAnswer')(function* (
  { agent }: Has,
  name: string,
  request: Request,
) {
  const open = yield* openShoot(name);
  const { files } = open;
  const wanted = yield* sent(HandOver, request);
  const handed = yield* handOver(files, yield* standingsOf(open), wanted);
  if (agent !== undefined) {
    yield* callAgent(open, agent);
  }
  return Response.json(handed);
});

/** Has an agent act on what was handed over before. */
const agentAnswer = Effect.fn('agentAnswer')(function* (
  { agent }: Has,
  name: string,
) {
  const open = yield* openShoot(name);
  if (agent === undefined) {
    return yield* new InvalidInput({
      message: 'No agent can be started from here.',
    });
  }
  yield* callAgent(open, agent);
  return nothing();
});

/** Starts getting an album ready from a folder. */
const newShootAnswer = Effect.fn('newShootAnswer')(function* (
  { folders, preparations }: Has,
  request: Request,
) {
  const wanted = yield* sent(NewShoot, request);
  yield* folders.at(wanted.folder);
  const name = yield* makeShoot(wanted);
  yield* preparations.start(name);
  return Response.json({ name });
});

const lookAnswer = Effect.fn('lookAnswer')(function* (
  { folders, workers }: Has,
  request: Request,
) {
  const path = new URL(request.url).searchParams.get('path') ?? '';
  const look = yield* lookAtFolder(yield* folders.at(path), workers);
  return Response.json(look, { headers: { 'cache-control': 'no-store' } });
});

/** What the server answers to the page. */
export const makeAnswers = (has: Has) => ({
  list: Effect.map(has.shoots.list, (list) => Response.json(list)),
  folders: Effect.gen(function* () {
    const shoots = yield* has.shoots.all;
    return Response.json(yield* has.folders.list(shoots));
  }),
  look: (request: Request) => lookAnswer(has, request),
  newShoot: (request: Request) => newShootAnswer(has, request),
  prepare: (name: string) =>
    Effect.gen(function* () {
      yield* has.preparations.start(name);
      return nothing();
    }),
  forget: (name: string) =>
    Effect.gen(function* () {
      yield* has.preparations.stop(name);
      yield* forgetShoot(name);
      yield* has.shoots.forget(name);
      return nothing();
    }),
  shoot: (name: string, request: Request) =>
    shootAnswer(has.shoots, name, request),
  picture: (named: Named, request: Request) =>
    pictureAnswer(has.shoots, named, request),
  mark: (name: string, request: Request) =>
    Effect.gen(function* () {
      const wanted = yield* sent(NewMark, request);
      return Response.json(yield* makeMark(yield* openShoot(name), wanted));
    }),
  takeBack: (name: string, mark: string) =>
    Effect.gen(function* () {
      yield* takeBack((yield* openShoot(name)).files, mark);
      return nothing();
    }),
  seen: (name: string, mark: string) =>
    Effect.gen(function* () {
      yield* seeMark((yield* openShoot(name)).files, mark);
      return nothing();
    }),
  handOver: (name: string, request: Request) =>
    handOverAnswer(has, name, request),
  agent: (name: string) => agentAnswer(has, name),
  favorite: (name: string, request: Request) =>
    Effect.gen(function* () {
      const wanted = yield* sent(Favorite, request);
      yield* setFavorite(yield* openShoot(name), wanted);
      return nothing();
    }),
  labels: (name: string, request: Request) =>
    Effect.gen(function* () {
      const wanted = yield* sent(NewLabels, request);
      yield* saveLabels(yield* openShoot(name), wanted);
      return nothing();
    }),
  rating: (name: string, request: Request) =>
    Effect.gen(function* () {
      const answer = yield* sent(RatingAnswer, request);
      yield* saveRating(yield* openShoot(name), answer);
      return nothing();
    }),
});
export type Answers = ReturnType<typeof makeAnswers>;
