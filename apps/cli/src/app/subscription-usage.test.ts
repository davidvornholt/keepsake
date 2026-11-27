// biome-ignore-all lint/style/useNamingConvention: names in the programs' sessions
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  failureOf,
  fake,
  runOk,
  scanLisbon,
  setUp,
  tearDown,
} from './command-fixtures.ts';
import { verdictAnswer } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';
import { claudeAnswer, codexAnswer, lines } from './subscription-answers.ts';

beforeEach(async () => {
  await setUp(spyOn);
  fakeTools.isSubscribed = true;
  await scanLisbon();
});
afterEach(tearDown);

const cull = (model: string) => runOk('cull', 'lisbon', '--model', model);

/** The files of usage records in a folder of a program's sessions. */
const recordFiles = (folder: string) => {
  const directory = join(folder, 'keepsake');
  return readdirSync(directory).map((name) => {
    const text = readFileSync(join(directory, name), 'utf8');
    return {
      name,
      text,
      lines: text
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line)),
    };
  });
};

/** What of the question and the answer is in a record of usage. */
const saidIn = (text: string) =>
  ['Lisbon', 'content', verdictAnswer.description, verdictAnswer.reason].filter(
    (said) => text.includes(said),
  );

/** A block of message `msg_1`, with its usage so far. */
const block = (usage: object) => ({
  type: 'assistant',
  message: {
    id: 'msg_1',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: 'A heron' }],
    usage: {
      input_tokens: 2,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 500,
      output_tokens: 3,
      ...usage,
    },
  },
});

/**
 * What Claude Code's calls left: how many files, whether each call left one
 * line, what was said in them, and each different usage they name.
 */
const claudeUsage = () => {
  const calls = fakeTools.runs.filter(
    ({ command, args }) => command === 'claude' && args[0] === '--print',
  );
  const files = recordFiles(join(fake.home, '.claude', 'projects'));
  const text = files.map((file) => file.text).join('');
  const recorded = files.flatMap((file) => file.lines);
  const usage = recorded.map(({ costUSD, message }) =>
    JSON.stringify({ costUSD, ...message.usage }),
  );
  return {
    files: files.length,
    onePerCall: recorded.length === calls.length,
    said: [...saidIn(text), ...(text.includes('A heron') ? ['A heron'] : [])],
    usage: [...new Set(usage)].map((used) => JSON.parse(used)),
  };
};

/** One file, with a line for each call that names `usage`. */
const recordedOnce = (usage: object) => ({
  files: 1,
  onePerCall: true,
  said: [],
  usage: [usage],
});

const fromBlocks = {
  input_tokens: 2,
  cache_creation_input_tokens: 1000,
  cache_read_input_tokens: 500,
  output_tokens: 80,
  cache_creation: { ephemeral_1h_input_tokens: 0 },
};

const opus = 'claude/claude-opus-5-5';

const isoTime = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/u;

/** Named so that neither program lists it among its sessions. */
const recordName = /^keepsake-(?<session>[\da-f-]{36})\.jsonl$/u;

describe('the usage of Claude Code', () => {
  it('is recorded where Claude Code keeps its sessions', async () => {
    fakeTools.assistant = () =>
      claudeAnswer({ is_error: false, structured_output: verdictAnswer });
    await cull(opus);
    const [file, ...others] = recordFiles(
      join(fake.home, '.claude', 'projects'),
    );
    expect(others).toEqual([]);
    const session = file?.name.match(recordName)?.groups?.session;
    expect(session).toBeDefined();
    expect(file?.lines).toHaveLength(3);
    for (const line of file?.lines ?? []) {
      expect(line).toEqual({
        type: 'assistant',
        timestamp: expect.stringMatching(isoTime),
        sessionId: session,
        costUSD: 0.03,
        message: {
          model: 'claude-opus-5-5',
          usage: {
            input_tokens: 2,
            cache_creation_input_tokens: 1000,
            cache_read_input_tokens: 500,
            output_tokens: 80,
            cache_creation: { ephemeral_1h_input_tokens: 0 },
          },
        },
      });
    }
    expect(saidIn(file?.text ?? '')).toEqual([]);
  });

  it('is recorded where CLAUDE_CONFIG_DIR says, also for a failed answer', async () => {
    fake.env = { CLAUDE_CONFIG_DIR: join(fake.home, 'claude-config') };
    fakeTools.assistant = () =>
      claudeAnswer({ is_error: true, result: 'You’ve hit your limit.' });
    await failureOf('cull', 'lisbon', '--model', opus);
    const [file] = recordFiles(join(fake.home, 'claude-config', 'projects'));
    expect(file?.lines[0].message.usage.output_tokens).toBe(80);
  });

  it('is not recorded without a home, and the answers still come', async () => {
    fake.env = { HOME: undefined };
    fakeTools.assistant = () =>
      claudeAnswer({ is_error: false, structured_output: verdictAnswer });
    const { models } = await cull(opus);
    expect(models[opus].calls).toBe(3);
    expect(existsSync(join(fake.home, '.claude'))).toBe(false);
  });
});

