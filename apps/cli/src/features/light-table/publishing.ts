import { Context, type Effect } from 'effect';
import type { PublishedPhoto } from '../../shared/domain.ts';
import type { OpenShoot } from '../../shared/store.ts';

type Failure = { readonly message: string };

/**
 * What takes photos out of the album and publishes them, which is the
 * publish feature's work. The entrypoint gives it to the page.
 */
export class Publishing extends Context.Service<
  Publishing,
  {
    readonly takeOut: (
      open: OpenShoot,
      photos: ReadonlyArray<string>,
      because: string,
    ) => Effect.Effect<void, Failure>;
    readonly publish: (
      open: OpenShoot,
      photo: string,
    ) => Effect.Effect<void, Failure>;
    /**
     * Takes a photo just published back out of the album, and lets what
     * was published of it be what it was before.
     */
    readonly unpublish: (
      open: OpenShoot,
      photo: string,
      before: PublishedPhoto | undefined,
    ) => Effect.Effect<void, Failure>;
  }
>()('@keepsake/cli/features/light-table/Publishing') {}
