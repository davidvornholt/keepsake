import { DateTime, Effect, Option, Schema } from 'effect';
import { InvalidInput } from '../../shared/errors/errors.ts';
import type { Standings } from '../../shared/standing.ts';
import { readJson, type ShootFiles, writeJson } from '../../shared/store.ts';
import { isOpen, isWaiting, readMarks, saveMark } from './marks.ts';
import { type HandOver, HandOverRecord, type Mark } from './schemas.ts';

const Records = Schema.Array(HandOverRecord);

export const readHandOvers = (files: ShootFiles) =>
  Effect.map(
    readJson(Records, files.handOvers),
    Option.getOrElse((): typeof Records.Type => []),
  );

/** Hands every open mark over to an agent, and the album if it is wanted. */
export const handOver = Effect.fn('handOver')(function* (
  files: ShootFiles,
  { dollars, album }: HandOver,
) {
  const marks = (yield* readMarks(files)).filter(isOpen);
  if (marks.length === 0 && !album) {
    return yield* new InvalidInput({
      message: 'There is nothing to hand over.',
    });
  }
  const at = DateTime.formatIso(yield* DateTime.now);
  yield* writeJson(Records, files.handOvers, [
    ...(yield* readHandOvers(files)),
    { at, dollars, album },
  ]);
  return yield* Effect.forEach(marks, (mark) => {
    const handed: Mark = { ...mark, handedOverAt: at };
    return Effect.as(saveMark(files, handed), handed);
  });
});

const isPicked = (known: Standings) =>
  [...known.of.values()].some(({ kind }) => kind === 'picked');

/** When the owner ordered an album of the chosen photos, until they are in it. */
export const orderOf = Effect.fn('orderOf')(function* (
  files: ShootFiles,
  known: Standings,
) {
  const order = (yield* readHandOvers(files)).findLast(({ album }) => album);
  return order !== undefined && isPicked(known)
    ? { at: order.at, dollars: order.dollars }
    : null;
});

/** What the owner agreed to pay for what an agent still has to do. */
export const agreedDollars = Effect.fn('agreedDollars')(function* (
  files: ShootFiles,
  known: Standings,
) {
  const order = yield* orderOf(files, known);
  const waiting = new Set(
    (yield* readMarks(files))
      .filter(isWaiting)
      .map(({ handedOverAt }) => handedOverAt),
  );
  return (yield* readHandOvers(files))
    .filter(({ at }) => waiting.has(at) || at === order?.at)
    .reduce((sum, { dollars }) => sum + dollars, 0);
});
