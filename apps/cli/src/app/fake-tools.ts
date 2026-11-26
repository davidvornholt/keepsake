// biome-ignore-all lint/style/useNamingConvention: exiftool's names for the tags
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Effect, Layer, Sink, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** A program that was run. */
type Run = {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  /** What it read from its standard input. */
  readonly input: string;
  /** The environment variables that were set or removed for it. */
  readonly env: Readonly<Record<string, unknown>>;
};

type FakeAsset = {
  readonly id: string;
  readonly fileName: string;
  readonly favorite: boolean;
  readonly trashed: boolean;
};

const greyPixels = 72;
/** One pixel of middle grey, in red, green and blue. */
const middleGrey = 128;
const greyPixel = [middleGrey, middleGrey, middleGrey];
const rgbaChannels = 4;
const cameraSize = '7008 4672';
/** Small, since pixels of it are computed with. */
const editSize = '48 32';
const editBytes = 4608;
const editPattern =
  /(?:input(?:-\d+)?\.jpg|version-\d+(?:-kept|-mended)?\.png|(?:candidate-\d+|result)-\d+\.png|-keepsake\.jpg)$/u;

const wantedSize = /(?<width>\d+)x(?<height>\d+)!/u;

const pad = (value: number) => String(value).padStart(2, '0');

const takenAt = (second: number) =>
  `2026:03:30 10:${pad(Math.floor(second / 60))}:${pad(second % 60)}`;

const tagsOf = (file: string, taken: string) => ({
  SourceFile: file,
  SubSecDateTimeOriginal: taken,
  FileModifyDate: taken,
  Model: 'ILCE-7M4',
  Orientation: 1,
  ImageSize: '7040 4688',
  FullImageSize: '7008 4672',
  JpgFromRawLength: 1000,
});

/**
 * Stands in for exiftool, ImageMagick and the photos command: records what
 * was run and answers plausibly, so no test needs them installed.
 */
export const fakeTools = {
  runs: [] as Array<Run>,
  /** The RAW files in the folder that is scanned, by the second each was taken. */
  files: [] as Array<{ readonly file: string; readonly second: number }>,
  /** Assets the photos command has uploaded, by file. */
  uploads: [] as Array<string>,
  /** The album in Immich, once it was created. */
  album: undefined as ReadonlyArray<FakeAsset> | undefined,
  /** RAW files ImageMagick can't read. */
  broken: new Set<string>(),
  /** Whether the claude and codex programs are signed in to a subscription. */
  isSubscribed: false,
  /** What the claude and codex programs answer to a question. */
  assistant: undefined as ((run: Run) => string) | undefined,
  /** Other programs, which print something or fail with an error. */
  programs: {} as Record<string, (run: Run) => string>,
};

export const resetTools = () => {
  fakeTools.runs = [];
  fakeTools.files = [];
  fakeTools.uploads = [];
  fakeTools.album = undefined;
  fakeTools.broken = new Set();
  fakeTools.isSubscribed = false;
  fakeTools.assistant = undefined;
  fakeTools.programs = {};
};

const exiftool = (args: ReadonlyArray<string>): string => {
  if (args[0] === '-s3') {
    return '2026:03:30 10:00:00.000+02:00\n';
  }
  if (args[0] !== '-json') {
    return '';
  }
  const places = args.filter((arg) => arg.startsWith('/'));
  return JSON.stringify(
    args.includes('-r')
      ? fakeTools.files.map(({ file, second }) =>
          tagsOf(`${places[0]}/${file}`, takenAt(second)),
        )
      : places.map((file, second) => tagsOf(file, takenAt(second))),
  );
};

const magick = (args: ReadonlyArray<string>): string | Uint8Array => {
  const target = args.at(-1) ?? '';
  if (args[0] === 'identify') {
    return editPattern.test(target) ? editSize : cameraSize;
  }
  if (target === 'rgb:-') {
    return new Uint8Array(editBytes);
  }
  if (target === 'rgba:-') {
    const { width, height } = wantedSize.exec(args.join(' '))?.groups ?? {};
    return new Uint8Array(Number(width) * Number(height) * rgbaChannels);
  }
  if (target === 'gray:-') {
    return new Uint8Array(greyPixels);
  }
  if (target === 'ppm:-') {
    return Uint8Array.from([
      ...new TextEncoder().encode('P6\n1 1\n255\n'),
      ...greyPixel,
    ]);
  }
  if (target === 'jpg:-') {
    return 'a picture';
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, 'a picture');
  return '';
};

