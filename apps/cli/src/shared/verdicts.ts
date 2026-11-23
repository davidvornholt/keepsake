import { Effect, Option } from 'effect';
import { type Moment, Verdict } from './domain.ts';
import { type OpenShoot, readJson } from './store.ts';

const sameAs = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

/** The moment's verdict by this model, unless its photos have changed. */
export const verdictOn = Effect.fn('verdictOn')(function* (
  open: OpenShoot,
  model: string,
  moment: Moment,
) {
  const verdict = yield* readJson(
    Verdict,
    open.files.verdict(model, moment.id),
  );
  return Option.filter(verdict, ({ photos }) => sameAs(photos, moment.photos));
});

/** Every verdict by this model, in the order the photos were taken. */
export const verdicts = Effect.fn('verdicts')(function* (
  open: OpenShoot,
  model: string,
) {
  const found = yield* Effect.forEach(open.moments, (moment) =>
    verdictOn(open, model, moment),
  );
  return found.flatMap(Option.toArray);
});
