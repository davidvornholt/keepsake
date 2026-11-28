import { DateTime, Effect, Schema } from 'effect';
import { InvalidInput } from '../../shared/errors/errors.ts';
import type { Standings } from '../../shared/standing.ts';
import { exists, type ShootFiles } from '../../shared/store.ts';
import { readHandOvers, saveHandOver, spentOn } from './handed.ts';
import { isOpen, isWaiting, readMarks } from './marks.ts';
import type { HandOver, HandOverRecord, Mark } from './schemas.ts';

// The page shows something else than the owner looked over, such as after
// another tab changed a mark.
export class Outdated extends Schema.TaggedError<Outdated>()('Outdated', {
  message: Schema.String,
}) {}

const idLength = 8;
const cents = 100;
const inCents = (dollars: number) => Math.round(dollars * cents) / cents;
/** What floating point takes off a whole number of cents. */
const roundingSlack = 1e-6;
/** Whole cents, never more than there is. */
const downToCents = (dollars: number) =>
  Math.floor(dollars * cents + roundingSlack) / cents;

const pickedOf = (known: Standings): ReadonlyArray<string> =>
  [...known.of].flatMap(([photo, { kind }]) =>
    kind === 'picked' ? [photo] : [],
  );

/**
 * Whether what the owner wrote about a photo is still to be acted on: a
 * photo that went out of the album is edited no more, nor one they took out
 * of every album that is still in one it wasn't taken out of.
 */
export const isStillChosen =
  (known: Standings) =>
  ({ photo }: Mark): boolean => {
    const kind = known.of.get(photo)?.kind;
    return (
      (kind === 'album' || kind === 'picked') &&
      !known.removed.some((one) => one.photo === photo)
    );
  };

/** Whether a photo has a finished edit, which a change changes. */
export const isEdited = (files: ShootFiles, photo: string) =>
  Effect.gen(function* () {
    const edit = files.edit(photo);
    return (yield* exists(edit.record)) && (yield* exists(edit.final));
  });

export const isOrder = ({ album, fulfilledAt }: HandOverRecord) =>
  album !== null && fulfilledAt === null;

/**
 * What was handed over, with each order noted as fulfilled once none of its
 * photos waits to be put into the album, so that it stays so.
 */
const handOversOf = Effect.fn('handOversOf')(function* (
  files: ShootFiles,
  known: Standings,
) {
  const picked = new Set(pickedOf(known));
  const at = DateTime.formatIso(yield* DateTime.now);
  return yield* Effect.forEach(yield* readHandOvers(files), (record) => {
    // Where the photos stood before an order was made says nothing of it.
    const isDone =
      isOrder(record) &&
      Date.parse(record.at) < known.at &&
      !(record.album ?? []).some((one) => picked.has(one));
    if (!isDone) {
      return Effect.succeed(record);
    }
    const fulfilled: HandOverRecord = { ...record, fulfilledAt: at };
    return Effect.as(saveHandOver(files, fulfilled), fulfilled);
  });
});

/** The order of chosen photos that aren't in the album yet, if there is one. */
export const orderOf = Effect.fn('orderOf')(function* (
  files: ShootFiles,
  known: Standings,
) {
  const order = (yield* handOversOf(files, known)).findLast(isOrder);
  return order === undefined
    ? null
    : {
        id: order.id,
        at: order.at,
        dollars: order.dollars,
        photos: order.album ?? [],
      };
});

/** Whether the owner paid more for a stop already. */
export const isApproved = (record: HandOverRecord, stop: string) =>
  (record.approved ?? []).includes(stop);

/**
 * Lets the owner pay more for a hand-over that stopped for want of money,
 * once for each stop: what they paid and that they did are one write.
 */
export const agreeToMore = Effect.fn('agreeToMore')(function* (
  files: ShootFiles,
  { handOver: id, stop }: { readonly handOver: string; readonly stop: string },
  dollars: number,
) {
  const record = (yield* readHandOvers(files)).find((one) => one.id === id);
  if (record !== undefined && !isApproved(record, stop)) {
    yield* saveHandOver(files, {
      ...record,
      dollars: inCents(record.dollars + Math.max(0, dollars)),
      approved: [...(record.approved ?? []), stop],
    });
  }
});

