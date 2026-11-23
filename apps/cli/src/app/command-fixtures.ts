import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, Stdio, Stream } from 'effect';
import { Command } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';
import { keepsake } from './cli.ts';
import {
  type AnswerName,
  fakeFetch,
  fakeModels,
  resetModels,
} from './fake-models.ts';
import { fakeTools, fakeToolsLayer, resetTools } from './fake-tools.ts';

export const endpoint = 'https://example.openai.azure.com';

/** A home directory for one test, and the key piped in. */
export const fake = { home: '', stdin: '' };

type Spy = ReturnType<typeof import('bun:test').spyOn>;
const spies: Array<Spy> = [];
let stdout: Spy | undefined;

export const printed = () =>
  JSON.parse(String(stdout?.mock.calls.at(-1)?.[0] ?? 'null'));

export const run = (...args: ReadonlyArray<string>) =>
  Effect.runPromise(
    Command.runWith(keepsake, { version: 'test' })(args).pipe(
      Effect.provide(fakeToolsLayer),
      Effect.provide(
        Stdio.layerTest({
          stdin: Stream.suspend(() =>
            Stream.make(new TextEncoder().encode(fake.stdin)),
          ),
          stdinIsTerminal: Effect.succeed(false),
        }),
      ),
      Effect.provide(BunServices.layer),
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromDotEnvContents(
            [
              `HOME=${fake.home}`,
              `XDG_CONFIG_HOME=${join(fake.home, 'config')}`,
              `XDG_DATA_HOME=${join(fake.home, 'data')}`,
            ].join('\n'),
          ),
        ),
      ),
      Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
      Effect.result,
    ),
  );

export const runOk = async (...args: ReadonlyArray<string>) => {
  const result = await run(...args);
  if (result._tag === 'Failure') {
    throw new Error(
      `keepsake ${args.join(' ')} failed: ${JSON.stringify(result.failure)}`,
    );
  }
  return printed();
};

export const failureOf = async (...args: ReadonlyArray<string>) => {
  const result = await run(...args);
  if (result._tag === 'Success') {
    throw new Error(`keepsake ${args.join(' ')} succeeded`);
  }
  return result.failure as { readonly _tag: string; readonly message: string };
};

export const credentialsPath = () =>
  join(fake.home, 'config', 'keepsake', 'credentials.json');

/** Where the test's shoot keeps a file. */
export const shootFile = (...parts: ReadonlyArray<string>) =>
  join(fake.home, 'data', 'keepsake', 'shoots', 'lisbon', ...parts);

export const shootJson = async (...parts: ReadonlyArray<string>) =>
  JSON.parse(await readFile(shootFile(...parts), 'utf8'));

/** The folder that is scanned. */
export const photosFolder = () => join(fake.home, 'photos');

/** Scans four photos: a burst of two, and two more a minute later each. */
export const scanLisbon = () => {
  fakeTools.files = [
    { file: 'A1.ARW', second: 0 },
    { file: 'A2.ARW', second: 1 },
    { file: 'B.ARW', second: 100 },
    { file: 'C.ARW', second: 200 },
  ];
  return runOk(
    'scan',
    photosFolder(),
    '--name',
    'lisbon',
    '--about',
    'Lisbon, May 2026',
  );
};

/** Scans, culls and picks the photos of `scanLisbon`. */
export const pickLisbon = async () => {
  await scanLisbon();
  await runOk('cull', 'lisbon');
  await runOk('pick', 'lisbon');
};

/** The questions a model was asked, by the name of the answer. */
export const asked = (name: AnswerName) =>
  fakeModels.asked.filter((question) => question.name === name);

/** A fresh home with a stored key; call it in `beforeEach`. */
export const setUp = async (spyOn: typeof import('bun:test').spyOn) => {
  resetModels();
  resetTools();
  fake.stdin = '';
  fake.home = await mkdtemp(join(tmpdir(), 'keepsake-cli-'));
  await mkdir(photosFolder());
  await Bun.write(
    credentialsPath(),
    JSON.stringify({ azure: { endpoint, apiKey: fakeModels.key } }),
  );
  stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
  // Progress goes to stderr through the console.
  spies.push(
    stdout,
    spyOn(console, 'error').mockImplementation(() => undefined),
  );
};

export const tearDown = async () => {
  for (const spy of spies.splice(0)) {
    spy.mockRestore();
  }
  await rm(fake.home, { recursive: true, force: true });
};
