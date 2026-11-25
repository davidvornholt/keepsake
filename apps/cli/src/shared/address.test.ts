import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import { photoLinks, saveAddress, shootLink } from './address.ts';

let home = '';

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'keepsake-address-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const elsewhere = 'https://keepsake.example.com/';
const here = 'http://127.0.0.1:3790/';

/** The link to a shoot after the page was served at these addresses. */
const linkAfter = (
  ...served: ReadonlyArray<readonly [address: string, isElsewhere: boolean]>
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.forEach(served, ([address, isElsewhere]) =>
        saveAddress(address, isElsewhere),
      );
      const linkTo = yield* photoLinks('lisbon');
      return [yield* shootLink('lisbon'), linkTo('day 1/A1')];
    }).pipe(
      Effect.provide(BunServices.layer),
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromDotEnvContents(`HOME=${home}`)),
      ),
    ),
  );

describe('links to the page', () => {
  it('lead to where it is reached', async () => {
    expect(await linkAfter([elsewhere, true])).toEqual([
      `${elsewhere}lisbon`,
      `${elsewhere}lisbon/photos/day%201%2FA1`,
    ]);
  });

  it('lead nowhere while it isn’t served', async () => {
    expect(await linkAfter()).toEqual([null, null]);
  });

  it('don’t lead to one that is only tried out meanwhile', async () => {
    const links = await linkAfter([elsewhere, true], [here, false]);
    expect(links[0]).toBe(`${elsewhere}lisbon`);
  });

  it('lead to the one that is reached from elsewhere', async () => {
    const links = await linkAfter([here, false], [elsewhere, true]);
    expect(links[0]).toBe(`${elsewhere}lisbon`);
  });
});
