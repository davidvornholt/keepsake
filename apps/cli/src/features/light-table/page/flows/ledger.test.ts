import { describe, expect, it } from 'bun:test';
import type { Agent, ShootView } from '../../contract.ts';
import { indexOf } from '../data/derive.ts';
import {
  sampleBehind,
  sampleEdit,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from '../data/sample.ts';
import {
  agentPatience,
  agentStateOf,
  handedOverSince,
  ledgerOf,
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
  sampleMark('1', { photo: 'd', kind: 'put-in' }),
  sampleMark('2', { photo: 'c', kind: 'swap', other: 'b' }),
  sampleMark('3', { photo: 'a', kind: 'change', note: 'Lighter' }),
  sampleMark('5', { photo: 'b', kind: 'take-out', ...handedOver }),
  sampleMark('6', {
    photo: 'a',
    kind: 'change',
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
    expect(ledger.news).toBe(1);
  });

  it('counts what costs money and how many photos are chosen afterwards', () => {
    // The change, and the swap of a photo that has no edit yet; the photo
    // that is put in was edited before.
    expect(ledger.open.map(({ costs }) => costs)).toEqual([true, true, false]);
    expect(ledger.ordersAlbum).toBe(false);
    expect(ledger.edits).toBe(2);
    expect(ledger.dollars).toBeCloseTo(1.5);
    expect(ledger.chosen).toBe(2);
    expect(ledger.chosenAfter).toBe(3);
    expect(ledger.limit).toBe(170);
  });

  it('costs an edit for a wish that comes in with a photo edited before', () => {
    const wished = marks.map((mark) =>
      mark.id === '1' ? { ...mark, note: 'Warmer' } : mark,
    );
    const wishedFor = ledgerOf(indexOf(sampleShoot(photos, wished)));
    expect(wishedFor.open.map(({ costs }) => costs)).toEqual([
      true,
      true,
      true,
    ]);
    expect(wishedFor.edits).toBe(3);
  });

  it('counts a wish for a photo without an edit as part of its first edit', () => {
    const wished = marks.map((mark) =>
      mark.id === '2' ? { ...mark, note: 'Warmer' } : mark,
    );
    expect(ledgerOf(indexOf(sampleShoot(photos, wished))).edits).toBe(2);
  });

  it('keeps marks with the open ones while they are shown going', () => {
    const held = ledgerOf(indexOf(sampleShoot(photos, marks)), new Set(['5']));
    expect(held.open.map(({ mark }) => mark.id)).toEqual(['3', '5', '2', '1']);
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

  it('counts what the marks add and spare', () => {
    const ledger = ledgerOf(
      indexOf(
        sampleShoot(chosen, [
          // A wish is part of the first edit of its photo.
          sampleMark('1', { photo: 'a', kind: 'change', note: 'Warmer' }),
          // One edit for another: the photo in front isn't edited.
          sampleMark('2', { photo: 'c', kind: 'swap', other: 'b' }),
          sampleMark('3', { photo: 'd', kind: 'take-out' }),
          sampleMark('4', { photo: 'e', kind: 'put-in' }),
        ]),
      ),
    );
    expect(ledger.open.map(({ costs }) => costs)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    // Three chosen, two more to edit, two spared.
    expect(ledger.edits).toBe(3);
    expect(ledger.chosenAfter).toBe(3);
  });

  it('costs nothing for what is edited already', () => {
    const edited = chosen.map((photo) =>
      photo.id === 'e' ? photo : { ...photo, edit: sampleEdit(photo.id) },
    );
    const ledger = ledgerOf(
      indexOf(
        sampleShoot(edited, [
          // A wish for a photo that is edited already is one more edit.
          sampleMark('1', { photo: 'a', kind: 'change', note: 'Warmer' }),
          sampleMark('2', { photo: 'd', kind: 'take-out' }),
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

  it('counts each photo that comes in for the same one', () => {
    const ledger = ledgerOf(
      indexOf(
        sampleShoot(
          [
            samplePhoto('a', picked),
            sampleBehind('b', 'a'),
            sampleBehind('c', 'a'),
          ],
          [
            sampleMark('1', { photo: 'b', kind: 'swap', other: 'a' }),
            sampleMark('2', { photo: 'c', kind: 'swap', other: 'a' }),
          ],
        ),
      ),
    );
    // A is spared once, and both B and C are edited instead.
    expect(ledger.edits).toBe(2);
    expect(ledger.firstEdits).toBe(0);
  });

  it('isn’t ordered a second time', () => {
    const shoot: ShootView = {
      ...sampleShoot(chosen),
      ordered: { at, dollars: 2.25 },
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

describe('agentStateOf', () => {
  const then = Date.parse(at);
  const soon = then + 1000;
  const withAgent = (agent: Partial<Agent>): ShootView => ({
    ...sampleShoot(photos),
    agent: { waitsSince: null, canStart: true, started: null, ...agent },
  });
  const started = (change: Partial<NonNullable<Agent['started']>>) => ({
    at: '2026-05-21T10:00:02.000Z',
    link: null,
    failed: null,
    ...change,
  });

  it('is idle while nothing is handed over', () => {
    expect(agentStateOf(withAgent({}), null, soon)).toEqual({ is: 'idle' });
  });

  it('says an agent is at work once one was started for it', () => {
    const link = 'https://app.example.com/threads/one';
    expect(
      agentStateOf(withAgent({ started: started({ link }) }), at, soon),
    ).toEqual({ is: 'at-work', link });
    expect(
      agentStateOf(withAgent({ waitsSince: at, canStart: false }), at, soon),
    ).toEqual({ is: 'at-work', link: null });
  });

  it('waits a while for an agent it asked for, and then says so', () => {
    expect(agentStateOf(withAgent({}), at, soon)).toEqual({ is: 'starting' });
    expect(agentStateOf(withAgent({}), at, then + agentPatience + 1)).toEqual({
      is: 'ask',
      failed: null,
      isLate: true,
    });
  });

  it('doesn’t take an agent started for an earlier hand-over for this one', () => {
    const earlier = started({ at: '2026-05-20T09:00:00.000Z' });
    expect(agentStateOf(withAgent({ started: earlier }), at, soon)).toEqual({
      is: 'starting',
    });
  });

  it('asks the owner when none can be started, or starting failed', () => {
    expect(agentStateOf(withAgent({ canStart: false }), at, soon)).toEqual({
      is: 'ask',
      failed: null,
      isLate: false,
    });
    expect(
      agentStateOf(
        withAgent({ started: started({ failed: 'not signed in' }) }),
        at,
        soon,
      ),
    ).toEqual({ is: 'ask', failed: 'not signed in', isLate: false });
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
        { ...index.shoot, ordered: { at: later, dollars: 3 } },
        waiting,
      ),
    ).toBe(later);
  });
});
