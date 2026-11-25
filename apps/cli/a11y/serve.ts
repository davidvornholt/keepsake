// Serves the page with made-up shoots, the way `keepsake serve` does.
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { writeFolders } from './made-up/folders.ts';
import { type Wanted, writeShoot } from './made-up/shoot.ts';

const [, , port = ''] = process.argv;
const home = await mkdtemp(join(tmpdir(), 'keepsake-a11y-'));
const tools = join(home, 'tools');
const photos = join(home, 'photos');

const wanted: ReadonlyArray<Wanted> = [
  {
    name: 'lisbon',
    about: 'Lisbon, May 2026',
    month: '2026-05',
    step: 'published',
    toRate: true,
    seed: 0,
  },
  {
    name: 'porto',
    about: 'Porto, June 2026',
    month: '2026-06',
    step: 'published',
    toRate: true,
    seed: 3,
  },
  {
    name: 'faro',
    about: 'Faro, July 2026',
    month: '2026-07',
    step: 'edited',
    seed: 7,
  },
  {
    name: 'braga',
    about: 'Braga, July 2026',
    month: '2026-07',
    step: 'culled',
    seed: 9,
  },
  {
    name: 'evora',
    about: 'Évora, August 2026',
    month: '2026-08',
    step: 'scanned',
    seed: 11,
  },
  {
    name: 'sagres',
    about: 'Sagres, September 2026',
    month: '2026-09',
    step: 'chosen',
    seed: 13,
  },
  {
    name: 'aveiro',
    about: 'Aveiro, September 2026',
    month: '2026-09',
    step: 'scanned',
    stopped: 'The model’s limit is reached. It is free again at 14:00.',
    seed: 17,
  },
  {
    name: 'obidos',
    about: 'Óbidos, October 2026',
    month: '2026-10',
    step: 'chosen',
    isOrdered: true,
    seed: 19,
  },
];
for (const shoot of wanted) {
  await writeShoot(join(home, 'keepsake', 'shoots'), shoot);
}

/** Puts a program where the server finds it: one of the stand-ins here. */
const standIn = async (name: string, script: string) => {
  const program = join(tools, name);
  await Bun.write(
    program,
    `#!/bin/sh\nexec '${process.execPath}' '${join(import.meta.dir, 'made-up', script)}' "$@"\n`,
  );
  await chmod(program, 0o755);
  return program;
};

await mkdir(tools);
await standIn('magick', 'magick.ts');
await standIn('exiftool', 'exiftool.ts');
await standIn('photos', 'photos.ts');
const agent = await standIn('agent', 'agent.ts');
await writeFolders(photos);

const server = Bun.spawn(
  [
    process.execPath,
    join(import.meta.dir, '..', 'src', 'app', 'cli.ts'),
    'serve',
    '--port',
    port,
    '--photos',
    photos,
    '--agent',
    agent,
  ],
  {
    // Built from entries because environment variable names are not camelCase.
    env: Object.fromEntries([
      ['HOME', home],
      ['XDG_DATA_HOME', home],
      ['XDG_CACHE_HOME', join(home, 'cache')],
      ['NODE_ENV', 'production'],
      ['PATH', tools],
    ]),
    cwd: join(import.meta.dir, '..'),
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal));
}
await server.exited;
await rm(home, { recursive: true, force: true });
