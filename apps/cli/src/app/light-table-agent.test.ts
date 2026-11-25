import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import process from 'node:process';
import {
  editLisbon,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import {
  change,
  eventually,
  handOver,
  send,
  shootOf,
  statusOf,
  whileServing,
} from './light-table-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const serving = <A>(visit: (address: string) => Promise<A>) =>
  whileServing(visit, { agent: 'start-agent' });

const runsOfAgent = () =>
  fakeTools.runs.filter(({ command }) => command === 'start-agent');

const handOverChange = async (address: string) => {
  await send('PUT', `${address}/api/shoots/lisbon/marks`, change);
  await handOver(address, { dollars: 0.75 });
};

type Agent = {
  readonly started: {
    readonly link: string | null;
    readonly failed: string | null;
  } | null;
};

/** What came of starting an agent. */
const started = async (address: string) => {
  await handOverChange(address);
  const { agent } = await eventually<{ readonly agent: Agent }>(
    () => shootOf(address),
    ({ agent: { started: last } }) =>
      last !== null && (last.link !== null || last.failed !== null),
  );
  return agent.started;
};

describe('the agent', () => {
  beforeEach(pickLisbon);

  it('is started when something is handed over', async () => {
    const link = 'https://example.com/threads/1';
    fakeTools.programs = { 'start-agent': () => JSON.stringify({ link }) };
    expect(await serving(started)).toMatchObject({ link, failed: null });
    expect(runsOfAgent().map(({ args }) => args)).toEqual([['lisbon']]);
  });

  it('doesn’t have to say where to read along', async () => {
    fakeTools.programs = { 'start-agent': () => 'on it' };
    await serving(async (address) => {
      await handOverChange(address);
      return eventually(
        () => Promise.resolve(runsOfAgent()),
        (runs) => runs.length > 0,
      );
    });
    expect(await shootJson('agent.json')).toMatchObject({
      link: null,
      failed: null,
    });
  });

  it('may not be there', async () => {
    fakeTools.programs = {
      'start-agent': () => {
        throw new Error('not signed in');
      },
    };
    const outcome = await serving(started);
    expect(outcome?.link).toBeNull();
    expect(outcome?.failed).toContain('not signed in');
    expect(await runOk('marks', 'lisbon')).toMatchObject({
      marks: [{ photo: 'B' }],
    });
  });

  it('is started for what was handed over before', async () => {
    let tries = 0;
    fakeTools.programs = {
      'start-agent': () => {
        tries += 1;
        if (tries === 1) {
          throw new Error('not signed in');
        }
        return '{"link":"https://example.com/threads/2"}';
      },
    };
    const agent = await serving(async (address) => {
      await started(address);
      const again = await statusOf(
        send('POST', `${address}/api/shoots/lisbon/agent`),
      );
      expect(again).toBe(204);
      return eventually<{ readonly agent: Agent }>(
        () => shootOf(address),
        ({ agent: { started: last } }) => (last?.link ?? null) !== null,
      );
    });
    expect(agent.agent.started).toMatchObject({ failed: null });
    expect(runsOfAgent()).toHaveLength(2);
  });

  it('can’t be started without a program for it', async () => {
    const status = await whileServing((address) =>
      statusOf(send('POST', `${address}/api/shoots/lisbon/agent`)),
    );
    expect(status).toBe(400);
  });

  it('isn’t started while one waits', async () => {
    const since = '2026-05-02T10:00:00.000Z';
    await Bun.write(
      shootFile('waiting.json'),
      JSON.stringify({ process: process.pid, since }),
    );
    const { agent } = await serving(async (address) => {
      await handOverChange(address);
      return shootOf(address);
    });
    expect(agent).toEqual({ waitsSince: since, canStart: true, started: null });
    expect(runsOfAgent()).toEqual([]);
  });
});

describe('the favorites on the light table', () => {
  const favor = (address: string, photo: string, favorite: boolean) =>
    statusOf(
      send('PUT', `${address}/api/shoots/lisbon/favorites`, {
        photo,
        favorite,
      }),
    );

  it('are those of Immich', async () => {
    await pickLisbon();
    await editLisbon('B');
    await runOk('publish', 'lisbon', 'B');
    const favorites = await whileServing(async (address) => {
      const isFavorite = async () =>
        (await shootOf(address)).photos[2].standing.favorite;
      await favor(address, 'B', true);
      const liked = await isFavorite();
      await favor(address, 'B', false);
      return [liked, await isFavorite()];
    });
    expect(favorites).toEqual([true, false]);
    expect(
      fakeTools.runs
        .filter(
          ({ command, args }) => command === 'photos' && args[0] === 'update',
        )
        .map(({ args }) => args.slice(1)),
    ).toEqual([
      ['asset-1', '--favorite'],
      ['asset-1', '--no-favorite'],
    ]);
  });

  it('are only in the album', async () => {
    await pickLisbon();
    expect(await whileServing((address) => favor(address, 'B', true))).toBe(
      400,
    );
  });
});
