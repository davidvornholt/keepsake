// biome-ignore-all lint/style/useNamingConvention: the programs' names
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import {
  asked,
  credentialsPath,
  failureOf,
  judge,
  photosFolder,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels, usualAnswers, verdictAnswer } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

type Run = Parameters<NonNullable<typeof fakeTools.assistant>>[0];

/** The usual answer to the question whose schema a program was given. */
const answerTo = ({ command, args }: Run) => {
  const given = (name: string) => args[args.indexOf(name) + 1] ?? '';
  const schema = JSON.parse(
    command === 'claude'
      ? given('--json-schema')
      : readFileSync(given('--output-schema'), 'utf8'),
  );
  const keysOf = (object: object) =>
    Object.keys(object)
      .toSorted((one, other) => one.localeCompare(other))
      .join();
  const wanted = keysOf(schema.properties);
  const answer = Object.values(usualAnswers).find(
    (usual) => keysOf(usual) === wanted,
  );
  if (answer === undefined) {
    throw new Error(`No usual answer has the keys ${wanted}`);
  }
  return answer;
};

/** Answers as Claude Code and Codex do on a subscription. */
const subscriptionAnswer = (run: Run) => {
  const answer = answerTo(run);
  const events =
    run.command === 'claude'
      ? [
          {
            type: 'result',
            is_error: false,
            structured_output: answer,
            usage: {
              input_tokens: 1,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
              output_tokens: 1,
            },
          },
        ]
      : [
          {
            type: 'item.completed',
            item: { type: 'agent_message', text: JSON.stringify(answer) },
          },
          {
            type: 'turn.completed',
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        ];
  return events.map((event) => JSON.stringify(event)).join('\n');
};

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const runLisbon = (...args: ReadonlyArray<string>) => [
  'run',
  photosFolder(),
  '--name',
  'lisbon',
  '--review-model',
  judge,
  ...args,
];

describe('keepsake run', () => {
  beforeEach(scanLisbon);

  it('does everything and goes on where it stopped', async () => {
    fakeModels.answers.reasons = {
      reasons: [{ photo: 2, because: 'Its eyes are closed.' }],
    };
    const result = await runOk(...runLisbon('--publish'));
    expect(result.culled.moments).toBe(3);
    expect(result.picked.picked).toBe(3);
    expect(result.edited.edited).toBe(3);
    expect(result.published.published).toBe(3);
    const questions = fakeModels.asked.length;
    await runOk(...runLisbon('--publish'));
    expect(fakeModels.asked).toHaveLength(questions);
  });

  it('uploads nothing unless asked to', async () => {
    const result = await runOk(...runLisbon());
    expect(result.published).toBeNull();
    expect(fakeTools.uploads).toEqual([]);
  });

  it('gets a shoot ready for the owner without an edit', async () => {
    const result = await runOk(...runLisbon('--unedited', '--maximum', '2'));
    expect(result).toMatchObject({
      picked: { picked: 2 },
      edited: null,
      published: null,
      explained: { notExplained: ['B', 'A2'] },
    });
    expect(fakeModels.edits).toEqual([]);
    expect(asked('reasons').length).toBeGreaterThan(0);
    expect(existsSync(shootFile('edits'))).toBe(false);
    const both = await failureOf(...runLisbon('--unedited', '--publish'));
    expect(both.message).toContain('either --unedited or --publish');
  });

  it('needs no API key to get a shoot ready on the subscriptions', async () => {
    await rm(credentialsPath());
    await rm(shootFile('judge.json'));
    fakeTools.isSubscribed = true;
    fakeTools.assistant = subscriptionAnswer;
    const result = await runOk(
      'run',
      photosFolder(),
      '--name',
      'lisbon',
      '--unedited',
    );
    expect(result).toMatchObject({
      culled: { model: 'codex/gpt-6.2-sol', failed: [] },
      picked: { picked: 3 },
      edited: null,
      dollarsSpent: 0,
    });
    const commands = new Set(fakeTools.runs.map(({ command }) => command));
    expect(commands).toContain('codex');
    expect(commands).toContain('claude');
  });

  it('asks nothing when it couldn’t edit afterwards', async () => {
    await rm(credentialsPath());
    fakeTools.isSubscribed = true;
    fakeTools.assistant = subscriptionAnswer;
    const failure = await failureOf(
      ...runLisbon('--model', 'codex/gpt-6.2-sol'),
    );
    expect(failure._tag).toBe('NotSignedIn');
    expect(fakeTools.runs.map(({ command }) => command)).not.toContain('codex');
  });

  it('stops when many moments couldn’t be judged, and goes on later', async () => {
    fakeModels.answers.judgement = () =>
      asked('judgement').length === 1
        ? verdictAnswer
        : new Response('You’ve hit your limit', { status: 400 });
    const failure = await failureOf(...runLisbon('--unedited'));
    expect(failure._tag).toBe('ModelFailed');
    expect(failure.message).toContain('2 of 3 moments couldn’t be judged');
    expect(failure.message).toContain('You’ve hit your limit');
    expect(existsSync(shootFile('picks.json'))).toBe(false);
    fakeModels.answers.judgement = verdictAnswer;
    const result = await runOk(...runLisbon('--unedited'));
    expect(result.picked.picked).toBe(3);
  });
});
