// biome-ignore-all lint/style/useNamingConvention: the API's names
/** What was asked of a model: the name of the answer, and the pieces. */
export type Asked = {
  readonly name: AnswerName;
  readonly model: string;
  readonly texts: ReadonlyArray<string>;
  readonly images: number;
};

/** An edit that was asked of the image model. */
export type AskedEdit = { readonly prompt: string; readonly size: string };

const box = { left: 0.3, top: 0.3, right: 0.6, bottom: 0.6 };

export const verdictAnswer = {
  ranking: [{ frame: 1, focus: box }],
  score: 8,
  subject: 'bird',
  description: 'A heron stands in shallow water.',
  reason: 'It looks at the camera.',
};

export const assessment = (version: number, overrides: object = {}) => ({
  version,
  sameMoment: true,
  samePlace: true,
  peopleUnchanged: true,
  textUnchanged: true,
  withoutErrors: true,
  looksLikeAPhoto: true,
  betterThanOriginal: true,
  beauty: 7,
  notes: `Version ${version} is good.`,
  ...overrides,
});

const usualAnswers = {
  judgement: verdictAnswer,
  shortlist: { best: [1] },
  check: {
    ranking: [1],
    score: 8,
    description: 'A heron stands in shallow water.',
    reason: 'Still sharp.',
    further: [],
  },
  album: { leaveOut: [] },
  motifs: { motifs: [] },
  motif: { keep: [], repeats: [] },
  reasons: { reasons: [] },
  ranking: { bestFirst: [] },
  description: { description: 'A heron takes off.' },
  crops: { subject: box, facing: 'neither', belongings: [], crops: [] },
  choice: { best: 1, reason: 'The whole frame is best.' },
  removals: { remove: [] },
  places: { everywhere: true, places: [] },
  choices: { places: [] },
  people: { people: [] },
  everyone: { everyone: [] },
  signs: { signs: [] },
  textures: { outlines: [] },
  'changed-signs': { changed: [] },
  faults: { faults: [] },
  assessment: { assessments: [assessment(1), assessment(2)] },
};

/** What a model can be asked for. */
export type AnswerName = keyof typeof usualAnswers;

type Answer = object | ((asked: Asked) => object);

/** Stands in for Azure, so no test reaches a real model. */
export const fakeModels = {
  asked: [] as Array<Asked>,
  edits: [] as Array<AskedEdit>,
  /** Answers instead of the usual ones, by the name of the answer. */
  answers: {} as Partial<Record<AnswerName, Answer>>,
  /** Answers the image model's requests. */
  editAnswer: undefined as (() => Response) | undefined,
  key: 'test-api-key',
};

export const resetModels = () => {
  fakeModels.asked = [];
  fakeModels.edits = [];
  fakeModels.answers = {};
  fakeModels.editAnswer = undefined;
};

type ChatPart = { readonly type: string; readonly text?: string };
type ChatRequest = {
  readonly model: string;
  readonly messages: ReadonlyArray<{
    readonly role: string;
    readonly content: string | ReadonlyArray<ChatPart>;
  }>;
  readonly response_format: {
    readonly json_schema: { readonly name: AnswerName };
  };
};

const chat = async (request: Request): Promise<Response> => {
  const body: ChatRequest = await request.json();
  const parts = body.messages.flatMap(({ role, content }) =>
    role === 'user' && typeof content !== 'string' ? content : [],
  );
  const asked: Asked = {
    name: body.response_format.json_schema.name,
    model: body.model,
    texts: parts.flatMap(({ text }) => (text === undefined ? [] : [text])),
    images: parts.filter(({ type }) => type === 'image_url').length,
  };
  fakeModels.asked.push(asked);
  const chosen = fakeModels.answers[asked.name] ?? usualAnswers[asked.name];
  const answer = typeof chosen === 'function' ? chosen(asked) : chosen;
  if (answer instanceof Response) {
    return answer;
  }
  return Response.json({
    id: 'answer',
    object: 'chat.completion',
    created: 0,
    model: body.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: JSON.stringify(answer) },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10_000,
      completion_tokens: 1000,
      total_tokens: 11_000,
    },
  });
};

const images = async (request: Request): Promise<Response> => {
  const form = await request.formData();
  fakeModels.edits.push({
    prompt: String(form.get('prompt')),
    size: String(form.get('size')),
  });
  if (fakeModels.editAnswer !== undefined) {
    return fakeModels.editAnswer();
  }
  const count = Number(form.get('n'));
  return Response.json({
    data: Array.from({ length: count }, () => ({ b64_json: btoa('a png') })),
    usage: { input_tokens: 1500, output_tokens: 14_000 },
  });
};

const unauthorized = 401;
const notFound = 404;

const answerTo = (request: Request): Promise<Response> | Response => {
  const { pathname } = new URL(request.url);
  if (request.headers.get('authorization') !== `Bearer ${fakeModels.key}`) {
    return Response.json({ error: {} }, { status: unauthorized });
  }
  if (pathname.endsWith('/chat/completions')) {
    return chat(request);
  }
  if (pathname.endsWith('/images/edits')) {
    return images(request);
  }
  if (pathname.endsWith('/models')) {
    return Response.json({ data: [{ id: 'gpt-6-astra' }] });
  }
  return new Response(null, { status: notFound });
};

export const fakeFetch = (async (
  input: RequestInfo | URL,
  init?: RequestInit,
) => await answerTo(new Request(input, init))) as typeof globalThis.fetch;
