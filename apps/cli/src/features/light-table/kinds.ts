/** Marks an agent acts on once they are handed over. */
export const wishKinds = [
  /** Change the finished photo as the note says, at the boxes if there are any. */
  'change',
  'take-out',
  'put-in',
  /** Put in this photo, and take out `other` for it. */
  'swap',
  'favorite',
  'not-favorite',
] as const;

/** Marks that only say what the owner thinks. */
export const opinionKinds = [
  /** The photo is right the way it is. */
  'keep',
  /** The photo is rightly not in the album. */
  'leave-out',
] as const;

export const markKinds = [...wishKinds, ...opinionKinds] as const;
export type MarkKind = (typeof markKinds)[number];
