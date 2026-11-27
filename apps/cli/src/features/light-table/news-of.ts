import type { Added, CarryingOut, Mark } from './contract.ts';

// What is new to the owner in a shoot, a photo at a time: the answers to their
// marks, the photos their order put into the album, and what waits for their
// word. The page and the server both use this, so it imports only types.

/** A photo with something new about it, and since when. */
export type New = { readonly photo: string; readonly at: string };

/** What is new, a photo at a time, oldest first. */
export const newsOf = (
  marks: ReadonlyArray<Mark>,
  added: ReadonlyArray<Added>,
  carrying: CarryingOut,
): ReadonlyArray<New> => {
  const { stopped } = carrying;
  const all = [
    ...marks.flatMap(({ photo, answer, ...mark }) =>
      answer !== null && mark.seenAt === null ? [{ photo, at: answer.at }] : [],
    ),
    ...added.flatMap(({ photo, at, seenAt }) =>
      seenAt === null ? [{ photo, at }] : [],
    ),
    ...(stopped === null || stopped.seenAt !== null
      ? []
      : stopped.photos.slice(0, 1).map((photo) => ({ photo, at: stopped.at }))),
  ];
  const first = new Map<string, string>();
  for (const { photo, at } of all) {
    const known = first.get(photo);
    if (known === undefined || at < known) {
      first.set(photo, at);
    }
  }
  return [...first]
    .map(([photo, at]) => ({ photo, at }))
    .toSorted(
      (left, right) =>
        left.at.localeCompare(right.at) ||
        left.photo.localeCompare(right.photo),
    );
};
