import { describe, expect, it } from 'bun:test';
import type { Mark } from '../../contract.ts';
import { indexOf } from '../data/derive.ts';
import { sampleMark, samplePhoto, sampleShoot } from '../data/sample.ts';
import { wordOf } from './word.ts';

const photo = samplePhoto('a');
const handedAt = '2026-05-21T10:00:00.000Z';
const calm = { isWorkedOn: false, isComposing: false };

const wordFor = (marks: ReadonlyArray<Mark>, how = calm) =>
  wordOf(indexOf(sampleShoot([photo], marks)), photo, how);

const handed = sampleMark('handed', {
  photo: 'a',
  kind: 'change',
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
  kind: 'change',
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

  it('says that an agent is at work, then that a mark waits for one', () => {
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
