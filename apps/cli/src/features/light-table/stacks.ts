import type { PhotoView, Stack } from './contract.ts';

// The page and the server both lay out stacks with this, so it imports only
// types.

/** The photos that show the same, in the order of those in front. */
export const stacksOf = (
  photos: ReadonlyArray<PhotoView>,
): ReadonlyArray<Stack> => {
  const behind = Map.groupBy(photos, ({ stack }) => stack);
  return photos.flatMap(({ id }) => {
    const all = behind.get(id);
    return all === undefined
      ? []
      : [{ front: id, photos: all.map((photo) => photo.id) }];
  });
};
