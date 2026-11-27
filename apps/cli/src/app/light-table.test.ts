import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { readdir, readlink, rm } from 'node:fs/promises';
import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';
import { serveLightTable } from '../features/light-table/server.ts';
import {
  editLisbon,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools, fakeToolsLayer } from './fake-tools.ts';
import {
  change,
  send,
  shootOf,
  statusOf,
  whileServing,
} from './light-table-fixtures.ts';
import { handedOver } from './mark-fixtures.ts';
import { publishingLayer } from './publishing.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('the light table', () => {
  it('serves the page at every place in it', async () => {
    const pages = await whileServing((address) =>
      Promise.all(
        ['/', '/lisbon', '/lisbon/photos/B'].map((path) =>
          fetch(`${address}${path}`).then((response) =>
            response.headers.get('content-type'),
          ),
        ),
      ),
    );
    expect(pages).toEqual(new Array(3).fill('text/html;charset=utf-8'));
  });

  it('lists the shoots', async () => {
    await pickLisbon();
    await editLisbon();
    await runOk('publish', 'lisbon');
    const { shoots } = await whileServing(async (address) =>
      (await fetch(`${address}/api/shoots`)).json(),
    );
    expect(shoots).toMatchObject([
      {
        name: 'lisbon',
        about: 'Lisbon, May 2026',
        photos: 4,
        inAlbum: 3,
        picked: 0,
        preparation: null,
        activity: null,
        isOrdered: false,
        openMarks: 0,
        carrying: { since: null, stopped: null },
        news: 0,
        newSince: null,
      },
    ]);
    expect(shoots[0].covers).toHaveLength(3);
  });

  it('shows where every photo stands', async () => {
    await pickLisbon();
    await editLisbon('A1');
    await runOk('publish', 'lisbon', 'A1');
    const view = await whileServing(shootOf);
    expect(view).toMatchObject({
      name: 'lisbon',
      album: { url: 'https://photos.example.com/albums/album-1' },
      picked: { minimumScore: 6, maximum: null },
      activity: null,
      preparation: null,
      carrying: { since: null, stopped: null },
      added: [],
      ordered: null,
      rating: null,
      photos: [
        {
          id: 'A1',
          standing: {
            kind: 'album',
            url: 'https://photos.example.com/photos/asset-1',
          },
          verdict: { score: 8, reason: 'It looks at the camera.' },
          edit: { isAi: true, earlier: [], wish: null },
        },
        {
          id: 'A2',
          stack: 'A1',
          standing: { kind: 'similar', to: 'A1', because: null },
          edit: null,
        },
        { id: 'B', stack: 'B', standing: { kind: 'picked' } },
        { id: 'C', standing: { kind: 'picked' } },
      ],
      stacks: [
        { front: 'A1', photos: ['A1', 'A2'] },
        { front: 'B', photos: ['B'] },
        { front: 'C', photos: ['C'] },
      ],
    });
  });

  it('knows no other shoot', async () => {
    const status = await whileServing((address) =>
      statusOf(fetch(`${address}/api/shoots/porto`)),
    );
    expect(status).toBe(404);
  });

  it('sends a shoot only when it changed', async () => {
    await pickLisbon();
    const statuses = await whileServing(async (address) => {
      const first = await fetch(`${address}/api/shoots/lisbon`);
      const headers = { 'if-none-match': first.headers.get('etag') ?? '' };
      const same = await fetch(`${address}/api/shoots/lisbon`, { headers });
      await send('PUT', `${address}/api/shoots/lisbon/marks`, change);
      const other = await fetch(`${address}/api/shoots/lisbon`, { headers });
      return [first.status, same.status, other.status];
    });
    expect(statuses).toEqual([200, 304, 200]);
  });

  it('tells an open page what changes', async () => {
    await pickLisbon();
    const told = await whileServing(async (address) => {
      const response = await fetch(`${address}/api/shoots/lisbon/events`);
      const reader = response.body?.getReader();
      const next = async () =>
        new TextDecoder().decode((await reader?.read())?.value);
      const before = await next();
      await send('PUT', `${address}/api/shoots/lisbon/marks`, change);
      const after = await next();
      await reader?.cancel();
      return { before, after };
    });
    expect(told.before).toStartWith('event: changed\ndata: {"revision":');
    expect(told.after).toStartWith('event: changed\ndata: {"revision":');
    expect(told.after).not.toBe(told.before);
  });
});

describe('what the light table is doing', () => {
  it('says what another server carries out, and when nothing does', async () => {
    await pickLisbon();
    const since = '2026-05-02T10:00:00.000Z';
    const carrying = shootFile('carrying-out.json');
    const seen = await whileServing(async (address) => {
      // Once the server started, which goes on with what it finds then.
      await handedOver('order', { dollars: 1.5, album: ['B'] });
      const path = `${address}/api/shoots/lisbon`;
      const first = await fetch(path);
      const headers = { 'if-none-match': first.headers.get('etag') ?? '' };
      const now = async () => (await shootOf(address)).carrying;
      // A server that still runs, which isn't this one.
      await Bun.write(
        carrying,
        JSON.stringify({
          process: process.ppid,
          since,
          stopped: null,
          marks: {},
          toExplain: false,
        }),
      );
      const asked = await fetch(path, { headers });
      const working = await now();
      await rm(carrying);
      return [asked.status, working, await now()];
    });
    expect(seen).toMatchObject([
      200,
      { since, stopped: null },
      { since: null, stopped: { needs: 'retry', photos: [] } },
    ]);
  });
});

