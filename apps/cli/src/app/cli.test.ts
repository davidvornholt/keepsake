import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

let home = '';

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'keepsake-cli-'));
});

afterAll(async () => {
  await rm(home, { recursive: true, force: true });
});

// Runs the real entrypoint, since what reaches stdout and stderr is decided
// there, around the CLI library.
const keepsake = async (...args: ReadonlyArray<string>) => {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'cli.ts'), ...args],
    {
      // Built from entries because environment variable names are not
      // camelCase, and nothing from the caller's environment leaks in.
      env: Object.fromEntries([
        ['HOME', home],
        ['NO_COLOR', '1'],
      ]),
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

describe('keepsake on the command line', () => {
  it.each(['--bogus', 'cull', 'login bing', '--log-level invalid'])(
    'reports `keepsake %s` as one JSON error and prints no help',
    async (command) => {
      const result = await keepsake(...command.split(' '));
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
      expect(JSON.parse(result.stderr)).toEqual({
        error: { tag: 'UsageError', message: expect.any(String) },
      });
    },
  );

  it.each(['--help', 'edit --help'])(
    'prints help for `keepsake %s`',
    async (command) => {
      const result = await keepsake(...command.split(' '));
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stderr).toBe('');
    },
  );

  it('asks for a scan when there is no such shoot', async () => {
    const result = await keepsake('show', 'lisbon');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.tag).toBe('StepMissing');
  });

  it('reports a wrong value with the usage exit code', async () => {
    const result = await keepsake('pick', 'lisbon', '--minimum-score', '0');
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.tag).toBe('InvalidInput');
  });
});
