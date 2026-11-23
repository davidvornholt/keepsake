import { Effect, Stream } from 'effect';
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
  readonly input?: string;
  readonly cwd?: string;
  /** Environment variables to set, or to remove if undefined. */
  readonly env?: Readonly<Record<string, string | undefined>>;
};

/**
 * Runs a program without a shell and returns what it printed, whatever its
 * exit code.
 */
export const runTool = Effect.fn('runTool')(
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
            : Stream.make(new TextEncoder().encode(input)),
        cwd,
        env: { ...env },
        extendEnv: true,
      }),
    );
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [collect(handle.stdout), collect(handle.stderr), handle.exitCode],
      { concurrency: 'unbounded' },
    );
    return {
      stdout,
      stderr: new TextDecoder().decode(stderr).trim(),
      exitCode: Number(exitCode),
    };
  },
  Effect.scoped,
  (effect, command) =>
    Effect.mapError(effect, (error) =>
      failed(
        command,
        `${error.message}. Is ${command} installed and on the PATH?`,
      ),
    ),
);

/** Runs a program that must succeed and returns the bytes it printed. */
export const toolBytes = Effect.fn('toolBytes')(function* (
  command: string,
  args: ReadonlyArray<string>,
) {
  const { stdout, stderr, exitCode } = yield* runTool(command, args);
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