describe('the usage of Claude Code cut short', () => {
  it('is read from the messages when it stops before its result', async () => {
    fakeTools.assistant = () =>
      lines(
        { type: 'system', subtype: 'init' },
        block({}),
        block({ output_tokens: 80 }),
      );
    await failureOf('cull', 'lisbon', '--model', opus);
    expect(claudeUsage()).toEqual(recordedOnce(fromBlocks));
  });

  it('is recorded when a signal stops Claude Code after it printed', async () => {
    fakeTools.assistant = () =>
      claudeAnswer({ is_error: false, structured_output: verdictAnswer });
    fakeTools.killedBy = ({ args }) =>
      args[0] === '--print' ? 'SIGTERM' : undefined;
    const failure = await failureOf('cull', 'lisbon', '--model', opus);
    expect(failure.message).toContain('SIGTERM');
    expect(claudeUsage()).toEqual(
      recordedOnce({ ...fromBlocks, costUSD: 0.03 }),
    );
  });

  it('is recorded from what was printed before a line was cut off', async () => {
    fakeTools.assistant = () =>
      `${lines(block({ output_tokens: 80 }))}\n{"type":`;
    await failureOf('cull', 'lisbon', '--model', opus);
    expect(claudeUsage()).toEqual(recordedOnce(fromBlocks));
  });

  it('counts tokens of a message whose other kinds are null', async () => {
    fakeTools.assistant = () =>
      lines({
        type: 'assistant',
        message: {
          id: 'msg_1',
          model: 'claude-opus-5-5',
          usage: {
            input_tokens: 12,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            cache_creation: null,
            output_tokens: 7,
          },
        },
      });
    await failureOf('cull', 'lisbon', '--model', opus);
    expect(claudeUsage()).toEqual(
      recordedOnce({
        input_tokens: 12,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 7,
        cache_creation: { ephemeral_1h_input_tokens: 0 },
      }),
    );
  });

  it('is read from the messages when the summary names no model', async () => {
    fakeTools.assistant = () =>
      lines(block({ output_tokens: 80 }), {
        type: 'result',
        is_error: true,
        result: 'Stopped.',
        modelUsage: {},
      });
    await failureOf('cull', 'lisbon', '--model', opus);
    expect(claudeUsage()).toEqual(recordedOnce(fromBlocks));
  });

  it('is counted once from the summary when the messages say it too', async () => {
    const answer = claudeAnswer({
      is_error: false,
      structured_output: verdictAnswer,
    });
    fakeTools.assistant = () =>
      `${lines(block({}), block({ output_tokens: 80 }))}\n${answer}`;
    await cull(opus);
    expect(claudeUsage()).toEqual(
      recordedOnce({ ...fromBlocks, costUSD: 0.03 }),
    );
  });
});

describe('the usage of Codex', () => {
  const astra = 'codex/gpt-6.2-astra';

  it('is recorded where CODEX_HOME says', async () => {
    fake.env = { CODEX_HOME: join(fake.home, 'codex-home') };
    fakeTools.assistant = () => codexAnswer(verdictAnswer);
    await cull(astra);
    const [file, ...others] = recordFiles(
      join(fake.home, 'codex-home', 'sessions'),
    );
    expect(others).toEqual([]);
    const session = file?.name.match(recordName)?.groups?.session;
    const records = file?.lines ?? [];
    const call = ['session_meta', 'turn_context', 'token_usage_record'];
    expect(records.map(({ type }) => type)).toEqual([
      ...call,
      ...call,
      ...call,
    ]);
    expect(records[0].payload).toEqual({ id: session });
    expect(records[1].payload).toEqual({ model: 'gpt-6.2-astra' });
    expect(records[2].payload.usage).toEqual({
      input_tokens: 12_000,
      cached_input_tokens: 4000,
      cache_write_input_tokens: 0,
      output_tokens: 70,
      reasoning_output_tokens: 20,
      total_tokens: 12_070,
    });
    const calls = records.flatMap(({ type, payload }) =>
      type === 'token_usage_record' ? [payload.response_id] : [],
    );
    expect(new Set(calls).size).toBe(3);
    expect(saidIn(file?.text ?? '')).toEqual([]);
  });
});
