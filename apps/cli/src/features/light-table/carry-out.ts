import { DateTime, Effect, FileSystem, Option } from 'effect';
import { judgeOf } from '../../shared/judge.ts';
import { type Standings, standings } from '../../shared/standing.ts';
import {
  type OpenShoot,
  openShoot,
  type ShootFiles,
} from '../../shared/store.ts';
import {
  beginning,
  type Carrying,
  endCarrying,
  isAbout,
  newId,
  readCarrying,
  type Stop,
  saveCarrying,
} from './carrying.ts';
import {
  agreedDollars,
  isApproved,
  isEdited,
  isOrder,
  isStillChosen,
  unsettledOf,
} from './hand-over.ts';
import { readHandOvers, saveHandOver } from './handed.ts';
import { changeUsedUp, takenOut } from './mark-answers.ts';
import { answerMark, isWaiting, readMarks } from './marks.ts';
import type { HandOverRecord, Mark } from './schemas.ts';

// What is to be done next about what the owner handed over, worked out from
// what is written down each time, so that it goes on alike after a restart:
// first the change marks, oldest first, each edited, published and answered,
// then the photos an order is still waiting for, and `explain` at the end
// when the album changed.

export type Step =
  | {
      readonly kind: 'editMark';
      readonly mark: Mark;
      readonly budget: number;
      /** The id the edit notes what it came to under. */
      readonly operation: string;
    }
  | { readonly kind: 'publishMark'; readonly mark: Mark }
  | {
      readonly kind: 'editOrder';
      readonly handOver: string;
      readonly photos: ReadonlyArray<string>;
      readonly budget: number;
    }
  | { readonly kind: 'publishOrder'; readonly handOver: string }
  | { readonly kind: 'explain' }
  /** Something was noted, so there is more to work out. */
  | { readonly kind: 'again' }
  /** Nothing is left, or nothing goes on without the owner. */
  | { readonly kind: 'end' };

const again: Step = { kind: 'again' };
const end: Step = { kind: 'end' };

const now = Effect.map(DateTime.now, DateTime.formatIso);

export const standingsOf = (open: OpenShoot) =>
  Effect.flatMap(judgeOf(open, Option.none()), (model) =>
    standings(open, model),
  );

/**
 * Which file a photo's finished photo is, or null while it has none. A new
 * edit puts a new file in its place, even one with the same pixels.
 */
export const versionOf = Effect.fn('versionOf')(function* (
  files: ShootFiles,
  photo: string,
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.stat(files.edit(photo).final).pipe(
    Effect.map(({ ino, mtime, size }) =>
      [
        Option.getOrElse(ino, () => 0),
        Option.match(mtime, { onNone: () => 0, onSome: (at) => at.getTime() }),
        size,
      ].join('-'),
    ),
    Effect.orElseSucceed(() => null),
  );
});

/** An answer that says why a mark wasn't done. */
export const notDone = (note: string) => ({
  outcome: 'not-done' as const,
  note,
});

/** Forgets what an edit came to, once that is noted. */
export const forgetOperation = Effect.fn('forgetOperation')(function* (
  files: ShootFiles,
  operation: string | null | undefined,
) {
  if (operation === null || operation === undefined) {
    return;
  }
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .remove(files.operation(operation), { force: true })
    .pipe(Effect.ignore);
});

/** Answers a mark and forgets how far it got. */
export const answered = Effect.fn('answered')(function* (
  files: ShootFiles,
  carrying: Carrying,
  mark: Mark,
  answer: { readonly outcome: 'done' | 'not-done'; readonly note: string },
) {
  yield* answerMark(files, mark.id, answer);
  const { [mark.id]: progress, ...marks } = carrying.marks;
  yield* saveCarrying(files, { ...carrying, marks });
  yield* forgetOperation(files, progress?.operation);
  return again;
});

/** Stops until the owner says to go on. */
export const stopped = Effect.fn('stopped')(function* (
  files: ShootFiles,
  carrying: Carrying,
  stop: Omit<Stop, 'id' | 'at' | 'seenAt'>,
) {
  yield* saveCarrying(files, {
    ...carrying,
    stopped: { ...stop, id: newId(), at: yield* now, seenAt: null },
  });
  return end;
});

/** The hand-over a mark came with. */
export const handOverOf = (files: ShootFiles, mark: Mark) =>
  Effect.map(
    readHandOvers(files),
    (records) => records.find(({ marks }) => marks.includes(mark.id))?.id ?? '',
  );

const planMark = Effect.fn('planMark')(function* (
  files: ShootFiles,
  known: Standings,
  carrying: Carrying,
  mark: Mark,
) {
  const progress = carrying.marks[mark.id] ?? null;
  const edited = progress?.edited ?? null;
  const isDone = edited !== null && (!edited.changed || progress?.published);
  if (!(isStillChosen(known)(mark) || isDone)) {
    return yield* answered(files, carrying, mark, notDone(takenOut));
  }
  if (edited === null) {
    const before = progress?.before ?? (yield* versionOf(files, mark.photo));
    // An edit that ended before it was noted is noted from what it came to,
    // whatever is left of the money now.
    const operation = progress?.operation ?? null;
    const budget = yield* agreedDollars(files, known);
    if (operation === null && budget <= 0) {
      return yield* stopped(files, carrying, {
        reason: changeUsedUp,
        needs: 'money',
        handOver: yield* handOverOf(files, mark),
        photos: [mark.photo],
      });
    }
    const given = operation ?? newId();
    yield* saveCarrying(files, {
      ...carrying,
      marks: {
        ...carrying.marks,
        [mark.id]: { operation: given, before, edited: null, published: false },
      },
    });
    return {
      kind: 'editMark',
      mark,
      budget,
      operation: given,
    } satisfies Step;
  }
  if (!isDone) {
    yield* saveCarrying(files, carrying);
    return { kind: 'publishMark', mark } satisfies Step;
  }
  const outcome = edited.changed ? 'done' : 'not-done';
  return yield* answered(files, carrying, mark, { outcome, note: edited.note });
});

