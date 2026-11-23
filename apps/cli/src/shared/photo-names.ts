import { Effect } from 'effect';
import { InvalidInput } from './errors/errors.ts';
import type { OpenShoot } from './store.ts';

const lastPart = (id: string) => id.slice(id.lastIndexOf('/') + 1);

/** The photo with this id, or with this name in whichever folder it is. */
export const photoNamed = Effect.fn('photoNamed')(function* (
  open: OpenShoot,
  name: string,
) {
  const whole = open.photos.get(name);
  if (whole !== undefined) {
    return whole;
  }
  const matches = [...open.photos.values()].filter(
    ({ id }) => lastPart(id) === name,
  );
  const [photo] = matches;
  if (photo === undefined || matches.length > 1) {
    return yield* new InvalidInput({
      message:
        photo === undefined
          ? `${open.shoot.name} has no photo called ${name}.`
          : `${name} names ${matches.length} photos. Use one of their ids: ${matches.map(({ id }) => id).join(', ')}.`,
    });
  }
  return photo;
});
