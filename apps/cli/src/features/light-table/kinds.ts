/** Marks an agent acts on once they are handed over. */
export const markKinds = [
  /** Change the finished photo as the note says, at the boxes if there are any. */
  'change',
  'take-out',
  'put-in',
  /** Put in this photo, and take out `other` for it. */
  'swap',
] as const;
export type MarkKind = (typeof markKinds)[number];
