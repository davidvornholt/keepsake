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
 * What the owner wants to be done with a photo, as it is saved. A photo has at
 * most one mark that isn't handed over.
 */
export const SavedMark = Schema.Struct({
  id: Schema.String,
  photo: Schema.String,
  kind: Schema.Literals(markKinds),
  note: Schema.String,
  /** What a change is about, in fractions of the finished photo. */
  boxes: Schema.Array(Box),
  /** The photo of the album that a swap takes out. */
  other: Schema.NullOr(Schema.String),
  madeAt: Schema.String,
  answer: Schema.NullOr(Answer),
  /** When the owner looked at what came of it. */
  seenAt: Schema.NullOr(Schema.String),
});
export type SavedMark = typeof SavedMark.Type;

/** A mark, with when it was handed over, which only a hand-over says. */
export const Mark = Schema.Struct({
  ...SavedMark.fields,
  handedOverAt: Schema.NullOr(Schema.String),
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
  /** The ids of the marks the owner looked over, all that aren't handed over. */
  marks: Schema.Array(Schema.String),
  /**
   * The chosen photos the owner ordered edited and put into an album, or null
   * when they ordered none.
   */
  album: Schema.NullOr(Schema.Array(Schema.String)),
});
export type HandOver = typeof HandOver.Type;

/**
 * What the owner handed over at once. It is saved in one go, so that whoever
 * reads it finds all of it or nothing.
 */
export const HandOverRecord = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  dollars: Schema.Finite,
  /** What had been spent on the shoot until then. */
  spentBefore: Schema.Finite,
  marks: Schema.Array(Schema.String),
  album: Schema.NullOr(Schema.Array(Schema.String)),
  /** When none of the ordered photos waited to be put into the album any more. */
  fulfilledAt: Schema.NullOr(Schema.String),
});
export type HandOverRecord = typeof HandOverRecord.Type;

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
