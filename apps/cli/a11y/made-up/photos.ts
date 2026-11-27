#!/usr/bin/env bun
// Stands in for the photos command, which talks to Immich: it agrees to
// whatever is asked and reaches nothing. Its own album has the name a new
// album of the Tavira folder gets, so the page says the photos join it,
// another account shares one with it, and photos can't tell whose a third is.
import process from 'node:process';

const [, , asked = '', ...rest] = process.argv;
const albums = [
  {
    id: 'tavira',
    name: 'Tavira',
    firstTakenOn: '2025-10-02',
    lastTakenOn: '2025-10-04',
    owner: 'Owner',
  },
  {
    id: 'lagos',
    name: 'Lagos',
    firstTakenOn: '2025-10-05',
    lastTakenOn: '2025-10-05',
    owner: 'Friend',
  },
  {
    id: 'silves',
    name: 'Silves',
    firstTakenOn: '2025-10-06',
    lastTakenOn: '2025-10-06',
    owner: null,
  },
];
const answers: Readonly<Record<string, unknown>> = {
  status: { server: 'https://photos.example.com', user: 'Owner' },
  'albums list': albums,
  trash: {
    trashed: rest.map((id) => ({ id })),
    alreadyInTrash: [],
    trashDays: 30,
    restoreWith: 'photos restore',
  },
};
process.stdout.write(
  JSON.stringify(answers[asked] ?? answers[`${asked} ${rest[0] ?? ''}`] ?? {}),
);
