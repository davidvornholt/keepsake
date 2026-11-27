import { describe, expect, it } from 'bun:test';
import type { CarryingOut, Mark } from './contract.ts';
import { decisionOf, newsItemsOf, newsOf } from './news-of.ts';

const at = '2026-05-02T10:00:00.000Z';
const later = '2026-05-02T11:00:00.000Z';

const answered = (id: string, photo: string, when: string) =>
  ({
    id,
    photo,
    answer: { outcome: 'done', note: 'Done.', at: when },
    seenAt: null,
  }) as unknown as Mark;

const stop = (
  photos: ReadonlyArray<string>,
  seenAt: string | null = null,
): CarryingOut => ({
  since: null,
  stopped: {
    id: 'stop1',
    at,
    reason: 'It stopped.',
    needs: 'retry',
    photos,
    seenAt,
  },
});

const idle: CarryingOut = { since: null, stopped: null };

describe('what is new', () => {
  it('names each thing by what it is now', () => {
    const items = newsItemsOf(
      [answered('m1', 'a', later)],
      [{ photo: 'b', at, seenAt: null }],
      stop(['a']),
    );
    expect(items.map(({ key }) => key)).toEqual([
      'stop:stop1',
      'added:b:2026-05-02T10:00:00.000Z',
      'answer:m1:2026-05-02T11:00:00.000Z',
    ]);
    expect(newsOf([answered('m1', 'a', later)], [], stop(['a']))).toEqual([
      { photo: 'a', at },
    ]);
  });

  it('counts what the album as a whole waits for until the owner answers it', () => {
    expect(decisionOf(idle)).toBeNull();
    expect(decisionOf(stop(['a']))).toBeNull();
    expect(decisionOf(stop([]))).toEqual({
      photo: null,
      at,
      key: 'stop:stop1',
    });
    // Once its photo was looked at, it waits for the owner all the same.
    expect(decisionOf(stop(['a'], later))).toMatchObject({ photo: null });
    expect(newsOf([], [], stop([]))).toEqual([]);
    expect(newsItemsOf([], [], stop([]))).toHaveLength(1);
  });
});
