import type { Mark, PhotoView } from '../../contract.ts';
import {
  chosenAfter,
  type Index,
  isOpinion,
  needsEdit,
} from '../data/derive.ts';

// The marks an agent is to act on, as a list to go over before they are
// handed over, and to follow afterwards.

export type Line = {
  readonly mark: Mark;
  readonly photo: PhotoView;
  /** Whether acting on it means editing a photo, which costs money. */
  readonly costs: boolean;
  /** The photo a swap takes out. */
  readonly other: PhotoView | null;
};

export type Ledger = {
  /** Not handed over yet, in the order of the shoot. */
  readonly open: ReadonlyArray<Line>;
  /** Handed over, and not answered yet. */
  readonly waiting: ReadonlyArray<Line>;
  /** Answers that weren't looked at yet. */
  readonly news: number;
  /** Marks that only say what the owner thinks, which stay with them. */
  readonly opinions: number;
  /** The edits the open marks ask for, and about what they cost. */
  readonly edits: number;
  readonly dollars: number;
  /** How many photos are chosen now, once the open marks are acted on, and at most. */
  readonly chosen: number;
  readonly chosenAfter: number;
  readonly limit: number | null;
};

const none: ReadonlySet<string> = new Set();

/**
 * Sorts the marks of a shoot. The marks in `held` count as not handed over,
 * for as long as the page shows them going.
 */
export const ledgerOf = (
  index: Index,
  held: ReadonlySet<string> = none,
): Ledger => {
  const { shoot, byId, numberOf } = index;
  const lines = shoot.marks
    .filter((mark) => !isOpinion(mark.kind) && mark.answer === null)
    .flatMap((mark): ReadonlyArray<Line> => {
      const photo = byId.get(mark.photo);
      return photo === undefined
        ? []
        : [
            {
              mark,
              photo,
              costs: needsEdit(index, mark),
              other:
                mark.other === null ? null : (byId.get(mark.other) ?? null),
            },
          ];
    })
    .toSorted(
      (left, right) =>
        (numberOf.get(left.photo.id) ?? 0) -
          (numberOf.get(right.photo.id) ?? 0) ||
        left.mark.madeAt.localeCompare(right.mark.madeAt),
    );
  const isOpen = ({ mark }: Line) =>
    mark.handedOverAt === null || held.has(mark.id);
  const open = lines.filter(isOpen);
  const edits = open.filter(({ costs }) => costs).length;
  return {
    open,
    waiting: lines.filter((line) => !isOpen(line)),
    news: shoot.marks.filter(
      ({ answer, seenAt }) => answer !== null && seenAt === null,
    ).length,
    opinions: shoot.marks.filter(
      ({ kind, handedOverAt }) => isOpinion(kind) && handedOverAt === null,
    ).length,
    edits,
    dollars: edits * shoot.dollars.perEdit,
    chosen: index.chosen,
    chosenAfter: chosenAfter(
      index,
      open.map(({ mark }) => mark),
    ),
    limit: shoot.picked?.maximum ?? null,
  };
};

/** How long after the first mark the pencil gets to each one, in milliseconds. */
export const staggerOf = (
  marks: number,
  whole: number,
  most: number,
): number => (marks <= 1 ? 0 : Math.min(most, whole / (marks - 1)));
