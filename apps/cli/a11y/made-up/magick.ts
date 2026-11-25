#!/usr/bin/env bun
// Stands in for ImageMagick, so the tests need only Bun. It knows what the
// page's server asks of it, about pictures drawn by `pictures.ts`.
import { copyFile, readFile } from 'node:fs/promises';
import process from 'node:process';
import { shrunk, sizeOf } from './pictures.ts';

const args = process.argv.slice(2);
const target = args.at(-1) ?? '';
const source = args[0] === 'identify' ? target : (args[2] ?? '');

if (args[0] === 'identify') {
  const { width, height } = sizeOf(await readFile(source));
  process.stdout.write(`${width} ${height}`);
} else if (target === 'rgba:-') {
  const size = args[args.indexOf('-resize') + 1] ?? '';
  const [width = 1, height = 1] = size.replace('!', '').split('x').map(Number);
  process.stdout.write(shrunk(await readFile(source), width, height));
} else {
  await copyFile(source, target);
}
