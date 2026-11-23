// biome-ignore-all lint/style/useNamingConvention: the programs' names
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  failureOf,
  runOk,
  scanLisbon,
  setUp,
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
      usage: { input_tokens: 12_000, output_tokens: 70 },
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
    expect(env).toHaveProperty('OPENAI_API_KEY', undefined);
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
