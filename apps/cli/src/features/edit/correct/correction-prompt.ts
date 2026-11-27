import type { Shoot } from '../../../shared/domain.ts';
import { sentence } from '../../../shared/sentence.ts';
import { listed } from '../removals.ts';
import type { Place } from './places.ts';

/** A place to change, and what was wrong with the attempt before. */
export type ToChange = {
  readonly place: Place;
  readonly problem: string | null;
};

const changeOf = ({ place, problem }: ToChange): string => {
  const what = place.what.map(sentence).join(' ');
  return problem === null
    ? what
    : `${what} An earlier attempt failed: ${sentence(problem)}`;
};

/** What the image model is asked to do with a finished photo. */
export const correctionPrompt = (
  shoot: Shoot,
  description: string,
  changes: ReadonlyArray<ToChange>,
): string => {
  const origin = shoot.about === null ? '' : ` from ${shoot.about}`;
  const removing = changes.some(({ place }) => place.isRemoval)
    ? '\n\nWhat is removed goes with its shadow and its reflection. Continue what is behind it as it would look there, as sharp and as finely textured as what is around it, without a trace, a blur, a gap or a repeated pattern, and put nothing else in its place.'
    : '';
  return `This is a finished photograph${origin}. ${sentence(description)} Change only the following:

${listed(changes.map(changeOf))}${removing}

Keep everything else exactly as it is, pixel for pixel: the framing, the position and the size of everything, light, colours, contrast, sharpness, texture and grain. Don't improve, sharpen or tidy anything else. Every other person keeps exactly the same face, body, hair and clothes, and every other text and sign the same words. It should look like the same photograph, not a painting or a render.`;
};
