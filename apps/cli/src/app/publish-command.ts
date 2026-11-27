import { Effect, Option } from 'effect';
import { Argument, Command } from 'effect/cli';
import { stillOrdered } from '../features/light-table/carry-out.ts';
import { tellOutdated } from '../features/publish/outdated.ts';
import { publish as publishShoot } from '../features/publish/publish.ts';
import { InvalidInput, PhotoChanged } from '../shared/errors/errors.ts';
import { withChoice } from '../shared/lock.ts';
import { Spending } from '../shared/spending.ts';
import { digestOf, type OpenShoot } from '../shared/store.ts';
import { workOn } from '../shared/work.ts';
import { optionalString, shootArgument } from './command-inputs.ts';
import { emit } from './output.ts';
import { markOfChosen } from './what-to-edit.ts';

/** Publishes the photos named, and says which ones they were. */
const publishNamed = (
  open: OpenShoot,
  {
    names,
    album,
  }: {
    readonly names: ReadonlyArray<string>;
    readonly album: Option.Option<string>;
  },
) =>
  Effect.gen(function* () {
    const published = yield* publishShoot(open, names, album);
    yield* tellOutdated(open, published.outdated, (outdated, trashFailed) =>
      emit({ ...published, outdated, trashFailed, photos: names }),
    );
  });

/** The photo of a mark, while its finished file is still the one it should be. */
const photoOfMark = Effect.fn('photoOfMark')(function* (
  open: OpenShoot,
  mark: string,
  digest: Option.Option<string>,
) {
  const { photo } = yield* markOfChosen(open, mark);
  if (Option.isNone(digest)) {
    return photo;
  }
  const now = yield* digestOf(open.files.edit(photo).final).pipe(
    Effect.orElseSucceed(() => null),
  );
  if (now !== digest.value) {
    return yield* new PhotoChanged({
      message: `${photo} was edited again after the change of the mark ${mark}, so nothing was published.`,
    });
  }
  return photo;
});

/** Publishes what was asked for: photos, the photo of a mark, or what an order still has. */
const publishAsked = Effect.fn('publishAsked')(function* (
  open: OpenShoot,
  asked: {
    readonly photos: ReadonlyArray<string>;
    readonly album: Option.Option<string>;
    readonly mark: Option.Option<string>;
    readonly digest: Option.Option<string>;
    readonly order: Option.Option<string>;
  },
) {
  const { photos, album, mark, digest, order } = asked;
  const named = [Option.isSome(mark), Option.isSome(order), photos.length > 0];
  if (named.filter(Boolean).length > 1) {
    return yield* new InvalidInput({
      message: 'Name photos, a --mark or an --order, only one of them.',
    });
  }
  if (Option.isSome(digest) && Option.isNone(mark)) {
    return yield* new InvalidInput({
      message: '--digest goes with a --mark.',
    });
  }
  if (Option.isSome(mark)) {
    return yield* publishNamed(open, {
      names: [yield* photoOfMark(open, mark.value, digest)],
      album,
    });
  }
  if (Option.isNone(order)) {
    return yield* publishNamed(open, { names: photos, album });
  }
  // Under the choice lock from here on, so what the owner takes out
  // meanwhile waits until it is published, and none comes back.
  const ordered = yield* stillOrdered(open, order.value);
  yield* ordered.length === 0
    ? emit({ shoot: open.shoot.name, published: 0, outdated: [], photos: [] })
    : publishNamed(open, { names: ordered, album });
});

export const publish = Command.make(
  'publish',
  {
    shoot: shootArgument,
    photos: Argument.String('photo').pipe(
      Argument.withDescription('Photos to publish instead of the picked ones'),
      Argument.variadic(),
    ),
    album: optionalString(
      'album',
      'Publish to the album with this name instead, made if there is none (default: the album published to before, or else a new album named after the shoot’s title)',
    ),
    mark: optionalString(
      'mark',
      'Publish the photo a mark is about, unless the owner took it out meanwhile',
    ),
    digest: optionalString(
      'digest',
      'With --mark: publish only while the finished photo is the file with this SHA-256 digest, as its edit printed it, and fail with PhotoChanged when it isn’t',
    ),
    order: optionalString(
      'order',
      'Publish the edited photos of the order handed over with this id that are still chosen when it starts, and list them under `photos`',
    ),
  },
  ({ shoot, photos, album, mark, digest, order }) =>
    workOn(shoot, (open) =>
      publishAsked(open, { photos, album, mark, digest, order }).pipe(
        // Until it told, so the page publishes nothing in between, and
        // takes out no photo of a mark while it is published.
        withChoice(open.files),
      ),
    ).pipe(Effect.provide(Spending.layer)),
).pipe(
  Command.withDescription(
    'Upload the finished photos to an album in Immich with the photos command, each stacked on top of the camera’s own picture. Photos published before are not sent again.',
  ),
);
