#!/usr/bin/env bun
// Stands in for the photos command, which talks to Immich: it agrees to
// whatever is asked and reaches nothing.
import process from 'node:process';

const [, , asked = ''] = process.argv;
process.stdout.write(
  JSON.stringify(
    asked === 'status' ? { server: 'https://photos.example.com' } : {},
  ),
);