/** The photos of an order that are still to be put into the album. */
export const waitingOf = (known: Standings, order: HandOverRecord) =>
  (order.album ?? []).filter((photo) => known.of.get(photo)?.kind === 'picked');

const planOrder = Effect.fn('planOrder')(function* (
  files: ShootFiles,
  known: Standings,
  carrying: Carrying,
  order: HandOverRecord,
) {
  const waiting = waitingOf(known, order);
  if (waiting.length === 0) {
    yield* saveHandOver(files, { ...order, fulfilledAt: yield* now });
    yield* saveCarrying(files, carrying);
    return again;
  }
  const unedited = yield* Effect.filter(waiting, (photo) =>
    Effect.map(isEdited(files, photo), (is) => !is),
  );
  if (unedited.length === 0) {
    yield* saveCarrying(files, carrying);
    return { kind: 'publishOrder', handOver: order.id } satisfies Step;
  }
  const budget = yield* agreedDollars(files, known);
  if (budget <= 0) {
    return yield* stopped(files, carrying, {
      reason: usedUp(unedited.length),
      needs: 'money',
      handOver: order.id,
      photos: unedited,
    });
  }
  yield* saveCarrying(files, carrying);
  return {
    kind: 'editOrder',
    handOver: order.id,
    photos: unedited,
    budget,
  } satisfies Step;
});

/** Why an order stopped short of its photos for want of money. */
export const usedUp = (count: number) =>
  `What you agreed to pay is used up, and ${count === 1 ? 'one photo you ordered isn’t' : `${count} photos you ordered aren’t`} edited yet.`;

/** Whether the owner took out all the photos a stop is about. */
const isLeftBehind = (known: Standings, { photos }: Stop) =>
  photos.length > 0 &&
  photos.every((photo) => {
    const kind = known.of.get(photo)?.kind;
    return kind !== 'album' && kind !== 'picked';
  });

/** The first mark still to be acted on, of the oldest hand-over first. */
const nextMark = (
  marks: ReadonlyArray<Mark>,
  unsettled: ReadonlyArray<HandOverRecord>,
) => {
  const byId = new Map(marks.map((mark) => [mark.id, mark] as const));
  return unsettled
    .flatMap(({ marks: ids }) => ids)
    .map((id) => byId.get(id))
    .find((mark) => mark !== undefined && isWaiting(mark));
};

/** Whether the owner paid more for a stop, which then waits no more. */
const isPaidFor = (stop: Stop, unsettled: ReadonlyArray<HandOverRecord>) =>
  stop.needs === 'money' &&
  unsettled.some(
    (record) => record.id === stop.handOver && isApproved(record, stop.id),
  );

/**
 * Works out what to do next about a shoot. Run it while this server holds
 * the shoot's runner lock, and while nothing else on the page changes the
 * shoot.
 */
export const plan = Effect.fn('plan')(function* (name: string) {
  const open = yield* openShoot(name);
  const { files } = open;
  const carrying = (yield* readCarrying(files)) ?? (yield* beginning);
  const known = yield* standingsOf(open);
  const unsettled = yield* unsettledOf(files, known);
  const stop = carrying.stopped;
  if (
    stop !== null &&
    isAbout(stop, unsettled) &&
    !isLeftBehind(known, stop) &&
    !isPaidFor(stop, unsettled)
  ) {
    yield* saveCarrying(files, carrying);
    return end;
  }
  // What it stopped at was settled meanwhile, the owner took its photos
  // out, which is their word to go on without them, or they paid more.
  const going: Carrying = { ...carrying, stopped: null };
  if (unsettled.length === 0) {
    if (going.toExplain) {
      yield* saveCarrying(files, going);
      return { kind: 'explain' } satisfies Step;
    }
    yield* endCarrying(files);
    return end;
  }
  const mark = nextMark(yield* readMarks(files), unsettled);
  if (mark !== undefined) {
    return yield* planMark(files, known, going, mark);
  }
  const order = unsettled.find(isOrder);
  if (order === undefined) {
    yield* saveCarrying(files, going);
    return end;
  }
  return yield* planOrder(files, known, going, order);
});

/**
 * The edited photos of an order that are still chosen and not in the album
 * yet, as they are now: run it under the choice lock up to the publish, so
 * no photo the owner took out meanwhile comes back.
 */
export const stillOrdered = Effect.fn('stillOrdered')(function* (
  open: OpenShoot,
  handOver: string,
) {
  const order = (yield* readHandOvers(open.files)).find(
    ({ id }) => id === handOver,
  );
  if (order === undefined) {
    return [];
  }
  return yield* Effect.filter(
    waitingOf(yield* standingsOf(open), order),
    (photo) => isEdited(open.files, photo),
  );
});
