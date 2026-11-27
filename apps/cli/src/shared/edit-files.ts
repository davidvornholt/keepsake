import type { Path } from 'effect';

/** The files of an edit of a photo. */
export const editFiles = (
  path: Path.Path,
  directory: string,
  base: string,
) => ({
  directory,
  /** The camera's own full-size JPEG. */
  camera: path.join(directory, `${base}.jpg`),
  /** What the photo shows, if another model judged it. */
  description: path.join(directory, 'description.json'),
  /** What a finished picture shows, where that isn't what was edited. */
  shown: (key: string) => path.join(directory, `shown-${key}.json`),
  crop: path.join(directory, 'crop.json'),
  /**
   * The cropped photo the image model gets. Unlike the camera's picture it
   * doesn't end in .jpg, so no photo's name makes them the same file.
   */
  input: path.join(directory, 'input.jpeg'),
  /** What the user wants to be done with the photo. */
  wish: path.join(directory, 'wish.json'),
  /** What is removed from the photo. */
  removals: path.join(directory, 'removals.json'),
  /** The people who can be recognised, and everyone else. */
  people: path.join(directory, 'people.json'),
  bystanders: path.join(directory, 'bystanders.json'),
  /** The animals too small for the image model to draw. */
  animals: path.join(directory, 'animals.json'),
  signs: path.join(directory, 'signs.json'),
  /** The areas that keep the photo's own texture. */
  textures: path.join(directory, 'textures.json'),
  /** What the image model made. */
  version: (number: number) => path.join(directory, `version-${number}.png`),
  /** The versions an attempt made, once all of them are saved. */
  batch: (attempt: number) => path.join(directory, `attempt-${attempt}.json`),
  /** The signs it got wrong. */
  changedSigns: (number: number) =>
    path.join(directory, `version-${number}-signs.json`),
  /** The same with the original's people, textures and signs in it. */
  versionWithOriginals: (number: number) =>
    path.join(directory, `version-${number}-kept.png`),
  /** What is wrong with it when looking closely. */
  faults: (number: number) =>
    path.join(directory, `version-${number}-faults.json`),
  /** The same without what could be mended. */
  versionMended: (number: number) =>
    path.join(directory, `version-${number}-mended.png`),
  /** The edit command that starts it over, and whether it is done with it. */
  anew: path.join(directory, 'anew.json'),
  final: path.join(directory, `${base}-keepsake.jpg`),
  /** The finished photos that newer ones replaced. */
  earlier: path.join(directory, 'earlier'),
  record: path.join(directory, 'edit.json'),
});
export type EditFiles = ReturnType<typeof editFiles>;

/**
 * The name of a photo's edit folder, which holds no slash, so that the edit of
 * `A/B` isn't inside the one of `A`. Different photos get different names.
 */
export const editFolderName = (photo: string) =>
  photo.replace(/[~/]/gu, (sign) => (sign === '/' ? '~s' : '~~'));
