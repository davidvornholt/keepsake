import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import type { Moment, Photo } from '../../shared/domain.ts';
import { type OpenShoot, shootFiles } from '../../shared/store.ts';
import { readRatings, serveRatingPage } from './server.ts';

let home = '';

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'keepsake-rating-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const sample: ReadonlyArray<Moment> = [{ id: 'A1', photos: ['A1', 'A2'] }];

/** Serves the page of a shoot while `visit` runs. */
const whileServing = <A>(visit: (address: string) => Promise<A>, port = 0) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const files = yield* shootFiles('lisbon');
      const open: OpenShoot = {
        files,
        shoot: { name: 'lisbon', source: '/photos', about: null },
        photos: new Map<string, Photo>(),
        moments: sample,
      };
      yield* Effect.promise(() => Bun.write(files.preview('A1'), 'a picture'));
      const server = yield* serveRatingPage({ open, sample, port });
      const visited = yield* Effect.promise(() =>
        visit(`http://127.0.0.1:${server.port}`),
      );
      return { visited, ratings: yield* readRatings(open) };
    }).pipe(
      Effect.scoped,
      Effect.provide(BunServices.layer),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromDotEnvContents(`HOME=${home}`)),
      ),
    ),
  );

const post = (address: string, body: unknown, headers = {}) =>
  fetch(`${address}/ratings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const answer = { moment: 'A1', best: ['A2'], stars: 4 };

describe('the rating page', () => {
  it('shows the moments without what a model thinks of them', async () => {
    const { visited } = await whileServing(async (address) => {
      const response = await fetch(`${address}/moments`);
      return response.json();
    });
    expect(visited).toEqual({ shoot: 'lisbon', sample, ratings: [] });
  });

  it('serves the page and the previews of its photos only', async () => {
    const { visited } = await whileServing(async (address) => {
      const [page, shown, full, other] = await Promise.all([
        fetch(address).then((response) => response.text()),
        fetch(`${address}/previews?photo=A1`).then((response) =>
          response.text(),
        ),
        fetch(`${address}/full?photo=A1`).then((response) => response.text()),
        fetch(`${address}/previews?photo=../../shoot`),
      ]);
      return { page, shown, full, other: other.status };
    });
    expect(visited.page).toContain('Rate photos');
    expect(visited.shown).toBe('a picture');
    expect(visited.full).toBe('a picture');
    expect(visited.other).toBe(404);
  });

  it('saves a rating in place of an earlier one', async () => {
    const { visited, ratings } = await whileServing(async (address) => {
      await post(address, { ...answer, stars: 1 });
      const response = await post(address, answer);
      return response.status;
    });
    expect(visited).toBe(204);
    expect(ratings).toEqual([{ ...answer, photos: ['A1', 'A2'] }]);
  });

  it.each([
    { ...answer, stars: 6 },
    { ...answer, moment: 'B' },
    { ...answer, best: ['C'] },
    {},
  ])('refuses %j', async (body) => {
    const { visited, ratings } = await whileServing(async (address) => {
      const response = await post(address, body);
      return response.status;
    });
    expect(visited).toBe(400);
    expect(ratings).toEqual([]);
  });

  it('says so when the port is taken', async () => {
    const taken = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => new Response(),
    });
    const served = whileServing(async () => undefined, taken.port);
    await expect(served).rejects.toThrow(`using port ${taken.port}`);
    await taken.stop(true);
  });

  it('answers no other website', async () => {
    const { visited, ratings } = await whileServing(async (address) => {
      const [byOrigin, byHost] = await Promise.all([
        post(address, answer, { origin: 'https://example.com' }),
        fetch(`${address}/moments`, { headers: { host: 'example.com' } }),
      ]);
      return [byOrigin.status, byHost.status];
    });
    expect(visited).toEqual([403, 403]);
    expect(ratings).toEqual([]);
  });
});
