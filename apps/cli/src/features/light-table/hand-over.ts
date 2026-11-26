import { DateTime, Effect, Schema } from 'effect';
import { InvalidInput } from '../../shared/errors/errors.ts';
import type { Standings } from '../../shared/standing.ts';
import type { ShootFiles } from '../../shared/store.ts';
import {
  claim,
  claimOn,
  readHandOvers,
  saveHandOver,
  spentOn,
} from './handed.ts';
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

const pickedOf = (known: Standings): ReadonlyArray<string> =>
  [...known.of].flatMap(([photo, { kind }]) =>
    kind === 'picked' ? [photo] : [],
  );

const isOrder = ({ album, fulfilledAt }: HandOverRecord) =>
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
    const isDone =
      isOrder(record) && !(record.album ?? []).some((one) => picked.has(one));
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
    : { at: order.at, dollars: order.dollars, photos: order.album ?? [] };
});

/** Which hand-overs an agent is about: those it was given, or all. */
export type Only = ReadonlySet<string> | null;

/** The hand-overs an agent still has to act on. */
export const unsettledOf = Effect.fn('unsettledOf')(function* (
  files: ShootFiles,
  known: Standings,
  only: Only = null,
) {
  const waiting = new Set(
    (yield* readMarks(files)).filter(isWaiting).map(({ id }) => id),
  );
  return (yield* handOversOf(files, known)).filter(
    (record) =>
      (only === null || only.has(record.id)) &&
      (isOrder(record) || record.marks.some((id) => waiting.has(id))),
  );
});

/** The order among those hand-overs, if one of them is one. */
export const orderAmong = Effect.fn('orderAmong')(function* (
  files: ShootFiles,
  known: Standings,
  only: Only,
) {
  const order = (yield* unsettledOf(files, known, only)).findLast(isOrder);
  return order === undefined
    ? null
    : { at: order.at, photos: order.album ?? [] };
});

/**
 * Takes for an agent that waits what is still to be done and no agent took
 * yet, so that nothing handed over is acted on twice. Says what it took.
 */
export const claimUnsettled = Effect.fn('claimUnsettled')(function* (
  files: ShootFiles,
  known: Standings,
) {
  const unsettled = yield* unsettledOf(files, known);
  const taken = yield* Effect.forEach(unsettled, ({ id }) =>
    Effect.map(claim(files, id, 'waiter'), (isTaken) => (isTaken ? [id] : [])),
  );
  return taken.flat();
});

/**
 * What the page is to start an agent for: what the page took and no program
 * said it started an agent for, unless one is being started for it now, and,
 * when it `mayTake` more, what is still to be done and that nobody took. An
 * agent that waits takes that itself.
 */
export const toLaunch = Effect.fn('toLaunch')(function* (
  files: ShootFiles,
  known: Standings,
  {
    launching,
    mayTake,
  }: { readonly launching: ReadonlySet<string>; readonly mayTake: boolean },
) {
  const unsettled = yield* unsettledOf(files, known);
  const found = yield* Effect.forEach(unsettled, ({ id }) =>
    Effect.gen(function* () {
      const taken = yield* claimOn(files, id);
      if (taken === null) {
        return mayTake && (yield* claim(files, id, 'page')) ? [id] : [];
      }
      const isUnstarted =
        taken.by === 'page' && !taken.isAcknowledged && !launching.has(id);
      return isUnstarted ? [id] : [];
    }),
  );
  return found.flat();
});

/**
 * What is left of what the owner agreed to pay for what an agent still has to
 * do. What was spent on the shoot counts against what was agreed before it,
 * oldest first, and never against what was agreed only later.
 */
export const agreedDollars = Effect.fn('agreedDollars')(function* (
  files: ShootFiles,
  known: Standings,
  only: Only = null,
) {
  const unsettled = yield* unsettledOf(files, known, only);
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
  return inCents(Math.max(0, atLast.dollars - spentSince));
});

const keyOf = (ids: ReadonlyArray<string> | null) =>
  ids === null ? null : JSON.stringify(ids.toSorted());

const isSame = (
  left: ReadonlyArray<string> | null,
  right: ReadonlyArray<string> | null,
) => keyOf(left) === keyOf(right);

/**
 * Hands every open mark over to an agent, and orders the chosen photos if the
 * owner did and no order waits for them. Only what the owner looked over: when
 * that changed in the meantime, nothing is handed over.
 */
export const handOver = Effect.fn('handOver')(function* (
  files: ShootFiles,
  known: Standings,
  wanted: HandOver,
) {
  const marks = (yield* readMarks(files)).filter(isOpen);
  const picked = pickedOf(known);
  const isOrdered = (yield* orderOf(files, known)) !== null;
  const orderable = isOrdered || picked.length === 0 ? null : picked;
  const { album } = wanted;
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
