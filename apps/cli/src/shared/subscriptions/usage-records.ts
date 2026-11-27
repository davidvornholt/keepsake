import { DateTime, Duration, Effect, Exit, FileSystem, Path } from 'effect';

/** One call to a program, which its usage records are filed under. */
export type UsageCall = {
  /** The same for every call of one model in one command. */
  readonly session: string;
  /** Only this call's. */
  readonly id: string;
  readonly at: string;
};

/**
 * keepsake runs the programs without a saved session, so that no photo is
 * kept, and so their session files miss what keepsake used. It adds records
 * of its calls there that hold only the model, the tokens and the time, so
 * that what reads the session files for usage, such as T3 Code, counts them.
 */
export type ProgramUsage = {
  /** The folder of the program's session files. */
  readonly folder: Effect.Effect<string, never, Path.Path>;
  /** The lines that record a call, from the events the program printed. */
  readonly lines: (
    events: ReadonlyArray<unknown>,
    call: UsageCall,
  ) => ReadonlyArray<object>;
};

/**
 * How long an answer, which is paid for, waits for its record. Writing one
 * takes milliseconds unless the file system is stuck.
 */
const recordWait = Duration.seconds(1);

const ignored = (_events: ReadonlyArray<unknown>) => Effect.void;

/** Records the calls of one model in a file of their own. */
export const usageRecorder = Effect.fn('usageRecorder')(function* ({
  folder,
  lines,
}: ProgramUsage) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  // Without a home there is nowhere to put the records, which matter less
  // than the answers.
  const found = yield* Effect.exit(folder);
  if (Exit.isFailure(found)) {
    return ignored;
  }
  const directory = path.join(found.value, 'keepsake');
  const session = crypto.randomUUID();
  // Claude Code and Codex list only files named like their own sessions, so
  // this name keeps the records out of `claude --resume` and `codex resume`.
  const file = path.join(directory, `keepsake-${session}.jsonl`);
  return (events: ReadonlyArray<unknown>) =>
    Effect.gen(function* () {
      const call = {
        session,
        id: crypto.randomUUID(),
        at: DateTime.formatIso(yield* DateTime.now),
      };
      const text = lines(events, call)
        .map((line) => `${JSON.stringify(line)}\n`)
        .join('');
      if (text === '') {
        return;
      }
      // Only the owner reads them, like the programs' own sessions.
      yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
      // One write for each call keeps its lines together beside other calls.
      yield* fs.writeFileString(file, text, { flag: 'a', mode: 0o600 });
    }).pipe(
      Effect.timeout(recordWait),
      // The answer is paid for and worth more than its record, which only
      // shows the use.
      Effect.ignore,
    );
});
