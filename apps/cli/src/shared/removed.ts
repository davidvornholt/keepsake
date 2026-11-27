import { Effect, Option, Schema } from 'effect';
import { type EditRecord, Removal } from './domain.ts';
import type { EditFiles } from './edit-files.ts';
import { readJson } from './store.ts';

/** What an edit took out of its photo, which only the camera's can bring back. */
export const removedBy = Effect.fn('removedBy')(function* (
  record: EditRecord,
  files: Pick<EditFiles, 'removals'>,
) {
  if (record.version === 'camera') {
    return [];
  }
  if (record.removed !== undefined) {
    return record.removed;
  }
  const planned = yield* readJson(Schema.Array(Removal), files.removals);
  return Option.getOrElse(planned, (): ReadonlyArray<Removal> => []);
});
