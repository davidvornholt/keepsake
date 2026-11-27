import { Effect, Schema, type Semaphore } from 'effect';
import { openShoot } from '../../shared/store.ts';
import type { Called, Caller } from './calls.ts';
import { readCarrying } from './carrying.ts';

// What the keepsake commands the runner starts print, and what it needs to
// carry out a step with one.

export const Edited = Schema.fromJsonString(
  Schema.Struct({
    keptFromCamera: Schema.Array(
      Schema.Struct({ photo: Schema.String, reason: Schema.String }),
    ),
    notDone: Schema.Array(
      Schema.Struct({ photo: Schema.String, what: Schema.String }),
    ),
    overBudget: Schema.Array(Schema.String),
    failed: Schema.Array(
      Schema.Struct({ photo: Schema.String, reason: Schema.String }),
    ),
    /** What a mark's edit left, which only an edit with an operation says. */
    finished: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({
          photo: Schema.String,
          digest: Schema.String,
          review: Schema.String,
        }),
      ),
    ),
  }),
);
export type Edited = typeof Edited.Type;

/** How long to wait while another command works on the shoot. */
export const busyFor = '2 seconds';

export type Doing = {
  readonly call: Caller;
  /** Held while the page changes something, so nothing changes in between. */
  readonly writing: Semaphore.Semaphore;
};

/** What a command printed, or why it failed in a way that stops it. */
export const editedIn = (called: Called) =>
  called.kind === 'failed'
    ? Effect.succeed<Edited | string>(called.message)
    : Schema.decodeUnknownEffect(Edited)(called.output.trim()).pipe(
        Effect.orElseSucceed(
          () => 'keepsake edit printed something unexpected.',
        ),
      );

/** What is noted about the shoot now. */
export const current = Effect.fn('current')(function* (name: string) {
  const open = yield* openShoot(name);
  const carrying = yield* readCarrying(open.files);
  return carrying === null ? null : { open, carrying };
});

export const isBusy = (called: Called) =>
  called.kind === 'failed' && called.tag === 'ShootBusy';