describe('the pictures of the light table', () => {
  it('are there in full size and smaller, for good', async () => {
    await pickLisbon();
    const [full, smaller, oddly] = await whileServing(async (address) => {
      const { photos } = await shootOf(address);
      const { src } = photos[2].picture;
      return Promise.all(
        ['', '?width=640', '?width=641'].map(async (query) => {
          const response = await fetch(`${address}${src}${query}`);
          return {
            text: await response.text(),
            type: response.headers.get('content-type'),
            cache: response.headers.get('cache-control'),
          };
        }),
      );
    });
    expect(full).toMatchObject({ text: 'a picture', type: 'image/jpeg' });
    expect(smaller).toMatchObject({ text: 'a picture', type: 'image/webp' });
    expect(oddly).toEqual(full);
    expect(smaller?.cache).toContain('immutable');
  });

  it('are known in full size, also where the photo was not edited', async () => {
    await pickLisbon();
    await editLisbon('A1');
    const [edited, other] = (await whileServing(shootOf)).photos;
    const size = { width: 7008, height: 4672 };
    expect(edited?.full).toMatchObject(size);
    expect(edited?.full.src).toContain('/A1/camera/');
    expect(other?.full).toMatchObject(size);
    expect(other?.full.src).toBe(other?.picture.src);
  });

  it('are not kept under the address of one they replaced', async () => {
    await pickLisbon();
    await editLisbon('B');
    const cacheOf = async (address: string) => {
      const { photos } = await shootOf(address);
      const { edit } = photos.find(({ id }: { id: string }) => id === 'B');
      return edit.picture.src;
    };
    const caches = await whileServing(async (address) => {
      const before = await cacheOf(address);
      await Bun.write(shootFile('edits', 'B', 'B-keepsake.jpg'), 'a newer one');
      const after = await cacheOf(address);
      return Promise.all(
        [before, after].map(async (src) => {
          const response = await fetch(`${address}${src}`);
          return [await response.text(), response.headers.get('cache-control')];
        }),
      );
    });
    expect(caches[0]).toEqual(['a newer one', 'no-store']);
    expect(caches[1]?.[1]).toContain('immutable');
  });

  it('are not kept where they only stand in for the photo', async () => {
    await pickLisbon();
    fakeTools.broken = new Set(['embedded.jpg']);
    const cache = await whileServing(async (address) => {
      const { photos } = await shootOf(address);
      const response = await fetch(`${address}${photos[2].picture.src}`);
      return response.headers.get('cache-control');
    });
    expect(cache).toBe('no-store');
  });

  it.each([
    '/pictures/lisbon/D/preview/1',
    '/pictures/lisbon/B/final/1',
    '/pictures/lisbon/B/record/1',
    '/pictures/lisbon/B/earlier-..%2F..%2Fshoot/1',
    '/pictures/lisbon/..%2Fshoot/preview/1',
  ])('are no other file: %p', async (path) => {
    await pickLisbon();
    const status = await whileServing((address) =>
      statusOf(fetch(`${address}${path}?width=640`)),
    );
    expect(status).toBe(404);
  });
});

describe('who the light table answers', () => {
  const elsewhere = new URL('https://keepsake.example.com');
  const visit = (headers: Record<string, string>, at = elsewhere) =>
    whileServing(
      (address) => statusOf(fetch(`${address}/api/shoots`, { headers })),
      { address: at },
    );

  it('answers under its own address and the one it is passed on from', async () => {
    expect(await visit({})).toBe(200);
    expect(await visit({ host: elsewhere.host })).toBe(200);
    const { origin } = elsewhere;
    expect(await visit({ host: elsewhere.host, origin })).toBe(200);
  });

  it('answers no other website', async () => {
    expect(await visit({ host: 'example.org' })).toBe(403);
    expect(await visit({ origin: 'https://example.org' })).toBe(403);
    const origin = 'http://keepsake.example.com';
    expect(await visit({ host: elsewhere.host, origin })).toBe(403);
  });

  it('changes nothing for another website', async () => {
    await pickLisbon();
    const status = await whileServing((address) =>
      statusOf(
        send('PUT', `${address}/api/shoots/lisbon/marks`, change, {
          origin: 'https://example.org',
        }),
      ),
    );
    expect(status).toBe(403);
    expect(await Bun.file(shootFile('marks')).exists()).toBe(false);
  });

  it('says that something else uses its port', async () => {
    const serving = whileServing((address) =>
      Effect.runPromise(
        serveLightTable({
          port: Number(new URL(address).port),
          address: undefined,
          photos: [],
          keepsake: [],
        }).pipe(
          Effect.scoped,
          Effect.provide(publishingLayer),
          Effect.provide(fakeToolsLayer),
          Effect.provide(BunServices.layer),
        ),
      ),
    );
    await expect(serving).rejects.toThrow('Leave out --port');
  });
});

describe('a light table that is served many times', () => {
  it('leaves no file watchers behind, which tests would run out of', async () => {
    const watchers = async () => {
      const fds = await readdir('/proc/self/fd');
      const links = await Promise.all(
        fds.map((fd) => readlink(`/proc/self/fd/${fd}`).catch(() => '')),
      );
      return links.filter((link) => link === 'anon_inode:inotify').length;
    };
    const before = await watchers();
    await whileServing((address) => fetch(address));
    expect(await watchers()).toBe(before);
  });
});
