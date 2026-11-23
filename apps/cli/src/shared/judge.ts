import { Effect, Option } from 'effect';
import { Judge } from './domain.ts';
import { defaultVisionModel } from './models.ts';
import { type OpenShoot, readJson, writeJson } from './store.ts';

/** The model asked for, or the one that judged the shoot, or the usual one. */
export const judgeOf = Effect.fn('judgeOf')(function* (
  open: OpenShoot,
  asked: Option.Option<string>,
) {
  if (Option.isSome(asked)) {
    return asked.value;
  }
  const judge = yield* readJson(Judge, open.files.judge);
  return Option.match(judge, {
    onNone: () => defaultVisionModel,
    onSome: ({ model }) => model,
  });
});

/** Remembers which model judges the shoot, for the steps that follow. */
export const saveJudge = (open: OpenShoot, model: string) =>
  writeJson(Judge, open.files.judge, { model });
