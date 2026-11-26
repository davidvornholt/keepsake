import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  editLisbon,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools, firstAlbum } from './fake-tools.ts';
import { send, whileServing } from './light-table-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

/** Long enough for a command to get to where it waits. */
const pause = 100;

/**
 * Holds up the next answer of Immich about the album, which the page asks for
 * once it is open, and runs `meanwhile` until it is let through.
 */
const whileReading = <A>(meanwhile: (address: string) => Promise<A>) => {
  const asked = Promise.withResolvers<void>();
  const answered = Promise.withResolvers<void>();
  fakeTools.late = ({ command, args }) => {
    if (command !== 'photos' || args.slice(0, 2).join(' ') !== 'albums show') {
      return;
    }
    fakeTools.late = undefined;
    asked.resolve();
    return answered.promise;
  };
  return whileServing(async (address) => {
    const events = new AbortController();
    await fetch(`${address}/api/shoots/lisbon/events`, {
      signal: events.signal,
    });
    await asked.promise;
    const done = meanwhile(address);
    await Bun.sleep(pause);
    answered.resolve();
    const result = await done;
    // Time for the page's own reading of the album to end as well.
    await Bun.sleep(pause);
    events.abort();
    return result;
  });
};

const publishB = async () => {
  await pickLisbon();
  await editLisbon('B');
  await runOk('publish', 'lisbon', 'B');
};

describe('the page reading the album again', () => {
  it('keeps why a photo was taken out meanwhile', async () => {
    await publishB();
    await whileReading(() =>
      runOk('take-out', 'lisbon', 'B', '--because', 'Too dark'),
    );
    expect(await shootJson('removed.json')).toMatchObject([
      { photo: 'B', because: 'Too dark' },
    ]);
  });

  it('keeps a favorite marked meanwhile', async () => {
    await publishB();
    await whileReading((address) =>
      send('PUT', `${address}/api/shoots/lisbon/favorites`, {
        photo: 'B',
        favorite: true,
      }),
    );
    expect((await shootJson('album.json')).photos).toMatchObject([
      { photo: 'B', favorite: true },
    ]);
  });
});

describe('keepsake publish, while the page marks a favorite', () => {
  it('gives the new upload the favorite marked meanwhile', async () => {
    await publishB();
    await Bun.write(shootFile('edits', 'B', 'B-keepsake.jpg'), 'another B');
    const uploading = Promise.withResolvers<void>();
    const go = Promise.withResolvers<void>();
    fakeTools.pause = ({ command, args }) => {
      if (command !== 'photos' || args[0] !== 'upload') {
        return;
      }
      fakeTools.pause = undefined;
      uploading.resolve();
      return go.promise;
    };
    const publishing = runOk('publish', 'lisbon', 'B');
    await uploading.promise;
    const marked = await whileServing((address) =>
      send('PUT', `${address}/api/shoots/lisbon/favorites`, {
        photo: 'B',
        favorite: true,
      }),
    );
    expect(marked.ok).toBe(true);
    go.resolve();
    await publishing;
    const [{ asset }] = (await shootJson('publication.json')).photos;
    const now = firstAlbum()?.find(({ id }) => id === asset);
    expect(now).toMatchObject({ favorite: true });
  });
});
