import { describe, expect, it } from 'bun:test';
import { whileShown } from './while-shown.ts';

const later = 5;

describe('whileShown', () => {
  it('leaves alone the owner who left before keepsake answered', async () => {
    let isShown = true;
    const done: Array<string> = [];
    const sending = Bun.sleep(later).then(() => 'lisbon');
    const passing = whileShown(sending, () => isShown, {
      onDone: (shoot) => done.push(shoot),
      onFailed: () => done.push('failed'),
    });
    isShown = false;
    await passing;
    expect(done).toEqual([]);
  });

  it('passes on what came of it while the form is shown', async () => {
    const done: Array<string> = [];
    await whileShown(Promise.reject(new Error('busy')), () => true, {
      onDone: () => done.push('done'),
      onFailed: (error) => done.push((error as Error).message),
    });
    expect(done).toEqual(['busy']);
  });
});
