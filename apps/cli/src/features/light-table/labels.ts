import { Effect, Option, Schema } from 'effect';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { type OpenShoot, readJson, writeJson } from '../../shared/store.ts';
import type { NewLabels } from './schemas.ts';

const Labels = Schema.Record(Schema.String, Schema.Array(Schema.String));

/** The owner's labels, by photo. */
export const readLabels = ({ files }: OpenShoot) =>
  Effect.map(
    readJson(Labels, files.labels),
    Option.getOrElse((): typeof Labels.Type => ({})),
  );

/** Gives a photo these labels instead of the ones it has. */
export const saveLabels = Effect.fn('saveLabels')(function* (
  open: OpenShoot,
  { photo, labels }: NewLabels,
) {
  if (!open.photos.has(photo)) {
    return yield* new InvalidInput({
      message: 'The shoot doesn’t have this photo.',
    });
  }
  const { [photo]: _, ...others } = yield* readLabels(open);
  const tidy = [
    ...new Set(labels.map((label) => label.trim()).filter(Boolean)),
  ];
  yield* writeJson(
    Labels,
    open.files.labels,
    tidy.length === 0 ? others : { ...others, [photo]: tidy },
  );
});
