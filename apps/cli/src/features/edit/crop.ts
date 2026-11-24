import { Effect, Schema } from 'effect';
import {
  around,
  coverage,
  holds,
  tidyBox,
  wholePicture,
  widened,
} from '../../shared/boxes.ts';
import {
  type AspectName,
  aspectNames,
  Box,
  type Crop,
  type Shoot,
} from '../../shared/domain.ts';
import { frameOf, rendered, type Size, sizeOf } from '../../shared/pictures.ts';
import { type Piece, Vision } from '../../shared/vision.ts';
import { frameBox, isMostlyPhoto } from './beyond.ts';
import { closestAspect, fitAspect, within } from './geometry.ts';

const pictureSide = 1024;
const mostProposals = 3;
/** A frame this close to all of the photo isn't worth telling from it. */
const almostEverything = 0.97;
/** How much room there is around what belongs to a photo. */
const air = 0.02;

/** What to know about a photo to frame it. */
type About = {
  /** What it shows. */
  readonly description: string;
  /** What the user wants to be done with it. */
  readonly wish: string | null;
};

const role = `You frame the photos of a private trip for an album. Look for an interesting composition rather than a large subject. A photo may show one thing close up, but it often says more when it shows how things come together: an animal and the place it lives in, someone and what they look at, a building and the street in front of it, a group, a row or a pattern, a reflection, or layers from near to far. Give what the eye goes to a strong place, let lines and shapes lead to it, balance it with what else is there, and leave room in front of a subject that looks or moves in a direction.

Take away only what adds nothing: plain sky or water without a purpose, dark edges, clutter, strangers at the edge, or a feeder or a fence around an animal. Go close only where the surroundings add nothing, or where a face, a gesture or a detail is what counts. Keep what shows where the photo was taken, what makes it funny or tells its story, all of a group, a row or a pattern, and whatever else would be missed by someone who was there, even out of focus. Never cut off a part of the subject that is in the frame, such as feet, a tail, wing tips, a reflection, the top of a building, or a person's hands, unless you go clearly and deliberately close, as in a portrait of a head.

The image model that edits the photo afterwards can also continue the scene beyond the edges of the photo and complete what they cut off, such as the tip of a wing or the top of a tower, as long as anyone could guess what is there. So a frame may reach beyond the photo, by up to a quarter of its width or height on each side: its box then has numbers below 0 or above 1. Do this only where it makes the photo clearly stronger, because a subject is cut off or has no room, and never where it would have to make up a person or a text.`;

const Proposals = Schema.Struct({
  subject: Box,
  belongings: Schema.Array(Schema.Struct({ what: Schema.String, box: Box })),
  crops: Schema.Array(
    Schema.Struct({
      box: Box,
      aspect: Schema.Literals(aspectNames),
      reason: Schema.String,
    }),
  ),
});

const proposalQuestion = `First give a box around the main subject, all of it, or around what the eye goes to when there is no single subject. Then list what else belongs to the photo, each with a box around all of it that is in the frame; the list is empty when only the subject counts. Then propose up to ${mostProposals} frames that could make this a stronger photo, as different from each other as the photo allows, such as the scene with little taken away, a closer one, or another shape. Each must show everything you listed. Propose none if the whole photo is the best composition. All boxes are fractions of the photo's width and height from its top left corner. Choose the shape each frame should have.`;

const Choice = Schema.Struct({
  best: Schema.Int,
  reason: Schema.String.annotate({ description: 'One short sentence' }),
});

const choiceQuestion = (count: number) =>
  `These are ${count} ways to frame the same photo; photo 1 is all of it. An edit will improve light and sharpness later, and fill plain grey areas by continuing the scene, so judge only the composition. Which one is the most interesting, the one you would most like to see in the album? Don't choose one that cuts off the subject carelessly, loses something that belongs to the photo, feels cramped, squeezes the subject against an edge, or lets an animal fill the frame for no reason, nor one with grey areas where one without them is as good.`;

type Candidate = {
  readonly box: Box;
  readonly aspect: AspectName;
  readonly reason: string;
};

const wholePhoto = (size: Size): Candidate => {
  const aspect = closestAspect(size);
  return {
    box: fitAspect(wholePicture, size, aspect),
    aspect,
    reason: 'The whole photo is best.',
  };
};

/** Whether a frame shows almost all of the photo and nothing beyond it. */
const isWhole = (box: Box): boolean =>
  coverage(tidyBox(box)) >= almostEverything &&
  coverage(box) <= 1 / almostEverything;

/** Finds the framing that makes the strongest photo. */
export const chooseCrop = Effect.fn('chooseCrop')(function* (
  shoot: Shoot,
  /** The whole photo, the right way up. */
  camera: string,
  { description, wish }: About,
) {
  const vision = yield* Vision;
  const size = yield* sizeOf(camera);
  const whole = wholePhoto(size);
  const about = shoot.about === null ? '' : `The shoot: ${shoot.about}. `;
  const wanted =
    wish === null
      ? ''
      : ` Whoever took the photo wants this, which comes first where it is about the framing: “${wish}”`;
  const introduction = `${about}The photo: ${description}${wanted}`;
  const proposals = yield* vision.ask({
    role,
    name: 'crops',
    schema: Proposals,
    pieces: [
      introduction,
      yield* rendered(camera, { longSide: pictureSide }),
      proposalQuestion,
    ],
  });
  const belongings = proposals.belongings.map(({ box }) => tidyBox(box));
  const crops = proposals.crops
    .slice(0, mostProposals)
    .map(
      ({ box, aspect, reason }): Candidate => ({
        // However tight the proposal is, what belongs to the photo stays.
        box: fitAspect(
          around([
            frameBox(box),
            ...belongings.map((belonging) => widened(belonging, air)),
          ]),
          size,
          aspect,
        ),
        aspect,
        reason,
      }),
    )
    .filter(
      ({ box }) =>
        !isWhole(box) &&
        isMostlyPhoto(box) &&
        belongings.every((belonging) => holds(box, belonging)),
    );
  const candidates = [whole, ...crops];
  const subject = tidyBox(proposals.subject);
  const asCrop = ({ box, aspect, reason }: Candidate): Crop => ({
    box,
    aspect,
    subject: within(subject, box),
    reason,
  });
  if (crops.length === 0) {
    return asCrop(whole);
  }
  const pictures = yield* Effect.forEach(candidates, ({ box }) =>
    rendered(camera, { frame: frameOf(box, size), longSide: pictureSide }),
  );
  const choice = yield* vision.ask({
    role,
    name: 'choice',
    schema: Choice,
    pieces: [
      introduction,
      ...pictures.flatMap(
        (picture, index): Array<Piece> => [`Photo ${index + 1}:`, picture],
      ),
      choiceQuestion(candidates.length),
    ],
  });
  const best = candidates[choice.best - 1] ?? whole;
  return asCrop({ ...best, reason: choice.reason });
});
