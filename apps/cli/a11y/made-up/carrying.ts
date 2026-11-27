// How the page's server carries out what was handed over in a made-up shoot.
// It names the process that writes the shoots, which runs as long as the
// server does, so the server leaves it to that one and never edits anything.
import process from 'node:process';

/** The order stopped first, the marks after their answers came. */
const orderStoppedAt = '2026-05-10T18:30:00.000Z';
const marksStoppedAt = '2026-05-10T20:30:00.000Z';

const carrying = (stopped: unknown) => ({
  process: process.pid,
  since: orderStoppedAt,
  stopped,
  marks: {},
  toExplain: false,
});

/** An order, at work or waiting for more money. */
export const ordering = (
  how: 'at-work' | 'waits-for-money',
  photos: ReadonlyArray<string>,
) =>
  carrying(
    how === 'at-work'
      ? null
      : {
          at: orderStoppedAt,
          reason: `What you agreed to pay is used up, and ${photos.length} photos you ordered aren’t edited yet.`,
          needs: 'money',
          handOver: 'order',
          photos,
          seenAt: null,
        },
  );

/** The marks, stopped at one photo until the owner says to go on. */
export const stoppedAt = (photo: string) =>
  carrying({
    at: marksStoppedAt,
    reason:
      'Changing the photo failed: Claude Code reached its usage limit. It is free again at 14:00.',
    needs: 'retry',
    handOver: 'marks',
    photos: [photo],
    seenAt: null,
  });

/** The order of the chosen photos. */
export const orderOf = (
  album: ReadonlyArray<string>,
  agreed: { readonly at: string; readonly dollars: number },
) => ({
  id: 'order',
  ...agreed,
  spentBefore: 0,
  marks: [],
  album,
  fulfilledAt: null,
});
