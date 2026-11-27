// biome-ignore-all lint/style/useNamingConvention: the programs' names
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  failureOf,
  fake,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { verdictAnswer } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(async () => {
  await setUp(spyOn);
  fakeTools.isSubscribed = true;
  await scanLisbon();
});
afterEach(tearDown);

const lines = (...events: ReadonlyArray<object>) =>
  events.map((event) => JSON.stringify(event)).join('\n');

const claudeAnswer = (result: object) =>
  lines(
    { type: 'system', subtype: 'init' },
    {
      type: 'result',
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 500,
        output_tokens: 80,
      },
      modelUsage: {
        'claude-opus-5-5': {
          inputTokens: 2,
          outputTokens: 80,
          cacheReadInputTokens: 500,
          cacheCreationInputTokens: 1000,
          cacheCreationEphemeral1hInputTokens: 0,
          costUSD: 0.03,
        },
      },
      ...result,
    },
  );

const codexAnswer = (answer: object) =>
  lines(
    { type: 'thread.started' },
    {
      type: 'item.completed',
      item: { type: 'agent_message', text: JSON.stringify(answer) },
    },
    {
      type: 'turn.completed',
      usage: {
        input_tokens: 12_000,
        cached_input_tokens: 4000,
        output_tokens: 70,
        reasoning_output_tokens: 20,
      },
    },
  );

/** The question about the two frames of the burst. */
const aboutBurst = (command: string) => {
  const run = fakeTools.runs.find(
    ({ command: ran, input }) => ran === command && input.includes('2 frames'),
  );
  if (run === undefined) {
    throw new Error(`${command} was not asked about the burst`);
  }
  return run;
};

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

describe('claude models', () => {
  const opus = 'claude/claude-opus-5-5';

  it('judge photos on the subscription, without costing money', async () => {
    fakeTools.assistant = () =>
      claudeAnswer({ is_error: false, structured_output: verdictAnswer });
    const result = await cull(opus);
    expect(result).toMatchObject({
      model: opus,
      failed: [],
      dollarsSpent: 0,
      models: { [opus]: { calls: 3, inputTokens: 4506, outputTokens: 240 } },
    });
    const verdict = await shootJson(
      'verdicts',
      'claude--claude-opus-5-5',
      'B.json',
    );
    expect(verdict).toMatchObject({ best: ['B'], score: 8, model: opus });
  });

  it('look after the edits unless another model is named', async () => {
    await runOk('cull', 'lisbon');
    await runOk('pick', 'lisbon');
    const asked = fakeTools.runs.length;
    fakeTools.assistant = () => lines({ type: 'system' });
    const { failed } = await runOk('edit', 'lisbon', 'B');
    expect(failed[0].reason).toStartWith(opus);
    const commands = fakeTools.runs.slice(asked).map(({ command }) => command);
    expect(commands).toContain('claude');
    expect(commands).not.toContain('codex');
  });

  it('see the photos and nothing else of this machine', async () => {
    fakeTools.assistant = () =>
      claudeAnswer({ is_error: false, structured_output: verdictAnswer });
    await cull(opus);
    const { args, env, input } = aboutBurst('claude');
    expect(args).toContain('--safe-mode');
    expect(args).toContain('--no-session-persistence');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(env).toHaveProperty('ANTHROPIC_API_KEY', undefined);
    const { content } = JSON.parse(input).message;
    const images = content.filter(
      ({ type }: { readonly type: string }) => type === 'image',
    );
    expect(images).toHaveLength(2);
    expect(content[0].text).toContain('Lisbon, May 2026');
  });

  it('think as long as their name says', async () => {
    fakeTools.assistant = () =>
      claudeAnswer({ is_error: false, structured_output: verdictAnswer });
    const effort = () => {
      const { args } = aboutBurst('claude');
      return args[args.indexOf('--effort') + 1];
    };
    await cull(opus);
    expect(effort()).toBe('medium');
    fakeTools.runs.length = 0;
    await cull(`${opus}@high`);
    expect(effort()).toBe('high');
    const failure = await failureOf('cull', 'lisbon', '--model', `${opus}@big`);
    expect(failure._tag).toBe('InvalidInput');
    expect(failure.message).toContain('low, medium, high, xhigh, max');
  });

  it('report what the program says when it can’t answer', async () => {
    fakeTools.assistant = () =>
      claudeAnswer({ is_error: true, result: 'You’ve hit your limit.' });
    const failure = await failureOf('cull', 'lisbon', '--model', opus);
    expect(failure._tag).toBe('ModelFailed');
    expect(failure.message).toContain('You’ve hit your limit.');
  });

  it('report that the program printed nothing', async () => {
    const failure = await failureOf('cull', 'lisbon', '--model', opus);
    expect(failure.message).toContain('exit code 0');
  });

  it('need the program to be signed in', async () => {
    fakeTools.isSubscribed = false;
    const failure = await failureOf('cull', 'lisbon', '--model', opus);
    expect(failure._tag).toBe('NotSignedIn');
    expect(failure.message).toContain('Claude');
  });
});

