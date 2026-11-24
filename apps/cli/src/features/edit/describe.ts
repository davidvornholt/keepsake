import { Effect, Option, Schema } from 'effect';
import { whatToDescribe } from '../../shared/describing.ts';
import type { Box } from '../../shared/domain.ts';
import { rendered } from '../../shared/pictures.ts';
import { type OpenShoot, readJson, writeJson } from '../../shared/store.ts';
import { Vision } from '../../shared/vision.ts';
import { edgesBeyond } from './beyond.ts';

const pictureSide = 1024;

const role =
  'You describe photos for someone who edits them without having seen them, so say only what each one really shows.';

const Description = Schema.Struct({ description: Schema.String });

/**
 * Says what a photo shows once it is framed, unless it has said so before. What
 * the frame leaves out isn't mentioned, or the image model would bring it back.
 */
export const descriptionOf = Effect.fn('descriptionOf')(function* (
  open: OpenShoot,
  photo: string,
  frame: Box,
) {
  const vision = yield* Vision;
  const files = open.files.edit(photo);
  const before = yield* readJson(Description, files.description);
  if (Option.isSome(before)) {
    return before.value.description;
  }
  const about =
    open.shoot.about === null ? '' : `The shoot: ${open.shoot.about}. `;
  const edges = edgesBeyond(frame);
  const beyond =
    edges === null
      ? ''
      : ` The plain grey area at the ${edges} is not part of it. The finished photo will show there what is cut off now, so mention neither the grey area nor that anything is cut off at it.`;
  const answer = yield* vision.ask({
    role,
    name: 'description',
    schema: Description,
    pieces: [
      `${about}Here is one photo.${beyond}`,
      yield* rendered(files.input, { longSide: pictureSide }),
      `Describe ${whatToDescribe}`,
    ],
  });
  yield* writeJson(Description, files.description, answer);
  return answer.description;
});
