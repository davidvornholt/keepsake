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

/** What the program that starts an agent says once it did. */
const Said = Schema.fromJsonString(Schema.Struct({ link: Schema.String }));

const unsaid =
  'The program didn’t print {"link":"…"}, so it may not have started an agent. It is started again with the same hand-overs when you ask.';

/** Where to read along with the agent, if the program said where. */
const linkIn = (text: string) =>
  Option.filter(
    Option.map(Schema.decodeUnknownOption(Said)(text), ({ link }) =>
      link.trim(),
    ),
    (link) => link !== '',
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

type Launch = {
  readonly name: string;
  readonly handOvers: ReadonlyArray<string>;
  readonly program: string;
};

/**
 * Has a program start an agent that acts on what was handed over, with the
 * shoot's name and the ids of the hand-overs it is for. Goes on as soon as
 * the program runs; what comes of it is written down. `isStarted` runs once
 * the program printed where to read along with the agent it started, which
 * is how it says it did, and `done` when it ended in any way.
 */
export const startAgent = Effect.fn('startAgent')(function* <R>(
  files: ShootFiles,
  { name, handOvers, program }: Launch,
  after: {
    readonly isStarted: Effect.Effect<void, unknown, R>;
    readonly done: Effect.Effect<void, never, R>;
  },
) {
  const at = DateTime.formatIso(yield* DateTime.now);
  const note = (link: string | null, failed: string | null) =>
    writeJson(Started, files.agent, { at, link, failed });
  yield* note(null, null);
  yield* toolText(program, [name, ...handOvers]).pipe(
    Effect.timeout(patience),
    Effect.matchEffect({
      onFailure: ({ message }) => note(null, message),
      onSuccess: (text) =>
        Option.match(linkIn(text), {
          onNone: () => note(null, unsaid),
          onSome: (link) =>
            after.isStarted.pipe(Effect.andThen(note(link, null))),
        }),
    }),
    Effect.ignore,
    Effect.ensuring(after.done),
    Effect.forkDetach,
  );
});
