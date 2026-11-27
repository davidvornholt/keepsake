import { editLisbon, pickLisbon, runOk } from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { eventually, send, shootOf } from './light-table-fixtures.ts';

/** Why a photo goes out that the owner took out without a reason. */
export const outReason = 'You didn’t want it in the album.';

export type Wanted = {
  readonly photo: string;
  readonly wants: 'in' | 'out';
  readonly because?: string | null;
  readonly instead?: string | null;
};

/** What the page sends when the owner puts a photo in or takes one out. */
export const choose = (address: string, wanted: Wanted) =>
  send('POST', `${address}/api/shoots/lisbon/choices`, {
    because: wanted.wants === 'out' ? outReason : null,
    instead: null,
    ...wanted,
  });

export const choicesOf = async (address: string) =>
  (await shootOf(address)).choices;

/** A choice as the page has it. */
type Seen = {
  readonly action: string;
  readonly photo: string;
  readonly wants: 'in' | 'out';
  readonly failed: string | null;
};

/** How often to look whether what waits was done: for some seconds. */
const patiently = 600;

/** The choices once nothing waits any more, as what failed stays. */
export const settled = (address: string) =>
  eventually(
    () => choicesOf(address),
    (choices: ReadonlyArray<Seen>) =>
      choices.every(({ failed }) => failed !== null),
    patiently,
  );

export const publishLisbon = async () => {
  await pickLisbon();
  await editLisbon();
  await runOk('publish', 'lisbon');
};

/** The photos in the album in Immich, by their file. */
export const inImmich = () =>
  (fakeTools.albums[0]?.assets ?? []).map(
    ({ fileName }) => fileName.split('-')[0],
  );

export const standingOf = async (photo: string) =>
  (await runOk('show', 'lisbon', photo)).standing;

/** Holds the upload of a photo's finished file until `resume`. */
export const pauseUploadOf = (photo: string) => {
  const reached = Promise.withResolvers<void>();
  const resumed = Promise.withResolvers<void>();
  fakeTools.pause = ({ command, args }) => {
    if (
      command === 'photos' &&
      args[0] === 'upload' &&
      args.some((arg) => arg.endsWith(`${photo}-keepsake.jpg`))
    ) {
      reached.resolve();
      return resumed.promise;
    }
  };
  return { reached: reached.promise, resume: () => resumed.resolve() };
};
