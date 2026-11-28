import { describe, expect, it } from 'bun:test';
import { wholePicture } from '../../../shared/boxes.ts';
import { correctionPrompt } from './correction-prompt.ts';

const shoot = {
  name: 'lisbon',
  source: '/photos',
  title: 'Lisbon',
  about: 'Lisbon',
};
const box = { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 };

describe('correctionPrompt', () => {
  it('names only what has to change, and what went wrong before', () => {
    const prompt = correctionPrompt(
      shoot,
      'A heron stands in water',
      [
        {
          place: { what: ['Remove the hose'], isRemoval: true, box },
          problem: 'Half of it was left',
        },
        {
          place: {
            what: ['Make the boat red', 'Close it'],
            isRemoval: false,
            box,
          },
          problem: null,
        },
      ],
      wholePicture,
    );
    expect(prompt).toContain('from Lisbon. A heron stands in water. Change');
    expect(prompt).toContain(
      '- Remove the hose. An earlier attempt failed: Half of it was left.',
    );
    expect(prompt).toContain('- Make the boat red. Close it.\n');
    expect(prompt).toContain('What is removed goes with its shadow');
    expect(prompt).toContain('Keep everything else exactly as it is');
  });

  it('says nothing about removing where nothing is removed', () => {
    const place = { what: ['Make the boat red'], isRemoval: false, box };
    expect(
      correctionPrompt(
        shoot,
        'A boat',
        [{ place, problem: null }],
        wholePicture,
      ),
    ).not.toContain('What is removed');
  });

  it('has the grey filled where the picture shows more than the photo', () => {
    const place = { what: ['Make the boat red'], isRemoval: false, box };
    const shown = { left: 0, top: -0.5, right: 1, bottom: 1.5 };
    expect(
      correctionPrompt(shoot, 'A boat', [{ place, problem: null }], shown),
    ).toContain('The plain grey area at the top and bottom edges');
  });
});
