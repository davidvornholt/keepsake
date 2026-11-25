import type { Activity } from '../../contract.ts';

// What an agent is doing with the shoot, in the owner's words.

const steps: Readonly<Record<string, string>> = {
  scan: 'Reading the photos',
  cull: 'Looking at every moment',
  rank: 'Comparing the best',
  motifs: 'Finding photos that show the same',
  pick: 'Choosing for the album',
  explain: 'Writing down why',
  edit: 'Editing',
  publish: 'Publishing to Immich',
};

/** "Editing", or "Working" for a step the page doesn't know. */
export const stepName = ({ step }: Activity): string =>
  steps[step] ?? 'Working';

/** "3 of 12", or nothing when there is nothing to count. */
export const progressOf = ({ done, total }: Activity): string =>
  total > 0 ? `${Math.min(done, total)} of ${total}` : '';

/** How far it has got, from 0 to 1. */
export const shareOf = ({ done, total }: Activity): number =>
  total > 0 ? Math.min(1, done / total) : 0;
