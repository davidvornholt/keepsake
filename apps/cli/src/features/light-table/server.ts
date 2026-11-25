import process from 'node:process';
import { Effect, type FileSystem, type Path, Semaphore } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { makeAnswers } from './answers.ts';
import { eventsOf } from './events.ts';
// biome-ignore lint/correctness/noUnresolvedImports: Bun turns an imported page into a bundle to serve
import page from './page/index.html';
import { makeShoots, type Shoots } from './shoots.ts';

const badRequest = 400;
const forbidden = 403;
const notFound = 404;
const failed = 500;

/** How long an answer may take, in seconds: the pictures are new at first. */
const patience = 240;

type Serving = {
  readonly port: number;
  /** Where else the page is reached, when something passes it on from there. */
  readonly address: URL | undefined;
};

type Needed =
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner;

type Failure = { readonly _tag: string; readonly message: string };

type Answering<Route extends string> = (
  request: Bun.BunRequest<Route>,
  server: Bun.Server<undefined>,
) => Response | Promise<Response>;

/** Answers only what comes from the page itself. */
const toThePage =
  (address: URL | undefined) =>
  <Route extends string>(answering: Answering<Route>): Answering<Route> =>
  (request, server) => {
    const own = new URL(`http://127.0.0.1:${server.port}`);
    const places = address === undefined ? [own] : [own, address];
    const host = request.headers.get('host');
    const origin = request.headers.get('origin');
    return places.some(
      (place) =>
        place.host === host && (origin === null || origin === place.origin),
    )
      ? answering(request, server)
      : new Response(null, { status: forbidden });
  };

const statuses = new Map([
  ['InvalidInput', badRequest],
  ['StepMissing', notFound],
]);

const failure = ({ _tag, message }: Failure) =>
  Response.json({ error: message }, { status: statuses.get(_tag) ?? failed });

const routesOf = Effect.fn('routesOf')(function* (
  shoots: Shoots,
  address: URL | undefined,
) {
  const answers = makeAnswers(shoots);
  const run = Effect.runPromiseWith(yield* Effect.context<Needed>());
  // One change at a time, since some read a file and write it again.
  const writing = yield* Semaphore.make(1);
  const answer = (work: Effect.Effect<Response, Failure, Needed>) =>
    run(work.pipe(Effect.catch((error) => Effect.succeed(failure(error)))));
  const change = (work: Effect.Effect<Response, Failure, Needed>) =>
    answer(writing.withPermits(1)(work));
  const ours = toThePage(address);
  // biome-ignore-start lint/style/useNamingConvention: Bun's names for the HTTP methods
  return {
    '/api/shoots': { GET: ours(() => answer(answers.list)) },
    '/api/shoots/:shoot': {
      GET: ours<'/api/shoots/:shoot'>((request) =>
        answer(answers.shoot(request.params.shoot, request)),
      ),
    },
    '/api/shoots/:shoot/events': {
      GET: ours<'/api/shoots/:shoot/events'>((request, server) => {
        server.timeout(request, 0);
        const { shoot } = request.params;
        return eventsOf(() => run(shoots.changed(shoot)), request.signal);
      }),
    },
    '/api/shoots/:shoot/marks': {
      PUT: ours<'/api/shoots/:shoot/marks'>((request) =>
        change(answers.mark(request.params.shoot, request)),
      ),
    },
    '/api/shoots/:shoot/marks/:mark': {
      DELETE: ours<'/api/shoots/:shoot/marks/:mark'>(({ params }) =>
        change(answers.takeBack(params.shoot, params.mark)),
      ),
    },
    '/api/shoots/:shoot/marks/:mark/seen': {
      POST: ours<'/api/shoots/:shoot/marks/:mark/seen'>(({ params }) =>
        change(answers.seen(params.shoot, params.mark)),
      ),
    },
    '/api/shoots/:shoot/hand-over': {
      POST: ours<'/api/shoots/:shoot/hand-over'>(({ params }) =>
        change(answers.handOver(params.shoot)),
      ),
    },
    '/api/shoots/:shoot/labels': {
      PUT: ours<'/api/shoots/:shoot/labels'>((request) =>
        change(answers.labels(request.params.shoot, request)),
      ),
    },
    '/api/shoots/:shoot/ratings': {
      POST: ours<'/api/shoots/:shoot/ratings'>((request) =>
        change(answers.rating(request.params.shoot, request)),
      ),
    },
    '/pictures/:shoot/:photo/:kind/:version': {
      GET: ours<'/pictures/:shoot/:photo/:kind/:version'>((request) =>
        answer(answers.picture(request.params, request)),
      ),
    },
    '/api/*': new Response(null, { status: notFound }),
    '/*': page,
  };
  // biome-ignore-end lint/style/useNamingConvention: Bun's names for the HTTP methods
});

/**
 * Serves the page to this machine, and to whatever passes it on from another
 * address. Other websites can't read it, since it answers only under those two.
 */
export const serveLightTable = Effect.fn('serveLightTable')(function* ({
  port,
  address,
}: Serving) {
  const shoots = yield* makeShoots();
  const routes = yield* routesOf(shoots, address);
  yield* Effect.forkScoped(shoots.prepare);
  return yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        Bun.serve({
          hostname: '127.0.0.1',
          port,
          idleTimeout: patience,
          // The page reloads while it is being worked on.
          // biome-ignore lint/style/noProcessEnv: the build puts its value here, so the binary needs no environment
          development: process.env.NODE_ENV !== 'production',
          routes,
        }),
      catch: () =>
        new InvalidInput({
          message: `Something else is using port ${port}. Leave out --port to use any free one.`,
        }),
    }),
    (server) => Effect.promise(() => server.stop(true)),
  );
});
