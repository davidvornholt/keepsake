import type { Mark, PhotoView } from '../../contract.ts';
import { chosenAfter, type Index } from '../data/derive.ts';

// The marks an agent is to act on, as a list to go over before they are
// handed over, and to follow afterwards; and what handing over costs.

export type Line = {
  readonly mark: Mark;
  readonly photo: PhotoView;
  /** Whether acting on it means one more photo to edit, which costs money. */
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
  /**
   * Whether handing over orders the album too: the chosen photos are edited
   * and published. So it is while photos are chosen and that wasn't asked for.
   */
  readonly ordersAlbum: boolean;
  /** Whether there is no album yet, so that ordering makes one. */
  readonly isFirst: boolean;
  /** How many photos are chosen and not in the album yet. */
  readonly picked: number;
  /** How many of them are edited for the first time when the album is ordered. */
  readonly firstEdits: number;
  /** The photos edited when everything is handed over, and about what they cost. */
  readonly edits: number;
  readonly dollars: number;
  /** How many photos are chosen now, once the open marks are acted on, and at most. */
  readonly chosen: number;
  readonly chosenAfter: number;
  readonly limit: number | null;
};

const none: ReadonlySet<string> = new Set();

const isPicked = (photo: PhotoView | null | undefined): boolean =>
  photo?.standing.kind === 'picked';

/** Whether a photo is chosen and waits for its first edit. */
const awaitsEdit = (photo: PhotoView | null | undefined): boolean =>
  isPicked(photo) && photo?.edit === null;

/** Whether a mark means one more photo to edit. */
const costsOf = ({ mark, photo }: Omit<Line, 'costs'>): boolean => {
  if (mark.kind === 'change') {
    // A wish for a photo that isn't edited yet is part of its first edit.
    return !awaitsEdit(photo);
  }
  return (
    (mark.kind === 'put-in' || mark.kind === 'swap') && photo.edit === null
  );
};

/** Whether a mark takes a photo out of those that would be edited for the album. */
const sparesOf = ({ mark, photo, other }: Line): boolean =>
  (mark.kind === 'take-out' && awaitsEdit(photo)) ||
  (mark.kind === 'swap' && awaitsEdit(other));

const linesOf = (index: Index): ReadonlyArray<Line> => {
  const { shoot, byId, numberOf } = index;
  return shoot.marks
    .filter((mark) => mark.answer === null)
    .flatMap((mark): ReadonlyArray<Line> => {
      const photo = byId.get(mark.photo);
      if (photo === undefined) {
        return [];
      }
      const other = mark.other === null ? null : (byId.get(mark.other) ?? null);
      const line = { mark, photo, other };
      return [{ ...line, costs: costsOf(line) }];
    })
    .toSorted(
      (left, right) =>
        (numberOf.get(left.photo.id) ?? 0) -
          (numberOf.get(right.photo.id) ?? 0) ||
        left.mark.madeAt.localeCompare(right.mark.madeAt),
    );
};

/**
 * Sorts the marks of a shoot. The marks in `held` count as not handed over,
 * for as long as the page shows them going.
 */
export const ledgerOf = (
  index: Index,
  held: ReadonlySet<string> = none,
): Ledger => {
  const { shoot } = index;
  const lines = linesOf(index);
  const isOpen = ({ mark }: Line) =>
    mark.handedOverAt === null || held.has(mark.id);
  const open = lines.filter(isOpen);
  const picked = shoot.photos.filter(isPicked).length;
  const ordersAlbum = picked > 0 && shoot.ordered === null;
  const firstEdits = ordersAlbum
    ? shoot.photos.filter(awaitsEdit).length - open.filter(sparesOf).length
    : 0;
  const edits = open.filter(({ costs }) => costs).length + firstEdits;
  return {
    open,
    waiting: lines.filter((line) => !isOpen(line)),
    news: shoot.marks.filter(
      ({ answer, seenAt }) => answer !== null && seenAt === null,
    ).length,
    ordersAlbum,
    isFirst: !index.hasAlbum,
    picked,
    firstEdits,
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

/** How far an agent that was to be started has got. */
export type AgentState =
  /** One waits for marks, or was started and is at work. */
  | { readonly is: 'at-work'; readonly link: string | null }
  /** The page asked for one, and it hasn't said anything yet. */
  | { readonly is: 'starting' }
  /**
   * None can be started, starting one failed, or the one asked for never
   * said a word, so the owner has to ask one.
   */
  | {
      readonly is: 'ask';
      readonly failed: string | null;
      readonly isLate: boolean;
    }
  /** Nothing is handed over. */
  | { readonly is: 'idle' };

/** How long an agent may take to say that it is there, in milliseconds. */
export const agentPatience = 25_000;

/**
 * Who acts on what was handed over. `since` is when the last of it was
 * handed over, or null when nothing waits for an agent; `now` is the time
 * in milliseconds.
 */
export const agentStateOf = (
  { agent }: Index['shoot'],
  since: string | null,
  now: number,
): AgentState => {
  if (since === null) {
    return { is: 'idle' };
  }
  const { started } = agent;
  // An agent started before the hand-over was started for an earlier one.
  const isForThis = started !== null && started.at >= since;
  if (isForThis && started.failed !== null) {
    return { is: 'ask', failed: started.failed, isLate: false };
  }
  if (isForThis) {
    return { is: 'at-work', link: started.link };
  }
  if (agent.waitsSince !== null) {
    return { is: 'at-work', link: null };
  }
  if (!agent.canStart) {
    return { is: 'ask', failed: null, isLate: false };
  }
  return now - Date.parse(since) > agentPatience
    ? { is: 'ask', failed: null, isLate: true }
    : { is: 'starting' };
};

/** When the last of what waits for an agent was handed over. */
export const handedOverSince = (
  { ordered }: Index['shoot'],
  waiting: ReadonlyArray<Line>,
): string | null => {
  const times = [
    ...waiting.flatMap(({ mark }) => mark.handedOverAt ?? []),
    ...(ordered === null ? [] : [ordered.at]),
  ];
  return times.toSorted().at(-1) ?? null;
};
