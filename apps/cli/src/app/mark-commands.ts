import { Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import {
  agreedDollars,
  claimUnsettled,
  type Only,
  orderAmong,
  unsettledOf,
} from '../features/light-table/hand-over.ts';
import { readHandOvers } from '../features/light-table/handed.ts';
import {
  answerMark,
  isWaiting,
  readMarks,
} from '../features/light-table/marks.ts';
import type { Mark } from '../features/light-table/schemas.ts';
import { waitForHandOver } from '../features/light-table/waiting.ts';
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

/** The marks, each with what an agent needs to know of its photos. */
const shown = Effect.fn('shown')(function* (
  open: OpenShoot,
  known: Standings,
  toShow: ReadonlyArray<Mark>,
) {
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

/** The photos that the owner ordered edited and put into an album, until they are. */
const ordered = Effect.fn('ordered')(function* (
  open: OpenShoot,
  known: Standings,
  only: Only,
) {
  const order = yield* orderAmong(open.files, known, only);
  if (order === null) {
    return null;
  }
  const waiting = order.photos.filter(
    (photo) => known.of.get(photo)?.kind === 'picked',
  );
  const isEdited = yield* Effect.forEach(waiting, (photo) =>
    exists(open.files.edit(photo).record),
  );
  return {
    at: order.at,
    photos: waiting,
    edited: isEdited.filter(Boolean).length,
  };
});

/** What there is for an agent: of the hand-overs named, or of all. */
const listed = Effect.fn('listed')(function* (
  open: OpenShoot,
  model: string,
  { all, only }: { readonly all: boolean; readonly only: Only },
) {
  const known = yield* standings(yield* openShoot(open.shoot.name), model);
  const unsettled = yield* unsettledOf(open.files, known, only);
  // The marks of the hand-overs named, also of those that are done.
  const named = new Set(
    (yield* readHandOvers(open.files)).flatMap(({ id, marks: ids }) =>
      only?.has(id) === true ? ids : [],
    ),
  );
  const every = yield* readMarks(open.files);
  return {
    known,
    handOvers: unsettled.map(({ id }) => id),
    found: every.filter(
      (mark) =>
        (all || isWaiting(mark)) && (only === null || named.has(mark.id)),
    ),
    album: yield* ordered(open, known, only),
    agreedDollars: yield* agreedDollars(open.files, known, only),
  };
});

export const marks = Command.make(
  'marks',
  {
    shoot: shootArgument,
    wait: flag(
      'wait',
      'Wait until there is something, however long that takes',
    ),
    all: flag(
      'all',
      'Also list marks that aren’t handed over yet or are answered already',
    ),
    handOvers: Flag.String('hand-over').pipe(
      Flag.withDescription(
        'Only what was handed over with this id, as the agent was given it; can be given several times',
      ),
      Flag.atLeast(0),
    ),
  },
  ({ shoot, wait, all, handOvers }) =>
    Effect.gen(function* () {
      if (wait && (all || handOvers.length > 0)) {
        return yield* fail('Give --wait alone, or --all and --hand-over.');
      }
      const open = yield* openShoot(shoot);
      const model = yield* judgeOf(open, Option.none());
      let only: Only = handOvers.length > 0 ? new Set(handOvers) : null;
      if (wait) {
        const take = Effect.gen(function* () {
          const known = yield* standings(yield* openShoot(shoot), model);
          return yield* claimUnsettled(open.files, known);
        });
        only = new Set(
          yield* waitForHandOver(open.files, take, (taken) => taken.length > 0),
        );
      }
      const found = yield* listed(open, model, { all, only });
      yield* emit({
        shoot,
        link: yield* shootLink(shoot),
        /** The hand-overs it is about, to name with --hand-over again. */
        handOvers: found.handOvers,
        /** What is left of what the owner agreed to pay for all of it. */
        agreedDollars: found.agreedDollars,
        album: found.album,
        marks: yield* shown(open, found.known, found.found),
      });
    }),
).pipe(
  Command.withDescription(
    'List what the owner handed over on the page, for an agent to act on: whether the chosen photos are to be edited and put into an album, their marks, and what they agreed to pay. Boxes are in fractions of the finished photo.',
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
      Argument.withDescription('A photo that is, or is to be, in the album'),
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
    'Take photos out of the album in Immich, or out of those that are to be in it, and note why. They stay in the library. With photos taken out before, only note why.',
  ),
);
