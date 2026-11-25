import type {
  Changed,
  Favorite,
  FolderList,
  FolderLook,
  HandOver,
  Mark,
  NewLabels,
  NewMark,
  NewShoot,
  ShootList,
  ShootView,
} from '../../contract.ts';

// Everything the page asks of keepsake.

const notFound = 404;

/** What went wrong, in words for the owner. */
export class Problem extends Error {
  readonly isMissing: boolean;

  constructor(message: string, isMissing = false) {
    super(message);
    this.name = 'Problem';
    this.isMissing = isMissing;
  }
}

/** Said when keepsake can't be reached at all. */
export const unreachable =
  'Keepsake doesn’t answer. Start it again; your marks so far are saved.';

const ask = async (path: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(path, init).catch(() => {
    throw new Problem(unreachable);
  });
  if (response.ok) {
    return response;
  }
  const said: unknown = await response.json().catch(() => null);
  const message =
    typeof said === 'object' && said !== null && 'error' in said
      ? String(said.error)
      : `Keepsake answered with an error (${response.status}).`;
  throw new Problem(message, response.status === notFound);
};

const send = (method: string, path: string, body?: unknown) =>
  ask(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });

const pathOf = (shoot: string, rest = '') =>
  `/api/shoots/${encodeURIComponent(shoot)}${rest}`;

export const readShoots = async (): Promise<ShootList> =>
  (await ask('/api/shoots')).json();

export const readShoot = async (shoot: string): Promise<ShootView> =>
  (await ask(pathOf(shoot))).json();

export const makeMark = async (shoot: string, mark: NewMark): Promise<Mark> =>
  (await send('PUT', pathOf(shoot, '/marks'), mark)).json();

export const takeBackMark = async (
  shoot: string,
  id: string,
): Promise<void> => {
  await send('DELETE', pathOf(shoot, `/marks/${encodeURIComponent(id)}`));
};

export const seeMark = async (shoot: string, id: string): Promise<void> => {
  await send('POST', pathOf(shoot, `/marks/${encodeURIComponent(id)}/seen`));
};

export const handOverMarks = async (
  shoot: string,
  agreed: HandOver,
): Promise<ReadonlyArray<Mark>> =>
  (await send('POST', pathOf(shoot, '/hand-over'), agreed)).json();

/** Has an agent act on what was handed over before. */
export const askForAgent = async (shoot: string): Promise<void> => {
  await send('POST', pathOf(shoot, '/agent'));
};

/** Sets or takes away the favorite heart of a photo in Immich. */
export const saveFavorite = async (
  shoot: string,
  favorite: Favorite,
): Promise<void> => {
  await send('PUT', pathOf(shoot, '/favorites'), favorite);
};

export const readFolders = async (): Promise<FolderList> =>
  (await ask('/api/folders')).json();

export const lookIntoFolder = async (path: string): Promise<FolderLook> =>
  (await ask(`/api/folders/look?path=${encodeURIComponent(path)}`)).json();

/** Makes a shoot of a folder, and says what it is called. */
export const makeShoot = async (wanted: NewShoot): Promise<string> => {
  const made: { readonly name: string } = await (
    await send('POST', '/api/shoots', wanted)
  ).json();
  return made.name;
};

/** Goes on with getting a shoot ready, after it stopped. */
export const goOnPreparing = async (shoot: string): Promise<void> => {
  await send('POST', pathOf(shoot, '/prepare'));
};

/** Throws a shoot away. The folder with its photos stays. */
export const forgetShoot = async (shoot: string): Promise<void> => {
  await send('DELETE', pathOf(shoot));
};

export const saveLabels = async (
  shoot: string,
  labels: NewLabels,
): Promise<void> => {
  await send('PUT', pathOf(shoot, '/labels'), labels);
};

export type Rating = {
  readonly moment: string;
  readonly best: string | null;
  readonly stars: number;
  readonly further: ReadonlyArray<string>;
};

export const saveRating = async (
  shoot: string,
  rating: Rating,
): Promise<void> => {
  await send('POST', pathOf(shoot, '/ratings'), rating);
};

type Listening = {
  readonly onChanged: (changed: Changed) => void;
  readonly onConnection: (isConnected: boolean) => void;
};

/** Listens to what changes in a shoot, until the returned function is called. */
export const listenTo = (shoot: string, listening: Listening): (() => void) => {
  const events = new EventSource(pathOf(shoot, '/events'));
  events.addEventListener('changed', (event) => {
    listening.onChanged(JSON.parse(event.data));
  });
  events.addEventListener('open', () => listening.onConnection(true));
  events.addEventListener('error', () => listening.onConnection(false));
  return () => events.close();
};
