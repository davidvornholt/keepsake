import process from 'node:process';
import { Effect, type FileSystem, type Path, Semaphore } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { asTheOnlyServer } from '../../shared/lock.ts';
import { serverLock } from '../../shared/store.ts';
import { type Has, makeAnswers } from './answers.ts';
import { eventsOf } from './events.ts';
import { makeFolders } from './folders.ts';
import { removeForgotten } from './new-shoot.ts';
// biome-ignore lint/correctness/noUnresolvedImports: Bun turns an imported page into a bundle to serve
import page from './page/index.html';
import { makePreparations } from './preparation.ts';
import type { Publishing } from './publishing.ts';
import { makeRunner } from './runner.ts';
import { makeSettling } from './settling.ts';
import { makeShoots } from './shoots.ts';

const badRequest = 400;
const forbidden = 403;
const notFound = 404;
const conflict = 409;
const failed = 500;

/** How many pictures are made smaller at once. */
const atOnce = 6;

/** How long an answer may take, in seconds: the pictures are new at first. */
const patience = 240;

type Serving = {
  readonly port: number;
  /** Where else the page is reached, when something passes it on from there. */
  readonly address: URL | undefined;
  /** The folders that the owner's photos are in, to make albums of. */
  readonly photos: ReadonlyArray<string>;
  /** How keepsake itself is started. */
  readonly keepsake: ReadonlyArray<string>;
};

type Needed =
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | Publishing;

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

/** Whether the server couldn't listen because the address is taken. */
const isInUse = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'EADDRINUSE';

const statuses = new Map([
  ['InvalidInput', badRequest],
  ['StepMissing', notFound],
  ['Outdated', conflict],
]);

const failure = ({ _tag, message }: Failure) =>
  Response.json({ error: message }, { status: statuses.get(_tag) ?? failed });

const routesOf = Effect.fn('routesOf')(function* (
  has: Has,
  address: URL | undefined,
  writing: Semaphore.Semaphore,
) {
  const { shoots } = has;
  const answers = makeAnswers(has);
  const run = Effect.runPromiseWith(yield* Effect.context<Needed>());
  const answer = (work: Effect.Effect<Response, Failure, Needed>) =>
    run(work.pipe(Effect.catch((error) => Effect.succeed(failure(error)))));
  const change = (work: Effect.Effect<Response, Failure, Needed>) =>
    answer(writing.withPermits(1)(work));
  const ours = toThePage(address);
  // biome-ignore-start lint/style/useNamingConvention: Bun's names for the HTTP methods
  return {
    '/api/folders': { GET: ours(() => answer(answers.folders)) },
    '/api/folders/look': {
      GET: ours((request) => answer(answers.look(request))),
    },
    '/api/shoots': {
      GET: ours(() => answer(answers.list)),
      POST: ours((request) => change(answers.newShoot(request))),
    },
    '/api/shoots/:shoot': {
      GET: ours<'/api/shoots/:shoot'>((request) =>
        answer(answers.shoot(request.params.shoot, request)),
      ),
      DELETE: ours<'/api/shoots/:shoot'>(({ params }) =>
        change(answers.forget(params.shoot)),
      ),
    },
    '/api/shoots/:shoot/prepare': {
      POST: ours<'/api/shoots/:shoot/prepare'>(({ params }) =>
        change(answers.prepare(params.shoot)),
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
    '/api/shoots/:shoot/seen': {
      POST: ours<'/api/shoots/:shoot/seen'>((request) =>
        change(answers.seen(request.params.shoot, request)),
      ),
    },
    '/api/shoots/:shoot/choices': {
      POST: ours<'/api/shoots/:shoot/choices'>((request) =>
        change(answers.choose(request.params.shoot, request)),
      ),
    },
    '/api/shoots/:shoot/choices/:action': {
      DELETE: ours<'/api/shoots/:shoot/choices/:action'>(({ params }) =>
        change(answers.dismiss(params.shoot, params.action)),
      ),
    },
    '/api/shoots/:shoot/hand-over': {
      POST: ours<'/api/shoots/:shoot/hand-over'>((request) =>
        change(answers.handOver(request.params.shoot, request)),
      ),
    },
    '/api/shoots/:shoot/go-on': {
      POST: ours<'/api/shoots/:shoot/go-on'>((request) =>
        change(answers.goOn(request.params.shoot, request)),
      ),
    },
    '/api/shoots/:shoot/favorites': {
      PUT: ours<'/api/shoots/:shoot/favorites'>((request) =>
        change(answers.favorite(request.params.shoot, request)),
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
  photos,
  keepsake,
}: Serving) {
  // Before anything is resumed, so a second server changes nothing.
  yield* asTheOnlyServer(yield* serverLock);
  const workers = yield* Semaphore.make(atOnce);
  // One change at a time, since some read a file and write it again.
  const writing = yield* Semaphore.make(1);
  const runner = yield* makeRunner(keepsake, writing);
  const shoots = yield* makeShoots(runner.isWorking, workers);
  const preparations = yield* makePreparations(keepsake);
  const folders = yield* makeFolders(photos);
  const settling = yield* makeSettling(writing);
  const routes = yield* routesOf(
    { shoots, folders, preparations, settling, workers, runner },
    address,
    writing,
  );
  yield* removeForgotten;
  yield* Effect.forkScoped(shoots.prepare);
  yield* preparations.resume;
  yield* settling.resume;
  yield* runner.resume;
  return yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        Bun.serve({
          hostname: '127.0.0.1',
          port,
          idleTimeout: patience,
          // Out of development, Bun would share a port that is in use.
          reusePort: false,
          // The page reloads while it is being worked on. Not in tests,
          // which serve it often: Bun keeps each server's file watchers.
          development: !['production', 'test'].includes(
            // biome-ignore lint/style/noProcessEnv: the build puts its value here, so the binary needs no environment
            process.env.NODE_ENV ?? '',
          ),
          routes,
        }),
      catch: (error) =>
        new InvalidInput({
          message: isInUse(error)
            ? `Something else is using port ${port}. Leave out --port to use any free one.`
            : `The page couldn’t be served: ${error instanceof Error ? error.message : String(error)}`,
        }),
    }),
    (server) => Effect.promise(() => server.stop(true)),
  );
});
