import { Effect, Schema } from 'effect';
import { clamp, coverage, tidyBox } from '../../../shared/boxes.ts';
import { Box, type Person, Point } from '../../../shared/domain.ts';
import { rendered } from '../../../shared/pictures.ts';
import { Vision } from '../../../shared/vision.ts';

const pictureSide = 1536;
const fewestPoints = 3;

const role =
  'You mark people in photos so that a program can keep them exactly as they are. Precise positions matter.';

const People = Schema.Struct({
  people: Schema.Array(
    Schema.Struct({
      face: Box.annotate({
        description:
          'Around the face, from hairline to chin, or around the head when the face is turned away',
      }),
      outline: Schema.Array(Point).annotate({
        description: '30 to 60 points in order along the outline',
      }),
    }),
  ),
});

const question =
  "Mark every person in this photo whom someone who knows them could recognise, and everyone whose face is as large but too dark for that, since an edit may bring it out. Leave out people who are too far away for that, and people on posters, paintings and statues. Give for each person a box around the face and an outline of everything that belongs to them: hair, hat, body, clothes, hands, and what they wear or hold. Follow the visible silhouette closely, rather a little too wide than too narrow, and leave out what covers them. All positions are fractions of the photo's width and height from its top left corner. Answer with an empty list when there is nobody.";

const tidyPoint = ({ x, y }: Point): Point => ({
  x: clamp(x, 0, 1),
  y: clamp(y, 0, 1),
});

/** Finds the people in a photo who can be recognised. */
export const findPeople = Effect.fn('findPeople')(function* (file: string) {
  const vision = yield* Vision;
  const { people } = yield* vision.ask({
    role,
    name: 'people',
    schema: People,
    pieces: [yield* rendered(file, { longSide: pictureSide }), question],
  });
  return people
    .map(
      ({ face, outline }): Person => ({
        face: tidyBox(face),
        outline: outline.map(tidyPoint),
      }),
    )
    .filter(
      ({ face, outline }) =>
        coverage(face) > 0 && outline.length >= fewestPoints,
    );
});
