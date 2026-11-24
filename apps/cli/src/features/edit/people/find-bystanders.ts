import { Effect, Schema } from 'effect';
import { coverage, tidyBox, wholePicture } from '../../../shared/boxes.ts';
import { Box, type Person } from '../../../shared/domain.ts';
import { Vision } from '../../../shared/vision.ts';
import { inParts, inPhoto } from '../parts.ts';
import { withoutRemoved } from '../removals.ts';
import { shareOn } from './outline.ts';

/** Nobody can tell whether somebody this small, in pixels, is drawn right. */
const leastHeight = 24;
/** A box this large holds more of the place than of anybody in it. */
const most = 0.15;
/** Who is this much on a person who is kept exactly is that person. */
const samePerson = 0.25;

const role =
  'You find people in photos so that a program can keep them as they are. Precise positions matter, and nobody may be missed.';

const Everyone = Schema.Struct({
  everyone: Schema.Array(
    Schema.Struct({
      part: Schema.Int,
      box: Box.annotate({
        description:
          'Around everything that is visible of the person, in fractions of the part',
      }),
    }),
  ),
});

const question =
  'Give a box for every person in this photo whose face, body or limbs someone could see to be drawn wrong when looking closely: the main ones, people far in the background, people seen from behind or only in part, and people in mirrors, windows, water and other reflections. Go through every part. Leave out specks and dim shapes that could be anything, statues, drawings, and people on posters and screens. Give one box for people who stand so close together that they can’t be told apart. For each, give the number of the part that shows all of them best, or 0 for the whole photo when no part does, and a box in fractions of the width and height of that part or photo from its top left corner. Answer with an empty list when there is nobody.';

/** Finds everyone in a photo who isn't kept exactly, however small. */
export const findBystanders = Effect.fn('findBystanders')(function* (
  file: string,
  kept: ReadonlyArray<Person>,
  removed: ReadonlyArray<string>,
) {
  const vision = yield* Vision;
  const { size, parts, pieces } = yield* inParts(file);
  const { everyone } = yield* vision.ask({
    role,
    name: 'everyone',
    schema: Everyone,
    pieces: [...pieces, ...withoutRemoved(removed), question],
  });
  return everyone
    .flatMap(({ part, box }): Array<Box> => {
      const place = part === 0 ? wholePicture : parts[part - 1];
      return place === undefined ? [] : [inPhoto(place, tidyBox(box))];
    })
    .filter(
      (box) =>
        coverage(box) > 0 &&
        coverage(box) <= most &&
        (box.bottom - box.top) * size.height >= leastHeight &&
        kept.every((person) => shareOn(person, box) < samePerson),
    );
});
