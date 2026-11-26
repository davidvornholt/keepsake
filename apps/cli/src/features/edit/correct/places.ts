import { Effect, Schema } from 'effect';
import {
  around,
  clamp,
  coverage,
  tidyBox,
  wholePicture,
} from '../../../shared/boxes.ts';
import { Box } from '../../../shared/domain.ts';
import { Vision } from '../../../shared/vision.ts';
import { inParts, inPhoto } from '../parts.ts';

/** More places than this are hardly a change to single ones. */
const mostPlaces = 12;
/** Nor is a change to so much of a photo. */
const mostCoverage = 0.5;
/** Places this close are changed as one, in fractions of the photo. */
const close = 0.01;

const role =
  'You prepare a finished photo for a retoucher, who changes single places in it and leaves everything else exactly as it is. Precise positions matter.';

const Found = Schema.Struct({
  everywhere: Schema.Boolean.annotate({
    description:
      'True when the photo as a whole has to change, such as its light, its colours, its sharpness or its framing',
  }),
  places: Schema.Array(
    Schema.Struct({
      part: Schema.Int,
      what: Schema.String.annotate({
        description:
          'What to do there, as an instruction to the retoucher that cannot mean anything else',
      }),
      isRemoval: Schema.Boolean.annotate({
        description: 'True when something is only taken away there',
      }),
      box: Box.annotate({
        description:
          'Around all that has to change, in fractions of the part or photo',
      }),
    }),
  ),
});

/** How much is shown around what the user marked, in fractions of it. */
const margin = 0.15;

/** What the user marked, with a little around it. */
const withMargin = ({ left, top, right, bottom }: Box): Box => {
  const across = (right - left) * margin;
  const down = (bottom - top) * margin;
  return {
    left: clamp(left - across, 0, 1),
    top: clamp(top - down, 0, 1),
    right: clamp(right + across, 0, 1),
    bottom: clamp(bottom + down, 0, 1),
  };
};

const aboutMarked = (marked: number): string =>
  marked === 0
    ? ''
    : ` They marked where: ${marked === 1 ? 'the last part shows what is' : `the last ${marked} parts show what is`} in their ${marked === 1 ? 'mark' : 'marks'}, with a little around it. They mean what is there, even where their words alone could mean something else, and drew the marks roughly.`;

const question = (wish: string, marked: number) =>
  `Whoever took this photo wants this to be changed: “${wish}”${aboutMarked(marked)}

When that is about the photo as a whole, say that it is everywhere and list no places. Otherwise list every place that has to change, and nothing they didn’t ask for. Go through every part, since nothing may be missed. Give a box for each place, around all that has to change there, with its shadow and its reflection, and as little else as possible. Give one box for small things that lie close together, and at most ${mostPlaces} boxes in all. For each, give the number of the part that shows all of it best, or 0 for the whole photo when no part does, and the box in fractions of the width and height of that part or photo from its top left corner. The list is empty when the photo shows nothing of what they want to be changed.`;

/** A place in a photo and what has to be done there. */
export const Place = Schema.Struct({
  what: Schema.Array(Schema.String),
  isRemoval: Schema.Boolean,
  box: Box,
});
export type Place = typeof Place.Type;

export const Change = Schema.Struct({
  /** Whether the photo as a whole has to change. */
  everywhere: Schema.Boolean,
  places: Schema.Array(Place),
});

const areClose = (left: Box, right: Box): boolean =>
  left.left - close < right.right &&
  right.left - close < left.right &&
  left.top - close < right.bottom &&
  right.top - close < left.bottom;

const together = (left: Place, right: Place): Place => ({
  what: [...left.what, ...right.what],
  isRemoval: left.isRemoval && right.isRemoval,
  box: around([left.box, right.box]),
});

/** Adds a place to others, as one with those that it touches. */
const withPlace = (
  others: ReadonlyArray<Place>,
  place: Place,
): ReadonlyArray<Place> => {
  const other = others.find(({ box }) => areClose(box, place.box));
  return other === undefined
    ? [...others, place]
    : withPlace(
        others.filter((one) => one !== other),
        together(other, place),
      );
};

/** Places that don't touch, the ones that did as one. */
export const apart = (places: ReadonlyArray<Place>): ReadonlyArray<Place> =>
  places.reduce<ReadonlyArray<Place>>(withPlace, []);

/** The part of a box inside another, if there is one. */
const insideOf = (box: Box, area: Box): ReadonlyArray<Box> => {
  const part = {
    left: Math.max(box.left, area.left),
    top: Math.max(box.top, area.top),
    right: Math.min(box.right, area.right),
    bottom: Math.min(box.bottom, area.bottom),
  };
  return part.right > part.left && part.bottom > part.top ? [part] : [];
};

/**
 * The places as far as they are inside what the user marked, with the little
 * around it that the model saw, since the marks are rough. Nothing else may
 * change then, however much the wish is about.
 */
const inMarks = (
  places: ReadonlyArray<Place>,
  marks: ReadonlyArray<Box>,
): ReadonlyArray<Place> =>
  places.flatMap((place) =>
    marks.flatMap((mark) =>
      insideOf(place.box, mark).map((box) => ({ ...place, box })),
    ),
  );

/** What may change of a photo: the marks, with a little around each. */
export const markedAreas = (areas: ReadonlyArray<Box>): ReadonlyArray<Box> =>
  areas.map(withMargin);

/**
 * What has to change, kept to the marks if there are any, also when it was
 * found before marks were kept to.
 */
export const inMarked = (
  change: typeof Change.Type,
  areas: ReadonlyArray<Box>,
): typeof Change.Type =>
  areas.length === 0
    ? change
    : { everywhere: false, places: inMarks(change.places, markedAreas(areas)) };

/** Finds where a finished photo has to change for what the user wants. */
export const findPlaces = Effect.fn('findPlaces')(function* (
  file: string,
  wish: string,
  areas: ReadonlyArray<Box>,
) {
  const vision = yield* Vision;
  const { parts, pieces } = yield* inParts(file, markedAreas(areas));
  const answer = yield* vision.ask({
    role,
    name: 'places',
    schema: Found,
    pieces: [...pieces, question(wish, areas.length)],
  });
  const places = apart(
    answer.places.flatMap(({ part, what, isRemoval, box }) => {
      const whole = part === 0 ? wholePicture : parts[part - 1];
      const tidy = tidyBox(box);
      return whole === undefined || coverage(tidy) <= 0
        ? []
        : [{ what: [what], isRemoval, box: inPhoto(whole, tidy) }];
    }),
  );
  if (areas.length > 0) {
    return inMarked({ everywhere: false, places }, areas);
  }
  const changed = places.reduce((sum, { box }) => sum + coverage(box), 0);
  return answer.everywhere || changed > mostCoverage
    ? { everywhere: true, places: [] }
    : { everywhere: false, places };
});
