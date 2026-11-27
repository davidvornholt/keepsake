import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import type { CarryingOut } from '../features/light-table/contract.ts';
import {
  judge,
  printed,
  run,
  shootFile,
  shootJson,
} from './command-fixtures.ts';
import { fakeTools, type Run } from './fake-tools.ts';
import {
  change,
  eventually,
  marksOf,
  send,
  shootOf,
} from './light-table-fixtures.ts';

// The page's server runs keepsake for what is handed over. In tests that is
// keepsake itself, in this process, with the fakes of everything outside.

/** The commands that look at photos, which use the test's reviewing model. */
const reviewing = new Set(['edit', 'explain']);

/** The keepsake commands that ended, each as its arguments. */
export const ended: Array<string> = [];

/**
 * Runs the commands the page starts with keepsake as this process's own,
 * with the fake models. `before` may stand in for one, as by failing, or
 * act meanwhile, and `after` runs once one is through, before the server
 * hears of it: one that never ends stands for a server that stops there.
 */
export const keepsakeInProcess = (
  before: (
    args: ReadonlyArray<string>,
  ) => string | undefined | Promise<string | undefined> = () => undefined,
  after: (args: ReadonlyArray<string>) => void | Promise<void> = () =>
    undefined,
) => {
  ended.length = 0;
  const outputs = new Map<Run, { output: string } | { error: string }>();
  fakeTools.pause = (called) => {
    if (called.command !== 'keepsake') {
      return;
    }
    return (async () => {
      const instead = await before(called.args);
      if (instead !== undefined) {
        outputs.set(called, { error: instead });
        ended.push(called.args.join(' '));
        return;
      }
      const extra = reviewing.has(called.args[0] ?? '')
        ? ['--review-model', judge]
        : [];
      const result = await run(...called.args, ...extra);
      ended.push(called.args.join(' '));
      await after(called.args);
      outputs.set(
        called,
        result._tag === 'Success'
          ? { output: JSON.stringify(printed()) }
          : {
              error: JSON.stringify({
                error: {
                  tag: (result.failure as { _tag: string })._tag,
                  message: (result.failure as { message: string }).message,
                },
              }),
            },
      );
    })();
  };
  fakeTools.programs.keepsake = (called) => {
    const outcome = outputs.get(called);
    if (outcome === undefined || 'error' in outcome) {
      throw new Error(outcome?.error ?? 'keepsake didn’t run');
    }
    return outcome.output;
  };
};

/** A keepsake command that fails as another command holds the shoot. */
export const busy = JSON.stringify({
  error: { tag: 'ShootBusy', message: 'Another command is working on it.' },
});

/** What the page ran keepsake for, each as its arguments. */
export const keepsakeRuns = () =>
  fakeTools.runs
    .filter(({ command }) => command === 'keepsake')
    .map(({ args }) => args.join(' '));

type Shown = {
  readonly id: string;
  readonly answer: {
    readonly outcome: string;
    readonly note: string;
    readonly at: string;
  } | null;
};

/** How long a runner test waits for what the server does, at most. */
const runnerPatience = 1500;

/** The marks once each of them is answered, of which there is at least one. */
export const answeredOf = (address: string) =>
  eventually(
    () => marksOf(address) as Promise<readonly [Shown, ...Array<Shown>]>,
    (marks) => marks.length > 0 && marks.every(({ answer }) => answer !== null),
    runnerPatience,
  );

/** What the page shows of how the hand-overs go, once that is `wanted`. */
export const carryingOnceOf = (
  address: string,
  wanted: (carrying: CarryingOut) => boolean,
) =>
  eventually(
    async () => (await shootOf(address)).carrying as CarryingOut,
    wanted,
    runnerPatience,
  );

/** What the page shows once nothing works on the hand-overs, and nothing is left. */
export const restingOf = (address: string) =>
  carryingOnceOf(
    address,
    ({ since, stopped }) =>
      since === null &&
      stopped === null &&
      !existsSync(shootFile('carrying-out.json')),
  );

/** Once the server stopped for the owner's word, with what it waits for. */
export const stopOf = async (address: string) => {
  const { stopped } = await carryingOnceOf(
    address,
    (carrying) => carrying.stopped !== null,
  );
  if (stopped === null) {
    throw new Error('It never stopped.');
  }
  return stopped;
};

/** What `ended` has once `wanted`. */
export const endedOnce = (wanted: (args: string) => boolean) =>
  eventually(
    async () => ended.filter(wanted),
    (found) => found.length > 0,
    runnerPatience,
  );

/** The owner's word to go on with a stop, with what more they pay. */
export const goOn = (address: string, stop: string, dollars = 0) =>
  send('POST', `${address}/api/shoots/lisbon/go-on`, { stop, dollars });

/** A change mark of the photo B, as the page makes it. */
export const markB = (address: string, note = change.note) =>
  send('PUT', `${address}/api/shoots/lisbon/marks`, {
    ...change,
    note,
    boxes: [],
  });

/** The operation an edit was given, from its arguments. */
export const operationOf = (args: string) =>
  args.split('--operation ')[1] ?? '';

/** The noted progress of each mark, while there is any. */
export const progressOf = async () =>
  existsSync(shootFile('carrying-out.json'))
    ? Object.values(
        (await shootJson('carrying-out.json')).marks as Record<
          string,
          {
            readonly operation: string | null;
            readonly before: string | null;
            readonly edited: unknown;
          }
        >,
      )
    : [];

/** The digest of a photo's finished file, as `edit` prints it. */
export const finalDigestOf = async (photo: string) =>
  createHash('sha256')
    .update(await readFile(shootFile('edits', photo, `${photo}-keepsake.jpg`)))
    .digest('hex');

/**
 * Makes what was published of a photo another picture than its finished
 * file, in Immich and in what keepsake noted of it: the fake image model's
 * pictures are all alike, and a change isn't.
 */
export const publishedBefore = async (photo: string) => {
  const asset = fakeTools.library.find(({ file }) =>
    file.endsWith(`${photo}-keepsake.jpg`),
  );
  if (asset === undefined) {
    throw new Error(`${photo} was never published.`);
  }
  asset.checksum = 'what was published before';
  const noted = shootFile('publication.json');
  const digest = await finalDigestOf(photo);
  await writeFile(
    noted,
    (await readFile(noted, 'utf8')).replaceAll(digest, 'published before'),
  );
};
