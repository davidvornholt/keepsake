import { createHash } from 'node:crypto';
import { Effect, Option } from 'effect';
import { Description, whatToDescribe } from '../../shared/describing.ts';
import type { Box, Shoot } from '../../shared/domain.ts';
import type { EditFiles } from '../../shared/edit-files.ts';
import { rendered } from '../../shared/pictures.ts';
import { readJson, writeJson } from '../../shared/store.ts';
import { Vision } from '../../shared/vision.ts';
import { edgesBeyond } from './beyond.ts';
import { withoutRemoved } from './removals.ts';

const pictureSide = 1024;

const role =
  'You describe photos for someone who edits them without having seen them, so say only what each one really shows.';

/**
 * Says what a photo shows once it is framed, unless it has said so before. What
 * the frame leaves out, or what is removed, isn't mentioned, or the image model
 * would bring it back.
 */
export const descriptionOf = Effect.fn('descriptionOf')(function* (
  shoot: Shoot,
  files: Pick<EditFiles, 'description' | 'input'>,
  frame: Box,
  removed: ReadonlyArray<string>,
) {
  const vision = yield* Vision;
  const before = yield* readJson(Description, files.description);
  if (Option.isSome(before)) {
    return before.value.description;
  }
  const about = shoot.about === null ? '' : `The shoot: ${shoot.about}. `;
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
      ...withoutRemoved(removed),
      `Describe ${whatToDescribe}`,
    ],
  });
  yield* writeJson(Description, files.description, answer);
  return answer.description;
});

/**
 * Says what a finished picture shows, apart from what is removed from it. Each
 * picture is described once for what it leaves out.
 */
export const shownIn = (
  shoot: Shoot,
  files: Pick<EditFiles, 'shown'>,
  picture: { readonly file: string; readonly frame: Box },
  removed: ReadonlyArray<string>,
) => {
  const key = createHash('sha256')
    .update(JSON.stringify({ ...picture, removed }))
    .digest('hex');
  return descriptionOf(
    shoot,
    { input: picture.file, description: files.shown(key) },
    picture.frame,
    removed,
  );
};
