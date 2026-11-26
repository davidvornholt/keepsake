#!/usr/bin/env bun
// Stands in for ImageMagick, so the tests need only Bun. It knows what
// keepsake asks of it, about pictures drawn by `pictures.ts`.
import { copyFile, readFile } from 'node:fs/promises';
import process from 'node:process';
import { shrunk, sizeOf } from './pictures.ts';

const args = process.argv.slice(2);
const target = args.at(-1) ?? '';
/** The picture that is asked about: the first file that is named. */
const photo = args.find((arg) => arg.startsWith('/')) ?? '';
const channels = 4;
const colors = 3;

/** A picture that is a file, or the one that is handed in. */
const read = async (file: string) =>
  file === '-' ? Buffer.from(await Bun.stdin.bytes()) : await readFile(file);

/** A smaller copy of the picture, in the size that was asked for. */
const small = async () => {
  const size = args[args.indexOf('-resize') + 1] ?? '';
  const [width = 1, height = 1] = size.replace('!', '').split('x').map(Number);
  return shrunk(await readFile(photo), width, height);
};

if (args[0] === 'identify') {
  const { width, height } = sizeOf(await read(target));
  process.stdout.write(`${width} ${height}`);
} else if (target === 'rgba:-') {
  process.stdout.write(await small());
} else if (target === 'gray:-') {
  const pixels = await small();
  const grey = new Uint8Array(pixels.length / channels);
  for (const [at] of grey.entries()) {
    const from = at * channels;
    grey[at] = Math.round(
      ((pixels[from] ?? 0) +
        (pixels[from + 1] ?? 0) +
        (pixels[from + 2] ?? 0)) /
        colors,
    );
  }
  process.stdout.write(grey);
} else if (target === 'ppm:-') {
  // What the photo looks like, shrunk, for grouping it with others.
  const size = args[args.indexOf('-resize') + 1] ?? '';
  const [width = 1, height = 1] = size.split('x').map(Number);
  const pixels = await small();
  const rgb = new Uint8Array(width * height * colors);
  for (const [at] of rgb.entries()) {
    rgb[at] = pixels[Math.floor(at / colors) * channels + (at % colors)] ?? 0;
  }
  process.stdout.write(`P6\n${width} ${height}\n255\n`);
  process.stdout.write(rgb);
} else if (target === 'jpg:-') {
  // A photo developed for the page: the picture as it is.
  process.stdout.write(await readFile(photo));
} else {
  await copyFile(photo, target);
}
