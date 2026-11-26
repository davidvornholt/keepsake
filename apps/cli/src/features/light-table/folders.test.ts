import { describe, expect, it } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { Effect, Path } from 'effect';
import { byFolder } from './folders.ts';

const pathOf = Effect.runSync(
  Effect.gen(function* () {
    return yield* Path.Path;
  }).pipe(Effect.provide(BunServices.layer)),
);

describe('the photos of a folder', () => {
  it('are grouped at once when there are very many', () => {
    const count = 100_000;
    const photos = Array.from({ length: count }, (_, index) => ({
      file: `/photos/trip/${index}.ARW`,
      modified: index,
    }));
    const started = performance.now();
    const grouped = byFolder(pathOf, photos);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(grouped.get('/photos/trip')).toEqual(photos);
  });
});
