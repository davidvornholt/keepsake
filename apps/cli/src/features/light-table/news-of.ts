import type { Added, CarryingOut, Mark } from './contract.ts';

// What is new to the owner in a shoot: the answers to their marks, the
// photos their order put into the album, and what waits for their word. The
// page and the server both use this, so it imports only types.

/**
 * One new thing, with the key the page names when the owner saw it, which
 * changes when the thing does. `photo` is null for what waits for the
 * owner's word about no photo in particular.
 */
export type NewsItem = {
  readonly photo: string | null;
  readonly at: string;
  readonly key: string;
};

/** A photo with something new about it, and since when. */
export type New = { readonly photo: string; readonly at: string };

const byTime = (
  left: { readonly at: string; readonly photo: string | null },
  right: { readonly at: string; readonly photo: string | null },
) =>
  left.at.localeCompare(right.at) ||
  (left.photo ?? '').localeCompare(right.photo ?? '');

/**
 * What waits for the owner's word about the album as a whole: a stop about
 * no photo, or one whose photo they looked at already. It stays new until
 * they answer it, so no album waits for them unsaid.
 */
export const decisionOf = ({ stopped }: CarryingOut): NewsItem | null =>
  stopped === null || (stopped.photos.length > 0 && stopped.seenAt === null)
    ? null
    : { photo: null, at: stopped.at, key: `stop:${stopped.id}` };

/** Everything new, oldest first. */
export const newsItemsOf = (
  marks: ReadonlyArray<Mark>,
  added: ReadonlyArray<Added>,
  carrying: CarryingOut,
): ReadonlyArray<NewsItem> => {
  const { stopped } = carrying;
  const decision = decisionOf(carrying);
  return [
    ...marks.flatMap(({ id, photo, answer, seenAt }) =>
      answer !== null && seenAt === null
        ? [{ photo, at: answer.at, key: `answer:${id}:${answer.at}` }]
        : [],
    ),
    ...added.flatMap(({ photo, at, seenAt }) =>
      seenAt === null ? [{ photo, at, key: `added:${photo}:${at}` }] : [],
    ),
    ...(stopped === null || stopped.seenAt !== null
      ? []
      : stopped.photos.slice(0, 1).map((photo) => ({
          photo,
          at: stopped.at,
          key: `stop:${stopped.id}`,
        }))),
    ...(decision === null ? [] : [decision]),
  ].toSorted(byTime);
};

/** The photos with something new, each once at its oldest, oldest first. */
export const newsOf = (
  marks: ReadonlyArray<Mark>,
  added: ReadonlyArray<Added>,
  carrying: CarryingOut,
): ReadonlyArray<New> => {
  const first = new Map<string, string>();
  for (const { photo, at } of newsItemsOf(marks, added, carrying)) {
    if (photo !== null && !first.has(photo)) {
      first.set(photo, at);
    }
  }
  return [...first].map(([photo, at]) => ({ photo, at })).toSorted(byTime);
};
