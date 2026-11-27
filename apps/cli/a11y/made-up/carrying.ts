// How the page's server carries out what was handed over in a made-up shoot.
// The process that writes the shoots holds their runner locks, and runs as
// long as the server does, so the server leaves them to it and never edits
// anything.
import { basename, join } from 'node:path';
import { holdWhileRunning } from '../../src/shared/lock.ts';

/** The order stopped first, the marks after their answers came. */
const orderStoppedAt = '2026-05-10T18:30:00.000Z';
const marksStoppedAt = '2026-05-10T20:30:00.000Z';

/** Holds the runner lock of the shoot in this folder, as its server would. */
const holdRunner = (root: string) => {
  holdWhileRunning(join(root, '..', '..', 'locks', `${basename(root)}.runner`));
};

const carrying = (root: string, stopped: unknown) => {
  holdRunner(root);
  return {
    since: orderStoppedAt,
    stopped,
    marks: {},
    toExplain: false,
  };
};

/** An order, at work or waiting for more money. */
export const ordering = (
  root: string,
  { isOrdered }: { readonly isOrdered?: 'at-work' | 'waits-for-money' },
  photos: ReadonlyArray<string>,
) =>
  carrying(
    root,
    isOrdered === 'at-work'
      ? null
      : {
          id: 'money',
          at: orderStoppedAt,
          reason: `What you agreed to pay is used up, and ${photos.length} photos you ordered aren’t edited yet.`,
          needs: 'money',
          handOver: 'order',
          photos,
          seenAt: null,
        },
  );

/** The marks, stopped at one photo until the owner says to go on. */
export const stoppedAt = (root: string, photo: string) =>
  carrying(root, {
    id: 'limit',
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
