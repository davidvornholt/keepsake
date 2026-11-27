import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Mark, ShootView } from '../../contract.ts';
import { unreachable } from './api.ts';
import {
  sampleChoice,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from './sample.ts';
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

const loaded = async (shoot: ShootView = shootWith()) => {
  const store = makeShootStore('lisbon');
  const loading = store.reload();
  await answerWith('GET', shoot);
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
    expect(store.get().unsaved).toEqual({ a: { ...wish, boxes: [box] } });
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

const out = {
  photo: 'a',
  wants: 'out',
  because: 'You didn’t want it in the album.',
  instead: null,
} as const;
const back = { ...out, wants: 'in', because: null } as const;
const takeOut = { wanted: out, back, restores: null };
const heart = { did: 'favorite', photo: 'a', was: false } as const;

/** A shoot that keepsake couldn’t do the choice noted under `action` for. */
const refused = (action: string) =>
  sampleShoot(
    [samplePhoto('a')],
    [],
    [sampleChoice('a', { action, failed: 'Immich refused.' })],
  );

/** The store once the owner made photo a a favorite. */
const hearted = async (shoot: ShootView = shootWith()) => {
  const store = await loaded(shoot);
  const hearting = store.favorite('a', true);
  (await next('PUT')).answer(new Response(null, { status: 204 }));
  await answerWith('GET', shoot);
  await hearting;
  return store;
};

describe('undoing a choice', () => {
  it('offers nothing for a choice keepsake couldn’t do, and keeps what came before', async () => {
    const store = await hearted();
    const choosing = store.choose(takeOut);
    await answerWith('POST', { action: 'one' });
    await answerWith('GET', refused('one'));
    await choosing;
    expect(store.get().undoable).toEqual(heart);
  });

  it('keeps a choice that keepsake did', async () => {
    const store = await loaded();
    const choosing = store.choose(takeOut);
    await answerWith('POST', { action: 'one' });
    await answerWith('GET', shootWith());
    await choosing;
    expect(store.get().undoable).toMatchObject({ did: 'chose', back });
  });
});

describe('undoing a choice that is on its way', () => {
  it('waits for keepsake to say whether it could do it', async () => {
    const store = await hearted();
    const choosing = store.choose(takeOut);
    const sent = await next('POST');
    const undoing = store.undo();
    sent.answer(Response.json({ action: 'one' }));
    await answerWith('GET', refused('one'));
    await choosing;
    await undoing;
    expect(calls).toEqual([]);
    expect(store.get().undoable).toEqual(heart);
  });

  it('waits for all that is sent before taking a choice back', async () => {
    const store = await loaded();
    const hearting = store.favorite('a', true);
    const sentHeart = await next('PUT');
    const choosing = store.choose(takeOut);
    await answerWith('POST', { action: 'one' });
    await choosing;
    const undoing = store.undo();
    sentHeart.answer(new Response(null, { status: 204 }));
    await answerWith('GET', refused('one'));
    await hearting;
    await undoing;
    expect(calls).toEqual([]);
    expect(store.get().undoable).toEqual(heart);
  });

  it('knows a cancelled choice that was still on its way once the cancellation is undone', async () => {
    const working = { ...shootWith(), isChoiceBusy: true };
    const store = await hearted(working);
    const choosing = store.choose(takeOut);
    const shown = store.get().index?.shoot.choices.at(0)?.action ?? null;
    await answerWith('POST', { action: 'one' });
    // The owner cancels it before the page read keepsake again.
    const cancelling = store.choose({
      wanted: back,
      back: out,
      restores: shown,
    });
    await answerWith('POST', { action: 'two' });
    await answerWith('GET', working);
    await choosing;
    await cancelling;
    const undoing = store.undo();
    await answerWith('POST', { action: 'three' });
    await answerWith('GET', {
      ...refused('three'),
      activity: working.activity,
    });
    await undoing;
    expect(store.get().undoable).toEqual(heart);
  });

  it('knows what waited by the action it goes on under once its cancellation is undone', async () => {
    const store = await hearted();
    const choosing = store.choose(takeOut);
    await answerWith('POST', { action: 'one' });
    const waits = sampleChoice('a', { action: 'one' });
    await answerWith('GET', sampleShoot([samplePhoto('a')], [], [waits]));
    await choosing;
    const cancelling = store.choose({
      wanted: back,
      back: out,
      restores: 'one',
    });
    await answerWith('POST', { action: 'two' });
    await answerWith('GET', shootWith());
    await cancelling;
    const undoing = store.undo();
    await answerWith('POST', { action: 'three' });
    await answerWith('GET', refused('three'));
    await undoing;
    expect(store.get().undoable).toEqual(heart);
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
