import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Mark, ShootView } from '../../contract.ts';
import { unreachable } from './api.ts';
import { sampleMark, samplePhoto, sampleShoot } from './sample.ts';
import { makeShootStore } from './store.ts';

/** A request the page sent, which waits for the test to answer it. */
type Call = {
  readonly method: string;
  readonly path: string;
  readonly answer: (with_: Response | Error) => void;
};

let calls: Array<Call> = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = ((path: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      calls.push({
        method: init?.method ?? 'GET',
        path,
        answer: (with_) =>
          with_ instanceof Error ? reject(with_) : resolve(with_),
      });
    })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The next request with this method that has no answer yet. */
const next = async (method: string): Promise<Call> => {
  const found = calls.find((call) => call.method === method);
  if (found === undefined) {
    await Bun.sleep(1);
    return next(method);
  }
  calls = calls.filter((call) => call !== found);
  return found;
};

const shootWith = (marks: ReadonlyArray<Mark> = []): ShootView =>
  sampleShoot([samplePhoto('a')], marks);

const answerWith = async (method: string, body: unknown) =>
  (await next(method)).answer(Response.json(body));

const wish = {
  photo: 'a',
  kind: 'change',
  note: 'Warmer',
  boxes: [],
  other: null,
} as const;

const loaded = async () => {
  const store = makeShootStore('lisbon');
  const loading = store.reload();
  await answerWith('GET', shootWith());
  await loading;
  return store;
};

describe('a change that keepsake didn’t get', () => {
  it('stays a problem when keepsake answers again', async () => {
    const store = await loaded();
    store.make(wish);
    (await next('PUT')).answer(new Error('offline'));
    await answerWith('GET', shootWith());
    expect(store.get().problem).toBe(unreachable);
  });

  it('keeps what was written for its photo until it is written again', async () => {
    const store = await loaded();
    const box = { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 };
    // Another photo is shown by now, so nothing of the photo holds it.
    store.make({ ...wish, boxes: [box] });
    (await next('PUT')).answer(new Error('offline'));
    await answerWith('GET', shootWith());
    await Bun.sleep(1);
    expect(store.get().unsaved).toEqual({
      a: { note: 'Warmer', boxes: [box] },
    });
    store.forgetUnsaved('a');
    expect(store.get().unsaved).toEqual({});
  });

  it('keeps nothing that keepsake got', async () => {
    const store = await loaded();
    store.make(wish);
    await answerWith('PUT', sampleMark('one', wish));
    await answerWith('GET', shootWith([sampleMark('one', wish)]));
    await Bun.sleep(1);
    expect(store.get().unsaved).toEqual({});
  });
});

describe('a hand-over', () => {
  it('stops when a mark it was to hand over wasn’t saved', async () => {
    const store = await loaded();
    const draft = store.make(wish);
    const handing = store.handOver({
      dollars: 0.5,
      marks: [draft?.id ?? ''],
      album: null,
    });
    (await next('PUT')).answer(new Error('offline'));
    await answerWith('GET', shootWith());
    expect(await handing).toBeNull();
    expect(calls.map(({ method }) => method)).not.toContain('POST');
    expect(store.get().problem).not.toBeNull();
  });
});

describe('undo', () => {
  it('takes back a mark it brought back', async () => {
    const store = await loaded();
    store.make(wish);
    const first = sampleMark('first', wish);
    await answerWith('PUT', first);
    await answerWith('GET', shootWith([first]));
    const takingBack = store.takeBack(first);
    (await next('DELETE')).answer(new Response(null, { status: 204 }));
    await answerWith('GET', shootWith());
    await takingBack;
    // Brings it back, under another id.
    const back = store.undo();
    const again = sampleMark('again', wish);
    await answerWith('PUT', again);
    await answerWith('GET', shootWith([again]));
    await back;
    // Takes back what made it in the first place.
    store.undo().catch(() => undefined);
    expect((await next('DELETE')).path).toEndWith('/marks/again');
  });
});

describe('reading the shoot', () => {
  it('keeps what keepsake said last', async () => {
    const store = await loaded();
    const open = sampleMark('one', {
      ...wish,
      handedOverAt: '2026-05-21T10:00:00Z',
    });
    const answer = {
      outcome: 'done',
      note: 'Warmer',
      at: '2026-05-21T11:00:00Z',
    } as const;
    const slow = store.reload();
    const slowRead = await next('GET');
    const quick = store.reload();
    (await next('GET')).answer(Response.json(shootWith([{ ...open, answer }])));
    await quick;
    slowRead.answer(Response.json(shootWith([open])));
    await slow;
    expect(store.get().index?.shoot.marks[0]?.answer).toEqual(answer);
  });

  it('doesn’t say a read failed that something newer replaced', async () => {
    const store = await loaded();
    const slow = store.reload();
    const slowRead = await next('GET');
    const quick = store.reload();
    await answerWith('GET', shootWith());
    await quick;
    slowRead.answer(new Error('offline'));
    await slow;
    expect(store.get().problem).toBeNull();
  });
});
