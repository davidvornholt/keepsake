import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Mark, ShootView } from '../../contract.ts';
import { unreachable } from './api.ts';
import { samplePhoto, sampleShoot } from './sample.ts';
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
    const draft = store.make(wish);
    (await next('PUT')).answer(new Error('offline'));
    await answerWith('GET', shootWith());
    expect(await store.isSaved(draft?.id ?? '')).toBe(false);
    expect(store.get().problem).toBe(unreachable);
  });
});
