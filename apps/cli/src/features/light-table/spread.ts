/** Its multiples fill the space between 0 and 1 evenly, however many there are. */
const golden = 0.618_033_988_749_895;

/** The first few of a list, for any number of them, taken from all over it. */
export const spread = <Item>(
  items: ReadonlyArray<Item>,
  many: number,
): ReadonlyArray<Item> => {
  const places = new Set<number>();
  for (let turn = 0; places.size < Math.min(many, items.length); turn += 1) {
    places.add(Math.floor(((turn * golden) % 1) * items.length));
  }
  return [...places].flatMap((place) => items.slice(place, place + 1));
};
