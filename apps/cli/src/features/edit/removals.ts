import { Effect, Schema } from 'effect';
import { tidyBox } from '../../shared/boxes.ts';
import { Box } from '../../shared/domain.ts';
import { rendered } from '../../shared/pictures.ts';
import { Vision } from '../../shared/vision.ts';
import { edgesBeyond } from './beyond.ts';

const pictureSide = 2000;

const role =
  'You prepare the photos of a private trip for a retoucher, who can take away whatever spoils a photo and continue what is behind it.';

const Removals = Schema.Struct({
  remove: Schema.Array(
    Schema.Struct({
      what: Schema.String.annotate({
        description:
          'What it is and where, so precisely that nothing else can be meant',
      }),
      box: Box.annotate({
        description:
          'Around all of it, in fractions of the photo’s width and height from its top left corner',
      }),
    }),
  ),
});

const question = `What should the retoucher take away? Name what pulls the eye away from what the photo is about and what anyone would rather not see in it:

- Strangers who happen to be in a photo of someone or something else, such as a building, a garden, a view, an animal or a couple: those behind or beside the people it was taken of, and those who stand or walk in front of a sight or along a path in it. Name all of them, or none. Leave them where they are part of what the photo shows: a crowd, a busy street, a market, a queue, a show, traffic, or people who do what the photo is about.
- Things that got into the frame and hide, cut into or crowd what the photo is about: other people’s hands, heads and phones, lamps, spotlights and floodlights, chairs, bins, boxes, cones, notices and prohibition signs.
- What was put up for use or for a while and spoils the view: cranes, scaffolding and other building work with its fences and barriers, fences, railings and nets in front of a view, a sight or an animal, poles, masts and overhead wires, and metal decorations fixed to a building or a sight. Name them also where they are there for good, unless the photo is about them or they tell the place.

Keep what the photo is about and what tells where it was taken: its subject, the people it was taken of and those who are with them, such as people who pose, look at the camera or are together with them, with everything they wear and carry, the buildings, sights, landmarks, streets, walls and landscape of the place, such as a lighthouse, a tower or a ship’s mast that the place is known for, and the signs that name it. Keep plants, sky and water, and what is hardly seen. Many photos need nothing: the list is empty then.`;

/** Finds what a photo is better without. */
export const findRemovals = Effect.fn('findRemovals')(function* (
  file: string,
  crop: Box,
  wish: string | null,
) {
  const vision = yield* Vision;
  const edges = edgesBeyond(crop);
  const beyond =
    edges === null
      ? []
      : [
          `The plain grey area at the ${edges} is not part of the photo and will be filled anyway.`,
        ];
  const wanted =
    wish === null
      ? []
      : [
          `Whoever took the photo wants this: “${wish}” That comes first. Name everything they want to have removed, and nothing they want to keep.`,
        ];
  const { remove } = yield* vision.ask({
    role,
    name: 'removals',
    schema: Removals,
    pieces: [
      yield* rendered(file, { longSide: pictureSide }),
      ...beyond,
      question,
      ...wanted,
    ],
  });
  return remove.map(({ what, box }) => ({ what, box: tidyBox(box) }));
});

export const listed = (things: ReadonlyArray<string>): string =>
  things.map((thing) => `- ${thing}`).join('\n');

/** Has a question about a photo leave out what will be removed from it. */
export const withoutRemoved = (
  removed: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  removed.length === 0
    ? []
    : [
        `The following will be removed from the photo, so leave it out of your answer:\n${listed(removed)}`,
      ];

/** The same for what the user wants to have removed, also where nothing names it. */
export const withoutUnwanted = (
  removed: ReadonlyArray<string>,
  wish: string | null,
): ReadonlyArray<string> => [
  ...withoutRemoved(removed),
  ...(wish === null
    ? []
    : [
        `Whoever took the photo wants this: “${wish}” Leave out everyone who isn’t to be in it any more, also where nothing above names them.`,
      ]),
];

/**
 * What stays although the list of what to remove may name it, which the edit
 * and the reviews are told alike.
 */
export const keepingFirst =
  'Keeping the subject, someone who is with the people the photo was taken of, and what tells the place, such as a landmark, a sight or a distinctive mast or tower that stands there for good, comes before this list.';

/** What to know about versions something was removed from. */
export const aboutRemoved = (
  removed: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  removed.length === 0
    ? []
    : [
        `The edit was asked to remove the following and to continue what is behind it. Taking away just that is no fault and changes neither the moment nor the place, the people or the text. It is a fault when any of it is still there, when a trace, a smear or a gap shows where it was, or when something else was put there:\n${listed(removed)}\n${keepingFirst} Where the list names any of that, it is no fault that it is still there, and a fault when it is gone.`,
      ];
