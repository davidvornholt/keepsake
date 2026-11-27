import { describe, expect, it } from 'bun:test';
import { keysAbout, newsItemsOf } from '../../news-of.ts';
import {
  draftOf,
  isDraft,
  replacedBy,
  tidyLabels,
  wantedOf,
  withChoice,
  withLabels,
  withMark,
  withoutMark,
  withRating,
  withSaved,
  withSeen,
} from './changes.ts';
import {
  sampleChoice,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from './sample.ts';

const now = '2026-05-22T08:00:00.000Z';
const later = '2026-05-22T09:00:00.000Z';

describe('draftOf', () => {
  it('is the mark as keepsake will save it', () => {
    const draft = draftOf(
      { photo: 'a', note: '  Less sky. ', boxes: [] },
      'draft-1',
      now,
    );
    expect(isDraft(draft.id)).toBe(true);
    expect(draft.note).toBe('Less sky.');
    expect(draft.madeAt).toBe(now);
    expect(draft.handedOverAt).toBeNull();
    expect(wantedOf(draft)).toEqual({
      photo: 'a',
      note: 'Less sky.',
      boxes: [],
    });
  });
});

describe('withChoice', () => {
  const chosen = samplePhoto('a', { standing: { kind: 'picked' } });
  const behind = samplePhoto('b', {
    standing: { kind: 'similar', to: 'a', because: null },
  });
  const because = 'You chose b instead.';

  it('waits until keepsake has done it, as one with what it replaces', () => {
    const shoot = sampleShoot([chosen, behind]);
    const wanted = { photo: 'b', wants: 'in', because, instead: 'a' } as const;
    const { choices } = withChoice(shoot, wanted, now);
    expect(choices).toMatchObject([
      { photo: 'b', wants: 'in', because: null, failed: null },
      { photo: 'a', wants: 'out', because, failed: null },
    ]);
    expect(new Set(choices.map(({ action }) => action)).size).toBe(1);
  });

  it('takes back what waited, with all that went with it', () => {
    const waits = [
      sampleChoice('b', { action: 'one', wants: 'in', because: null }),
      sampleChoice('a', { action: 'one' }),
    ];
    const shoot = sampleShoot([chosen, behind], [], waits);
    const back = { photo: 'b', wants: 'out', because, instead: null } as const;
    expect(withChoice(shoot, back, now).choices).toEqual([]);
  });
});

describe('withMark', () => {
  it('takes the place of the open mark on the same photo', () => {
    const keep = sampleMark('one', { photo: 'a' });
    const other = sampleMark('two', { photo: 'b' });
    const again = sampleMark('three', { photo: 'a', note: 'Less sky.' });
    expect(replacedBy([keep, other], again)).toBe(keep);
    expect(withMark([keep, other], again)).toEqual([other, again]);
  });

  it('leaves a mark that was handed over', () => {
    const handed = sampleMark('two', { photo: 'a', handedOverAt: now });
    const again = sampleMark('three', { photo: 'a' });
    expect(replacedBy([handed], again)).toBeNull();
    expect(withMark([handed], again)).toEqual([handed, again]);
  });

  it('counts an answer on the photo as seen', () => {
    const answered = sampleMark('one', {
      photo: 'a',
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

  it('notes as seen only what was shown of a photo', () => {
    const answer = { at: now, outcome: 'done' as const, note: 'Done.' };
    const stopped = {
      id: 'stop1',
      at: now,
      reason: 'It stopped.',
      needs: 'retry' as const,
      photos: ['a'],
      seenAt: null,
    };
    const shoot = {
      ...sampleShoot(
        [samplePhoto('a'), samplePhoto('b')],
        [
          sampleMark('one', { photo: 'a', answer }),
          sampleMark('two', { photo: 'b', answer }),
        ],
      ),
      added: [
        { photo: 'a', at: now, seenAt: null },
        { photo: 'b', at: now, seenAt: null },
      ],
      carrying: { since: null, stopped },
    };
    const keysOf = (photo: string) =>
      new Set(
        keysAbout(newsItemsOf(shoot.marks, shoot.added, shoot.carrying), photo),
      );
    const seen = withSeen(shoot, keysOf('a'), later);
    expect(seen.marks.map(({ seenAt }) => seenAt)).toEqual([later, null]);
    expect(seen.added.map(({ seenAt }) => seenAt)).toEqual([later, null]);
    expect(seen.carrying.stopped?.seenAt).toBe(later);
    expect(withSeen(shoot, keysOf('b'), later).carrying).toBe(shoot.carrying);
    // What came after the page showed the photo stays new.
    const answeredAgain = {
      ...shoot,
      marks: shoot.marks.map((mark) =>
        mark.id === 'one'
          ? { ...mark, answer: { ...answer, at: later } }
          : mark,
      ),
      added: [{ photo: 'a', at: later, seenAt: null }],
    };
    const late = withSeen(answeredAgain, keysOf('a'), later);
    expect(late.marks.map(({ seenAt }) => seenAt)).toEqual([null, null]);
    expect(late.added.map(({ seenAt }) => seenAt)).toEqual([null]);
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
