type Space = { readonly width: number; readonly height: number };

/**
 * In how many columns photos are largest when all of them are to be seen at
 * once, and how wide each one is. `shape` is its width divided by its height.
 */
export const gridFor = (
  count: number,
  shape: number,
  { width, height }: Space,
) => {
  const widthIn = (across: number) =>
    Math.min(width / across, (height / Math.ceil(count / across)) * shape);
  let columns = 1;
  for (let more = 2; more <= count; more += 1) {
    if (widthIn(more) > widthIn(columns)) {
      columns = more;
    }
  }
  return {
    columns,
    rows: Math.ceil(count / columns),
    photoWidth: widthIn(columns),
  };
};
