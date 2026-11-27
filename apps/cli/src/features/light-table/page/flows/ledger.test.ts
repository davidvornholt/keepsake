import { describe, expect, it } from 'bun:test';
import type { ShootView } from '../../contract.ts';
import { indexOf } from '../data/derive.ts';
import {
  sampleBehind,
  sampleEdit,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from '../data/sample.ts';
import {
  carryingStateOf,
  handedOverSince,
  ledgerOf,
  limitOf,
  staggerOf,
} from './ledger.ts';

const at = '2026-05-21T10:00:00.000Z';
const handedOver = { handedOverAt: at };
const leftOut = { kind: 'left-out', because: null } as const;

const photos = [
  samplePhoto('a', { edit: sampleEdit('a') }),
  samplePhoto('b', { edit: sampleEdit('b') }),
  sampleBehind('c', 'b'),
  samplePhoto('d', { standing: leftOut, edit: sampleEdit('d') }),
  samplePhoto('e', { standing: leftOut }),
];

const marks = [
  sampleMark('3', { photo: 'a', note: 'Lighter' }),
  sampleMark('4', { photo: 'b', note: 'Warmer' }),
  sampleMark('5', { photo: 'b', note: 'Straighter', ...handedOver }),
  sampleMark('6', {
    photo: 'a',
    note: 'Less sky',
    ...handedOver,
    answer: { outcome: 'done', note: '', at: '2026-05-21T11:00:00.000Z' },
  }),
  sampleMark('7', { photo: 'gone', note: 'Gone' }),
];

describe('ledgerOf', () => {
  const ledger = ledgerOf(indexOf(sampleShoot(photos, marks)));

  it('lists what keepsake is to do in the order of the shoot', () => {
    expect(ledger.open.map(({ mark }) => mark.id)).toEqual(['3', '4']);
    expect(ledger.waiting.map(({ mark }) => mark.id)).toEqual(['5']);
    expect(ledger.news).toBe(1);
  });

  it('leaves out what is about a photo that went out of the album', () => {
    const ofOut = [
      sampleMark('8', { photo: 'd', note: 'Warmer' }),
      sampleMark('9', { photo: 'd', note: 'Lighter', ...handedOver }),
    ];
    const out = ledgerOf(indexOf(sampleShoot(photos, [...marks, ...ofOut])));
    expect(out.open.map(({ mark }) => mark.id)).toEqual(['3', '4']);
    expect(out.waiting.map(({ mark }) => mark.id)).toEqual(['5']);
  });

  it('counts what costs money', () => {
    expect(ledger.open.map(({ costs }) => costs)).toEqual([true, true]);
    expect(ledger.ordersAlbum).toBe(false);
    expect(ledger.edits).toBe(2);
    expect(ledger.dollars).toBeCloseTo(1.5);
  });

  it('keeps marks with the open ones while they are shown going', () => {
    const held = ledgerOf(indexOf(sampleShoot(photos, marks)), new Set(['5']));
    expect(held.open.map(({ mark }) => mark.id)).toEqual(['3', '4', '5']);
    expect(held.waiting).toEqual([]);
  });
});

describe('an album that is ordered', () => {
  const picked = { standing: { kind: 'picked' } } as const;
  const chosen = [
    samplePhoto('a', picked),
    samplePhoto('b', picked),
    sampleBehind('c', 'b'),
    samplePhoto('d', picked),
    samplePhoto('e', { standing: leftOut }),
  ];

  it('costs an edit for every chosen photo', () => {
    const ledger = ledgerOf(indexOf(sampleShoot(chosen)));
    expect(ledger.ordersAlbum).toBe(true);
    expect(ledger.edits).toBe(3);
    expect(ledger.dollars).toBeCloseTo(2.25);
  });

  it('counts a wish as part of the first edit of its photo', () => {
    const ledger = ledgerOf(
      indexOf(
        sampleShoot(chosen, [sampleMark('1', { photo: 'a', note: 'Warmer' })]),
      ),
    );
    expect(ledger.open.map(({ costs }) => costs)).toEqual([false]);
    expect(ledger.edits).toBe(3);
  });

  it('costs nothing for what is edited already', () => {
    const edited = chosen.map((photo) =>
      photo.id === 'e' ? photo : { ...photo, edit: sampleEdit(photo.id) },
    );
    const ledger = ledgerOf(
      indexOf(
        sampleShoot(edited, [
          // A wish for a photo that is edited already is one more edit.
          sampleMark('1', { photo: 'a', note: 'Warmer' }),
        ]),
      ),
    );
    expect(ledger.ordersAlbum).toBe(true);
    expect(ledger.isFirst).toBe(true);
    expect(ledger.firstEdits).toBe(0);
    expect(ledger.edits).toBe(1);
  });

  it('says so when the album is there and some chosen photos aren’t in it', () => {
    const ledger = ledgerOf(
      indexOf(
        sampleShoot([samplePhoto('z', { edit: sampleEdit('z') }), ...chosen]),
      ),
    );
    expect(ledger.ordersAlbum).toBe(true);
    expect(ledger.isFirst).toBe(false);
    expect(ledger.picked).toBe(3);
    expect(ledger.firstEdits).toBe(3);
  });

  it('is offered for a photo put in after the album was made', () => {
    // z is in the album; e was left out, and the owner put it in.
    const album = samplePhoto('z', { edit: sampleEdit('z') });
    const putIn = samplePhoto('e', picked);
    const ledger = ledgerOf(indexOf(sampleShoot([album, putIn])));
    expect(ledger.ordersAlbum).toBe(true);
    expect(ledger.isFirst).toBe(false);
    expect(ledger.picked).toBe(1);
    expect(ledger.edits).toBe(1);
  });

  it('keeps a wish for a first edit back until the photo is ordered', () => {
    const wish = sampleMark('1', { photo: 'd', note: 'Warmer' });
    const orderOf = (inOrder: ReadonlyArray<string>): ShootView => ({
      ...sampleShoot(chosen, [wish]),
      ordered: { at, dollars: 2.25, photos: inOrder },
    });
    expect(ledgerOf(indexOf(orderOf(['a']))).open).toEqual([]);
    const ordered = ledgerOf(indexOf(orderOf(['a', 'd'])));
    expect(ordered.open.map(({ mark }) => mark.id)).toEqual(['1']);
    expect(ordered.edits).toBe(0);
  });

  it('isn’t ordered a second time', () => {
    const shoot: ShootView = {
      ...sampleShoot(chosen),
      ordered: { at, dollars: 2.25, photos: [] },
    };
    const ledger = ledgerOf(indexOf(shoot));
    expect(ledger.ordersAlbum).toBe(false);
    expect(ledger.edits).toBe(0);
  });
});

describe('staggerOf', () => {
  it('spreads the marks over a time, and never slower than a pace', () => {
    expect(staggerOf(1, 900, 70)).toBe(0);
    expect(staggerOf(4, 900, 70)).toBe(70);
    expect(staggerOf(91, 900, 70)).toBe(10);
  });
});

describe('carryingStateOf', () => {
  const shoot = sampleShoot(photos);
  const stop = (needs: 'money' | 'retry', stopped: ReadonlyArray<string>) => ({
    at,
    reason: 'It stopped.',
    needs,
    photos: stopped,
    seenAt: null,
  });

  it('is idle while nothing is handed over', () => {
    const resting = { since: null, stopped: null };
    expect(carryingStateOf(shoot, resting, null)).toEqual({ is: 'idle' });
  });

  it('is at work while keepsake carries it out, or is about to', () => {
    expect(carryingStateOf(shoot, { since: at, stopped: null }, null)).toEqual({
      is: 'at-work',
    });
    expect(carryingStateOf(shoot, { since: null, stopped: null }, at)).toEqual({
      is: 'at-work',
    });
  });

  it('says what it waits for, and what going on agrees to pay more', () => {
    const forMoney = stop('money', ['a', 'b']);
    expect(
      carryingStateOf(shoot, { since: null, stopped: forMoney }, at),
    ).toEqual({ is: 'stopped', stopped: forMoney, more: limitOf(shoot, 2) });
    const once = stop('retry', ['a']);
    expect(carryingStateOf(shoot, { since: null, stopped: once }, at)).toEqual({
      is: 'stopped',
      stopped: once,
      more: 0,
    });
  });
});

describe('limitOf', () => {
  it('leaves room beyond the estimate, and at least the hold of the last edit', () => {
    const shoot = sampleShoot(photos);
    // Nine edits at $0.75 come to $6.75; half as much again is $10.13.
    expect(limitOf(shoot, 9)).toBe(10.13);
    expect(limitOf(shoot, 0)).toBe(0);
    const held = { ...shoot, dollars: { ...shoot.dollars, hold: 3 } };
    expect(limitOf(held, 1)).toBe(3);
  });

  it('is what handing over agrees to pay', () => {
    const ledger = ledgerOf(indexOf(sampleShoot(photos, marks)));
    expect(ledger.dollars).toBe(1.5);
    expect(ledger.limit).toBe(2.25);
  });
});

describe('handedOverSince', () => {
  it('is when the last of what waits was handed over', () => {
    const index = indexOf(sampleShoot(photos, marks));
    const { waiting } = ledgerOf(index);
    expect(handedOverSince(index.shoot, waiting)).toBe(at);
    expect(handedOverSince(index.shoot, [])).toBeNull();
    const later = '2026-05-22T08:00:00.000Z';
    expect(
      handedOverSince(
        { ...index.shoot, ordered: { at: later, dollars: 3, photos: [] } },
        waiting,
      ),
    ).toBe(later);
  });
});
