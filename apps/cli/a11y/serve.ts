// Serves the page with made-up shoots, the way `keepsake serve` does.
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { type Wanted, writeShoot } from './made-up/shoot.ts';

const [, , port = ''] = process.argv;
const home = await mkdtemp(join(tmpdir(), 'keepsake-a11y-'));
const tools = join(home, 'tools');

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
];
for (const shoot of wanted) {
  await writeShoot(join(home, 'keepsake', 'shoots'), shoot);
}

const magick = join(tools, 'magick');
await mkdir(tools);
await Bun.write(
  magick,
  `#!/bin/sh\nexec '${process.execPath}' '${join(import.meta.dir, 'made-up', 'magick.ts')}' "$@"\n`,
);
await chmod(magick, 0o755);

const server = Bun.spawn(
  [
    process.execPath,
    join(import.meta.dir, '..', 'src', 'app', 'cli.ts'),
    'serve',
    '--port',
    port,
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
