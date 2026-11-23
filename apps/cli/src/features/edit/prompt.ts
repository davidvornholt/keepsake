import type { Photo, Pick, Shoot } from '../../shared/domain.ts';

const sentence = (text: string) => {
  const trimmed = text.trim();
  return trimmed === '' || trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
};

/** What the image model is asked to do with a photo. */
export const editPrompt = (
  shoot: Shoot,
  photo: Photo,
  pick: Pick,
  problems: string | null,
): string => {
  const origin = [
    shoot.about === null ? '' : ` from ${shoot.about}`,
    photo.camera === null ? '' : `, taken with a ${photo.camera}`,
  ].join('');
  const avoid =
    problems === null
      ? ''
      : `\n\nAn earlier attempt had these problems. Avoid them: ${sentence(problems)}`;
  return `This is a personal photograph${origin}. ${sentence(pick.description)} Make it a beautiful photograph I would want to print and hang on the wall.

You may freely improve light, colour, contrast, sky, sharpness and detail; invent fine detail; fix soft focus, blur and noise; calm or tidy distracting parts of the background; straighten. Keep the framing.

Keep it recognisably the same moment: the same subject in the same pose, in the same place, at the same time of day and in the same weather. Distracting parts may become softer, calmer and more pleasing, but the background stays what it is: don't open up a sky, water or a view where the photo shows none, and don't replace trees, walls, rocks or buildings with something else. Every person keeps exactly the same face, body, hair and clothes, and every text and sign keeps the same words.

No added sun rays, no fantasy light, no stylisation. It should look like an exceptional photograph, not a painting or a render.${avoid}`;
};
