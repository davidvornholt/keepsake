import { Effect, Schema } from 'effect';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { RatingAnswer, saveRating } from '../../shared/ratings.ts';
import { openShoot } from '../../shared/store.ts';
import { pictureWidths } from './contract.ts';
import { saveLabels } from './labels.ts';
import { handOver, makeMark, seeMark, takeBack } from './marks.ts';
import { fullSize, smaller } from './pictures.ts';
import { NewLabels, NewMark } from './schemas.ts';
import type { Shoots } from './shoots.ts';

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
  const { json, revision } = yield* shoots.view(name);
  const etag = `"${revision}"`;
  const headers = {
    etag,
    'cache-control': 'private, no-cache',
    'content-type': 'application/json',
    'content-encoding': 'gzip',
  };
  return request.headers.get('if-none-match') === etag
    ? new Response(null, { status: 304, headers })
    : new Response(json, { headers });
});

type Named = {
  readonly shoot: string;
  readonly photo: string;
  readonly kind: string;
};

/** A picture in full size, or a smaller copy of it. */
const pictureAnswer = Effect.fn('pictureAnswer')(function* (
  shoots: Shoots,
  { shoot, photo, kind }: Named,
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
  const headers = { 'cache-control': isStandIn ? 'no-store' : forever };
  return typeof found === 'string'
    ? new Response(Bun.file(found), { headers })
    : new Response(found, {
        headers: { ...headers, 'content-type': 'image/jpeg' },
      });
});

/** What the server answers to the page. */
export const makeAnswers = (shoots: Shoots) => ({
  list: Effect.map(shoots.list, (list) => Response.json(list)),
  shoot: (name: string, request: Request) => shootAnswer(shoots, name, request),
  picture: (named: Named, request: Request) =>
    pictureAnswer(shoots, named, request),
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
  handOver: (name: string) =>
    Effect.gen(function* () {
      return Response.json(yield* handOver((yield* openShoot(name)).files));
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
