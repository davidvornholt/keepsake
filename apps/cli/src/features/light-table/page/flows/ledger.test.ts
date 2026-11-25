import { describe, expect, it } from 'bun:test';
import { indexOf } from '../data/derive.ts';
import {
  sampleEdit,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from '../data/sample.ts';
import { ledgerOf, staggerOf } from './ledger.ts';

const handedOver = { handedOverAt: '2026-05-21T10:00:00.000Z' };
const leftOut = {
  kind: 'left-out',
  rule: 'score',
  repeats: null,
  because: null,
} as const;

const photos = [
  samplePhoto('a', { edit: sampleEdit('a') }),
  samplePhoto('b', { edit: sampleEdit('b') }),
  samplePhoto('c', { standing: leftOut }),
  samplePhoto('d', { standing: leftOut, edit: sampleEdit('d') }),
  samplePhoto('e', { standing: { kind: 'picked' } }),
];

const marks = [
  sampleMark('1', { photo: 'd', kind: 'put-in' }),
  sampleMark('2', { photo: 'c', kind: 'swap', other: 'b' }),
  sampleMark('3', { photo: 'a', kind: 'change', note: 'Lighter' }),
  sampleMark('4', { photo: 'b', kind: 'keep' }),
  sampleMark('5', { photo: 'b', kind: 'take-out', ...handedOver }),
  sampleMark('6', {
    photo: 'a',
    kind: 'favorite',
    ...handedOver,
    answer: { outcome: 'done', note: '', at: '2026-05-21T11:00:00.000Z' },
  }),
  sampleMark('7', { photo: 'gone', kind: 'take-out' }),
];

describe('ledgerOf', () => {
  const ledger = ledgerOf(indexOf(sampleShoot(photos, marks)));

  it('lists what an agent is to do in the order of the shoot', () => {
    expect(ledger.open.map(({ mark }) => mark.id)).toEqual(['3', '2', '1']);
    expect(ledger.waiting.map(({ mark }) => mark.id)).toEqual(['5']);
    expect(ledger.open[1]?.other?.id).toBe('b');
    expect(ledger.opinions).toBe(1);
    expect(ledger.news).toBe(1);
  });

  it('counts what costs money and how many photos are chosen afterwards', () => {
    // The change, and the swap of a photo that has no edit yet.
    expect(ledger.open.map(({ costs }) => costs)).toEqual([true, true, false]);
    expect(ledger.edits).toBe(2);
    expect(ledger.dollars).toBeCloseTo(1.5);
    expect(ledger.chosen).toBe(3);
    expect(ledger.chosenAfter).toBe(4);
    expect(ledger.limit).toBe(170);
  });

  it('keeps marks with the open ones while they are shown going', () => {
    const held = ledgerOf(indexOf(sampleShoot(photos, marks)), new Set(['5']));
    expect(held.open.map(({ mark }) => mark.id)).toEqual(['3', '5', '2', '1']);
    expect(held.waiting).toEqual([]);
  });
});

describe('staggerOf', () => {
  it('spreads the marks over a time, and never slower than a pace', () => {
    expect(staggerOf(1, 900, 70)).toBe(0);
    expect(staggerOf(4, 900, 70)).toBe(70);
    expect(staggerOf(91, 900, 70)).toBe(10);
  });
});
