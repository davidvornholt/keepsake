import { Effect, Schema } from 'effect';
import { coverage, tidyBox } from '../../shared/boxes.ts';
import { Box } from '../../shared/domain.ts';
import { frameOf, rendered, sizeOf } from '../../shared/pictures.ts';
import { type Piece, Vision } from '../../shared/vision.ts';
import { aboutBeyond } from './beyond.ts';
import { inPhoto, partsOf } from './parts.ts';
import { aboutRemoved } from './removals.ts';

const wholeSide = 1024;

const role = `You are the last one to check a photo that an image model edited, before it is hung on a wall for whoever took it. You look at it part by part in full size, next to the same part of the original. The edit may improve light, colour, sky and sharpness, calm the background, remove distractions and invent fine detail, and none of that is a fault.

A fault is what looks wrong to someone who stands in front of the photo: a person, large or small, near or far, seen from behind or in a reflection, whose face, limbs or body are melted, smeared, doubled or missing, or who became somebody else; an animal with the wrong anatomy; someone or something that looks pasted in, as light, colour or sharpness don’t fit what is around it, or as it has a halo or hair with hard edges; foliage, grass, rock or water that turned into an artificial pattern, with hard outlines, the same shape over and over, or a woven grid, where the original looks natural; a structure, a text or an object that makes no sense, floats, merges with another or ends nowhere; what is left of something half removed; and a face that is too dark to see. Something in the original too is a fault when it looks like a mistake in the finished photo, such as a shape nobody can explain.`;

const Faults = Schema.Struct({
  faults: Schema.Array(
    Schema.Struct({
      part: Schema.Int,
      box: Box.annotate({
        description: 'Around all of it, in fractions of the part',
      }),
      what: Schema.String.annotate({
        description: 'What is wrong and where, in a sentence',
      }),
      kind: Schema.Literals(['people', 'texture', 'other']),
      serious: Schema.Boolean.annotate({
        description:
          'True when someone who takes half a minute to look at the photo on a large screen is bothered by it, false when it only shows in a comparison or when they search for it',
      }),
      rightInOriginal: Schema.Boolean.annotate({
        description:
          'True when the same place looks right in the original and could be put back from it. False for what is left of something half removed, since the original shows all of it, and for what the original shows wrongly too.',
      }),
      inOriginal: Schema.Boolean.annotate({
        description:
          'True when the original shows the same fault at the same place, such as a face that is as dark there. False for what the edit made, such as what is left of something half removed.',
      }),
    }),
  ),
});

const question =
  'Go through all parts one by one, and through every person in them, and list each fault with the number of the part that shows it best and a box around it, in fractions of the width and height of that part from its top left corner. The list is empty when there is none. Don’t list improvements, and nothing that merely looks different.';

export const Fault = Schema.Struct({
  /** Where it is, in fractions of the photo. */
  box: Box,
  what: Schema.String,
  kind: Schema.Literals(['people', 'texture', 'other']),
  serious: Schema.Boolean,
  /** Whether putting the original's pixels back would mend it. */
  rightInOriginal: Schema.Boolean,
  /**
   * Whether the original has it as well. Inspections noted before it was asked
   * count it as the edit's.
   */
  inOriginal: Schema.Boolean.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(false)),
  ),
});
export type Fault = typeof Fault.Type;

/** Looks closely at an edit for what is wrong with it. */
export const inspect = Effect.fn('inspect')(function* (
  files: { readonly original: string; readonly version: string },
  {
    crop,
    removed,
  }: { readonly crop: Box; readonly removed: ReadonlyArray<string> },
) {
  const vision = yield* Vision;
  const size = yield* sizeOf(files.version);
  const originalSize = yield* sizeOf(files.original);
  const parts = partsOf(size);
  const closeUps = yield* Effect.forEach(parts, (part, index) =>
    Effect.gen(function* () {
      return [
        `Part ${index + 1}, original:`,
        yield* rendered(files.original, {
          frame: frameOf(part, originalSize),
        }),
        `Part ${index + 1}, edit:`,
        yield* rendered(files.version, { frame: frameOf(part, size) }),
      ] satisfies Array<Piece>;
    }),
  );
  const { faults } = yield* vision.ask({
    role,
    name: 'faults',
    schema: Faults,
    pieces: [
      'The original:',
      yield* rendered(files.original, { longSide: wholeSide }),
      'The edit:',
      yield* rendered(files.version, { longSide: wholeSide }),
      ...closeUps.flat(),
      ...aboutRemoved(removed),
      ...aboutBeyond(crop),
      question,
    ],
  });
  return faults.flatMap(({ part, box, ...fault }): Array<Fault> => {
    const place = parts[part - 1];
    const tidy = tidyBox(box);
    return place === undefined || coverage(tidy) <= 0
      ? []
      : [{ ...fault, box: inPhoto(place, tidy) }];
  });
});
