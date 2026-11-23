// biome-ignore-all lint/style/useNamingConvention: exiftool's names for the tags
import { describe, expect, it } from 'bun:test';
import { cameraTime, foundPhotos } from './exif.ts';
import { nameFor } from './scan.ts';

describe('cameraTime', () => {
  it.each([
    ['2026:03:30 18:04:05.12+08:00', '2026-03-30T18:04:05.120'],
    ['2026:03:30 18:04:05', '2026-03-30T18:04:05.000'],
    ['2026:03:30 18:04:05.1234', '2026-03-30T18:04:05.123'],
  ])('reads %s', (text, time) => {
    expect(cameraTime(text)).toBe(time);
  });

  it.each(['', '0000:00:00', 'yesterday'])('refuses %j', (text) => {
    expect(cameraTime(text)).toBeUndefined();
  });
});

const exif = (overrides: object = {}) => ({
  SourceFile: '/photos/A.ARW',
  FileModifyDate: '2026:03:30 18:00:00+08:00',
  ...overrides,
});

describe('foundPhotos', () => {
  it('takes the RAW file of a photo the camera saved twice', () => {
    const photos = foundPhotos([
      { file: 'day 1/A.JPG', exif: exif() },
      { file: 'day 1/A.ARW', exif: exif({ JpgFromRawLength: 5 }) },
    ]);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      id: 'day 1/A',
      file: 'day 1/A.ARW',
      raw: true,
      cameraJpeg: true,
    });
  });

  it('sorts by the time, to the fraction of a second', () => {
    const photos = foundPhotos([
      {
        file: 'B.ARW',
        exif: exif({ SubSecDateTimeOriginal: '2026:03:30 18:00:00.9' }),
      },
      {
        file: 'A.ARW',
        exif: exif({ SubSecDateTimeOriginal: '2026:03:30 18:00:00.95' }),
      },
    ]);
    expect(photos.map(({ id }) => id)).toEqual(['B', 'A']);
  });

  it('reads what a camera leaves out as unknown', () => {
    expect(
      foundPhotos([{ file: 'A.jpg', exif: exif({ LensModel: ' ' }) }])[0],
    ).toEqual({
      id: 'A',
      file: 'A.jpg',
      takenAt: '2026-03-30T18:00:00.000',
      camera: null,
      lens: null,
      focalLength: null,
      orientation: 1,
      raw: false,
      cameraJpeg: false,
    });
  });
});

describe('nameFor', () => {
  it.each([
    ['2026-05-01 Lissabon & Café', '2026-05-01-lissabon-cafe'],
    ['Übergröße', 'uebergroesse'],
  ])('turns %s into %s', (folder, name) => {
    expect(nameFor(folder)).toBe(name);
  });
});
