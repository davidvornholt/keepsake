import { Effect, Option } from 'effect';
import { photoLinks } from '../../shared/address.ts';
import { EditRecord, PickList, Publication } from '../../shared/domain.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { SpendingRecord, totalDollars } from '../../shared/spending.ts';
import { standings } from '../../shared/standing.ts';
import {
  type OpenShoot,
  openShoot,
  readJson,
  shootFiles,
  shootNames,
} from '../../shared/store.ts';
import { verdictOn, verdicts } from '../../shared/verdicts.ts';

const cents = 100;
const inCents = (dollars: number) => Math.round(dollars * cents) / cents;

const dollarsSpent = Effect.fn('dollarsSpent')(function* (open: OpenShoot) {
  const spending = yield* readJson(SpendingRecord, open.files.spending);
  return Option.match(spending, {
    onNone: () => 0,
    onSome: (record) => inCents(totalDollars(record)),
  });
});

const editOf = Effect.fn('editOf')(function* (open: OpenShoot, photo: string) {
  return Option.getOrNull(
    yield* readJson(EditRecord, open.files.edit(photo).record),
  );
});

/** Every shoot on this machine, in short. */
export const listShoots = Effect.gen(function* () {
  const names = yield* shootNames;
  const shoots = yield* Effect.forEach(names.toSorted(), (name) =>
    Effect.gen(function* () {
      const files = yield* shootFiles(name);
      const open = yield* openShoot(name).pipe(Effect.option);
      return Option.isNone(open)
        ? []
        : [
            {
              shoot: name,
              title: open.value.shoot.title ?? null,
              about: open.value.shoot.about,
              source: open.value.shoot.source,
              photos: open.value.photos.size,
              moments: open.value.moments.length,
              folder: files.root,
            },
          ];
    }),
  );
  return shoots.flat();
});

/** Where a shoot stands. */
export const showShoot = Effect.fn('showShoot')(function* (
  open: OpenShoot,
  model: string,
) {
  const judged = yield* verdicts(open, model);
  const picks = Option.getOrNull(yield* readJson(PickList, open.files.picks));
  const published = Option.getOrNull(
    yield* readJson(Publication, open.files.publication),
  );
  const picked = yield* Effect.forEach(picks?.picks ?? [], (pick) =>
    Effect.gen(function* () {
      const edit = yield* editOf(open, pick.photo);
      const files = open.files.edit(pick.photo);
      return {
        photo: pick.photo,
        score: pick.score,
        subject: pick.subject,
        description: pick.description,
        edit:
          edit === null
            ? null
            : { version: edit.version, review: edit.review, file: files.final },
        published:
          published?.photos.find(({ photo }) => photo === pick.photo)?.asset ??
          null,
      };
    }),
  );
  return {
    shoot: open.shoot.name,
    title: open.shoot.title ?? null,
    about: open.shoot.about,
    source: open.shoot.source,
    folder: open.files.root,
    photos: open.photos.size,
    moments: open.moments.length,
    judgedBy: { model, moments: judged.length },
    picked,
    album: published?.album ?? null,
    dollarsSpent: yield* dollarsSpent(open),
  };
});

/** Everything keepsake knows about one photo. */
export const showPhoto = Effect.fn('showPhoto')(function* (
  open: OpenShoot,
  model: string,
  name: string,
) {
  const photo = yield* photoNamed(open, name);
  const moment = open.moments.find(({ photos }) => photos.includes(photo.id));
  const verdict =
    moment === undefined
      ? null
      : Option.getOrNull(yield* verdictOn(open, model, moment));
  const files = open.files.edit(photo.id);
  const { hash: _, ...shown } = photo;
  const known = yield* standings(open, model);
  const linkTo = yield* photoLinks(open.shoot.name);
  return {
    ...shown,
    link: linkTo(photo.id),
    standing: known.of.get(photo.id) ?? null,
    preview: open.files.preview(photo.id),
    moment: moment ?? null,
    verdict,
    edit: yield* editOf(open, photo.id),
    files: {
      camera: files.camera,
      input: files.input,
      final: files.final,
    },
  };
});
