import { Effect, Option, Schema } from 'effect';
import { coverage } from './boxes.ts';
import { type Box, type EditRecord, Person, Removal } from './domain.ts';
import type { EditFiles } from './edit-files.ts';
import { readJson } from './store.ts';

const half = 0.5;

/**
 * Whether most of what is to be removed is on someone's face. It stays then,
 * since a face always comes back as the photo shows it.
 */
export const isOnFace = (people: ReadonlyArray<Person>, box: Box): boolean =>
  people.some(({ face }) => {
    const width =
      Math.min(box.right, face.right) - Math.max(box.left, face.left);
    const height =
      Math.min(box.bottom, face.bottom) - Math.max(box.top, face.top);
    return width > 0 && height > 0 && width * height > half * coverage(box);
  });

/** What an edit took out of its photo, in fractions of the finished photo. */
export const removedBy = Effect.fn('removedBy')(function* (
  record: EditRecord,
  files: Pick<EditFiles, 'removals' | 'people'>,
) {
  if (record.version === 'camera') {
    return [];
  }
  if (record.removed !== undefined) {
    return record.removed;
  }
  // An edit from before it was noted: what was to be removed, apart from what
  // its face kept.
  const planned = yield* readJson(Schema.Array(Removal), files.removals);
  const people = yield* readJson(Schema.Array(Person), files.people);
  const faces = Option.getOrElse(people, (): ReadonlyArray<Person> => []);
  return Option.getOrElse(planned, (): ReadonlyArray<Removal> => []).filter(
    ({ box }) => !isOnFace(faces, box),
  );
});
