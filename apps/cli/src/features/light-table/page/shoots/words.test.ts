import { describe, expect, it } from 'bun:test';
import type { ShootSummary } from './use-shoots.ts';
import { isBusy, printOf, sentenceOf, waitsOf } from './words.ts';

const shoot = (change: Partial<ShootSummary> = {}): ShootSummary => ({
  name: 'harbor',
  title: 'The harbor',
  about: 'The harbor, May 2026',
  from: '2026-05-01T07:12:04+01:00',
  to: '2026-05-04T19:40:36+01:00',
  photos: 43,
  inAlbum: 8,
  picked: 0,
  preparation: null,
  activity: null,
  isOrdered: false,
  openMarks: 0,
  newAnswers: 0,
  covers: [],
  ...change,
});

const since = '2026-05-05T08:00:00.000Z';
const texts = (change: Partial<ShootSummary>) =>
  waitsOf(shoot(change)).map(({ text }) => text);

describe('what is printed under an album', () => {
  it('says when it was and how much there is', () => {
    expect(printOf(shoot())).toEqual([
      '1 May to 4 May 2026',
      '43 photos',
      '8 in the album',
    ]);
    expect(printOf(shoot({ inAlbum: 0 }))).toHaveLength(2);
    expect(
      printOf(shoot({ photos: 0, from: null, to: null, inAlbum: 0 })),
    ).toEqual([]);
  });

  it('puts it all in one sentence', () => {
    expect(sentenceOf(shoot({ newAnswers: 1 }))).toBe(
      'The harbor, 1 May to 4 May 2026, 43 photos, 8 in the album, 1 new answer',
    );
  });
});

describe('what waits at an album', () => {
  it('is nothing for one that is finished and left alone', () => {
    expect(waitsOf(shoot())).toEqual([]);
    expect(isBusy(shoot())).toBe(false);
  });

  it('says when nobody has chosen anything of it yet', () => {
    expect(texts({ inAlbum: 0 })).toEqual(['Nothing chosen yet']);
    expect(texts({ inAlbum: 0, picked: 4 })).toEqual([
      '4 chosen, ready for your look',
    ]);
    expect(texts({ picked: 1 })).toEqual(['1 chosen, not in the album yet']);
  });

  it('says how far one that is being made ready has got', () => {
    const preparing = shoot({
      preparation: { since, stopped: null },
      activity: { step: 'cull', done: 30, total: 60, photos: [] },
      // Whatever else is known doesn't matter until it is ready.
      openMarks: 2,
    });
    expect(waitsOf(preparing)).toEqual([
      {
        text: 'Preparing, 44%',
        more: 'Looking at every moment, 30 of 60',
        who: 'keepsake',
      },
    ]);
    expect(isBusy(preparing)).toBe(true);
    const starting = { preparation: { since, stopped: null }, inAlbum: 0 };
    expect(waitsOf(shoot({ ...starting, photos: 0 }))).toEqual([
      { text: 'Preparing, 0%', more: 'Starting', who: 'keepsake' },
    ]);
    // Between two steps it is as far as what there is of it says.
    expect(waitsOf(shoot(starting))).toEqual([
      { text: 'Preparing, 8%', more: null, who: 'keepsake' },
    ]);
  });

  it('says why one has stopped, which the owner has to see to', () => {
    const stopped = shoot({
      preparation: { since, stopped: 'The usage limit is reached.' },
    });
    expect(waitsOf(stopped)).toEqual([
      { text: 'Stopped', more: 'The usage limit is reached.', who: 'owner' },
    ]);
    // Nothing goes on there, so the shelf needn't keep asking.
    expect(isBusy(stopped)).toBe(false);
  });

  it('says that there are no photos yet', () => {
    expect(texts({ photos: 0 })).toEqual(['No photos yet']);
  });

  it('says that a choice is ready to be looked at, until it is ordered', () => {
    expect(texts({ inAlbum: 0, picked: 12 })).toEqual([
      '12 chosen, ready for your look',
    ]);
    const ordered = { inAlbum: 0, picked: 12, isOrdered: true };
    expect(texts(ordered)).toEqual(['Being edited']);
    expect(
      texts({
        ...ordered,
        activity: { step: 'edit', done: 3, total: 12, photos: [] },
      }),
    ).toEqual(['Being edited, 3 of 12']);
    expect(isBusy(shoot(ordered))).toBe(true);
  });

  it('lists what an agent does, then answers, then marks', () => {
    const waits = waitsOf(
      shoot({
        activity: { step: 'publish', done: 0, total: 0, photos: [] },
        newAnswers: 2,
        openMarks: 1,
      }),
    );
    expect(waits.map(({ text, who }) => [text, who])).toEqual([
      ['Publishing to Immich', 'agent'],
      ['2 new answers', 'agent'],
      ['1 mark to hand over', 'owner'],
    ]);
  });
});
