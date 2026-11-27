// Serves the page with made-up shoots, the way `keepsake serve` does.
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { writeFolders } from './made-up/folders.ts';
import { type Wanted, writeShoot } from './made-up/shoot.ts';
import { warm } from './warm.ts';

const [, , port = ''] = process.argv;
const home = await mkdtemp(join(tmpdir(), 'keepsake-a11y-'));
const tools = join(home, 'tools');
const photos = join(home, 'photos');

const wanted: ReadonlyArray<Wanted> = [
  {
    name: 'lisbon',
    title: 'Lisbon',
    about: 'Lisbon, May 2026',
    month: '2026-05',
    step: 'published',
    toRate: true,
    seed: 0,
  },
  {
    name: 'porto',
    title: 'Porto',
    about: 'Porto, June 2026',
    month: '2026-06',
    step: 'published',
    toRate: true,
    seed: 3,
  },
  {
    name: 'faro',
    title: 'Faro',
    about: 'Faro, July 2026',
    month: '2026-07',
    step: 'edited',
    seed: 7,
  },
  {
    name: 'braga',
    title: 'Braga',
    about: 'Braga, July 2026',
    month: '2026-07',
    step: 'culled',
    seed: 9,
  },
  {
    name: 'evora',
    title: 'Évora',
    about: 'Évora, August 2026',
    month: '2026-08',
    step: 'scanned',
    seed: 11,
  },
  {
    name: 'sagres',
    title: 'Sagres',
    about: 'Sagres, September 2026',
    month: '2026-09',
    step: 'chosen',
    seed: 13,
  },
  {
    name: 'aveiro',
    title: 'Aveiro',
    about: 'Aveiro, September 2026',
    month: '2026-09',
    step: 'scanned',
    stopped: 'The model’s limit is reached. It is free again at 14:00.',
    seed: 17,
  },
  {
    name: 'obidos',
    title: 'Óbidos',
    about: 'Óbidos, October 2026',
    month: '2026-10',
    step: 'chosen',
    isOrdered: true,
    seed: 19,
  },
  {
    name: 'cascais',
    title: 'Cascais',
    about: 'Cascais, October 2026',
    month: '2026-10',
    step: 'edited',
    seed: 29,
  },
  {
    name: 'nazare',
    title: 'Nazaré',
    about: 'Nazaré, November 2026',
    month: '2026-11',
    step: 'edited',
    seed: 31,
    failedTakeOut: 'Immich did not take it out of the album.',
  },
  {
    name: 'tomar',
    title: 'Tomar',
    about: 'Tomar, November 2026',
    month: '2026-11',
    step: 'edited',
    seed: 23,
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

const serveOn = (at: number) =>
  Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, '..', 'src', 'app', 'cli.ts'),
      'serve',
      '--port',
      String(at),
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
      stdout: 'pipe',
      stderr: 'inherit',
    },
  );

// One server makes what is kept from then on. The tests get the one after it,
// which has all of it from the start.
let server = serveOn(Number(port) + 1);
const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// It says where it is once it can be reached.
for await (const said of server.stdout.pipeThrough(new TextDecoderStream())) {
  await warm(String(JSON.parse(said).url));
  break;
}
server.kill();
await server.exited;
server = serveOn(Number(port));
await server.exited;
await rm(home, { recursive: true, force: true });
