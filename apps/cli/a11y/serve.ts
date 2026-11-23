// Serves the rating page of a made-up shoot, the way `keepsake rate` does.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const [, , port = ''] = process.argv;
const home = await mkdtemp(join(tmpdir(), 'keepsake-a11y-'));
const shoot = join(home, 'keepsake', 'shoots', 'lisbon');

const width = 300;
const height = 200;
const headerSize = 54;
const bitsPerPixel = 24;
const bytesPerPixel = 3;

/** A picture of one colour, as a BMP, which needs no compression. */
const picture = (shade: number): Uint8Array => {
  const bytes = new Uint8Array(headerSize + width * height * bytesPerPixel);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('BM'));
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, headerSize, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, bitsPerPixel, true);
  bytes.fill(shade, headerSize);
  return bytes;
};

const moments = [
  { id: 'A1', photos: ['A1', 'A2', 'A3'] },
  { id: 'B', photos: ['B'] },
];
const photos = moments.flatMap((moment) =>
  moment.photos.map((id) => ({
    id,
    file: `${id}.ARW`,
    takenAt: '2026-05-01T10:00:00.000',
    camera: null,
    lens: null,
    focalLength: null,
    orientation: 1,
    raw: true,
    cameraJpeg: true,
    hash: '0000000000000000',
  })),
);

await Promise.all([
  Bun.write(
    join(shoot, 'shoot.json'),
    JSON.stringify({
      name: 'lisbon',
      source: join(home, 'photos'),
      about: 'Lisbon, May 2026',
    }),
  ),
  Bun.write(join(shoot, 'photos.json'), JSON.stringify(photos)),
  Bun.write(join(shoot, 'moments.json'), JSON.stringify(moments)),
  ...photos.map(({ id }, index) =>
    Bun.write(join(shoot, 'previews', `${id}.jpg`), picture(60 + index * 50)),
  ),
]);

const server = Bun.spawn(
  [
    process.execPath,
    join(import.meta.dir, '..', 'src', 'app', 'cli.ts'),
    'rate',
    'lisbon',
    '--port',
    port,
  ],
  {
    // Built from entries because environment variable names are not camelCase.
    env: Object.fromEntries([
      ['HOME', home],
      ['XDG_DATA_HOME', home],
    ]),
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal));
}
await server.exited;
await rm(home, { recursive: true, force: true });
