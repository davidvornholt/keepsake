import type { Activity } from '../../contract.ts';

// What keepsake is doing with the shoot, in the owner's words.

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

/**
 * The steps that get a new album ready, in their order, and about how much
 * of the whole time each takes: looking at every photo is nearly all of it.
 */
export const preparing = [
  { step: 'scan', part: 0.08 },
  { step: 'cull', part: 0.72 },
  { step: 'pick', part: 0.1 },
  { step: 'explain', part: 0.1 },
] as const;

/** How much of the whole is done before a step begins. */
const shareBefore = (at: number): number =>
  preparing.slice(0, at).reduce((sum, { part }) => sum + part, 0);

/** How far getting an album ready has got, from 0 to 1, given what is done now. */
export const preparedShare = (activity: Activity | null): number => {
  const at = preparing.findIndex(({ step }) => step === activity?.step);
  if (activity === null || at === -1) {
    return 0;
  }
  return shareBefore(at) + (preparing[at]?.part ?? 0) * shareOf(activity);
};

const afterReading = 1;
const afterChoosing = 3;

/**
 * How far getting an album ready has got at least, from what there is of
 * it: photos once they are read, a choice once it is made. So it is known
 * also when it has stopped and nothing says how far it is.
 */
export const preparedAtLeast = ({
  photos,
  chosen,
}: {
  readonly photos: number;
  readonly chosen: number;
}): { readonly at: number; readonly share: number } => {
  if (photos === 0) {
    return { at: 0, share: 0 };
  }
  const at = chosen === 0 ? afterReading : afterChoosing;
  return { at, share: shareBefore(at) };
};

const whole = 100;

/** "41%" */
export const percentOf = (share: number): string =>
  `${Math.round(Math.min(1, Math.max(0, share)) * whole)}%`;

const minute = 60;
/** Seconds are said in steps of this many, since nobody knows it better. */
const roughly = 5;

/** "about 20 s left", "about 3 min left": how long something still takes. */
export const timeLeft = (seconds: number): string => {
  const rounded = Math.max(roughly, Math.round(seconds / roughly) * roughly);
  return rounded >= minute
    ? `about ${Math.round(seconds / minute)} min left`
    : `about ${rounded} s left`;
};

/** Less than this share of the whole, and how long it takes can't be told. */
const tooLittle = 0.03;

/**
 * How many seconds are left when the share that is done grew from one to
 * another in so many seconds, or null while too little got done to tell.
 */
export const secondsLeft = (
  share: number,
  since: { readonly share: number; readonly seconds: number },
): number | null => {
  const got = share - since.share;
  return got < tooLittle || since.seconds <= 0 || share >= 1
    ? null
    : ((1 - share) * since.seconds) / got;
};
