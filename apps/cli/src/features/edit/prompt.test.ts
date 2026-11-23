import { describe, expect, it } from 'bun:test';
import type { Photo, Pick } from '../../shared/domain.ts';
import { editPrompt } from './prompt.ts';

const photo: Photo = {
  id: 'A',
  file: 'A.ARW',
  takenAt: '2026-05-01T10:00:00.000',
  camera: 'ILCE-7M4',
  lens: null,
  focalLength: null,
  orientation: 1,
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
const shoot = { name: 'lisbon', source: '/photos', about: 'Lisbon' };

describe('editPrompt', () => {
  it('says what the photo shows and where it is from', () => {
    expect(editPrompt(shoot, photo, pick, null)).toStartWith(
      'This is a personal photograph from Lisbon, taken with a ILCE-7M4. A heron stands in shallow water. Make it',
    );
  });

  it('says nothing it doesn’t know', () => {
    expect(
      editPrompt(
        { ...shoot, about: null },
        { ...photo, camera: null },
        pick,
        null,
      ),
    ).toStartWith('This is a personal photograph. A heron');
  });

  it('ends with what was wrong with an earlier attempt', () => {
    expect(editPrompt(shoot, photo, pick, 'Two heads')).toEndWith(
      'Avoid them: Two heads.',
    );
  });
});
