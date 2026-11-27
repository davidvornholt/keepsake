// biome-ignore-all lint/style/useNamingConvention: names of the programs' events

/** What a program prints, one event in each line. */
export const lines = (...events: ReadonlyArray<object>) =>
  events.map((event) => JSON.stringify(event)).join('\n');

/** Claude Code's answer, whose result is completed by `result`. */
export const claudeAnswer = (result: object) =>
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

/** Codex's answer to a question. */
export const codexAnswer = (answer: object) =>
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
