import { DateTime, Effect, FileSystem, Option, Schema } from 'effect';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { isHeld } from '../../shared/lock.ts';
import { readJson, type ShootFiles, writeJson } from '../../shared/store.ts';
import type { CarryingOut } from './contract.ts';
import type { HandOverRecord } from './schemas.ts';

// How the page's server carries out what the owner handed over, written down
// as it goes, so that a server started later goes on where it stopped and
// nothing is paid for twice.

/** What can't go on without the owner. */
const Stop = Schema.Struct({
  /** Which stop it is, so the owner's word to go on counts once. */
  id: Schema.String,
  at: Schema.String,
  /** What it waits for, in a sentence for the owner. */
  reason: Schema.String,
  /** More money, or only the owner's word to try again. */
  needs: Schema.Literals(['money', 'retry']),
  /** The hand-over it stopped at, or '' for all of them. */
  handOver: Schema.String,
  /** The photos it is about. */
  photos: Schema.Array(Schema.String),
  /** When the owner looked at it. */
  seenAt: Schema.NullOr(Schema.String),
});
export type Stop = typeof Stop.Type;

/** How far a mark got, until it is answered. */
const Progress = Schema.Struct({
  /**
   * The id of the edit it is given, under which the edit notes what it came
   * to, so an edit that ended before the server noted it isn't paid again.
   * Null once that was noted.
   */
  operation: Schema.NullOr(Schema.String),
  /** Which file the finished photo was before the change, if it had one. */
  before: Schema.NullOr(Schema.String),
  /** What came of the edit, once it ended. */
  edited: Schema.NullOr(
    Schema.Struct({ changed: Schema.Boolean, note: Schema.String }),
  ),
  published: Schema.Boolean,
});
export type Progress = typeof Progress.Type;

const Carrying = Schema.Struct({
  since: Schema.String,
  stopped: Schema.NullOr(Stop),
  marks: Schema.Record(Schema.String, Progress),
  /** Whether the album changed since `explain` last ran. */
  toExplain: Schema.Boolean,
});
export type Carrying = typeof Carrying.Type;

const storeFailed = (error: { readonly message: string }) =>
  new StoreFailed({
    message: `Could not note how the hand-overs go: ${error.message}`,
  });

export const readCarrying = (files: ShootFiles) =>
  Effect.map(readJson(Carrying, files.carrying), Option.getOrNull);

export const saveCarrying = (files: ShootFiles, carrying: Carrying) =>
  writeJson(Carrying, files.carrying, carrying);

/** Forgets it, once nothing is left to carry out. */
export const endCarrying = Effect.fn('endCarrying')(function* (
  files: ShootFiles,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .remove(files.carrying, { force: true })
    .pipe(Effect.mapError(storeFailed));
});

const idLength = 8;

/** A new id for a stop or an edit. */
export const newId = () =>
  crypto.randomUUID().replaceAll('-', '').slice(0, idLength);

/** Carrying out from the start. */
export const beginning = Effect.map(
  DateTime.now,
  (now): Carrying => ({
    since: DateTime.formatIso(now),
    stopped: null,
    marks: {},
    toExplain: false,
  }),
);

/** Whether a stop is about something still to be done. */
export const isAbout = (
  { handOver }: Stop,
  unsettled: ReadonlyArray<HandOverRecord>,
) =>
  handOver === ''
    ? unsettled.length > 0
    : unsettled.some(({ id }) => id === handOver);

/** The id of what waits for the owner when nothing works on it and nothing says why. */
export const nobodyId = 'nobody';

const nobody =
  'Nothing works on what you handed over now. Go on, and keepsake picks it up where it stopped.';

/**
 * How what was handed over goes, as the page shows it: whether a server
 * holds the shoot's runner lock and works on it now, which `isWorking` says
 * for this server, and what waits for the owner. What is still to be done
 * while nothing works on it and nothing says why waits for the owner too, so
 * the page never says it is being done.
 */
export const carryingOf = Effect.fn('carryingOf')(function* (
  files: ShootFiles,
  unsettled: ReadonlyArray<HandOverRecord>,
  isWorking: boolean,
) {
  const carrying = yield* readCarrying(files);
  const working = isWorking || (yield* isHeld(files.runnerLock));
  const stop = carrying?.stopped ?? null;
  const stopped = stop !== null && isAbout(stop, unsettled) ? stop : null;
  const [first] = unsettled;
  if (working && stopped === null && first !== undefined) {
    return {
      since: carrying?.since ?? first.at,
      stopped: null,
    } satisfies CarryingOut;
  }
  if (stopped !== null || first === undefined) {
    return {
      since: null,
      stopped:
        stopped === null
          ? null
          : {
              id: stopped.id,
              at: stopped.at,
              reason: stopped.reason,
              needs: stopped.needs,
              photos: stopped.photos,
              seenAt: stopped.seenAt,
            },
    } satisfies CarryingOut;
  }
  return {
    since: null,
    stopped: {
      id: nobodyId,
      at: first.at,
      reason: nobody,
      needs: 'retry',
      photos: [],
      seenAt: null,
    },
  } satisfies CarryingOut;
});
