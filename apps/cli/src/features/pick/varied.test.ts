import { describe, expect, it } from 'bun:test';
import type { Pick } from '../../shared/domain.ts';
import { variedBest } from './varied.ts';

const valued = (
  photo: string,
  subject: Pick['subject'],
  value: number,
  time = `1${photo.charCodeAt(0) % 10}:00`,
) => ({
  pick: { photo, moment: photo, score: 7, subject, description: '' },
  value,
  takenAt: `2026-05-01T${time}:00.000`,
});
const names = (picks: ReadonlyArray<Pick>) => picks.map(({ photo }) => photo);

describe('variedBest', () => {
  it('takes the most valuable photos', () => {
    const photos = [
      valued('A', 'bird', 5),
      valued('B', 'plant', 6),
      valued('C', 'person', 7),
    ];
    expect(names(variedBest(photos, 2))).toEqual(['C', 'B']);
    expect(names(variedBest(photos, 9))).toEqual(['C', 'B', 'A']);
  });

  it('prefers another kind to more of the same', () => {
    const photos = [
      valued('A', 'bird', 8),
      valued('B', 'animal', 7.9),
      valued('C', 'architecture', 7.1),
    ];
    expect(names(variedBest(photos, 2))).toEqual(['A', 'C']);
  });

  it('still takes more of the same when it is clearly better', () => {
    const photos = [
      valued('A', 'bird', 8),
      valued('B', 'bird', 7.9),
      valued('C', 'architecture', 5),
    ];
    expect(names(variedBest(photos, 2))).toEqual(['A', 'B']);
  });

  it('prefers another scene to more of the same', () => {
    const photos = [
      valued('A', 'bird', 8, '10:00'),
      valued('B', 'bird', 7.9, '10:04'),
      valued('C', 'bird', 7.8, '10:06'),
    ];
    expect(names(variedBest(photos, 2))).toEqual(['A', 'C']);
  });
});
