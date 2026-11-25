#!/usr/bin/env bun
// biome-ignore-all lint/style/useNamingConvention: exiftool's names for the tags
// Stands in for exiftool, so the tests need only Bun. It knows the photos
// that `folders.ts` wrote: each says in its name when it was taken.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { takenAt } from './folders.ts';

const args = process.argv.slice(2);
const isPhoto = (file: string) => file.endsWith('.jpg');

/** The photos that were named, or all below the folder that was. */
const files = args.includes('-r')
  ? (await readdir(args.at(-1) ?? '', { recursive: true }))
      .filter(isPhoto)
      .map((file) => join(args.at(-1) ?? '', file))
  : args.filter(isPhoto);

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
