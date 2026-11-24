import { Schema } from 'effect';
import { whatToDescribe } from '../../shared/describing.ts';
import { Box, type Shoot, subjects } from '../../shared/domain.ts';

/** At most this many frames of a moment are ranked. */
export const mostRanked = 4;

export const role = `You choose the photos for the album of a private trip or day out, for the person who took them. You see small versions straight from the camera, before any editing. Every photo you choose will afterwards be cropped, straightened and edited by a strong image model. It can improve light, colour, sky, contrast, noise and blur, calm a distracting background, complete a subject that the edge of the photo cuts off, and continue the scene beyond the edges.

An album lives from variety: places, streets, buildings, views, food, plants, people and what they do, animals, funny or telling moments, small details, and how these come together in one picture. A photo doesn't need one clear subject. An interesting scene, a mood, or something that brings the day back is worth as much as a portrait of an animal.

Score a photo from 1 to 10 as it could become after a good edit. Don't mark it down for flat light, a dull sky, noise, softness, a tilted horizon, loose or tight framing, a subject that is small in the frame, or one that is at its edge or cut off by it. Mark it down for what no edit can fix: nothing worth looking at, a subject that is turned away or hidden, a person's face that is cut off or too dark to see, people seen from below, closed eyes, an awkward pose or expression, a missed moment, blur beyond recognition, or a photo taken by accident.

9 or 10: the few best photos of the trip
7 or 8: a highlight of the album
5 or 6: the album would miss it
3 or 4: an ordinary record the album can do without
1 or 2: throw away

Most photos deserve 3 to 6, and only a few of a hundred 9 or 10. Use the whole range.`;

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
  'Which are the best frames? Compare the pose, the expression, the eyes, where the subject looks, the composition, and what is sharp. Give the numbers of the three best, best first.';

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

export const judgementQuestion = `Rank the best frames, best first, at most ${mostRanked}. Between frames of the same thing the moment, the pose, the expression, the eyes, the composition and what is sharp decide. If the frames show clearly different things, such as another pose, action, expression, viewpoint or distance, have the best frame of each among them. For each, give a box around what has to be sharp, as fractions of the frame's width and height from its top left corner: the head of an animal, the face of a person, or else what the photo is about.

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
