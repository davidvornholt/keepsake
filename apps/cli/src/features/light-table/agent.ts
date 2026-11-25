import { DateTime, Effect, Option, Schema } from 'effect';
import { readJson, type ShootFiles, writeJson } from '../../shared/store.ts';
import { toolText } from '../../shared/tools.ts';
import type { Agent } from './contract.ts';
import { agentWaitsSince } from './waiting.ts';

const Started = Schema.Struct({
  at: Schema.String,
  link: Schema.NullOr(Schema.String),
  failed: Schema.NullOr(Schema.String),
});

/** What the program that starts an agent may say about it. */
const Said = Schema.fromJsonString(
  Schema.Struct({ link: Schema.optionalKey(Schema.String) }),
);

/** The agent that acts on what the owner hands over. */
export const agentOf = Effect.fn('agentOf')(function* (
  files: ShootFiles,
  canStart: boolean,
) {
  return {
    waitsSince: yield* agentWaitsSince(files),
    canStart,
    started: Option.getOrNull(yield* readJson(Started, files.agent)),
  } satisfies Agent;
});

const patience = '2 minutes';

/**
 * Has a program start an agent that acts on what was handed over. Goes on
 * as soon as the program runs; what comes of it is written down.
 */
export const startAgent = Effect.fn('startAgent')(function* (
  files: ShootFiles,
  name: string,
  program: string,
) {
  const at = DateTime.formatIso(yield* DateTime.now);
  const note = (link: string | null, failed: string | null) =>
    writeJson(Started, files.agent, { at, link, failed });
  yield* note(null, null);
  yield* toolText(program, [name]).pipe(
    Effect.timeout(patience),
    Effect.matchEffect({
      onFailure: ({ message }) => note(null, message),
      onSuccess: (text) =>
        note(
          Option.match(Schema.decodeUnknownOption(Said)(text), {
            onNone: () => null,
            onSome: ({ link }) => link ?? null,
          }),
          null,
        ),
    }),
    Effect.ignore,
    Effect.forkDetach,
  );
});
