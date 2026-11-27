// biome-ignore lint/nursery/noBunModules: keepsake runs only as a Bun binary, and flock(2) is only there through Bun's FFI.
import { dlopen, FFIType } from 'bun:ffi';
import {
  closeSync,
  fstatSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';
import { Context, type Duration, Effect, Option } from 'effect';
import { ShootBusy, StoreFailed } from './errors/errors.ts';
import type { ShootFiles } from './store.ts';

// The kernel holds the locks, with flock(2), so a lock can't be taken from a
// command that is still running, and it ends with the command however that
// ends. Node has no flock, so it comes from the C library.

// LOCK_EX | LOCK_NB of <sys/file.h>: alone, and without waiting for it.
const exclusiveAtOnce = 6;
const ownerOnly = 0o600;

let library: { readonly flock: (fd: number, how: number) => number } | null =
  null;

const flock = (fd: number, how: number) => {
  library ??= dlopen('libc.so.6', {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  }).symbols;
  return library.flock(fd, how);
};

/** How often a lock is opened again because it was removed meanwhile. */
const tries = 3;

/** The same file, not one of the same name that replaced it. */
const isStill = (fd: number, path: string) => {
  try {
    const held = fstatSync(fd);
    const there = statSync(path);
    return held.ino === there.ino && held.dev === there.dev;
  } catch {
    return false;
  }
};

/** Takes the lock on an open file, unless another holds it or it was removed. */
const holdOpen = (fd: number, path: string) => {
  if (flock(fd, exclusiveAtOnce) !== 0) {
    return 'held';
  }
  // The one who held it last removed it, so this one is nobody's lock.
  if (!isStill(fd, path)) {
    return 'removed';
  }
  ftruncateSync(fd, 0);
  writeSync(fd, `${process.pid}\n`);
  return 'taken';
};

/** Takes a lock unless another holds it, and gives its file. */
const tryToHold = (path: string): number | null => {
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < tries; attempt += 1) {
    // Made if it isn't there, and never emptied by opening it.
    const fd = openSync(path, 'a+', ownerOnly);
    let outcome: ReturnType<typeof holdOpen> | 'failed' = 'failed';
    try {
      outcome = holdOpen(fd, path);
    } finally {
      // Closing it lets the lock go, also when taking it failed half-way.
      if (outcome !== 'taken') {
        closeSync(fd);
      }
    }
    if (outcome === 'taken') {
      return fd;
    }
    if (outcome === 'held') {
      return null;
    }
  }
  return null;
};

/**
 * Removes the lock and lets it go, so no file of it stays. A file that
 * replaced it after something else removed it stays, since it is another's.
 */
const letGo = (path: string, fd: number) => {
  try {
    if (isStill(fd, path)) {
      unlinkSync(path);
    }
  } finally {
    closeSync(fd);
  }
};

const decimal = 10;

/** The process that holds a lock, if it said so already. */
const holderOf = (path: string) => {
  try {
    const holder = Number.parseInt(readFileSync(path, 'utf8'), decimal);
    return Number.isInteger(holder) ? ` (process ${holder})` : '';
  } catch {
    return '';
  }
};

/** The locks this fiber holds, so it can take one of them again. */
const Held = Context.Reference<ReadonlySet<string>>(
  '@keepsake/cli/shared/HeldLocks',
  { defaultValue: () => new Set() },
);

/** Runs the work while holding the lock, or gives none when another has it. */
const holding =
  (path: string) =>
  <A, E, R>(
    work: Effect.Effect<A, E, R>,
  ): Effect.Effect<Option.Option<A>, E | StoreFailed, R> =>
    Effect.gen(function* () {
      const held = yield* Held;
      if (held.has(path)) {
        return Option.some(yield* work);
      }
      return yield* Effect.acquireUseRelease(
        Effect.try({
          try: () => tryToHold(path),
          catch: (error) =>
            new StoreFailed({ message: `Could not use ${path}: ${error}` }),
        }),
        (fd) =>
          fd === null
            ? Effect.succeedNone
            : work.pipe(
                Effect.map(Option.some),
                Effect.provideService(Held, new Set([...held, path])),
              ),
        (fd) =>
          fd === null
            ? Effect.void
            : Effect.ignore(
                Effect.try({ try: () => letGo(path, fd), catch: String }),
              ),
      );
    });

const busy = (path: string) =>
  new ShootBusy({
    message: `Another keepsake command${holderOf(path)} is working on this shoot. Wait for it, or stop it.`,
  });

/** Runs a command that changes a shoot, while no other command does. */
export const exclusively =
  (files: ShootFiles) =>
  <A, E, R>(work: Effect.Effect<A, E, R>) =>
    holding(files.lock)(work).pipe(
      Effect.flatMap(
        Option.match({
          onSome: Effect.succeed,
          onNone: () => Effect.fail(busy(files.lock)),
        }),
      ),
    );

/** How long work on the album waits for other such work, which is short. */
const albumPause = '50 millis';
const albumTries = 600;

/**
 * How long a command waits for the page to change the choice, which may
 * take putting a photo or two into the album.
 */
const choicePause = '100 millis';
const choiceTries = 3000;

const waitingFor =
  (path: string, pause: Duration.Input, triesLeft: number, what: string) =>
  <A, E, R>(
    work: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | StoreFailed | ShootBusy, R> =>
    holding(path)(work).pipe(
      Effect.flatMap(
        Option.match({
          onSome: Effect.succeed,
          onNone: () =>
            triesLeft === 0
              ? Effect.fail(
                  new ShootBusy({
                    message: `Another keepsake command${holderOf(path)} has been changing ${what} of this shoot for long. Try again later.`,
                  }),
                )
              : Effect.andThen(
                  Effect.sleep(pause),
                  waitingFor(path, pause, triesLeft - 1, what)(work),
                ),
        }),
      ),
    );

/**
 * Runs work that reads or changes what keepsake knows of a shoot's album in
 * Immich, after other such work, so neither undoes what the other noted.
 */
export const withAlbum =
  (files: ShootFiles) =>
  <A, E, R>(work: Effect.Effect<A, E, R>) =>
    waitingFor(files.albumLock, albumPause, albumTries, 'the album')(work);

/**
 * Runs work that looks for the album of a name and makes it if there is none,
 * after other such work for the name, from any shoot.
 */
export const withAlbumName =
  (files: ShootFiles, key: string) =>
  <A, E, R>(work: Effect.Effect<A, E, R>) =>
    waitingFor(
      files.albumNameLock(key),
      albumPause,
      albumTries,
      'an album',
    )(work);

/** The same, or none when such work is going on now. */
export const withAlbumIfFree = (files: ShootFiles) => holding(files.albumLock);

/**
 * Runs work that changes which photos are chosen or in the album, after what
 * the page does to them, and keeps the page from changing them meanwhile.
 */
export const withChoice =
  (files: ShootFiles) =>
  <A, E, R>(work: Effect.Effect<A, E, R>) =>
    waitingFor(files.choiceLock, choicePause, choiceTries, 'the choice')(work);

/** The same, or none when such work is going on now. */
export const withChoiceIfFree = (files: ShootFiles) =>
  holding(files.choiceLock);

/**
 * Runs work that changes a photo's finished file, or publishes it, after
 * other such work on that photo. Work on other photos goes on meanwhile.
 */
export const withPhoto =
  (files: ShootFiles, photo: string) =>
  <A, E, R>(work: Effect.Effect<A, E, R>) =>
    waitingFor(
      files.photoLock(photo),
      choicePause,
      choiceTries,
      `the photo ${photo}`,
    )(work);
