#!/usr/bin/env bun
// biome-ignore-all lint/style/useNamingConvention: exiftool's names for the tags
// Stands in for exiftool, so the tests need only Bun. It knows the photos
// that `folders.ts` wrote: each says in its name when it was taken.
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { takenAt } from './folders.ts';

const args = process.argv.slice(2);
const isPhoto = (file: string) => file.endsWith('.jpg');

const unescaped = new Map([
  ['n', '\n'],
  ['r', '\r'],
]);

/** The photos in an argument file, one in a line as a C string. */
const listed = async (argumentFile: string) =>
  (await readFile(argumentFile, 'utf8'))
    .split('\n')
    .filter((line) => line.startsWith('#[CSTR]'))
    .map((line) =>
      line
        .slice('#[CSTR]'.length)
        .replaceAll(
          /\\(?<escaped>.)/gu,
          (_, escaped: string) => unescaped.get(escaped) ?? escaped,
        ),
    );

/** The photos that were named, there or in an argument file. */
const list = args[args.indexOf('-@') + 1];
const files = (
  args.includes('-@') && list !== undefined ? await listed(list) : args
).filter(isPhoto);

process.stdout.write(
  files.length === 0
    ? ''
    : JSON.stringify(
        files.map((file) => ({
          SourceFile: file,
          SubSecDateTimeOriginal: takenAt(file),
          FileModifyDate: takenAt(file),
          Model: 'ILCE-7M4',
          Orientation: 1,
          ImageSize: '480 320',
        })),
      ),
);
