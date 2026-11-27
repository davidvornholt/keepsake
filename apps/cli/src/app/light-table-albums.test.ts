import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Layer } from 'effect';
import { makeShoot } from '../features/light-table/new-shoot.ts';
import {
  editLisbon,
  failureOf,
  fake,
  photosFolder,
  pickLisbon,
  scanLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import {
  eventually,
  handOver,
  pickedOf,
  send,
  shootOf,
  statusOf,
  whileServing,
} from './light-table-fixtures.ts';
import { whileHeld } from './lock-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

/** Puts a photo into the folder the page may use, taken on a day of May 2026. */
const putPhoto = async (path: string, day: number) => {
  const file = join(photosFolder(), path);
  const at = new Date(Date.UTC(2026, 4, day));
  await Bun.write(file, 'a photo');
  await utimes(file, at, at);
};

const serving = <A>(visit: (address: string) => Promise<A>) =>
  whileServing(visit, { photos: [photosFolder()] });

const foldersOf = async (address: string) =>
  (await fetch(`${address}/api/folders`)).json();

const lookAt = (address: string, path: string) =>
  fetch(`${address}/api/folders/look?path=${encodeURIComponent(path)}`);

const may = (day: number) => `2026-05-0${day}T00:00:00.000Z`;

describe('the folders of photos', () => {
  it('are listed with what is in them, newest first', async () => {
    await putPhoto('2026/lisbon/A.ARW', 2);
    await putPhoto('2026/lisbon/A.JPG', 2);
    await putPhoto('2026/lisbon/more/B.arw', 4);
    await putPhoto('2025/porto.jpg', 1);
    await putPhoto('2026/.trash/C.ARW', 9);
    await putPhoto('2026/notes.txt', 9);
    expect(await serving(foldersOf)).toEqual({
      canAdd: true,
      folders: [
        ['2026', [], 2, 2, 4],
        ['lisbon', ['2026'], 2, 2, 4],
        ['more', ['2026', 'lisbon'], 1, 4, 4],
        ['2025', [], 1, 1, 1],
      ].map(([name, within, photos, from, to]) => ({
        path: join(photosFolder(), ...(within as Array<string>), String(name)),
        name,
        within,
        photos,
        from: may(Number(from)),
        to: may(Number(to)),
        shoot: null,
      })),
    });
  });

  it('say which have an album', async () => {
    await scanLisbon();
    await putPhoto('A1.ARW', 1);
    const { folders } = await whileServing(foldersOf, { photos: [fake.home] });
    expect(folders).toContainEqual(
      expect.objectContaining({ path: photosFolder(), shoot: 'lisbon' }),
    );
  });

  it('can’t be chosen when none were named', async () => {
    expect(await whileServing(foldersOf)).toEqual({
      canAdd: false,
      folders: [],
    });
  });

  it('can be looked into', async () => {
    await putPhoto('lisbon/A.ARW', 1);
    await putPhoto('lisbon/B.ARW', 1);
    const folder = join(photosFolder(), 'lisbon');
    const look = await serving(async (address) =>
      (await lookAt(address, folder)).json(),
    );
    const sample = {
      src: `data:image/jpeg;base64,${btoa('a picture')}`,
      width: 7008,
      height: 4672,
    };
    expect(look).toEqual({
      path: folder,
      photos: 2,
      from: '2026-03-30T10:00:00.000',
      to: '2026-03-30T10:00:01.000',
      samples: [
        { ...sample, takenAt: '2026-03-30T10:00:00.000' },
        { ...sample, takenAt: '2026-03-30T10:00:01.000' },
      ],
    });
  });

  it.each(['', '/', '..'])('are the only ones: %p', async (path) => {
    await putPhoto('lisbon/A.ARW', 1);
    const status = await serving((address) =>
      statusOf(lookAt(address, join(photosFolder(), 'lisbon', path, '..'))),
    );
    expect(status).toBe(400);
  });
});

const wanted = () => ({
  folder: join(photosFolder(), 'lisbon'),
  title: ' Lisbon ',
  about: ' Lisbon, May 2026 ',
  timeZone: 'Europe/Lisbon',
  maximum: 40,
});

const make = (address: string, changes: object = {}) =>
  send('POST', `${address}/api/shoots`, { ...wanted(), ...changes });

const shoot = 'lisbon';

const newShootOf = async (address: string) =>
  (await fetch(`${address}/api/shoots/${shoot}`)).json();

type Prepared = {
  readonly preparation: { readonly stopped: string | null } | null;
};

const ready = (address: string) =>
  eventually<Prepared>(
    () => newShootOf(address),
    ({ preparation }) => preparation === null,
  );

const stopped = (address: string) =>
  eventually<Prepared>(
    () => newShootOf(address),
    ({ preparation }) => preparation?.stopped !== null,
  );

const runsOfKeepsake = () =>
  fakeTools.runs.filter(({ command }) => command === 'keepsake');

const atLimit = () => {
  fakeTools.programs = {
    keepsake: () => {
      throw new Error(
        [
          JSON.stringify({ step: 'cull', done: 3, total: 9 }),
          JSON.stringify({
            error: { tag: 'ModelFailed', message: 'You’ve hit your limit.' },
          }),
        ].join('\n'),
      );
    },
  };
};

describe('a new album', () => {
  beforeEach(() => putPhoto('lisbon/A.ARW', 1));

  it('is got ready without any edit', async () => {
    const [answer, view] = await serving(async (address) => [
      await (await make(address)).json(),
      await ready(address),
    ]);
    expect(answer).toEqual({ name: shoot });
    expect(view).toMatchObject({
      name: shoot,
      title: 'Lisbon',
      about: 'Lisbon, May 2026',
      photos: [],
      stacks: [],
      preparation: null,
    });
    expect(runsOfKeepsake().map(({ args }) => args)).toEqual([
      [
        'run',
        wanted().folder,
        '--unedited',
        '--name',
        shoot,
        '--title',
        'Lisbon',
        '--about',
        'Lisbon, May 2026',
        '--time-zone',
        'Europe/Lisbon',
        '--maximum',
        '40',
      ],
    ]);
  });

  it('takes the camera’s time and all good photos unless told otherwise', async () => {
    await serving(async (address) => {
      await make(address, { timeZone: null, maximum: null });
      return ready(address);
    });
    const [run] = runsOfKeepsake();
    expect(run?.args.at(-1)).toBe('Lisbon, May 2026');
  });

  it('gets a name of its own', async () => {
    const names = await serving(async (address) => {
      const first = await (await make(address)).json();
      const second = await (await make(address)).json();
      return [first.name, second.name];
    });
    expect(names).toEqual([shoot, `${shoot}-2`]);
  });

  it('says what stopped it, and goes on when asked to', async () => {
    atLimit();
    const [before, list, after] = await serving(async (address) => {
      await make(address);
      const first = await stopped(address);
      const { shoots } = await (await fetch(`${address}/api/shoots`)).json();
      fakeTools.programs = {};
      await send('POST', `${address}/api/shoots/${shoot}/prepare`);
      return [first, shoots, await ready(address)];
    });
    const why = { stopped: 'You’ve hit your limit.' };
    expect(before).toMatchObject({ preparation: why });
    expect(list).toMatchObject([
      { name: shoot, photos: 0, from: null, to: null, preparation: why },
    ]);
    expect(after).toMatchObject({ preparation: null });
    const [first, second] = runsOfKeepsake();
    expect(second?.args).toEqual(first?.args ?? []);
  });

  it('goes on by itself after the page was stopped', async () => {
    atLimit();
    await serving(async (address) => {
      await make(address);
      return stopped(address);
    });
    const file = join(shootFile(), '..', shoot, 'preparation.json');
    const noted = await Bun.file(file).json();
    const gone = 2 ** 30;
    fakeTools.programs = {};
    await Bun.write(
      file,
      JSON.stringify({ ...noted, process: gone, stopped: null }),
    );
    expect(await serving(ready)).toMatchObject({ preparation: null });
    expect(runsOfKeepsake()).toHaveLength(2);
  });

  it.each([
    { folder: '/etc' },
    { title: '  ' },
    { about: '  ' },
    { maximum: 0 },
    { timeZone: 'Europe/Nowhere' },
    { maximum: 'many' },
  ])('is refused where it makes no sense: %p', async (changes) => {
    const [status, list] = await serving(async (address) => [
      await statusOf(make(address, changes)),
      await (await fetch(`${address}/api/shoots`)).json(),
    ]);
    expect(status).toBe(400);
    expect(list).toEqual({ shoots: [] });
  });

  it('can be thrown away while nothing was made from it', async () => {
    const [status, after] = await serving(async (address) => {
      await make(address);
      await ready(address);
      const path = `${address}/api/shoots/${shoot}`;
      return [
        await statusOf(send('DELETE', path)),
        await statusOf(fetch(path)),
      ];
    });
    expect([status, after]).toEqual([204, 404]);
    expect(existsSync(join(wanted().folder, 'A.ARW'))).toBe(true);
  });
});

describe('a new album beside a command on a shoot of its name', () => {
  beforeEach(() => putPhoto('lisbon/A.ARW', 1));

  it('takes another name than a command that works on a shoot of its name', async () => {
    const name = await whileHeld(
      () => serving(async (address) => (await make(address)).json()),
      shoot,
    );
    expect(name).toEqual({ name: `${shoot}-2` });
  });

  it('keeps a scan of its name from it until it is made', async () => {
    const folder = join(shootFile(), '..', shoot);
    const written = Promise.withResolvers<void>();
    const going = Promise.withResolvers<void>();
    // Waits once what the shoot has is noted, before the shoot is one.
    const waiting = Layer.effect(
      FileSystem.FileSystem,
      Effect.map(FileSystem.FileSystem, (fs) => ({
        ...fs,
        rename: (from: string, to: string) =>
          to === join(folder, 'moments.json')
            ? Effect.andThen(
                fs.rename(from, to),
                Effect.promise(() => {
                  written.resolve();
                  return going.promise;
                }),
              )
            : fs.rename(from, to),
      })),
    );
    const making = Effect.runPromise(
      makeShoot({ ...wanted(), about: 'Lisbon, May 2026' }).pipe(
        Effect.provide(waiting),
        Effect.provide(BunServices.layer),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromDotEnvContents(
              `HOME=${fake.home}\nXDG_DATA_HOME=${join(fake.home, 'data')}`,
            ),
          ),
        ),
      ),
    );
    await written.promise;
    const scan = failureOf('scan', wanted().folder, '--name', shoot);
    const failure = await scan.finally(() => going.resolve());
    expect(await making).toBe(shoot);
    expect(failure._tag).toBe('ShootBusy');
    expect(await Bun.file(join(folder, 'photos.json')).json()).toEqual([]);
    expect(await Bun.file(join(folder, 'moments.json')).json()).toEqual([]);
    expect(await Bun.file(join(folder, 'shoot.json')).json()).toMatchObject({
      title: 'Lisbon',
      about: 'Lisbon, May 2026',
    });
  });
});

describe('an album with finished photos', () => {
  it('can’t be thrown away', async () => {
    await pickLisbon();
    await editLisbon('A1');
    const status = await whileServing((address) =>
      statusOf(send('DELETE', `${address}/api/shoots/lisbon`)),
    );
    expect(status).toBe(400);
    expect(await shootJson('picks.json')).toMatchObject({ maximum: null });
  });
});

describe('an album that was chosen', () => {
  it('is ordered as a whole', async () => {
    await pickLisbon();
    const [before, after] = await whileServing(async (address) => {
      const first = await shootOf(address);
      await handOver(address, {
        dollars: 2.25,
        album: await pickedOf(address),
      });
      return [first, await shootOf(address)];
    });
    expect(before.ordered).toBeNull();
    expect(after.ordered).toMatchObject({ dollars: 2.25 });
  });
});
