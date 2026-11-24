import { Effect, Option, Schema } from 'effect';
import { developed } from '../../shared/develop.ts';
import { type Moment, Rating } from '../../shared/domain.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { type OpenShoot, readJson, writeJson } from '../../shared/store.ts';
// biome-ignore lint/correctness/noUnresolvedImports: Bun turns an imported page into a bundle to serve
import page from './page/index.html';

const Ratings = Schema.Array(Rating);

/** What the owner answers for one moment. */
const Answer = Schema.Struct({
  moment: Schema.String,
  best: Schema.NullOr(Schema.String),
  stars: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  further: Schema.Array(Schema.String),
});

/** Whether an answer fits its moment and doesn't contradict itself. */
const isPossible = (
  { best, stars, further }: typeof Answer.Type,
  { photos }: Moment,
) =>
  best === null
    ? stars === 0 && further.length === 0
    : stars > 0 &&
      new Set([best, ...further]).size === further.length + 1 &&
      [best, ...further].every((photo) => photos.includes(photo));

export const readRatings = Effect.fn('readRatings')(function* (
  open: OpenShoot,
) {
  return Option.getOrElse(
    yield* readJson(Ratings, open.files.ratings),
    (): ReadonlyArray<Rating> => [],
  );
});

const badRequest = 400;
const forbidden = 403;
const notFound = 404;
const noContent = 204;

/** Saves an answer, in place of an earlier one about the same moment. */
export const saveRating = Effect.fn('saveRating')(function* (
  open: OpenShoot,
  sample: ReadonlyArray<Moment>,
  body: unknown,
) {
  const answer = yield* Schema.decodeUnknownEffect(Answer)(body);
  const moment = sample.find(({ id }) => id === answer.moment);
  if (moment === undefined || !isPossible(answer, moment)) {
    return false;
  }
  const before = yield* readRatings(open);
  yield* writeJson(Ratings, open.files.ratings, [
    ...before.filter(({ moment: id }) => id !== moment.id),
    { ...answer, photos: moment.photos },
  ]);
  return true;
});

const fullQuality = 92;

/** A photo at full size, or its preview when the photo can't be read now. */
const fullSize = Effect.fn('fullSize')(function* (
  open: OpenShoot,
  photo: string,
) {
  const details = open.photos.get(photo);
  const picture =
    details === undefined
      ? undefined
      : yield* developed(open.shoot, details, { quality: fullQuality }).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        );
  return picture === undefined
    ? new Response(Bun.file(open.files.preview(photo)))
    : new Response(picture, { headers: { 'content-type': 'image/jpeg' } });
});

type Serving = {
  readonly open: OpenShoot;
  readonly sample: ReadonlyArray<Moment>;
  readonly port: number;
  /** Where else the page is reached, when something passes it on from there. */
  readonly address: URL | undefined;
};

type Answering = (request: Request) => Response | Promise<Response>;

/** Answers only what comes from the page itself. */
const toThePage =
  (address: URL | undefined, answering: Answering) =>
  (request: Request, server: { readonly port?: number | undefined }) => {
    const own = new URL(`http://127.0.0.1:${server.port}`);
    const places = address === undefined ? [own] : [own, address];
    const host = request.headers.get('host');
    const origin = request.headers.get('origin');
    return places.some(
      (place) =>
        place.host === host && (origin === null || origin === place.origin),
    )
      ? answering(request)
      : new Response(null, { status: forbidden });
  };

/**
 * Serves the rating page to this machine, and to whatever passes it on from
 * another address. Other websites can't read it, since it answers only under
 * those two.
 */
export const serveRatingPage = Effect.fn('serveRatingPage')(function* ({
  open,
  sample,
  port,
  address,
}: Serving) {
  const context = yield* Effect.context<
    | Effect.Services<ReturnType<typeof saveRating>>
    | Effect.Services<ReturnType<typeof fullSize>>
  >();
  const run = Effect.runPromiseWith(context);
  const shown = new Set(sample.flatMap(({ photos }) => photos));
  const ofPhoto = (
    answering: (photo: string) => Response | Promise<Response>,
  ) =>
    toThePage(address, (request) => {
      const photo = new URL(request.url).searchParams.get('photo') ?? '';
      return shown.has(photo)
        ? answering(photo)
        : new Response(null, { status: notFound });
    });
  const moments = async () =>
    Response.json({
      shoot: open.shoot.name,
      sample,
      ratings: await run(readRatings(open)),
    });
  const save = async (request: Request) => {
    const saved = await run(
      saveRating(open, sample, await request.json()).pipe(
        Effect.catchTag('SchemaError', () => Effect.succeed(false)),
      ),
    );
    return new Response(null, { status: saved ? noContent : badRequest });
  };
  return yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        Bun.serve({
          hostname: '127.0.0.1',
          port,
          routes: {
            '/': page,
            '/moments': toThePage(address, moments),
            // biome-ignore lint/style/useNamingConvention: Bun's name for the HTTP method
            '/ratings': { POST: toThePage(address, save) },
            '/previews': ofPhoto(
              (photo) => new Response(Bun.file(open.files.preview(photo))),
            ),
            '/full': ofPhoto((photo) => run(fullSize(open, photo))),
          },
        }),
      catch: () =>
        new InvalidInput({
          message: `Something else is using port ${port}. Leave out --port to use any free one.`,
        }),
    }),
    (server) => Effect.promise(() => server.stop(true)),
  );
});
