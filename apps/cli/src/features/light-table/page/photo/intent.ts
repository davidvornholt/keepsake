// What the owner meant to do with a photo when they opened it from the
// table, such as writing a change, kept until the photo is there.

let composing: string | null = null;

/** Opens the words of a change as soon as this photo is shown. */
export const askToCompose = (photo: string): void => {
  composing = photo;
};

/** Says whether a change was asked for with this photo, once. */
export const wasAskedToCompose = (photo: string): boolean => {
  const isAsked = composing === photo;
  composing = null;
  return isAsked;
};
