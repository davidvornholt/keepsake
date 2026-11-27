import { Context, type Effect } from 'effect';
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
      photos: ReadonlyArray<string>,
    ) => Effect.Effect<void, Failure>;
  }
>()('@keepsake/cli/features/light-table/Publishing') {}
