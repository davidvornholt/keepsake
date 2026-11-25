import { Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import {
  answerMark,
  isWaiting,
  readMarks,
} from '../features/light-table/marks.ts';
import type { Mark } from '../features/light-table/schemas.ts';
import { waitForMarks } from '../features/light-table/waiting.ts';
import { takeOut as takeOutOfAlbum } from '../features/publish/take-out.ts';
import { photoLinks, shootLink } from '../shared/address.ts';
import { readAlbum } from '../shared/album.ts';
import { judgeOf } from '../shared/judge.ts';
import { Spending } from '../shared/spending.ts';
import { type Standings, standings } from '../shared/standing.ts';
import { exists, type OpenShoot, openShoot } from '../shared/store.ts';
import { workOn } from '../shared/work.ts';
import { fail, flag, optionalString, shootArgument } from './command-inputs.ts';
import { emit } from './output.ts';

/** A photo of a mark, with what an agent needs to act on it. */
const aboutPhoto = Effect.fn('aboutPhoto')(function* (
  open: OpenShoot,
  known: Standings,
  photo: string,
) {
  const files = open.files.edit(photo);
  const linkTo = yield* photoLinks(open.shoot.name);
  const album = known.album?.photos.find((one) => one.photo === photo);
  return {
    photo,
    link: linkTo(photo),
    preview: open.files.preview(photo),
    /** The finished photo, if there is one. */
    final: (yield* exists(files.final)) ? files.final : null,
    /** Its asset in Immich, if it is in the album. */
    asset: album?.asset ?? null,
  };
});

const shown = Effect.fn('shown')(function* (
  open: OpenShoot,
  toShow: ReadonlyArray<Mark>,
) {
  const model = yield* judgeOf(open, Option.none());
  const known = yield* standings(open, model);
  return yield* Effect.forEach(toShow, ({ photo, other, ...mark }) =>
    Effect.gen(function* () {
      return {
        ...mark,
        ...(yield* aboutPhoto(open, known, photo)),
        other: other === null ? null : yield* aboutPhoto(open, known, other),
      };
    }),
  );
});

export const marks = Command.make(
  'marks',
  {
    shoot: shootArgument,
    wait: flag('wait', 'Wait until there are some, however long that takes'),
    all: flag(
      'all',
      'Also list marks that aren’t handed over yet or are answered already',
    ),
  },
  ({ shoot, wait, all }) =>
    Effect.gen(function* () {
      if (wait && all) {
        return yield* fail('Give either --wait or --all.');
      }
      const open = yield* openShoot(shoot);
      const found = wait
        ? yield* waitForMarks(open.files)
        : (yield* readMarks(open.files)).filter(
            (mark) => all || isWaiting(mark),
          );
      yield* emit({
        shoot,
        link: yield* shootLink(shoot),
        marks: yield* shown(open, found),
      });
    }),
).pipe(
  Command.withDescription(
    'List what the owner marked on the page and handed over, for an agent to act on. Boxes are in fractions of the finished photo.',
  ),
);

export const answer = Command.make(
  'answer',
  {
    shoot: shootArgument,
    mark: Argument.String('mark').pipe(
      Argument.withDescription('The id of the mark'),
    ),
    done: optionalString('done', 'What was done about it, in one sentence'),
    notDone: optionalString('not-done', 'Why it wasn’t done, in one sentence'),
  },
  ({ shoot, mark, done, notDone }) =>
    Effect.gen(function* () {
      if (Option.isSome(done) === Option.isSome(notDone)) {
        return yield* fail('Give either --done or --not-done.');
      }
      const open = yield* openShoot(shoot);
      const note = Option.getOrElse(done, () =>
        Option.getOrElse(notDone, () => ''),
      );
      // First, so the owner sees the answer next to what came of it.
      yield* readAlbum(open).pipe(Effect.ignore);
      const answered = yield* answerMark(open.files, mark, {
        outcome: Option.isSome(done) ? 'done' : 'not-done',
        note,
      });
      const waiting = (yield* readMarks(open.files)).filter(isWaiting);
      yield* emit({ shoot, mark: answered, left: waiting.map(({ id }) => id) });
    }),
).pipe(
  Command.withDescription(
    'Tell the owner what came of a mark. The page shows it with the photo, for them to look at.',
  ),
);

export const takeOut = Command.make(
  'take-out',
  {
    shoot: shootArgument,
    photos: Argument.String('photo').pipe(
      Argument.withDescription('A photo of the album'),
      Argument.variadic({ min: 1 }),
    ),
    because: Flag.String('because').pipe(
      Flag.withDescription('Why, in the owner’s words where they gave any'),
    ),
  },
  ({ shoot, photos, because }) =>
    workOn(shoot, (open) => takeOutOfAlbum(open, photos, because)).pipe(
      Effect.flatMap(emit),
      Effect.provide(Spending.layer),
    ),
).pipe(
  Command.withDescription(
    'Take photos out of the album in Immich and note why. They stay in the library. With photos taken out before, only note why.',
  ),
);
