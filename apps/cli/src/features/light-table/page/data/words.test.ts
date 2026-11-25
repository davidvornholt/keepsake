import { describe, expect, it } from 'bun:test';
import { indexOf } from './derive.ts';
import {
  sampleBehind,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from './sample.ts';
import {
  chosenName,
  chosenWords,
  exposureLine,
  standingName,
  standingOf,
  stateOf,
} from './words.ts';

const index = indexOf(
  sampleShoot([
    samplePhoto('a'),
    sampleBehind('b', 'a', {
      standing: { kind: 'similar', to: 'a', because: 'The bird looks away.' },
    }),
    samplePhoto('c', { standing: { kind: 'picked' } }),
    sampleBehind('d', 'c'),
    samplePhoto('e', { standing: { kind: 'left-out', because: 'Blurred.' } }),
    sampleBehind('f', 'e'),
    samplePhoto('g', {
      standing: {
        kind: 'taken-out',
        at: '2026-05-21T12:00:00',
        because: 'Too dark.',
      },
    }),
    samplePhoto('h', { standing: { kind: 'open' } }),
  ]),
);

const said = (id: string) =>
  standingOf(index, index.byId.get(id) ?? samplePhoto(id));

describe('standingOf', () => {
  it('says where a chosen photo stands', () => {
    expect(said('a')).toEqual({
      text: 'In the album',
      other: null,
      because: null,
      tone: 'in',
    });
    expect(said('c').text).toBe('Chosen for the album');
    expect(said('h')).toMatchObject({ text: 'Not decided yet', tone: 'open' });
  });

  it('says why a photo was left out, in the words written down', () => {
    expect(said('e')).toEqual({
      text: 'Left out: not strong enough',
      other: null,
      because: 'Blurred.',
      tone: 'out',
    });
  });

  it('says which photo one lies behind, and where that one stands', () => {
    expect(said('b')).toEqual({
      text: 'Behind the photo in the album',
      other: 'a',
      because: 'The bird looks away.',
      tone: 'out',
    });
    expect(said('d').text).toBe('Behind the photo chosen for the album');
    expect(said('f').text).toBe('Behind a photo that was left out too');
    expect(said('f').because).toBeNull();
  });

  it('says when a photo was taken out, and in whose words why', () => {
    expect(said('g').text).toBe('Taken out by you 21 May');
    expect(said('g').because).toBe('Too dark.');
  });

  it('has a word or two for where room is short', () => {
    expect(
      ['a', 'b', 'c', 'e', 'g', 'h'].map((id) =>
        standingName(index.byId.get(id) ?? samplePhoto(id)),
      ),
    ).toEqual([
      'In the album',
      'Behind',
      'Chosen',
      'Left out',
      'Taken out',
      'Not decided',
    ]);
  });
});

describe('chosenWords', () => {
  it('counts the album and what is chosen for it', () => {
    expect(chosenWords(index, { inAlbum: 1, picked: 1 })).toEqual([
      '1 in the album',
      '1 chosen',
    ]);
    expect(chosenWords(index, { inAlbum: 1, picked: 0 })).toEqual([
      '1 in the album',
    ]);
    expect(chosenName(index)).toBe('Album');
  });

  it('speaks of a choice only, while there is no album', () => {
    const fresh = indexOf(
      sampleShoot([samplePhoto('a', { standing: { kind: 'picked' } })]),
    );
    expect(chosenWords(fresh, { inAlbum: 0, picked: 0 })).toEqual(['0 chosen']);
    expect(chosenName(fresh)).toBe('Chosen');
    const open = indexOf(
      sampleShoot([samplePhoto('a', { standing: { kind: 'open' } })]),
    );
    expect(chosenWords(open, { inAlbum: 0, picked: 0 })).toEqual([]);
  });
});

describe('exposureLine', () => {
  it('lists what the camera wrote down, and leaves out what it didn’t', () => {
    expect(
      exposureLine(
        samplePhoto('a', {
          focalLength: 600,
          aperture: 6.3,
          exposure: 0.001,
          iso: 800,
        }),
      ),
    ).toEqual(['600 mm', 'f/6.3', '1/1000 s', 'ISO 800']);
    expect(exposureLine(samplePhoto('a'))).toEqual([]);
  });
});

describe('stateOf', () => {
  it('says how far a mark has got', () => {
    expect(stateOf(sampleMark('1'))).toBe('Not handed over yet');
    expect(
      stateOf(sampleMark('1', { handedOverAt: '2026-05-21T14:07:00' })),
    ).toBe('Handed over 21 May, 14:07');
    expect(
      stateOf(
        sampleMark('1', {
          handedOverAt: '2026-05-21T14:07:00',
          answer: { outcome: 'not-done', note: '', at: '2026-05-21T15:30:00' },
        }),
      ),
    ).toBe('Not done 21 May, 15:30');
  });
});