describe('codex models', () => {
  const astra = 'codex/gpt-6.2-astra';

  it('judge photos on the subscription, without costing money', async () => {
    fakeTools.assistant = () => codexAnswer(verdictAnswer);
    const result = await cull(astra);
    expect(result).toMatchObject({
      model: astra,
      failed: [],
      dollarsSpent: 0,
      models: { [astra]: { calls: 3, inputTokens: 36_000, outputTokens: 210 } },
    });
    const { args, env, input } = aboutBurst('codex');
    expect(args.filter((arg) => arg === '--image')).toHaveLength(2);
    expect(input).toContain('(the attached picture number 2)');
    expect(args).toContain('model_reasoning_effort="medium"');
    expect(env).toHaveProperty('OPENAI_API_KEY', undefined);
  });

  it('judge photos unless another model has judged them before', async () => {
    await rm(shootFile('judge.json'));
    fakeTools.assistant = () => codexAnswer(verdictAnswer);
    const { model } = await runOk('cull', 'lisbon');
    expect(model).toBe('codex/gpt-6.2-sol');
  });

  it('know their role and that they need no tools', async () => {
    const instructions: Array<string> = [];
    fakeTools.assistant = ({ args }) => {
      const name = 'model_instructions_file=';
      const file = args.find((arg) => arg.startsWith(name)) ?? '';
      const path = JSON.parse(file.slice(name.length));
      instructions.push(readFileSync(path, 'utf8'));
      return codexAnswer(verdictAnswer);
    };
    await cull(astra);
    expect(instructions[0]).toStartWith('You choose the photos');
    expect(instructions[0]).toContain('call no tools');
  });

  it('think as long as their name says', async () => {
    fakeTools.assistant = () => codexAnswer(verdictAnswer);
    await cull(`${astra}@high`);
    expect(aboutBurst('codex').args).toContain('model_reasoning_effort="high"');
  });

  it.each([
    { type: 'turn.failed', error: { message: 'You hit your usage limit.' } },
    { type: 'error', message: 'You hit your usage limit.' },
  ])('report what the program says in $type', async (event) => {
    fakeTools.assistant = () => lines({ type: 'turn.started' }, event);
    const failure = await failureOf('cull', 'lisbon', '--model', astra);
    expect(failure.message).toContain('You hit your usage limit.');
  });

  it('need the program to be signed in with ChatGPT', async () => {
    fakeTools.isSubscribed = false;
    const failure = await failureOf('cull', 'lisbon', '--model', astra);
    expect(failure._tag).toBe('NotSignedIn');
    expect(failure.message).toContain('codex login');
  });
});

describe('the usage of a subscription', () => {
  const opus = 'claude/claude-opus-5-5';
  const astra = 'codex/gpt-6.2-astra';

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

  it('is recorded where CODEX_HOME says for Codex', async () => {
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

describe('a model of a subscription', () => {
  it('can’t edit photos', async () => {
    fakeTools.assistant = () =>
      claudeAnswer({ is_error: false, structured_output: verdictAnswer });
    await runOk('cull', 'lisbon');
    await runOk('pick', 'lisbon');
    const failure = await failureOf(
      'edit',
      'lisbon',
      '--image-model',
      'codex/gpt-image-2.5-sunburst',
    );
    expect(failure._tag).toBe('InvalidInput');
  });
});
