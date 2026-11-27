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
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line)),
    };
  });
};

/** What of the question and the answer is in a record of usage. */
const saidIn = (text: string) =>
  ['Lisbon', 'content', verdictAnswer.description, verdictAnswer.reason].filter(
    (said) => text.includes(said),
  );

const isoTime = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/u;

/** Named so that neither program lists it among its sessions. */
const recordName = /^keepsake-(?<session>[\da-f-]{36})\.jsonl$/u;

describe('the usage of Claude Code', () => {
  const opus = 'claude/claude-opus-5-5';

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

  it('is recorded from the messages when Claude Code stops before its result', async () => {
    const block = (output_tokens: number) => ({
      type: 'assistant',
      message: {
        id: 'msg_1',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: 'A heron' }],
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 500,
          output_tokens,
        },
      },
    });
    fakeTools.assistant = () =>
      lines({ type: 'system', subtype: 'init' }, block(3), block(80));
    await failureOf('cull', 'lisbon', '--model', opus);
    const [file] = recordFiles(join(fake.home, '.claude', 'projects'));
    expect(file?.lines).toHaveLength(3);
    expect(file?.lines[0]).not.toHaveProperty('costUSD');
    expect(file?.lines[0].message).toEqual({
      model: 'claude-opus-5-5',
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 500,
        output_tokens: 80,
        cache_creation: { ephemeral_1h_input_tokens: 0 },
      },
    });
    expect(saidIn(file?.text ?? '')).toEqual([]);
    expect(file?.text).not.toContain('A heron');
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
