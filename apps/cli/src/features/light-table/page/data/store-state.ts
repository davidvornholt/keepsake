import type {
  Activity,
  CarryingOut,
  Mark,
  NewChoice,
  NewMark,
  Preparation,
  ShootView,
} from '../../contract.ts';
import { type Index, indexOf } from './derive.ts';

// What the page knows of a shoot at this moment, and who is told when it
// changes.

export type ShootState = {
  readonly status: 'loading' | 'ready' | 'missing' | 'failed';
  readonly index: Index | null;
  readonly activity: Activity | null;
  readonly preparation: Preparation | null;
  /** How what was handed over is carried out, as keepsake last said. */
  readonly carrying: CarryingOut;
  readonly isConnected: boolean;
  /** What went wrong last, until it is dismissed. */
  readonly problem: string | null;
  /** Something worth knowing for a moment, such as why a key did nothing. */
  readonly hint: string | null;
  /** What Undo takes back or brings back, if anything. */
  readonly undoable: Undo | null;
  /** The changes keepsake didn't get, by photo, until they are written again. */
  readonly unsaved: Readonly<Record<string, NewMark>>;
};

export type Undo =
  | {
      readonly did: 'made';
      readonly mark: Mark;
      readonly replaced: Mark | null;
    }
  | { readonly did: 'took-back'; readonly mark: Mark }
  /** A photo put in or taken out, which `back` undoes. */
  | { readonly did: 'chose'; readonly back: NewChoice }
  | {
      readonly did: 'favorite';
      readonly photo: string;
      /** Whether it was a favorite before. */
      readonly was: boolean;
    };

const initial: ShootState = {
  status: 'loading',
  index: null,
  activity: null,
  preparation: null,
  carrying: { since: null, stopped: null },
  isConnected: true,
  problem: null,
  hint: null,
  undoable: null,
  unsaved: {},
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
