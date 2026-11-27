// biome-ignore-all lint/style/useNamingConvention: exiftool's names for the tags

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { Effect, Layer, PlatformError, Sink, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { answerPhotos, type FakeAlbum } from './fake-photos.ts';

/** A program that was run. */
export type Run = {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  /** What it read from its standard input. */
  readonly input: string;
  readonly inputBytes: Uint8Array;
  /** The environment variables that were set or removed for it. */
  readonly env: Readonly<Record<string, unknown>>;
};

const greyPixels = 72;
/** One pixel of middle grey, in red, green and blue. */
const middleGrey = 128;
const greyPixel = [middleGrey, middleGrey, middleGrey];
const rgbaChannels = 4;
const rgbChannels = 3;
const cameraSize = '7008 4672';
/** Small, since pixels of it are computed with. */
const editSize = '48 32';
const editBytes = 4608;
const editPattern =
  /(?:input(?:-\d+)?\.jpe?g|version-\d+(?:-kept|-mended)?\.png|(?:candidate-\d+|result)-\d+\.png|-keepsake\.jpg)$/u;

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
  /** The RAW files in the folder that is scanned, by the second each was taken; `putPhotos` puts them there. */
  files: [] as Array<{ readonly file: string; readonly second: number }>,
  /** Files the photos command has sent to Immich, in the order it got them. */
  uploads: [] as Array<string>,
  /** The assets in Immich, with the file and the checksum of its bytes. */
  library: [] as Array<{ id: string; file: string; checksum: string }>,
  /** The albums in Immich, the first of which is created as `album-1`. */
  albums: [] as Array<FakeAlbum>,
  /** Assets Immich refuses to put into an album or take out of one. */
  refused: new Set<string>(),
  /** RAW files whose pictures can't be read. */
  broken: new Set<string>(),
  /** Whether the claude and codex programs are signed in to a subscription. */
  isSubscribed: false,
  /** What the claude and codex programs answer to a question. */
  assistant: undefined as ((run: Run) => string) | undefined,
  /** Other programs, which print something or fail with an error. */
  programs: {} as Record<string, (run: Run) => string>,
  /** How bright ImageMagick finds each pixel of a file, by how its path ends. */
  pictures: {} as Record<string, (x: number, y: number) => number>,
  /** Holds a program up until the promise settles; one that rejects stops keepsake. */
  pause: undefined as ((run: Run) => Promise<void> | undefined) | undefined,
  /** Holds back what a program answered, as it was when it ran, until the promise settles. */
  late: undefined as ((run: Run) => Promise<void> | undefined) | undefined,
  /** The signal that stops a program after it printed its output, if any. */
  killedBy: undefined as ((run: Run) => string | undefined) | undefined,
};

export const resetTools = () => {
  fakeTools.runs = [];
  fakeTools.files = [];
  fakeTools.uploads = [];
  fakeTools.library = [];
  fakeTools.albums = [];
  fakeTools.refused = new Set();
  fakeTools.broken = new Set();
  fakeTools.isSubscribed = false;
  fakeTools.assistant = undefined;
  fakeTools.programs = {};
  fakeTools.pictures = {};
  fakeTools.pause = undefined;
  fakeTools.late = undefined;
  fakeTools.killedBy = undefined;
};

const exiftool = (args: ReadonlyArray<string>): string => {
  if (args[0] === '-s3') {
    return '2026:03:30 10:00:00.000+02:00\n';
  }
  if (args.includes('-overwrite_original')) {
    // The data copied into a picture makes its bytes those of its photo, so
    // Immich tells the uploads of different photos apart by their checksum.
    const target = args.at(-1) ?? '';
    appendFileSync(target, `\n${args.slice(0, -1).join(' ')}`);
    return '';
  }
  if (args[0] !== '-json') {
    return '';
  }
  const places = args.filter((arg) => arg.startsWith('/'));
  return JSON.stringify(
    places.map((path, index) => {
      const second =
        fakeTools.files.find(({ file }) => path.endsWith(`/${file}`))?.second ??
        index;
      return tagsOf(path, takenAt(second));
    }),
  );
};

