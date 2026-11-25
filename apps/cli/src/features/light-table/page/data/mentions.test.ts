import { describe, expect, it } from 'bun:test';
import { indexOf } from './derive.ts';
import { partsOf, stemOf } from './mentions.ts';
import { samplePhoto, sampleShoot } from './sample.ts';

const index = indexOf(
  sampleShoot([samplePhoto('day-1/IMG_0012.ARW'), samplePhoto('IMG_0040.jpg')]),
);

describe('partsOf', () => {
  it('finds the photos a sentence names, with or without the ending', () => {
    expect(
      partsOf(index, 'Not as sharp as IMG_0012. See img_0040.jpg too'),
    ).toEqual([
      { kind: 'text', text: 'Not as sharp as ' },
      { kind: 'photo', photo: 'day-1/IMG_0012.ARW', text: 'IMG_0012' },
      { kind: 'text', text: '. See ' },
      { kind: 'photo', photo: 'IMG_0040.jpg', text: 'img_0040.jpg' },
      { kind: 'text', text: ' too' },
    ]);
  });

  it('leaves a sentence without names as it is', () => {
    expect(partsOf(index, 'The light is flat.')).toEqual([
      { kind: 'text', text: 'The light is flat.' },
    ]);
    expect(partsOf(index, '')).toEqual([]);
  });

  it('doesn’t take other words for photos', () => {
    expect(partsOf(index, 'IMG_0013 is better')).toEqual([
      { kind: 'text', text: 'IMG_0013 is better' },
    ]);
  });
});

describe('stemOf', () => {
  it('is the name of the file without folder and ending', () => {
    expect(stemOf('day-1/IMG_0012.ARW')).toBe('IMG_0012');
    expect(stemOf('plain')).toBe('plain');
  });
});
