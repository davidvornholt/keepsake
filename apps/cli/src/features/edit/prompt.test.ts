import { describe, expect, it } from 'bun:test';
import { wholePicture } from '../../shared/boxes.ts';
import type { Photo, Pick } from '../../shared/domain.ts';
import { editPrompt } from './prompt.ts';

const photo: Photo = {
  id: 'A',
  file: 'A.ARW',
  takenAt: '2026-05-01T10:00:00.000',
  utcOffset: null,
  camera: 'ILCE-7M4',
  lens: null,
  focalLength: null,
  aperture: null,
  exposure: null,
  iso: null,
  orientation: 1,
  width: 6000,
  height: 4000,
  raw: true,
  cameraJpeg: true,
  hash: '',
};
const pick: Pick = {
  photo: 'A',
  moment: 'A',
  score: 8,
  subject: 'bird',
  description: 'A heron stands in shallow water',
};
const shoot = {
  name: 'lisbon',
  source: '/photos',
  title: 'Lisbon',
  about: 'Lisbon',
};
const wanted = {
  shoot,
  photo,
  pick,
  crop: wholePicture,
  removed: [],
  wish: null,
  problems: null,
};

describe('editPrompt', () => {
  it('says what the photo shows and where it is from', () => {
    expect(editPrompt(wanted)).toStartWith(
      'This is a personal photograph from Lisbon, taken with a ILCE-7M4. A heron stands in shallow water. Make it',
    );
  });

  it('says nothing it doesn’t know', () => {
    expect(
      editPrompt({
        ...wanted,
        shoot: { ...shoot, about: null },
        photo: { ...photo, camera: null },
      }),
    ).toStartWith('This is a personal photograph. A heron');
  });

  it('ends with what was wrong with an earlier attempt', () => {
    expect(editPrompt({ ...wanted, problems: 'Two heads' })).toEndWith(
      'Avoid them: Two heads.',
    );
  });

  it('asks to continue the scene only where the crop goes beyond the photo', () => {
    expect(editPrompt(wanted)).not.toContain('grey');
    expect(
      editPrompt({ ...wanted, crop: { ...wholePicture, right: 1.1 } }),
    ).toContain('The plain grey area at the right edge is not part');
  });
});
