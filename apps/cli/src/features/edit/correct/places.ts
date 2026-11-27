import { Effect, Schema } from 'effect';
import {
  around,
  clamp,
  coverage,
  tidyBox,
  wholePicture,
} from '../../../shared/boxes.ts';
import { Box, type Removal } from '../../../shared/domain.ts';
import { sentence } from '../../../shared/sentence.ts';
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
  back: Schema.Array(Schema.Int).annotate({
    description:
      'The numbers of what the edit took out that they want back, from 1',
  }),
  replaces: Schema.Array(Schema.Int).annotate({
    description:
      'The numbers of what they asked for before that the new wish takes back or asks otherwise, from 1',
  }),
});

/** How much is shown around what the user marked, in fractions of it. */
const margin = 0.15;

/** What the user marked, with a little around it. */
export const withMargin = ({ left, top, right, bottom }: Box): Box => {
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

const numbered = (things: ReadonlyArray<string>): string =>
  things.map((thing, index) => `${index + 1}. ${thing}`).join('\n');

/**
 * What the edit took out, which only an edit of the camera's picture can bring
 * back as it was.
 */
const aboutTakenOut = (removed: ReadonlyArray<string>): string =>
  removed.length === 0
    ? ' Answer with an empty list under back.'
    : `

The edit took the following out of the photo, so it no longer shows them:
${numbered(removed)}
List under back the numbers of what they want back, and give no place for it.`;

/** What was asked before, which the new wish may take back. */
const aboutEarlier = (earlier: ReadonlyArray<string>): string =>
  earlier.length === 0
    ? ' Answer with an empty list under replaces.'
    : `

They asked for this before:
${numbered(earlier)}
List under replaces the numbers of what the new wish takes back or asks otherwise, since the new one counts, and nothing that it only adds to.`;

/** What a change is asked for. */
type Asked = {
  readonly wish: string;
  /** What the user marked, in fractions of the photo. */
  readonly areas: ReadonlyArray<Box>;
  /** What the edit took out. */
  readonly removed: ReadonlyArray<Removal>;
  /** What the user asked for before, the latest last. */
  readonly earlier: ReadonlyArray<string>;
};

const question = ({ wish, areas, removed, earlier }: Asked) =>
  `Whoever took this photo wants this to be changed: “${wish}”${aboutMarked(areas.length)}

When that is about the photo as a whole, say that it is everywhere and list no places. Otherwise list every place that has to change, and nothing they didn’t ask for. Go through every part, since nothing may be missed. Give a box for each place, around all that has to change there, with its shadow and its reflection, and as little else as possible. Give one box for small things that lie close together, and at most ${mostPlaces} boxes in all. For each, give the number of the part that shows all of it best, or 0 for the whole photo when no part does, and the box in fractions of the width and height of that part or photo from its top left corner. The list is empty when the photo shows nothing of what they want to be changed.${aboutTakenOut(removed.map(({ what }) => what))}${aboutEarlier(earlier)}`;

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
  /**
   * What the edit took out and is to come back. Changes found before it was
   * asked bring nothing back.
   */
  back: Schema.Array(Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
  /** What was asked for before and the change takes back, the same way. */
  replaced: Schema.Array(Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
});
type Change = typeof Change.Type;

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

const sameBox = (one: Box, other: Box): boolean =>
  one.left === other.left &&
  one.top === other.top &&
  one.right === other.right &&
  one.bottom === other.bottom;

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
  places.flatMap((place) => {
    const parts = marks.flatMap((mark) => insideOf(place.box, mark));
    // A place in marks that overlap is the same in each of them.
    const distinct = parts.filter(
      (part, index) =>
        parts.findIndex((other) => sameBox(other, part)) === index,
    );
    return distinct.map((box) => ({ ...place, box }));
  });

/** What may change of a photo: the marks, with a little around each. */
export const markedAreas = (areas: ReadonlyArray<Box>): ReadonlyArray<Box> =>
  areas.map(withMargin);

/**
 * What has to change, kept to the marks if there are any, also when it was
 * found before marks were kept to.
 */
export const inMarked = (change: Change, areas: ReadonlyArray<Box>): Change =>
  areas.length === 0
    ? change
    : {
        everywhere: false,
        places: inMarks(change.places, markedAreas(areas)),
        back: change.back,
        replaced: change.replaced,
      };

/** Finds where a finished photo has to change for what the user wants. */
export const findPlaces = Effect.fn('findPlaces')(function* (
  file: string,
  asked: Asked,
) {
  const { areas, removed, earlier } = asked;
  const vision = yield* Vision;
  const { parts, pieces } = yield* inParts(file, markedAreas(areas));
  const answer = yield* vision.ask({
    role,
    name: 'places',
    schema: Found,
    pieces: [...pieces, question(asked)],
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
  const marks = markedAreas(areas);
  // Where the user marked something, only what was there comes back.
  const back = [...new Set(answer.back)]
    .flatMap((number) => removed[number - 1] ?? [])
    .filter(
      ({ box }) =>
        marks.length === 0 ||
        marks.some((mark) => insideOf(box, mark).length > 0),
    )
    .map(({ what }) => what);
  const replaced = [...new Set(answer.replaces)].flatMap(
    (number) => earlier[number - 1] ?? [],
  );
  const asWished = { back, replaced };
  // Kept to the marks once they are read, also where they were found before.
  if (areas.length > 0) {
    return { everywhere: false, places, ...asWished } satisfies Change;
  }
  const changed = places.reduce((sum, { box }) => sum + coverage(box), 0);
  return answer.everywhere || changed > mostCoverage
    ? ({ everywhere: true, places: [], ...asWished } satisfies Change)
    : ({ everywhere: false, places, ...asWished } satisfies Change);
});

/**
 * The wishes a photo has once it is changed: what was asked before and isn't
 * taken back, then the new wish. What is to come back is named as the edit
 * named it, since the user's words may only point at it, and apart, so that a
 * later wish can take it back alone.
 */
export const wishesAfter = (
  earlier: ReadonlyArray<string>,
  wish: string,
  { everywhere, places, back, replaced }: Change,
): ReadonlyArray<string> => {
  const isOnlyBack = back.length > 0 && !everywhere && places.length === 0;
  return [
    ...earlier.filter((before) => !replaced.includes(before)),
    ...(isOnlyBack ? [] : [wish]),
    ...(back.length === 0
      ? []
      : [`Keep what was taken out before: ${back.map(sentence).join(' ')}`]),
  ];
};
