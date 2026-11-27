import { describe, expect, it } from 'bun:test';
import { answerFor } from './mark-answers.ts';

const asked = {
  changed: true,
  wish: 'Remove the chair',
  review: null,
  keptBecause: null,
  notDone: [],
};

describe('the answer to a mark', () => {
  it('says what changed, as the change of single places says it', () => {
    expect(
      answerFor({
        ...asked,
        review: 'Changed: Remove the chair. Not done: The sign stays.',
        notDone: ['The sign stays.'],
      }),
    ).toEqual({
      changed: true,
      note: 'Changed: Remove the chair. Not done: The sign stays.',
    });
  });

  it('says the wish for an edit anew, and what wasn’t done', () => {
    expect(
      answerFor({
        ...asked,
        review: 'The second version is cleaner.',
        notDone: ['The man on the left is on a face'],
      }),
    ).toEqual({
      changed: true,
      note: 'Changed: Remove the chair. Not done: The man on the left is on a face.',
    });
  });

  it('says why nothing changed', () => {
    expect(
      answerFor({ ...asked, changed: false, notDone: ['It is too small.'] }),
    ).toEqual({ changed: false, note: 'It is too small.' });
    expect(answerFor({ ...asked, changed: false })).toEqual({
      changed: false,
      note: 'No version of the change passed the review, so the photo stays as it was.',
    });
  });

  it('isn’t done when the camera’s own picture was kept', () => {
    expect(
      answerFor({ ...asked, keptBecause: 'Every version melted the bird' }),
    ).toEqual({ changed: false, note: 'Every version melted the bird.' });
  });
});
