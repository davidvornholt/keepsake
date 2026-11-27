import { Effect } from 'effect';
import { Publication } from '../../shared/domain.ts';
import { withChoice } from '../../shared/lock.ts';
import {
  assetsInUse,
  readPublication,
  uploadsOfOthers,
} from '../../shared/publication.ts';
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

/**
 * Tells of the replaced uploads that are still outdated and forgets them once
 * told. Run it on the shoot it holds, so no publish changes them in between;
 * it holds the choice too, so the page publishes nothing meanwhile.
 */
export const tellOutdated = <E, R>(
  open: OpenShoot,
  candidates: ReadonlyArray<string>,
  tell: (outdated: ReadonlyArray<string>) => Effect.Effect<void, E, R>,
) =>
  stillOutdated(open, candidates).pipe(
    Effect.tap(tell),
    Effect.flatMap((outdated) => forgetOutdated(open, outdated)),
    withChoice(open.files),
  );
