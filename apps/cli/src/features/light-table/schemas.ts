import { Schema } from 'effect';
import { Box } from '../../shared/domain.ts';
import { markKinds } from './kinds.ts';

/** What an agent did about a mark. */
export const Answer = Schema.Struct({
  outcome: Schema.Literals(['done', 'not-done']),
  note: Schema.String,
  at: Schema.String,
});

/**
 * What the owner wants to be done with a photo. A photo has at most one mark
 * that isn't handed over.
 */
export const Mark = Schema.Struct({
  id: Schema.String,
  photo: Schema.String,
  kind: Schema.Literals(markKinds),
  note: Schema.String,
  /** What a change is about, in fractions of the finished photo. */
  boxes: Schema.Array(Box),
  /** The photo of the album that a swap takes out. */
  other: Schema.NullOr(Schema.String),
  madeAt: Schema.String,
  handedOverAt: Schema.NullOr(Schema.String),
  answer: Schema.NullOr(Answer),
  /** When the owner looked at what came of it. */
  seenAt: Schema.NullOr(Schema.String),
});
export type Mark = typeof Mark.Type;

/** What the page sends to make a mark: PUT /api/shoots/<shoot>/marks */
export const NewMark = Schema.Struct({
  photo: Schema.String,
  kind: Schema.Literals(markKinds),
  note: Schema.String,
  boxes: Schema.Array(Box),
  other: Schema.NullOr(Schema.String),
});
export type NewMark = typeof NewMark.Type;

/** What the page sends to label a photo: PUT /api/shoots/<shoot>/labels */
export const NewLabels = Schema.Struct({
  photo: Schema.String,
  labels: Schema.Array(Schema.String),
});
export type NewLabels = typeof NewLabels.Type;

/** What the page sends when the owner likes a photo of the album most: PUT /api/shoots/<shoot>/favorites */
export const Favorite = Schema.Struct({
  photo: Schema.String,
  favorite: Schema.Boolean,
});
export type Favorite = typeof Favorite.Type;

/** What the page sends to hand everything over: POST /api/shoots/<shoot>/hand-over */
export const HandOver = Schema.Struct({
  /** What the edits cost at most, as the owner was told. */
  dollars: Schema.Finite,
  /** Whether the chosen photos are to be edited and put into an album. */
  album: Schema.Boolean,
});
export type HandOver = typeof HandOver.Type;

/** That the owner handed something over. */
export const HandOverRecord = Schema.Struct({
  at: Schema.String,
  ...HandOver.fields,
});

/** What the page sends to make an album of a folder: POST /api/shoots */
export const NewShoot = Schema.Struct({
  /** The path of one of the folders it was told of. */
  folder: Schema.String,
  /** Where and when: "Lisbon, May 2026" */
  about: Schema.String,
  /** Where the photos were taken, if the camera's clock was set elsewhere. */
  timeZone: Schema.NullOr(Schema.String),
  /** How many photos the album has at most. */
  maximum: Schema.NullOr(Schema.Int),
});
export type NewShoot = typeof NewShoot.Type;
