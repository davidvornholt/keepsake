import { Schema } from 'effect';
import { whatToDescribe } from '../../shared/describing.ts';
import { Box, type Shoot, subjects } from '../../shared/domain.ts';

/** At most this many frames of a moment are ranked. */
export const mostRanked = 4;

export const role = `You choose the best photos of a private shoot for the person who took them. You see small versions straight from the camera, before any editing. Every photo you choose will afterwards be cropped, straightened and edited by a strong image model, which can improve light, colour, sky, contrast, noise and slight blur, and calm a distracting background.

So don't mark a photo down for flat light, a dull sky, noise, slight softness, a tilted horizon, loose framing, or a subject that is small in the frame. Mark it down for what no edit can fix: no clear subject, a subject that is turned away, hidden or cut off, closed eyes, an awkward pose or expression, a missed moment, heavy blur, or a photo taken by accident.

Score the photo from 1 to 10 as it could become after a good edit:
10: among the best photos of the year
8 or 9: worth printing and showing to anyone
6 or 7: good, belongs in the album
4 or 5: an ordinary record of something
1 to 3: throw away

Most photos of a shoot deserve 3 to 6. Use the whole range.`;

/** What every question starts with. */
export const introduction = (shoot: Shoot, count: number) => {
  const about = shoot.about === null ? '' : `The shoot: ${shoot.about}. `;
  return count === 1
    ? `${about}Here is one photo, frame 1.`
    : `${about}Here are ${count} frames of one moment, in the order they were taken.`;
};

export const frameName = (index: number) => `Frame ${index + 1}:`;
export const closeUpName = (index: number) =>
  `Part of frame ${index + 1} at full size:`;

export const Shortlist = Schema.Struct({
  best: Schema.Array(Schema.Int).annotate({
    description: 'The numbers of the best frames, best first, at most three',
  }),
});

export const shortlistQuestion =
  'Which are the best frames? Compare the pose, the expression, the eyes, where the subject looks, what is cut off, and what is sharp. Give the numbers of the three best, best first.';

export const Judgement = Schema.Struct({
  ranking: Schema.Array(
    Schema.Struct({
      frame: Schema.Int,
      /** What must be sharp. */
      focus: Box,
    }),
  ).annotate({
    description: `The best frames, best first, at most ${mostRanked}`,
  }),
  score: Schema.Int.annotate({
    description: 'From 1 to 10, for the best frame',
  }),
  subject: Schema.Literals(subjects),
  description: Schema.String,
  reason: Schema.String.annotate({ description: 'One short sentence' }),
});

export const judgementQuestion = `Rank the best frames, best first, at most ${mostRanked}. If the frames show clearly different things, such as another pose, action, expression, viewpoint or distance, have the best frame of each among them. For each, give a box around what has to be sharp, as fractions of the frame's width and height from its top left corner: the head of an animal, the face of a person, or else the main subject.

Then, for the best frame, give its score, its subject, and a description of ${whatToDescribe} Give your reason for the score in one short sentence.`;

export const Check = Schema.Struct({
  ranking: Schema.Array(Schema.Int).annotate({
    description: 'The numbers of all frames, best first',
  }),
  score: Schema.Int.annotate({
    description: 'From 1 to 10, for the best frame',
  }),
  description: Schema.String.annotate({ description: 'Of the best frame' }),
  reason: Schema.String.annotate({ description: 'One short sentence' }),
  further: Schema.Array(
    Schema.Struct({
      frame: Schema.Int,
      score: Schema.Int,
      description: Schema.String,
    }),
  ).annotate({
    description: 'Frames that belong in the album next to the best one',
  }),
});

type FirstAnswer = {
  readonly score: number;
  readonly description: string;
  readonly reason: string;
};

export const checkQuestion = ({ score, description, reason }: FirstAnswer) =>
  `These are the frames you ranked best, in that order, each with a part of it at full size. You gave the best one ${score} out of 10: ${reason} You described it like this: ${description} Rank them again now that you see what is sharp and what the eyes, the pose and the expression are really like, and correct the score and the description if that changes them or another frame is best now. Slight softness is no reason to lower the score, but a subject that is blurred beyond recognition is.

Then list the other frames that belong in the album next to the best one, each with its own score and a description of what it shows. A frame belongs there when it is good itself and the owner would want both because they differ clearly: in the pose, the action, the expression, the viewpoint, the distance, or who is in it. It doesn't when it only shows the same a little earlier or later. Most moments have none.`;
