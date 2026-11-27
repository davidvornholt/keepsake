import { Context, Effect, Layer } from 'effect';
import { Publishing } from '../features/light-table/publishing.ts';
import { publishToAlbum } from '../features/publish/publish.ts';
import { takeOut } from '../features/publish/take-out.ts';
import { unpublish } from '../features/publish/unpublish.ts';

type Needs =
  | Effect.Services<ReturnType<typeof takeOut>>
  | Effect.Services<ReturnType<typeof publishToAlbum>>
  | Effect.Services<ReturnType<typeof unpublish>>;

/**
 * Lets the page take photos out of the album and publish them, with the
 * publish feature's own work, so the page does what the commands do.
 */
export const publishingLayer = Layer.effect(
  Publishing,
  Effect.gen(function* () {
    const services = yield* Effect.context<Needs>();
    // What the page holds, such as its locks, stays as it is.
    const plainly = <E extends { readonly message: string }>(
      work: Effect.Effect<unknown, E, Needs>,
    ) =>
      work.pipe(
        Effect.asVoid,
        Effect.mapError(({ message }) => ({ message })),
        Effect.updateContext((held: Context.Context<never>) =>
          Context.merge(services, held),
        ),
      );
    return Publishing.of({
      takeOut: (open, photos, because) =>
        plainly(takeOut(open, photos, because)),
      publish: (open, photos) => plainly(publishToAlbum(open, photos)),
      unpublish: (open, photo, before) =>
        plainly(unpublish(open, photo, before)),
    });
  }),
);
