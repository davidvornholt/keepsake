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
 * that isn't handed over, besides one about being a favourite.
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
