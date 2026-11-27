// biome-ignore-all lint/style/useNamingConvention: the API's names
/** What was asked of a model: the name of the answer, and the pieces. */
export type Asked = {
  readonly name: AnswerName;
  readonly model: string;
  /** Where it was asked, such as the provider's host. */
  readonly host: string;
  readonly texts: ReadonlyArray<string>;
  readonly images: number;
  /** The most output tokens the answer may use, if any. */
  readonly outputLimit?: number;
};

/** An edit that was asked of the image model. */
export type AskedEdit = {
  /** The model asked, by the provider's name for it. */
  readonly model: string;
  readonly prompt: string;
  readonly size: string;
  /** The photo it was given. */
  readonly picture: Uint8Array;
};

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

/** What the fake models answer unless a test says otherwise. */
export const usualAnswers = {
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
  places: { everywhere: true, bringsBack: false, places: [] },
  choices: { places: [] },
  people: { people: [] },
  everyone: { everyone: [] },
  animals: { animals: [] },
  signs: { signs: [] },
  textures: { outlines: [] },
  'changed-signs': { changed: [], gone: [] },
  faults: { faults: [] },
  assessment: { assessments: [assessment(1), assessment(2)] },
};

/** What a model can be asked for. */
export type AnswerName = keyof typeof usualAnswers;

type Answer = object | ((asked: Asked) => object);

type ChatUsage = {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
};

const usualChatUsage: ChatUsage = {
  prompt_tokens: 10_000,
  completion_tokens: 1000,
};

/** What a question uses when the test wants questions to cost nothing. */
export const freeChatUsage: ChatUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
};

/** Stands in for Azure, so no test reaches a real model. */
export const fakeModels = {
  asked: [] as Array<Asked>,
  edits: [] as Array<AskedEdit>,
  /** Answers instead of the usual ones, by the name of the answer. */
  answers: {} as Partial<Record<AnswerName, Answer>>,
  /** Answers the image model's requests. */
  editAnswer: undefined as (() => Response | Promise<Response>) | undefined,
  /** Answers the requests to Anthropic's API, which has no usual answer. */
  anthropicAnswer: undefined as (() => Promise<Response>) | undefined,
  /** What a question uses, or nothing when the answer doesn't say. */
  chatUsage: usualChatUsage as ChatUsage | undefined,
  key: 'test-api-key',
};

export const resetModels = () => {
  fakeModels.asked = [];
  fakeModels.edits = [];
  fakeModels.answers = {};
  fakeModels.editAnswer = undefined;
  fakeModels.anthropicAnswer = undefined;
  fakeModels.chatUsage = usualChatUsage;
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
  readonly max_completion_tokens?: number;
};

const chat = async (request: Request): Promise<Response> => {
  const body: ChatRequest = await request.json();
  const parts = body.messages.flatMap(({ role, content }) =>
    role === 'user' && typeof content !== 'string' ? content : [],
  );
  const asked: Asked = {
    name: body.response_format.json_schema.name,
    model: body.model,
    host: new URL(request.url).host,
    texts: parts.flatMap(({ text }) => (text === undefined ? [] : [text])),
    images: parts.filter(({ type }) => type === 'image_url').length,
    outputLimit: body.max_completion_tokens,
  };
  fakeModels.asked.push(asked);
  const chosen = fakeModels.answers[asked.name] ?? usualAnswers[asked.name];
  // An answer may come later, to hold one question back behind others.
  const answer = await (typeof chosen === 'function' ? chosen(asked) : chosen);
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
    ...(fakeModels.chatUsage === undefined
      ? {}
      : {
          usage: {
            ...fakeModels.chatUsage,
            total_tokens:
              fakeModels.chatUsage.prompt_tokens +
              fakeModels.chatUsage.completion_tokens,
          },
        }),
  });
};

const images = async (request: Request): Promise<Response> => {
  const form = await request.formData();
  const picture = form.get('image[]');
  fakeModels.edits.push({
    model: String(form.get('model')),
    prompt: String(form.get('prompt')),
    size: String(form.get('size')),
    picture: new Uint8Array(
      picture instanceof Blob ? await picture.arrayBuffer() : [],
    ),
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
  // Anthropic's API takes its key in a header of its own.
  if (pathname.endsWith('/messages') && fakeModels.anthropicAnswer) {
    return request.headers.get('x-api-key') === fakeModels.key
      ? fakeModels.anthropicAnswer()
      : Response.json({ error: {} }, { status: unauthorized });
  }
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
