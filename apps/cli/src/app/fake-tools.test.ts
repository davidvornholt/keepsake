import { beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { uploadPhoto } from '../shared/immich.ts';
import { fakeToolsLayer, resetTools } from './fake-tools.ts';

const upload = (file: string) =>
  Effect.runPromise(
    uploadPhoto(file, null).pipe(Effect.provide(fakeToolsLayer)),
  );

describe('the fake photos command', () => {
  beforeEach(resetTools);

  it('tells files apart by their bytes, also where they are not text', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'keepsake-fake-'));
    try {
      await writeFile(join(folder, 'a.jpg'), new Uint8Array([0xff]));
      await writeFile(join(folder, 'b.jpg'), new Uint8Array([0xfe]));
      await writeFile(join(folder, 'c.jpg'), new Uint8Array([0xff]));
      const a = await upload(join(folder, 'a.jpg'));
      const b = await upload(join(folder, 'b.jpg'));
      expect(b).not.toBe(a);
      expect(await upload(join(folder, 'c.jpg'))).toBe(a);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
