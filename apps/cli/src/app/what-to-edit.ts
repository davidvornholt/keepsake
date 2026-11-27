import { Effect, Option } from 'effect';
import { markWith } from '../features/light-table/marks.ts';
import { InvalidInput } from '../shared/errors/errors.ts';
import { judgeOf } from '../shared/judge.ts';
import { standings } from '../shared/standing.ts';
import { type OpenShoot, openShoot } from '../shared/store.ts';

/**
 * A mark, while its photo is chosen or in the album. The owner may have
 * taken it out since they handed the mark over.
 */
export const markOfChosen = Effect.fn('markOfChosen')(function* (
  open: OpenShoot,
  id: string,
) {
  const mark = yield* markWith(open.files, id);
  const known = yield* standings(open, yield* judgeOf(open, Option.none()));
  const kind = known.of.get(mark.photo)?.kind;
  if (kind !== 'album' && kind !== 'picked') {
    return yield* new InvalidInput({
      message: `${mark.photo} was taken out meanwhile, so nothing was done for the mark ${id}. Answer it with --not-done and that reason.`,
    });
  }
  return mark;
});

/** The photos to edit, and what is wanted of them and where. */
export const whatToEdit = Effect.fn('whatToEdit')(function* (
  shoot: string,
  asked: {
    readonly photos: ReadonlyArray<string>;
    readonly wish: Option.Option<string>;
    readonly mark: Option.Option<string>;
    readonly again: boolean;
    readonly budget: Option.Option<number>;
  },
) {
  const { photos, mark } = asked;
  const own = Option.getOrNull(asked.wish);
  if (Option.isSome(mark) && asked.again) {
    return yield* new InvalidInput({
      message:
        'A mark changes only what it is about, so it can’t start over. Use --again with the photo’s name and a --wish instead.',
    });
  }
  if (Option.isNone(mark)) {
    if (own !== null && photos.length === 0) {
      return yield* new InvalidInput({
        message: 'Name the photos the wish is for.',
      });
    }
    return { photos, wish: own, areas: [] };
  }
  if (photos.length > 0) {
    return yield* new InvalidInput({
      message: 'Name no photos with --mark, which is about one already.',
    });
  }
  // A mark is answered without the owner there to agree to the default.
  if (Option.isNone(asked.budget)) {
    return yield* new InvalidInput({
      message:
        'Give --budget with --mark: what is left of what the owner agreed to spend.',
    });
  }
  const open = yield* openShoot(shoot);
  const { photo, note, boxes } = yield* markOfChosen(open, mark.value);
  const wish = own ?? (note === '' ? null : note);
  if (wish === null && boxes.length > 0) {
    return yield* new InvalidInput({
      message: `The mark ${mark.value} has no note. Say with --wish what to do at the places it marks.`,
    });
  }
  return { photos: [photo], wish, areas: boxes };
});
