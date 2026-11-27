import { describe, expect, it } from 'bun:test';
import { newsItemsOf } from '../../news-of.ts';
import { actionFor } from '../marks/act.ts';
import {
  draftOf,
  isDraft,
  isHeldBack,
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
import { indexOf } from './derive.ts';
import {
  sampleBehind,
  sampleChoice,
  sampleEdit,
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

const chosen = samplePhoto('a', { standing: { kind: 'picked' } });
const behind = sampleBehind('b', 'a');
const further = sampleBehind('c', 'a');
const because = 'You chose b instead.';
const working = { now, action: 'draft-choice-1', waits: true };
const idle = { now, action: 'draft-choice-1', waits: false };
const swap = { photo: 'b', wants: 'in', because, instead: 'a' } as const;
const putIn = (photo: string) =>
  ({ photo, wants: 'in', because: null, instead: null }) as const;
const takeOut = (photo: string, why: string | null = null) =>
  ({ photo, wants: 'out', because: why, instead: null }) as const;

describe('isHeldBack', () => {
  const finished = samplePhoto('d', {
    standing: { kind: 'left-out', because: null },
    edit: sampleEdit('d'),
  });
  const shoot = sampleShoot([chosen, behind, finished]);
  const free = { isChoiceBusy: false, activity: null };
  const editing = (...photos: ReadonlyArray<string>) => ({
    isChoiceBusy: false,
    activity: { photos },
  });

  it('holds back any choice while a command changes the choice', () => {
    const busy = { isChoiceBusy: true, activity: null };
    expect(isHeldBack(shoot, takeOut('a'), busy)).toBe(true);
    expect(isHeldBack(shoot, swap, busy)).toBe(true);
  });

  it('holds back a finished photo that comes in while it is edited', () => {
    expect(isHeldBack(shoot, putIn('d'), editing('d'))).toBe(true);
    expect(isHeldBack(shoot, putIn('d'), free)).toBe(false);
  });

  it('doesn’t hold back what an edit of other photos leaves alone', () => {
    expect(isHeldBack(shoot, takeOut('a'), editing('a', 'd'))).toBe(false);
    expect(isHeldBack(shoot, putIn('d'), editing('a'))).toBe(false);
    expect(isHeldBack(shoot, swap, editing('b'))).toBe(false);
  });
});

describe('withChoice', () => {
  it('waits when keepsake makes it wait, as one with what it replaces', () => {
    const shoot = sampleShoot([chosen, behind]);
    const { choices, photos } = withChoice(shoot, swap, working);
    expect(choices).toMatchObject([
      { photo: 'b', wants: 'in', because: null, failed: null },
      { photo: 'a', wants: 'out', because, failed: null },
    ]);
    expect(new Set(choices.map(({ action }) => action)).size).toBe(1);
    expect(photos).toEqual(shoot.photos);
  });

  it('takes back what waited, with all that went with it', () => {
    const waits = [
      sampleChoice('b', { action: 'one', wants: 'in', because: null }),
      sampleChoice('a', { action: 'one' }),
    ];
    const shoot = sampleShoot([chosen, behind], [], waits);
    const back = takeOut('b', because);
    expect(withChoice(shoot, back, working).choices).toEqual([]);
    const done = withChoice(shoot, back, idle);
    expect(done.choices).toEqual([]);
    expect(done.photos.map(({ standing }) => standing.kind)).toEqual([
      'picked',
      'taken-out',
    ]);
  });

  it('is done at once otherwise, and forgets the change written for it', () => {
    const open = sampleMark('one', { photo: 'a' });
    const handed = sampleMark('two', { photo: 'a', handedOverAt: now });
    const shoot = sampleShoot([chosen, behind], [open, handed]);
    const done = withChoice(shoot, takeOut('a', 'Too dark.'), idle);
    expect(done.choices).toEqual([]);
    expect(done.photos[0]?.standing).toEqual({
      kind: 'taken-out',
      at: now,
      because: 'Too dark.',
    });
    expect(done.stacks).toEqual(shoot.stacks);
    expect(done.marks).toEqual([handed]);
  });

  it('puts a finished photo into the album there is, and others among the chosen', () => {
    const weak = samplePhoto('d', {
      standing: { kind: 'left-out', because: null },
      edit: sampleEdit('d'),
    });
    const unpublished = sampleShoot([weak]);
    const published = {
      ...unpublished,
      album: { name: 'Lisbon', url: 'https://immich/albums/1', readAt: now },
    };
    expect(
      withChoice(unpublished, putIn('d'), idle).photos[0]?.standing,
    ).toEqual({ kind: 'picked' });
    expect(withChoice(published, putIn('d'), idle).photos[0]?.standing).toEqual(
      {
        kind: 'album',
        url: 'https://immich/albums/1',
        favorite: false,
      },
    );
  });

  it('counts an order as done once none of its photos waits to be put in', () => {
    const waits = samplePhoto('b', { standing: { kind: 'picked' } });
    const ordered = { at: now, dollars: 2, photos: ['a', 'b'] };
    const shoot = { ...sampleShoot([chosen, waits]), ordered };
    const first = withChoice(shoot, takeOut('a'), idle);
    expect(first.ordered).toEqual(ordered);
    expect(withChoice(first, takeOut('b'), idle).ordered).toBeNull();
  });
});

describe('the stacks after a choice', () => {
  it('let the photo that comes instead stand for the stack', () => {
    const reasoned = sampleBehind('c', 'a', {
      standing: { kind: 'similar', to: 'a', because: 'It is sharper.' },
    });
    const shoot = sampleShoot([chosen, behind, reasoned]);
    const done = withChoice(shoot, swap, idle);
    expect(done.stacks).toEqual([
      { front: 'a', photos: ['a'] },
      { front: 'b', photos: ['b', 'c'] },
    ]);
    // What was written about the photo in front before is about it no more.
    expect(done.photos.map(({ standing }) => standing)).toEqual([
      { kind: 'taken-out', at: now, because },
      { kind: 'picked' },
      { kind: 'similar', to: 'b', because: null },
    ]);
  });

  it('lay the photos closer to one put in as well behind it', () => {
    const elsewhere = samplePhoto('x', { standing: { kind: 'picked' } });
    const shoot = sampleShoot([
      chosen,
      behind,
      further,
      elsewhere,
      sampleBehind('y', 'x'),
    ]);
    const done = withChoice(shoot, putIn('b'), idle);
    expect(done.stacks).toEqual([
      { front: 'a', photos: ['a'] },
      { front: 'b', photos: ['b', 'c'] },
      { front: 'x', photos: ['x', 'y'] },
    ]);
    const [, , c] = done.photos;
    expect(c).toMatchObject({
      stack: 'b',
      standing: { kind: 'similar', to: 'b', because: null },
    });
    // So the photo that "Use this one instead" takes out is the one keepsake has in front.
    expect(c && actionFor(indexOf(done), c, 'swap')).toMatchObject({
      wanted: { photo: 'c', instead: 'b' },
    });
  });

  it('let the photo that comes instead stand for the photos of other moments behind the one it replaces', () => {
    const repeats = sampleBehind('d', 'a', { moment: 'd' });
    const shoot = sampleShoot([chosen, behind, repeats]);
    const done = withChoice(shoot, swap, idle);
    expect(done.stacks).toEqual([
      { front: 'a', photos: ['a'] },
      { front: 'b', photos: ['b', 'd'] },
    ]);
    const [, , d] = done.photos;
    expect(d && actionFor(indexOf(done), d, 'swap')).toMatchObject({
      wanted: { photo: 'd', instead: 'b' },
    });
  });

  it('lay the photos behind one taken out behind another chosen one', () => {
    const also = samplePhoto('c', {
      moment: 'a',
      standing: { kind: 'picked' },
    });
    const shoot = sampleShoot([chosen, behind, also]);
    const done = withChoice(shoot, takeOut('a', 'Too dark.'), idle);
    expect(done.stacks).toEqual([
      { front: 'a', photos: ['a'] },
      { front: 'c', photos: ['b', 'c'] },
    ]);
    expect(done.photos[1]).toMatchObject({
      stack: 'c',
      standing: { kind: 'similar', to: 'c', because: null },
    });
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
        newsItemsOf(shoot.marks, shoot.added, shoot.carrying).flatMap((item) =>
          item.photo === photo ? [item.key] : [],
        ),
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
