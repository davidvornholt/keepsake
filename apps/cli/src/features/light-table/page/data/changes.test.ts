import { describe, expect, it } from 'bun:test';
import {
  draftOf,
  isDraft,
  replacedBy,
  tidyLabels,
  wantedOf,
  withLabels,
  withMark,
  withoutMark,
  withRating,
  withSaved,
  withSeen,
} from './changes.ts';
import { sampleMark, samplePhoto, sampleShoot } from './sample.ts';

const now = '2026-05-22T08:00:00.000Z';

describe('draftOf', () => {
  it('is the mark as keepsake will save it', () => {
    const draft = draftOf(
      {
        photo: 'a',
        kind: 'change',
        note: '  Less sky. ',
        boxes: [],
        other: null,
      },
      'draft-1',
      now,
    );
    expect(isDraft(draft.id)).toBe(true);
    expect(draft.note).toBe('Less sky.');
    expect(draft.madeAt).toBe(now);
    expect(draft.handedOverAt).toBeNull();
    expect(wantedOf(draft)).toEqual({
      photo: 'a',
      kind: 'change',
      note: 'Less sky.',
      boxes: [],
      other: null,
    });
  });
});

describe('withMark', () => {
  it('takes the place of the open mark on the same photo', () => {
    const keep = sampleMark('one', { photo: 'a' });
    const other = sampleMark('two', { photo: 'b' });
    const takeOut = sampleMark('three', { photo: 'a', kind: 'take-out' });
    expect(replacedBy([keep, other], takeOut)).toBe(keep);
    expect(withMark([keep, other], takeOut)).toEqual([other, takeOut]);
  });

  it('leaves a favorite beside a mark, and a mark that was handed over', () => {
    const favorite = sampleMark('one', { photo: 'a', kind: 'favorite' });
    const handed = sampleMark('two', {
      photo: 'a',
      kind: 'change',
      handedOverAt: now,
    });
    const keep = sampleMark('three', { photo: 'a' });
    expect(replacedBy([favorite, handed], keep)).toBeNull();
    expect(withMark([favorite, handed], keep)).toEqual([
      favorite,
      handed,
      keep,
    ]);
    const not = sampleMark('four', { photo: 'a', kind: 'not-favorite' });
    expect(withMark([favorite, keep], not)).toEqual([keep, not]);
  });

  it('counts an answer on the photo as seen', () => {
    const answered = sampleMark('one', {
      photo: 'a',
      kind: 'change',
      handedOverAt: now,
      answer: { at: now, outcome: 'done', note: 'Done.' },
    });
    const elsewhere = { ...answered, id: 'two', photo: 'b' };
    const keep = sampleMark('three', { photo: 'a', madeAt: now });
    const [first, second] = withMark([answered, elsewhere], keep);
    expect(first?.seenAt).toBe(now);
    expect(second?.seenAt).toBeNull();
  });
});

describe('what keepsake answers', () => {
  it('puts the saved mark in the place of its draft', () => {
    const draft = sampleMark('draft-1', { photo: 'a' });
    const saved = sampleMark('real', { photo: 'a' });
    const other = sampleMark('other');
    expect(withSaved([other, draft], 'draft-1', saved)).toEqual([other, saved]);
    expect(withoutMark([other, draft], 'draft-1')).toEqual([other]);
  });

  it('notes that an answer was seen', () => {
    const [seen, unseen] = withSeen(
      [sampleMark('one'), sampleMark('two')],
      'one',
      now,
    );
    expect(seen?.seenAt).toBe(now);
    expect(unseen?.seenAt).toBeNull();
  });
});

describe('labels', () => {
  it('are trimmed, kept once each, and never empty', () => {
    expect(tidyLabels([' print ', 'print', '', 'for   the wall', ' '])).toEqual(
      ['print', 'for the wall'],
    );
  });

  it('change on one photo only', () => {
    const shoot = sampleShoot([samplePhoto('a'), samplePhoto('b')]);
    const labelled = withLabels(shoot, 'b', ['print']);
    expect(labelled.photos.map(({ labels }) => labels)).toEqual([
      [],
      ['print'],
    ]);
  });
});

describe('withRating', () => {
  const rated = { moment: 'a', best: 'a', stars: 4, further: [] };

  it('replaces what was said about the moment before', () => {
    const shoot = {
      ...sampleShoot([samplePhoto('a')]),
      rating: {
        questions: [],
        ratings: [
          { moment: 'a', best: null, stars: 0, further: [] },
          { moment: 'b', best: 'b', stars: 2, further: [] },
        ],
      },
    };
    expect(withRating(shoot, rated).rating?.ratings).toEqual([
      { moment: 'b', best: 'b', stars: 2, further: [] },
      rated,
    ]);
  });

  it('leaves a shoot alone that has nothing to rate', () => {
    const shoot = sampleShoot([samplePhoto('a')]);
    expect(withRating(shoot, rated)).toBe(shoot);
  });
});
