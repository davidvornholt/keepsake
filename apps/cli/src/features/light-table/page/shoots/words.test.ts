import { describe, expect, it } from 'bun:test';
import type { ShootSummary } from './use-shoots.ts';
import { printOf, sentenceOf, wantsOf } from './words.ts';

const shoot = (change: Partial<ShootSummary> = {}): ShootSummary => ({
  name: 'harbor',
  about: 'The harbor, May 2026',
  from: '2026-05-01T07:12:04+01:00',
  to: '2026-05-04T19:40:36+01:00',
  photos: 43,
  inAlbum: 8,
  openMarks: 0,
  newAnswers: 0,
  covers: [],
  ...change,
});

describe('what is printed beside a shoot', () => {
  it('says when it was and how much there is', () => {
    expect(printOf(shoot())).toEqual([
      '1 May to 4 May 2026',
      '43 taken',
      '8 in the album',
    ]);
    expect(printOf(shoot({ inAlbum: 0 })).at(-1)).toBe('No album yet');
  });

  it('says what waits there, and nothing when nothing does', () => {
    expect(wantsOf(shoot())).toEqual({ answers: null, marks: null });
    expect(wantsOf(shoot({ openMarks: 1, newAnswers: 2 }))).toEqual({
      answers: '2 answers',
      marks: '1 mark to hand over',
    });
  });

  it('puts it all in one sentence', () => {
    expect(sentenceOf(shoot({ about: null, newAnswers: 1 }))).toBe(
      'harbor, 1 May to 4 May 2026, 43 taken, 8 in the album, 1 answer',
    );
  });
});
