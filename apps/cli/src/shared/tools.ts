import { Effect, Result, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ToolFailed } from './errors/errors.ts';

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  Stream.runCollect(stream).pipe(
    Effect.map((chunks) => new Uint8Array(Buffer.concat([...chunks]))),
  );

/** How much of a failing program's error output goes into the message. */
const shownError = 400;

const failed = (command: string, detail: string) =>
  new ToolFailed({ message: `${command} failed: ${detail}` });

type RunOptions = {
  /** What the program reads from its standard input. */
  readonly input?: string | Uint8Array;
  readonly cwd?: string;
  /** Environment variables to set, or to remove if undefined. */
  readonly env?: Readonly<Record<string, string | undefined>>;
};

const notRun = (command: string, { message }: { readonly message: string }) =>
  failed(command, `${message}. Is ${command} installed and on the PATH?`);

/**
 * Runs a program without a shell and returns what it printed, and its exit
 * code or why it has none, as when a signal stopped it.
 */
export const runToolToEnd = Effect.fn('runToolToEnd')(
  function* (
    command: string,
    args: ReadonlyArray<string>,
    { input, cwd, env }: RunOptions = {},
  ) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(command, [...args], {
        stdin:
          input === undefined
            ? 'ignore'
            : Stream.make(
                typeof input === 'string'
                  ? new TextEncoder().encode(input)
                  : input,
              ),
        cwd,
        env: { ...env },
        extendEnv: true,
      }),
    );
    const [stdout, stderr, ending] = yield* Effect.all(
      [
        collect(handle.stdout),
        collect(handle.stderr),
        Effect.result(handle.exitCode),
      ],
      { concurrency: 'unbounded' },
    );
    return {
      stdout,
      stderr: new TextDecoder().decode(stderr).trim(),
      ending: Result.mapBoth(ending, {
        onSuccess: Number,
        onFailure: (error) => notRun(command, error),
      }),
    };
  },
  Effect.scoped,
  (effect, command) =>
    Effect.mapError(effect, (error) => notRun(command, error)),
);

/**
 * Runs a program without a shell and returns what it printed, whatever its
 * exit code.
 */
export const runTool = Effect.fn('runTool')(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
) {
  const { stdout, stderr, ending } = yield* runToolToEnd(
    command,
    args,
    options,
  );
  return { stdout, stderr, exitCode: yield* Effect.fromResult(ending) };
});

/** Runs a program that must succeed and returns the bytes it printed. */
export const toolBytes = Effect.fn('toolBytes')(function* (
  command: string,
  args: ReadonlyArray<string>,
  options: RunOptions = {},
) {
  const { stdout, stderr, exitCode } = yield* runTool(command, args, options);
  if (exitCode !== 0) {
    return yield* failed(
      command,
      stderr === '' ? `exit code ${exitCode}` : stderr.slice(0, shownError),
    );
  }
  return stdout;
});

/** Runs a program that must succeed and returns the text it printed. */
export const toolText = (command: string, args: ReadonlyArray<string>) =>
  Effect.map(toolBytes(command, args), (bytes) =>
    new TextDecoder().decode(bytes),
  );