const album = { id: 'album-1', name: 'Lisbon, May 2026' };

const upload = ([, file = '', inAlbum]: ReadonlyArray<string>) => {
  fakeTools.uploads.push(file);
  const id = `asset-${fakeTools.uploads.length}`;
  if (inAlbum === '--album') {
    const fileName = file.slice(file.lastIndexOf('/') + 1);
    fakeTools.album = [
      ...(fakeTools.album ?? []),
      { id, fileName, favorite: false, trashed: false },
    ];
  }
  return { files: [{ status: 'created', assetId: id }] };
};

const photos = (args: ReadonlyArray<string>): unknown => {
  switch (`${args[0]} ${args[1]}`) {
    case 'albums list':
      return fakeTools.album === undefined ? [] : [album];
    case 'albums create':
      fakeTools.album = [];
      return { ...album, name: args[2] };
    case 'albums show':
      return { album, assets: fakeTools.album, nextCursor: null };
    case 'albums remove':
      fakeTools.album = fakeTools.album?.filter(
        ({ id }) => !args.slice(2).includes(id),
      );
      return {};
    case 'tags list':
      return [];
    case 'status undefined':
      return { server: 'https://photos.example.com' };
    default:
      return args[0] === 'upload' ? upload(args) : {};
  }
};

const claudeStatus = () =>
  JSON.stringify({
    loggedIn: fakeTools.isSubscribed,
    authMethod: fakeTools.isSubscribed ? 'claude.ai' : 'none',
  });

const codexStatus = () =>
  fakeTools.isSubscribed ? 'Logged in using ChatGPT' : 'Not logged in';

const answer = (run: Run): string | Uint8Array => {
  const { command, args } = run;
  switch (command) {
    case 'claude':
      return args[0] === 'auth'
        ? claudeStatus()
        : (fakeTools.assistant?.(run) ?? '');
    case 'codex':
      return args[0] === 'login'
        ? codexStatus()
        : (fakeTools.assistant?.(run) ?? '');
    case 'exiftool':
      return exiftool(args);
    case 'magick':
      return magick(args);
    case 'photos':
      return JSON.stringify(photos(args));
    default:
      return fakeTools.programs[command]?.(run) ?? '';
  }
};

/** What a program prints, or why it fails. */
const outcomeOf = (run: Run) => {
  const isBroken = run.args.some((arg) =>
    [...fakeTools.broken].some((file) => arg.endsWith(file)),
  );
  if (isBroken) {
    return { output: '', error: 'unreadable file' };
  }
  try {
    return { output: answer(run), error: '' };
  } catch (error) {
    return { output: '', error: (error as Error).message };
  }
};

const firstPid = 1000;

const inputOf = (stdin: unknown) =>
  Stream.isStream(stdin)
    ? (stdin as Stream.Stream<Uint8Array>).pipe(
        Stream.decodeText(),
        Stream.mkString,
      )
    : Effect.succeed('');

const spawner = ChildProcessSpawner.make((spawned) =>
  Effect.gen(function* () {
    const run: Run = ChildProcess.isStandardCommand(spawned)
      ? {
          command: spawned.command,
          args: spawned.args.map(String),
          input: yield* inputOf(spawned.options.stdin),
          env: spawned.options.env ?? {},
        }
      : { command: '', args: [], input: '', env: {} };
    fakeTools.runs.push(run);
    const { output, error } = outcomeOf(run);
    const stdout = Stream.make(
      typeof output === 'string' ? new TextEncoder().encode(output) : output,
    );
    return ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(firstPid + fakeTools.runs.length),
      exitCode: Effect.succeed(
        ChildProcessSpawner.ExitCode(error === '' ? 0 : 1),
      ),
      isRunning: Effect.succeed(false),
      kill: () => Effect.void,
      stdin: Sink.drain,
      stdout,
      stderr: Stream.make(new TextEncoder().encode(error)),
      all: stdout,
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.succeed(Effect.void),
    });
  }),
);

export const fakeToolsLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  spawner,
);
