import type { Activity, Mark, ShootView } from '../../contract.ts';
import { type Index, indexOf } from './derive.ts';

// What the page knows of a shoot at this moment, and who is told when it
// changes.

export type ShootState = {
  readonly status: 'loading' | 'ready' | 'missing' | 'failed';
  readonly index: Index | null;
  readonly activity: Activity | null;
  readonly agentWaitsSince: string | null;
  readonly isConnected: boolean;
  /** What went wrong last, until it is dismissed. */
  readonly problem: string | null;
  /** Something worth knowing for a moment, such as why a key did nothing. */
  readonly hint: string | null;
  /** The mark that Undo takes back or brings back, if any. */
  readonly undoable: Undo | null;
};

export type Undo =
  | {
      readonly did: 'made';
      readonly mark: Mark;
      readonly replaced: Mark | null;
    }
  | { readonly did: 'took-back'; readonly mark: Mark };

const initial: ShootState = {
  status: 'loading',
  index: null,
  activity: null,
  agentWaitsSince: null,
  isConnected: true,
  problem: null,
  hint: null,
  undoable: null,
};

type Marks = ReadonlyArray<Mark>;

export const makeHeld = () => {
  let state = initial;
  let undos: ReadonlyArray<Undo> = [];
  const listeners = new Set<() => void>();

  const set = (next: Partial<ShootState>) => {
    state = { ...state, ...next, undoable: undos.at(-1) ?? null };
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    set,
    get: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    undos: () => undos,
    setUndos: (next: ReadonlyArray<Undo>) => {
      undos = next;
      set({});
    },
    setShoot: (shoot: ShootView) => set({ index: indexOf(shoot) }),
    setMarks: (next: (marks: Marks) => Marks) => {
      const shoot = state.index?.shoot;
      if (shoot !== undefined) {
        set({ index: indexOf({ ...shoot, marks: next(shoot.marks) }) });
      }
    },
  };
};