/**
 * The pixels of a file: as a test drew them, as they were written, or black.
 * Rasters that were written keep their pixels, so a test can look at them.
 */
const pixelsOf = (file: string, args: ReadonlyArray<string>): Uint8Array => {
  const { width, height } = wantedSize.exec(args.join(' '))?.groups ?? {};
  const size = { width: Number(width), height: Number(height) };
  const drawn = Object.entries(fakeTools.pictures).find(([end]) =>
    file.endsWith(end),
  )?.[1];
  const length = size.width * size.height * rgbChannels;
  if (drawn !== undefined) {
    return Uint8Array.from({ length }, (_, index) => {
      const pixel = Math.floor(index / rgbChannels);
      return drawn(pixel % size.width, Math.floor(pixel / size.width));
    });
  }
  const written = existsSync(file) ? readFileSync(file) : new Uint8Array();
  return written.length === length
    ? new Uint8Array(written)
    : new Uint8Array(editBytes);
};

const magick = (run: Run): string | Uint8Array => {
  const { args } = run;
  const target = args.at(-1) ?? '';
  if (args[0] === 'identify') {
    return editPattern.test(target) ? editSize : cameraSize;
  }
  if (target === 'rgb:-') {
    return pixelsOf(args[0] ?? '', args);
  }
  if (args[0] === '-size') {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, run.inputBytes);
    return '';
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

/** The assets of the album keepsake made first. */
export const firstAlbum = () => fakeTools.albums[0]?.assets;

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
      return magick(run);
    case 'photos':
      return JSON.stringify(answerPhotos(fakeTools, args));
    default:
      return fakeTools.programs[command]?.(run) ?? '';
  }
};

/** What a program prints, or why it fails. */
const outcomeOf = (run: Run) => {
  // exiftool lists a broken file with the others, as it is.
  const isListing = run.command === 'exiftool' && run.args.includes('-json');
  const isBroken =
    !isListing &&
    run.args.some((arg) =>
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
        Stream.runCollect,
        Effect.map((chunks) => {
          const bytes = new Uint8Array(
            chunks.reduce((length, chunk) => length + chunk.length, 0),
          );
          let at = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, at);
            at += chunk.length;
          }
          return bytes;
        }),
      )
    : Effect.succeed(new Uint8Array());

/** How the program ends: with an exit code, or stopped by a signal. */
const exitCodeOf = (run: Run, error: string) => {
  const signal = fakeTools.killedBy?.(run);
  return signal === undefined
    ? Effect.succeed(ChildProcessSpawner.ExitCode(error === '' ? 0 : 1))
    : Effect.fail(
        PlatformError.systemError({
          _tag: 'Unknown',
          module: 'ChildProcess',
          method: 'exitCode',
          // As the real spawner does, the signal is in the cause.
          cause: new Error(
            `Process interrupted due to receipt of signal: '${signal}'`,
          ),
        }),
      );
};

const spawner = ChildProcessSpawner.make((spawned) =>
  Effect.gen(function* () {
    const inputBytes = ChildProcess.isStandardCommand(spawned)
      ? yield* inputOf(spawned.options.stdin)
      : new Uint8Array();
    const run: Run = ChildProcess.isStandardCommand(spawned)
      ? {
          command: spawned.command,
          args: spawned.args.map(String),
          input: new TextDecoder().decode(inputBytes),
          inputBytes,
          env: spawned.options.env ?? {},
        }
      : { command: '', args: [], input: '', inputBytes, env: {} };
    fakeTools.runs.push(run);
    const paused = fakeTools.pause?.(run);
    if (paused !== undefined) {
      yield* Effect.promise(() => paused);
    }
    const { output, error } = outcomeOf(run);
    const late = fakeTools.late?.(run);
    if (late !== undefined) {
      yield* Effect.promise(() => late);
    }
    const stdout = Stream.make(
      typeof output === 'string' ? new TextEncoder().encode(output) : output,
    );
    return ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(firstPid + fakeTools.runs.length),
      exitCode: exitCodeOf(run, error),
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
