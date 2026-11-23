// biome-ignore-all lint/style/useNamingConvention: exiftool's names for the tags
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Effect, Layer, Sink, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** A program that was run. */
type Run = { readonly command: string; readonly args: ReadonlyArray<string> };

const greyPixels = 72;
const cameraSize = '7008 4672';

const pad = (value: number) => String(value).padStart(2, '0');

const tagsOf = (file: string, taken: string) => ({
  SourceFile: file,
  SubSecDateTimeOriginal: taken,
  FileModifyDate: taken,
  Model: 'ILCE-7M4',
  Orientation: 1,
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
  /** RAW files ImageMagick can't read. */
  broken: new Set<string>(),
};

export const resetTools = () => {
  fakeTools.runs = [];
  fakeTools.files = [];
  fakeTools.uploads = [];
  fakeTools.broken = new Set();
};

const exiftool = (args: ReadonlyArray<string>): string => {
  if (args[0] !== '-json') {
    return '';
  }
  const folder = args.at(-1) ?? '';
  return JSON.stringify(
    fakeTools.files.map(({ file, second }) =>
      tagsOf(
        `${folder}/${file}`,
        `2026:03:30 10:${pad(Math.floor(second / 60))}:${pad(second % 60)}`,
      ),
    ),
  );
};

const magick = (args: ReadonlyArray<string>): string | Uint8Array => {
  const target = args.at(-1) ?? '';
  if (args[0] === 'identify') {
    return cameraSize;
  }
  if (target === 'gray:-') {
    return new Uint8Array(greyPixels);
  }
  if (target === 'jpg:-') {
    return 'a picture';
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, 'a picture');
  return '';
};

const album = { id: 'album-1', name: 'Lisbon, May 2026' };

const photos = (args: ReadonlyArray<string>): unknown => {
  switch (`${args[0]} ${args[1]}`) {
    case 'albums list':
      return [];
    case 'albums create':
      return { ...album, name: args[2] };
    case 'tags list':
      return [];
    default:
      if (args[0] !== 'upload') {
        return {};
      }
      fakeTools.uploads.push(args[1] ?? '');
      return {
        files: [
          { status: 'created', assetId: `asset-${fakeTools.uploads.length}` },
        ],
      };
  }
};

const answer = ({ command, args }: Run): string | Uint8Array => {
  switch (command) {
    case 'exiftool':
      return exiftool(args);
    case 'magick':
      return magick(args);
    case 'photos':
      return JSON.stringify(photos(args));
    default:
      return '';
  }
};

const firstPid = 1000;

const spawner = ChildProcessSpawner.make((spawned) =>
  Effect.sync(() => {
    const run: Run = ChildProcess.isStandardCommand(spawned)
      ? { command: spawned.command, args: spawned.args.map(String) }
      : { command: '', args: [] };
    fakeTools.runs.push(run);
    const isBroken = run.args.some((arg) =>
      [...fakeTools.broken].some((file) => arg.endsWith(file)),
    );
    const output = isBroken ? '' : answer(run);
    const stdout = Stream.make(
      typeof output === 'string' ? new TextEncoder().encode(output) : output,
    );
    return ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(firstPid + fakeTools.runs.length),
      exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(isBroken ? 1 : 0)),
      isRunning: Effect.succeed(false),
      kill: () => Effect.void,
      stdin: Sink.drain,
      stdout,
      stderr: Stream.make(
        new TextEncoder().encode(isBroken ? 'unreadable file' : ''),
      ),
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
