import { describe, expect, it } from 'bun:test';
import { sampleEdit, samplePhoto } from '../data/sample.ts';
import { photoByPicture, targetsOf } from './arrival.ts';

const rect = { x: 10, y: 20, w: 30, h: 20 };

describe('where the photos of the start go', () => {
  const photos = [
    samplePhoto('a', { edit: sampleEdit('a') }),
    samplePhoto('b'),
  ];

  it('knows a photo by its camera picture and by its finished one', () => {
    const known = photoByPicture(photos);
    expect(known.get(photos[0]?.picture.src ?? '')).toBe(photos[0]?.id ?? '');
    expect(known.get(photos[0]?.edit?.picture.src ?? '')).toBe(
      photos[0]?.id ?? '',
    );
    expect(known.get(photos[1]?.picture.src ?? '')).toBe(photos[1]?.id ?? '');
  });

  it('sends each picture to where its photo lies, and leaves out the rest', () => {
    const flying = [
      { src: photos[0]?.edit?.picture.src ?? '', url: '', rect },
      { src: photos[1]?.picture.src ?? '', url: '', rect },
      { src: '/pictures/unknown', url: '', rect },
    ];
    const targets = targetsOf(flying, photos, (photo) =>
      photo === photos[0]?.id ? rect : null,
    );
    expect([...targets.keys()]).toEqual([flying[0]?.src ?? '']);
    expect(targets.get(flying[0]?.src ?? '')).toEqual(rect);
  });
});
