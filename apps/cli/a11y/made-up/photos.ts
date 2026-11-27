#!/usr/bin/env bun
// Stands in for the photos command, which talks to Immich: it agrees to
// whatever is asked and reaches nothing.
import process from 'node:process';

const [, , asked = '', ...rest] = process.argv;

const answers: Readonly<Record<string, unknown>> = {
  status: { server: 'https://photos.example.com' },
  trash: {
    trashed: rest.map((id) => ({ id })),
    alreadyInTrash: [],
    trashDays: 30,
    restoreWith: 'photos restore',
  },
};

process.stdout.write(JSON.stringify(answers[asked] ?? {}));