/**
 * The hand-overs still to be acted on, oldest first: orders whose photos
 * aren't all in the album, and those with a mark that has no answer yet.
 * A mark of a photo that was taken out counts too, since it gets the answer
 * that it was.
 */
export const unsettledOf = Effect.fn('unsettledOf')(function* (
  files: ShootFiles,
  known: Standings,
) {
  const waiting = new Set(
    (yield* readMarks(files)).filter(isWaiting).map(({ id }) => id),
  );
  return (yield* handOversOf(files, known)).filter(
    (record) => isOrder(record) || record.marks.some((id) => waiting.has(id)),
  );
});

/**
 * The hand-overs still to be acted on as their files say, without asking
 * where the photos stand, for what is read often: an order counts until it
 * was noted as fulfilled, which `unsettledOf` does.
 */
export const roughlyUnsettled = Effect.fn('roughlyUnsettled')(function* (
  files: ShootFiles,
) {
  const waiting = new Set(
    (yield* readMarks(files)).filter(isWaiting).map(({ id }) => id),
  );
  return (yield* readHandOvers(files)).filter(
    (record) => isOrder(record) || record.marks.some((id) => waiting.has(id)),
  );
});

/**
 * What is left of what the owner agreed to pay for what is still to be
 * done. What was spent on the shoot counts against what was agreed before it,
 * oldest first, and never against what was agreed only later.
 */
export const agreedDollars = Effect.fn('agreedDollars')(function* (
  files: ShootFiles,
  known: Standings,
) {
  const unsettled = yield* unsettledOf(files, known);
  const [first] = unsettled;
  if (first === undefined) {
    return 0;
  }
  const atLast = unsettled.reduce(
    (left, { spentBefore, dollars }) => ({
      dollars:
        Math.max(0, left.dollars - Math.max(0, spentBefore - left.spent)) +
        dollars,
      spent: Math.max(left.spent, spentBefore),
    }),
    { dollars: 0, spent: first.spentBefore },
  );
  const spentSince = (yield* spentOn(files)) - atLast.spent;
  return downToCents(Math.max(0, atLast.dollars - spentSince));
});

const keyOf = (ids: ReadonlyArray<string> | null) =>
  ids === null ? null : JSON.stringify(ids.toSorted());

const isSame = (
  left: ReadonlyArray<string> | null,
  right: ReadonlyArray<string> | null,
) => keyOf(left) === keyOf(right);

/**
 * Hands every open mark over, and orders the chosen photos if the
 * owner did and no order waits for them. Only what the owner looked over: when
 * that changed in the meantime, nothing is handed over.
 */
export const handOver = Effect.fn('handOver')(function* (
  files: ShootFiles,
  known: Standings,
  wanted: HandOver,
) {
  const picked = pickedOf(known);
  const order = yield* orderOf(files, known);
  const orderable = order !== null || picked.length === 0 ? null : picked;
  const { album } = wanted;
  // A wish for the first edit of a photo is done with that edit, which only
  // an order pays for: it waits until the photo is ordered.
  const ordered = new Set([...(order?.photos ?? []), ...(album ?? [])]);
  const marks = yield* Effect.filter(
    (yield* readMarks(files)).filter(
      (mark) => isOpen(mark) && isStillChosen(known)(mark),
    ),
    ({ photo }) =>
      ordered.has(photo) ? Effect.succeed(true) : isEdited(files, photo),
  );
  const ids = marks.map(({ id }) => id);
  const isAsOrderable = album === null || isSame(album, orderable);
  // First, since what the page shows may be gone, which leaves nothing.
  if (!(isSame(ids, wanted.marks) && isAsOrderable)) {
    return yield* new Outdated({
      message:
        'The marks or the chosen photos changed since this page showed them. Look over them again.',
    });
  }
  if (marks.length === 0 && album === null) {
    return yield* new InvalidInput({
      message: 'There is nothing to hand over.',
    });
  }
  const at = DateTime.formatIso(yield* DateTime.now);
  yield* saveHandOver(files, {
    id: crypto.randomUUID().replaceAll('-', '').slice(0, idLength),
    at,
    dollars: wanted.dollars,
    spentBefore: yield* spentOn(files),
    marks: ids,
    album,
    fulfilledAt: null,
  });
  return marks.map((mark): Mark => ({ ...mark, handedOverAt: at }));
});
