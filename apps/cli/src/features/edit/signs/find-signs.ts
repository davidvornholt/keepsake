import { Effect, Schema } from 'effect';
import { coverage, tidyBox } from '../../../shared/boxes.ts';
import { Box, type Sign } from '../../../shared/domain.ts';
import { Vision } from '../../../shared/vision.ts';
import { inParts, inPhoto } from '../parts.ts';
import { withoutRemoved } from '../removals.ts';

const role =
  'You mark the signs in photos so that a program can keep them exactly as they are. Precise positions matter.';

const Signs = Schema.Struct({
  signs: Schema.Array(
    Schema.Struct({
      part: Schema.Int,
      text: Schema.String,
      box: Box.annotate({
        description:
          'Around all of the text and its logo, in fractions of the part',
      }),
    }),
  ),
});

const question =
  'Mark every text, number and logo that can be read or recognised in this photo when looking closely, large and small: on buildings, roofs, shops, boats, vehicles, roads, traffic signs, number plates, banners and screens. Leave out what is so small or blurred that nobody could tell what it says. For each, give the number of the part that shows it best, what it says, and a box around it, in fractions of the width and height of that part from its top left corner. Answer with an empty list when there is none.';

/** Finds the signs in a photo that can be read. */
export const findSigns = Effect.fn('findSigns')(function* (
  file: string,
  removed: ReadonlyArray<string>,
) {
  const vision = yield* Vision;
  const { parts, pieces } = yield* inParts(file);
  const { signs } = yield* vision.ask({
    role,
    name: 'signs',
    schema: Signs,
    pieces: [...pieces, ...withoutRemoved(removed), question],
  });
  return signs.flatMap(({ part, text, box }): Array<Sign> => {
    const place = parts[part - 1];
    const tidy = tidyBox(box);
    return place === undefined || coverage(tidy) <= 0
      ? []
      : [{ text, box: inPhoto(place, tidy) }];
  });
});
