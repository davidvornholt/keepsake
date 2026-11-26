import { describe, expect, it } from 'bun:test';
import { Writable } from 'node:stream';
import { Effect } from 'effect';
import { emitTo } from './output.ts';

describe('emitTo', () => {
  it('is done only once a slow reader took the output', async () => {
    const waiting: Array<() => void> = [];
    const slow = new Writable({
      write: (_chunk, _encoding, done) => {
        waiting.push(done);
      },
    });
    let isDone = false;
    const emitting = Effect.runPromise(emitTo(slow, { shoot: 'lisbon' })).then(
      () => {
        isDone = true;
      },
    );
    await Bun.sleep(10);
    expect(isDone).toBe(false);
    for (const done of waiting) {
      done();
    }
    await emitting;
    expect(isDone).toBe(true);
  });
});
