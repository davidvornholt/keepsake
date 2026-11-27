import { Effect } from 'effect';
import { Publication } from '../../shared/domain.ts';
import { trashPhotos } from '../../shared/immich.ts';
import { withChoice } from '../../shared/lock.ts';
import { assetsInUse, readPublication } from '../../shared/publication.ts';
import { type OpenShoot, writeJson } from '../../shared/store.ts';

/**
 * The upload of a photo that a new one replaced and that is a photo of no
 * album keepsake knows of, as Immich gives a file that it has the same id.
 */
export const outdatedOf = (publication: Publication) => {
  const inUse = assetsInUse(publication);
  return (publication.outdated ?? []).filter((asset) => !inUse.has(asset));
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
 * of, as a publish since may have brought one back.
 */
const stillOutdated = Effect.fn('stillOutdated')(function* (
  open: OpenShoot,
  candidates: ReadonlyArray<string>,
) {
  const publication = yield* readPublication(open);
  const noted = new Set(publication === null ? [] : outdatedOf(publication));
  return candidates.filter((asset) => noted.has(asset));
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
    const outdated = yield* stillOutdated(open, candidates);
    const failed = yield* trashed(outdated);
    yield* tell(outdated, failed);
    if (failed === null) {
      yield* forgetOutdated(open, outdated);
    }
  }).pipe(withChoice(open.files));
