import { Effect, Option, Schema } from 'effect';
import { whatToDescribe } from '../../shared/describing.ts';
import type { Pick } from '../../shared/domain.ts';
import { rendered } from '../../shared/pictures.ts';
import { type OpenShoot, readJson, writeJson } from '../../shared/store.ts';
import { Vision } from '../../shared/vision.ts';

const pictureSide = 1024;

const role =
  'You describe photos for someone who edits them without having seen them, so say only what each one really shows.';

const Description = Schema.Struct({ description: Schema.String });

/** Says what a photo shows, unless it has said so before. */
export const descriptionOf = Effect.fn('descriptionOf')(function* (
  open: OpenShoot,
  pick: Pick,
) {
  const vision = yield* Vision;
  const files = open.files.edit(pick.photo);
  const before = yield* readJson(Description, files.description);
  if (Option.isSome(before)) {
    return before.value.description;
  }
  const about =
    open.shoot.about === null ? '' : `The shoot: ${open.shoot.about}. `;
  const answer = yield* vision.ask({
    role,
    name: 'description',
    schema: Description,
    pieces: [
      `${about}Here is one photo.`,
      yield* rendered(open.files.preview(pick.photo), {
        longSide: pictureSide,
      }),
      `Describe ${whatToDescribe}`,
    ],
  });
  yield* writeJson(Description, files.description, answer);
  return answer.description;
});
