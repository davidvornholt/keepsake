import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
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

const since = '2026-05-02T10:00:00.000Z';

/** The ids of what was handed over. */
const handOverIds = () =>
  readdirSync(shootFile('hand-overs'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace('.json', ''));

/** Who took the one hand-over there is. */
const claimOf = () =>
  shootJson('hand-overs', `${handOverIds()[0] ?? ''}.claim`);

const agentPath = (address: string) => `${address}/api/shoots/lisbon/agent`;

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
    const args = runsOfAgent()[0]?.args ?? [];
    const [shoot, given = ''] = args;
    expect(args).toHaveLength(2);
    expect(shoot).toBe('lisbon');
    const listed = await runOk('marks', 'lisbon', '--hand-over', given);
    expect(listed).toMatchObject({ handOvers: [given], agreedDollars: 0.75 });
  });

  it.each(['', 'on it', '{}', '{"link":""}'])(
    'counts as started only once it says where to read along: %p',
    async (said) => {
      const link = 'https://example.com/threads/5';
      let tries = 0;
      fakeTools.programs = {
        'start-agent': () => {
          tries += 1;
          return tries === 1 ? said : JSON.stringify({ link });
        },
      };
      const [unsaid, afterwards] = await serving(async (address) => {
        const first = await started(address);
        const claim = await claimOf();
        await statusOf(send('POST', agentPath(address)));
        await eventually(
          () => shootOf(address),
          ({ agent }) => (agent.started?.link ?? null) !== null,
        );
        return [{ first, claim }, await claimOf()];
      });
      expect(unsaid.first?.link).toBeNull();
      expect(unsaid.first?.failed).not.toBeNull();
      expect(unsaid.claim).toMatchObject({ by: 'page', isAcknowledged: false });
      expect(afterwards).toMatchObject({ by: 'page', isAcknowledged: true });
      expect(await shootJson('agent.json')).toMatchObject({
        link,
        failed: null,
      });
      const [first, second] = runsOfAgent().map(({ args }) => args);
      expect(second).toEqual(first);
    },
  );

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
});

/** Gives a program that was started a moment to show that it ran. */
const settle = () => Bun.sleep(100);

describe('the agent for a hand-over', () => {
  beforeEach(pickLisbon);

  it('isn’t started for what a waiting agent took', async () => {
    const waiting = runOk('marks', 'lisbon', '--wait');
    await eventually(
      () => Promise.resolve(existsSync(shootFile('waiting.json'))),
      Boolean,
    );
    const { agent, listed } = await serving(async (address) => {
      await handOverChange(address);
      const { agent: shown } = await shootOf(address);
      // The waiter wakes and goes before the page asks for an agent again.
      const marks = await waiting;
      await statusOf(send('POST', agentPath(address)));
      await settle();
      return { agent: shown, listed: marks };
    });
    expect(agent).toMatchObject({ canStart: true, started: null });
    expect(agent.waitsSince).not.toBeNull();
    expect(listed.marks).toMatchObject([{ photo: 'B' }]);
    expect(runsOfAgent()).toEqual([]);
  });

  it('is started once when it is asked for twice at once', async () => {
    let tries = 0;
    fakeTools.programs = {
      'start-agent': () => {
        tries += 1;
        if (tries === 1) {
          throw new Error('not signed in');
        }
        return '{"link":"https://example.com/threads/3"}';
      },
    };
    const statuses = await serving(async (address) => {
      await started(address);
      const again = () => statusOf(send('POST', agentPath(address)));
      const both = await Promise.all([again(), again()]);
      await eventually(
        () => shootOf(address),
        ({ agent }) => (agent.started?.link ?? null) !== null,
      );
      await settle();
      return both;
    });
    expect(statuses).toEqual([204, 204]);
    expect(runsOfAgent()).toHaveLength(2);
  });

  it('isn’t started again for what was acted on', async () => {
    fakeTools.programs = {
      'start-agent': () => {
        throw new Error('not signed in');
      },
    };
    await serving(async (address) => {
      await started(address);
      const [mark] = (await runOk('marks', 'lisbon')).marks;
      await runOk('answer', 'lisbon', mark.id, '--done', 'It is gone.');
      await statusOf(send('POST', agentPath(address)));
      await settle();
    });
    expect(runsOfAgent()).toHaveLength(1);
  });
});

describe('an agent no program said it started', () => {
  beforeEach(pickLisbon);

  it('is started again for what the page took, while an agent waits', async () => {
    let tries = 0;
    fakeTools.programs = {
      'start-agent': () => {
        tries += 1;
        if (tries === 1) {
          throw new Error('not signed in');
        }
        return '{"link":"https://example.com/threads/7"}';
      },
    };
    const { first, listed } = await serving(async (address) => {
      await started(address);
      const [taken = ''] = handOverIds();
      const waiting = runOk('marks', 'lisbon', '--wait');
      await eventually(
        () => Promise.resolve(existsSync(shootFile('waiting.json'))),
        Boolean,
      );
      await statusOf(send('POST', agentPath(address)));
      await eventually(
        () => shootOf(address),
        ({ agent }) => (agent.started?.link ?? null) !== null,
      );
      // What is handed over now is the waiting agent's.
      await send('PUT', `${address}/api/shoots/lisbon/marks`, {
        ...change,
        photo: 'A1',
      });
      await handOver(address);
      return { first: taken, listed: await waiting };
    });
    expect(runsOfAgent().map(({ args }) => args)).toEqual([
      ['lisbon', first],
      ['lisbon', first],
    ]);
    expect(listed.handOvers).toHaveLength(1);
    expect(listed.handOvers).not.toContain(first);
    expect(listed.marks).toMatchObject([{ photo: 'A1' }]);
  });

  it('is started for what the page took and never started one for', async () => {
    fakeTools.programs = {
      'start-agent': () => '{"link":"https://example.com/threads/6"}',
    };
    // As a page that stopped after it took the hand-over.
    await whileServing(handOverChange);
    const [id = ''] = handOverIds();
    await Bun.write(
      shootFile('hand-overs', `${id}.claim`),
      JSON.stringify({ by: 'page', at: since, isAcknowledged: false }),
    );
    await serving(async (address) => {
      await statusOf(send('POST', agentPath(address)));
      await eventually(
        () => Promise.resolve(runsOfAgent()),
        (runs) => runs.length > 0,
      );
    });
    expect(runsOfAgent().map(({ args }) => args)).toEqual([['lisbon', id]]);
  });

  it('is started again for the same hand-over when no start was confirmed', async () => {
    let tries = 0;
    fakeTools.programs = {
      'start-agent': () => {
        tries += 1;
        if (tries === 1) {
          throw new Error('no answer');
        }
        return '{"link":"https://example.com/threads/4"}';
      },
    };
    const claims = await serving(async (address) => {
      await started(address);
      const lost = await claimOf();
      await statusOf(send('POST', agentPath(address)));
      await eventually(
        () => shootOf(address),
        ({ agent }) => (agent.started?.link ?? null) !== null,
      );
      await statusOf(send('POST', agentPath(address)));
      await settle();
      return [lost, await claimOf()];
    });
    expect(claims).toMatchObject([
      { by: 'page', isAcknowledged: false },
      { by: 'page', isAcknowledged: true },
    ]);
    const [first, second, ...more] = runsOfAgent().map(({ args }) => args);
    expect(second).toEqual(first);
    expect(more).toEqual([]);
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
