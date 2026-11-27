#!/usr/bin/env bun
// Stands in for the photos command, which talks to Immich: it agrees to
// whatever is asked and reaches nothing. Its one album has the name a new
// album of the Tavira folder gets, so the page says the photos join it.
import process from 'node:process';

const [, , asked = '', what = ''] = process.argv;
const albums = [
  {
    id: 'tavira',
    name: 'Tavira',
    firstTakenOn: '2025-10-02',
    lastTakenOn: '2025-10-04',
  },
];
const answers: Record<string, unknown> = {
  status: { server: 'https://photos.example.com' },
  'albums list': albums,
};
process.stdout.write(
  JSON.stringify(answers[asked] ?? answers[`${asked} ${what}`] ?? {}),
);
