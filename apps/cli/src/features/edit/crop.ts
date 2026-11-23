import { Effect, Schema } from 'effect';
import {
  around,
  coverage,
  holds,
  tidyBox,
  widened,
} from '../../shared/boxes.ts';
import {
  type AspectName,
  aspectNames,
  Box,
  type Crop,
  type Pick,
  type Shoot,
} from '../../shared/domain.ts';
import { frameOf, rendered, type Size, sizeOf } from '../../shared/pictures.ts';
import { type Piece, Vision } from '../../shared/vision.ts';
import { closestAspect, fitAspect, within } from './geometry.ts';

const pictureSide = 1024;
const mostProposals = 3;
/** A crop that keeps more than this isn't worth telling from the whole. */
const almostEverything = 0.97;
/** How much room there is around what belongs to a photo. */
const air = 0.02;

const role = `You crop photos for someone who likes tight crops, but not at the price of what belongs to the photo. A good crop makes the subject large and clear, takes away everything that adds nothing, and puts the subject where the eye wants it. A bird or another animal usually deserves to fill a good part of the frame, and so do a face, a flower, or a detail. A landscape, a skyline or a building often needs its surroundings, so crop it only where the edges add nothing.

What belongs to a photo stays in it: a landmark, a skyline or a view behind the subject that shows where it was taken, even out of focus; all of a group, a row or a pattern, such as every bird on a branch; and whatever else makes it funny, tells its story, or would be missed by someone who was there. Plain sky or water, dark edges, leaves, strangers, clutter, a feeder or a fence around an animal, and whatever the edge of the photo already cuts off don't belong to it. When animals or people do something together up close, only the parts that do it belong, such as the heads of two birds that feed each other.

Leave room in front of a subject that looks or moves in a direction. Never cut off a part of the subject that is in the frame, such as feet, a tail, wing tips, a reflection, the top of a building, or a person's hands, unless you go clearly and deliberately close, as in a portrait of a head.`;

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

const proposalQuestion = `First give a box around the main subject, all of it. Then list what else belongs to the photo, each with a box around all of it that is in the frame; the list is empty when only the subject counts. Then propose up to ${mostProposals} crops that could make this a stronger photo: one tight, one moderate, and one in another shape if that suits the subject. Each must show everything you listed. Propose none if the whole frame can't be improved. All boxes are fractions of the photo's width and height from its top left corner. Choose the shape each crop should have.`;

const Choice = Schema.Struct({
  best: Schema.Int,
  reason: Schema.String.annotate({ description: 'One short sentence' }),
});

const choiceQuestion = (count: number) =>
  `These are ${count} ways to frame the same photo; photo 1 is the whole frame. An edit will improve light and sharpness later, so judge only the framing. Which one would you hang on the wall? Prefer the tighter one when two are equally good. Don't choose one that cuts off the subject carelessly, loses something that belongs to the photo, or feels cramped.`;

type Candidate = {
  readonly box: Box;
  readonly aspect: AspectName;
  readonly reason: string;
};

const wholePhoto = (size: Size): Candidate => {
  const aspect = closestAspect(size);
  return {
    box: fitAspect({ left: 0, top: 0, right: 1, bottom: 1 }, size, aspect),
    aspect,
    reason: 'The whole frame is best.',
  };
};

/** Finds the framing that makes the strongest photo. */
export const chooseCrop = Effect.fn('chooseCrop')(function* (
  shoot: Shoot,
  pick: Pick,
  /** The whole photo, the right way up. */
  camera: string,
) {
  const vision = yield* Vision;
  const size = yield* sizeOf(camera);
  const whole = wholePhoto(size);
  const about = shoot.about === null ? '' : `The shoot: ${shoot.about}. `;
  const introduction = `${about}The photo: ${pick.description}`;
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
            tidyBox(box),
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
        coverage(box) < almostEverything &&
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
