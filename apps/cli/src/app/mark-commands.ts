import { Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import {
  agreedDollars,
  isStillChosen,
  orderOf,
} from '../features/light-table/hand-over.ts';
import { isWaiting, readMarks } from '../features/light-table/marks.ts';
import type { Mark } from '../features/light-table/schemas.ts';
import { takeOut as takeOutOfAlbum } from '../features/publish/take-out.ts';
import { photoLinks, shootLink } from '../shared/address.ts';
import { judgeOf } from '../shared/judge.ts';
import { Spending } from '../shared/spending.ts';
import { type Standings, standings } from '../shared/standing.ts';
import { exists, type OpenShoot, openShoot } from '../shared/store.ts';
import { workOn } from '../shared/work.ts';
import { flag, shootArgument } from './command-inputs.ts';
import { emit } from './output.ts';

/** A photo of a mark, with what is needed to look at it. */
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

/** The marks, each with what there is to know of its photos. */
const shown = Effect.fn('shown')(function* (
  open: OpenShoot,
  known: Standings,
  toShow: ReadonlyArray<Mark>,
) {
  return yield* Effect.forEach(toShow, ({ photo, ...mark }) =>
    Effect.gen(function* () {
      return { ...mark, ...(yield* aboutPhoto(open, known, photo)) };
    }),
  );
});

/** The photos that the owner ordered edited and put into an album, until they are. */
const ordered = Effect.fn('ordered')(function* (
  open: OpenShoot,
  known: Standings,
) {
  const order = yield* orderOf(open.files, known);
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

/** What was handed over and is still to be done, or every mark. */
const listed = Effect.fn('listed')(function* (
  open: OpenShoot,
  model: string,
  all: boolean,
) {
  const known = yield* standings(yield* openShoot(open.shoot.name), model);
  const every = yield* readMarks(open.files);
  return {
    known,
    found: every.filter(
      (mark) => all || (isWaiting(mark) && isStillChosen(known)(mark)),
    ),
    album: yield* ordered(open, known),
    agreedDollars: yield* agreedDollars(open.files, known),
  };
});

export const marks = Command.make(
  'marks',
  {
    shoot: shootArgument,
    all: flag(
      'all',
      'Also list marks that aren’t handed over yet or are answered already',
    ),
  },
  ({ shoot, all }) =>
    Effect.gen(function* () {
      const open = yield* openShoot(shoot);
      const model = yield* judgeOf(open, Option.none());
      const found = yield* listed(open, model, all);
      yield* emit({
        shoot,
        link: yield* shootLink(shoot),
        /** What is left of what the owner agreed to pay for all of it. */
        agreedDollars: found.agreedDollars,
        album: found.album,
        marks: yield* shown(open, found.known, found.found),
      });
    }),
).pipe(
  Command.withDescription(
    'List what the owner handed over on the page and the page is still carrying out: whether the chosen photos are to be edited and put into an album, their marks with the answers keepsake gave, and what they agreed to pay. Boxes are in fractions of the finished photo.',
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
