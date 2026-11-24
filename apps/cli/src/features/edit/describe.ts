import { Effect, Schema } from 'effect';
import { whatToDescribe } from '../../shared/describing.ts';
import type { Pick } from '../../shared/domain.ts';
import { rendered } from '../../shared/pictures.ts';
import type { OpenShoot } from '../../shared/store.ts';
import { Vision } from '../../shared/vision.ts';

const pictureSide = 1024;

const role =
  'You describe photos for someone who edits them without having seen them, so say only what each one really shows.';

const Description = Schema.Struct({ description: Schema.String });

/** The pick with what its own photo shows, not another frame of its moment. */
export const described = Effect.fn('described')(function* (
  open: OpenShoot,
  pick: Pick,
) {
  const vision = yield* Vision;
  const about =
    open.shoot.about === null ? '' : `The shoot: ${open.shoot.about}. `;
  const { description } = yield* vision.ask({
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
  return { ...pick, description };
});
