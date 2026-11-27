import { describe, expect, it } from 'bun:test';
import type { Mark } from '../../contract.ts';
import { indexOf } from '../data/derive.ts';
import { sampleMark, samplePhoto, sampleShoot } from '../data/sample.ts';
import { newsShownOf, wordOf } from './word.ts';

const photo = samplePhoto('a');
const handedAt = '2026-05-21T10:00:00.000Z';
const calm = { isWorkedOn: false, isComposing: false };

const wordFor = (marks: ReadonlyArray<Mark>, how = calm) =>
  wordOf(indexOf(sampleShoot([photo], marks)), photo, how);

const handed = sampleMark('handed', {
  photo: 'a',
  note: 'Less sky.',
  handedOverAt: handedAt,
});
const answered: Mark = {
  ...handed,
  id: 'answered',
  answer: { at: handedAt, outcome: 'done', note: 'The sky is lower now.' },
};
const mine = sampleMark('mine', {
  photo: 'a',
  note: 'Warmer.',
});

describe('wordOf', () => {
  it('says nothing over a photo without words', () => {
    expect(wordFor([])).toBeNull();
    expect(wordFor([sampleMark('keep', { photo: 'a' })])).toBeNull();
  });

  it('puts an answer that wasn’t looked at before everything else', () => {
    const word = wordFor([answered, mine], { ...calm, isWorkedOn: true });
    expect(word).toEqual({ kind: 'answer', mark: answered });
  });

  it('says what waits for the owner at the photo, with what going on costs', () => {
    const stopped = {
      id: 'stop1',
      at: handedAt,
      reason: 'What you agreed to pay is used up.',
      needs: 'money' as const,
      photos: ['a'],
      seenAt: null,
    };
    const word = wordOf(indexOf(sampleShoot([photo], [handed])), photo, {
      ...calm,
      carrying: { since: null, stopped },
    });
    expect(word).toMatchObject({
      kind: 'stopped',
      carrying: { is: 'stopped', stopped, more: 1.13 },
    });
  });

  it('says that an order put the photo in, until it is looked at', () => {
    const shoot = sampleShoot([photo]);
    const added = { photo: 'a', at: handedAt, seenAt: null };
    expect(wordOf(indexOf({ ...shoot, added: [added] }), photo, calm)).toEqual({
      kind: 'added',
      at: handedAt,
    });
    const seen = { ...added, seenAt: handedAt };
    expect(
      wordOf(indexOf({ ...shoot, added: [seen] }), photo, calm),
    ).toBeNull();
  });

  it('says that keepsake is at work, then that a mark waits for it', () => {
    expect(wordFor([handed], { ...calm, isWorkedOn: true })).toEqual({
      kind: 'working',
    });
    expect(wordFor([handed])).toEqual({ kind: 'waiting', mark: handed });
  });

  it('shows the owner’s own words, except while they are written', () => {
    expect(wordFor([mine])).toEqual({ kind: 'mine', mark: mine });
    expect(wordFor([mine], { ...calm, isComposing: true })).toBeNull();
  });

  it('leaves an answer that was looked at alone', () => {
    expect(wordFor([{ ...answered, seenAt: handedAt }])).toBeNull();
  });
});

describe('newsShownOf', () => {
  it('names only what the photo shows as new, one thing at a time', () => {
    const earlier: Mark = {
      ...answered,
      id: 'earlier',
      answer: {
        at: '2026-05-21T09:00:00.000Z',
        outcome: 'done',
        note: 'Done.',
      },
    };
    const shoot = {
      ...sampleShoot([photo], [earlier, answered]),
      added: [{ photo: 'a', at: handedAt, seenAt: null }],
    };
    const idle = { since: null, stopped: null };
    expect(newsShownOf(indexOf(shoot), 'a', idle)).toEqual([
      `answer:answered:${handedAt}`,
    ]);
    const without = { ...shoot, marks: [] };
    expect(newsShownOf(indexOf(without), 'a', idle)).toEqual([
      `added:a:${handedAt}`,
    ]);
    expect(newsShownOf(indexOf(without), 'gone', idle)).toEqual([]);
  });
});
