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

  it.each([
    [1, { ImageSize: '7040 4688', FullImageSize: '7008 4672' }, [7008, 4672]],
    [8, { ImageSize: '7040 4688', FullImageSize: '7008 4672' }, [4672, 7008]],
    [3, { ImageSize: '6000x4000' }, [6000, 4000]],
  ])('reads how large it is when turned as %j', (orientation, sizes, size) => {
    const [photo] = foundPhotos([
      { file: 'A.ARW', exif: exif({ Orientation: orientation, ...sizes }) },
    ]);
    expect([photo?.width, photo?.height]).toEqual([...size]);
  });

  it('reads how it was exposed, and by which clock', () => {
    const [photo] = foundPhotos([
      {
        file: 'A.ARW',
        exif: exif({
          OffsetTimeOriginal: '+02:00',
          FNumber: 6.3,
          ExposureTime: 0.0005,
          ISO: 800,
        }),
      },
    ]);
    expect(photo).toMatchObject({
      utcOffset: '+02:00',
      aperture: 6.3,
      exposure: 0.0005,
      iso: 800,
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
      utcOffset: null,
      camera: null,
      lens: null,
      focalLength: null,
      aperture: null,
      exposure: null,
      iso: null,
      orientation: 1,
      width: 0,
      height: 0,
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
