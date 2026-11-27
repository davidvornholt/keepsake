import { Effect, Option, Schema } from 'effect';
import type { EditSummary, Keep } from '../features/edit/edit.ts';
import type { EditRecord } from '../shared/domain.ts';
import { InvalidInput } from '../shared/errors/errors.ts';
import {
  digestOf,
  type OpenShoot,
  readJson,
  type ShootFiles,
  writeJson,
} from '../shared/store.ts';
import { withCost } from './output.ts';

// A command given an operation id notes what it came to under that id
// before it says so, and a command given the same id again says the same
// without doing it again. The page's server gives one to each edit it
// starts, so an edit that ended while the server stopped isn't paid twice.

const Result = Schema.Record(Schema.String, Schema.Unknown);
type Result = typeof Result.Type;

/** What a command came to, and what it was about, such as a mark. */
const Saved = Schema.Struct({ about: Schema.String, result: Result });

const operationPattern = /^[a-z0-9]{1,32}$/u;

/** The operation id, as one that names a file of the shoot's and no other. */
export const operationOf = (id: string) =>
  operationPattern.test(id)
    ? Effect.succeed(id)
    : Effect.fail(
        new InvalidInput({
          message: `An operation id has up to 32 lowercase letters and digits, unlike ${JSON.stringify(id)}.`,
        }),
      );

/**
 * What the command given this id came to, if it ended. An id given to a
 * command about something else can't be given again.
 */
export const resultOf = Effect.fn('resultOf')(function* (
  files: ShootFiles,
  { id, about }: { readonly id: string; readonly about: string },
) {
  const saved = yield* readJson(Saved, files.operation(id));
  if (Option.isNone(saved)) {
    return null;
  }
  if (saved.value.about !== about) {
    return yield* new InvalidInput({
      message: `The operation ${id} was about ${saved.value.about}, not ${about}. Give each edit an id of its own.`,
    });
  }
  return saved.value.result;
});

/**
 * What an edit came to, with the version of each finished photo it left and
 * how that was reviewed, so what it made is told from what came after it.
 */
const editResultOf = Effect.fn('editResultOf')(function* (
  open: OpenShoot,
  summary: EditSummary,
  records: ReadonlyArray<EditRecord>,
) {
  const finished = yield* Effect.forEach(records, ({ photo, review }) =>
    Effect.map(digestOf(open.files.edit(photo).final), (digest) => ({
      photo,
      digest,
      review,
    })),
  );
  return { ...(yield* withCost(summary)), finished };
});

/**
 * Notes what an edit came to under its id, and keeps it to be printed. It
 * runs before the edit forgets how far it got.
 */
export const keepingEdit = (
  open: OpenShoot,
  operation: { readonly id: string; readonly about: string },
) => {
  const kept: { value: Result | null } = { value: null };
  const keep: Keep = (summary, records) =>
    Effect.gen(function* () {
      const result = yield* editResultOf(open, summary, records);
      yield* writeJson(Saved, open.files.operation(operation.id), {
        about: operation.about,
        result,
      });
      kept.value = result;
    });
  return { keep, kept };
};
