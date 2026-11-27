import { describe, expect, it } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { Effect, Result } from 'effect';
import { runToolToEnd } from './tools.ts';

/** Runs a shell script with the real spawner. */
const shell = (script: string) =>
  Effect.runPromise(
    runToolToEnd('sh', ['-c', script]).pipe(Effect.provide(BunServices.layer)),
  );

const failure = (
  ending: Result.Result<number, { readonly message: string }>,
) => (Result.isFailure(ending) ? ending.failure.message : '');

describe('a program a signal stopped', () => {
  it('returns at once with what it printed, though its child holds the output open', async () => {
    const started = performance.now();
    const { stdout, ending } = await shell(
      'echo emitted; sleep 3 & kill -TERM $$',
    );
    expect(performance.now() - started).toBeLessThan(2000);
    expect(new TextDecoder().decode(stdout)).toBe('emitted\n');
    expect(Result.isFailure(ending)).toBe(true);
  });

  it('names the signal and gives no hint about the installation', async () => {
    const { ending } = await shell('kill -TERM $$');
    expect(failure(ending)).toBe(
      "sh failed: Process interrupted due to receipt of signal: 'SIGTERM'",
    );
  });
});

describe('a program that is not there', () => {
  it('asks whether it is installed', async () => {
    const run = Effect.runPromise(
      runToolToEnd('keepsake-no-such-program', []).pipe(
        Effect.provide(BunServices.layer),
      ),
    );
    await expect(run).rejects.toThrow('installed and on the PATH');
  });
});
