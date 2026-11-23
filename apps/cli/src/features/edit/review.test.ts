import { describe, expect, it } from 'bun:test';
import { passes } from './review.ts';

const good = {
  version: 1,
  sameMoment: true,
  samePlace: true,
  peopleUnchanged: true,
  textUnchanged: true,
  withoutErrors: true,
  looksLikeAPhoto: true,
  betterThanOriginal: true,
  beauty: 3,
  notes: '',
};

describe('passes', () => {
  it('takes a version without a fault', () => {
    expect(passes(good)).toBe(true);
  });

  it.each([
    'sameMoment',
    'samePlace',
    'peopleUnchanged',
    'textUnchanged',
    'withoutErrors',
    'looksLikeAPhoto',
    'betterThanOriginal',
  ])('refuses one without %s, however beautiful', (fault) => {
    expect(passes({ ...good, beauty: 10, [fault]: false })).toBe(false);
  });
});
