import { Effect } from 'effect';
import { Publication } from '../../shared/domain.ts';
import { trashPhotos } from '../../shared/immich.ts';
import { withChoice, withUploads } from '../../shared/lock.ts';
import {
  assetsInUse,
  madeFor,
  readPublication,
  uploadsOfOthers,
} from '../../shared/publication.ts';
import { type OpenShoot, writeJson } from '../../shared/store.ts';

/**
 * The upload of a photo that a new one replaced and that is a photo of no
 * album keepsake knows of, as Immich gives a file that it has the same id.
 * Only an asset keepsake made counts: another may be the owner's.
 */
export const outdatedOf = (publication: Publication) => {
  const inUse = assetsInUse(publication);
  const made = madeFor(publication);
  return (publication.outdated ?? []).filter(
    (asset) => made.has(asset) && !inUse.has(asset),
  );
};

/**
 * Forgets the replaced uploads that the output of a command named, which
 * happens only once it was printed.
 */
const forgetOutdated = Effect.fn('forgetOutdated')(function* (
  open: OpenShoot,
  named: ReadonlyArray<string>,
) {
  const publication = yield* readPublication(open);
  if (publication !== null && named.length > 0) {
    yield* writeJson(Publication, open.files.publication, {
      ...publication,
      outdated: (publication.outdated ?? []).filter(
        (asset) => !named.includes(asset),
      ),
    });
  }
});

/**
 * Of these replaced uploads, those still noted and in no album keepsake knows
 * of, as a publish since may have brought one back, and no other shoot's.
 */
const stillOutdated = Effect.fn('stillOutdated')(function* (
  open: OpenShoot,
  candidates: ReadonlyArray<string>,
) {
  const publication = yield* readPublication(open);
  const noted = new Set(publication === null ? [] : outdatedOf(publication));
  // One that another shoot's photo is stays, and is told once it isn't.
  const others = yield* uploadsOfOthers(open);
  return candidates.filter(
    (asset) => noted.has(asset) && !others.anywhere(asset),
  );
});

/** Why the uploads couldn't go to the trash, or null once they are there. */
const trashed = (assets: ReadonlyArray<string>) =>
  assets.length === 0
    ? Effect.succeed(null)
    : trashPhotos(assets).pipe(
        Effect.as(null),
        Effect.catch(({ message }) => Effect.succeed(message)),
      );

/**
 * Moves the replaced uploads that are still outdated to Immich's trash, since
 * the owner asked for the better photo and not for two, tells of them, and
 * forgets them once told. Those the trash didn't take stay noted, so the next
 * publish tries again. Run it on the shoot it holds, so no publish changes
 * them in between; it holds the choice too, so the page publishes nothing
 * meanwhile.
 */
export const tellOutdated = <E, R>(
  open: OpenShoot,
  candidates: ReadonlyArray<string>,
  tell: (
    outdated: ReadonlyArray<string>,
    trashFailed: string | null,
  ) => Effect.Effect<void, E, R>,
) =>
  Effect.gen(function* () {
    // While no shoot uploads, so none gets one of these as its own between
    // the look and the trash.
    const [outdated, failed] = yield* Effect.gen(function* () {
      const still = yield* stillOutdated(open, candidates);
      return [still, yield* trashed(still)] as const;
    }).pipe(withUploads(open.files));
    yield* tell(outdated, failed);
    if (failed === null) {
      yield* forgetOutdated(open, outdated);
    }
  }).pipe(withChoice(open.files));
