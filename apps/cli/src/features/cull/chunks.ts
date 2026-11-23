/** Splits items into as few groups of at most `most` as even as possible. */
export const chunks = <A>(
  items: ReadonlyArray<A>,
  most: number,
): ReadonlyArray<ReadonlyArray<A>> => {
  const count = Math.ceil(items.length / most);
  return Array.from({ length: count }, (_, index) =>
    items.slice(
      Math.round((index * items.length) / count),
      Math.round(((index + 1) * items.length) / count),
    ),
  );
};
