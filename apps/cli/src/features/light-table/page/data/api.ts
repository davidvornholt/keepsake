import type {
  Changed,
  Mark,
  NewLabels,
  NewMark,
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
): Promise<ReadonlyArray<Mark>> =>
  (await send('POST', pathOf(shoot, '/hand-over'))).json();

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
