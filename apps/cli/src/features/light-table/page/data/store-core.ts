import type { ShootView } from '../../contract.ts';
import { Problem, readShoot, readShoots, unreachable } from './api.ts';
import { isDraft } from './changes.ts';
import { indexOf } from './derive.ts';
import { makeHeld } from './store-state.ts';

// What every part of the store shares: the way the shoot is read from
// keepsake, and the way a change is sent to it.

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong.';

/** How long until keepsake is asked again after it didn't answer, in milliseconds. */
const askAgainAfter = 2000;

/**
 * Whether the list of shoots answers and doesn't have this one. The server
 * says so only in words, which may change.
 */
const isUnknown = async (name: string): Promise<boolean> => {
  try {
    const { shoots } = await readShoots();
    return !shoots.some((shoot) => shoot.name === name);
  } catch {
    return false;
  }
};

/** Whether loading failed because there is no such shoot. */
const isGone = async (
  name: string,
  error: unknown,
  isShown: boolean,
): Promise<boolean> =>
  (error instanceof Problem && error.isMissing) ||
  (!isShown && (await isUnknown(name)));

/**
 * What settles once nothing is sent any more, and keepsake was read after
 * that.
 */
const quietOnce = (isQuiet = false) => {
  let settle: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  if (isQuiet) {
    settle();
  }
  return { promise, settle };
};

/** What goes on in the shoot now, as keepsake said. */
const goingOnIn = ({
  activity,
  preparation,
  carrying,
  isChoiceBusy,
}: ShootView) => ({ activity, preparation, carrying, isChoiceBusy });

export const makeCore = (name: string) => {
  const held = makeHeld();
  const { set, get } = held;
  let inFlight = 0;
  /** The id keepsake gave to each draft, once it has. */
  const saved = new Map<string, Promise<string | null>>();
  /** The shoot as keepsake last gave it. */
  let known: ShootView | null = null;
  /** Whether a change was shown that keepsake never got. */
  let isAhead = false;
  let again: ReturnType<typeof setTimeout> | undefined;
  /** Whether nobody looks at the shoot any more. */
  let isResting = false;
  /** Why the last change didn't reach keepsake, until that is dismissed. */
  let lost: string | null = null;
  let quiet = quietOnce(true);

  /** Shows what keepsake has, and nothing that never reached it. */
  const fallBack = () => {
    if (isAhead && known !== null && inFlight === 0) {
      isAhead = false;
      set({ index: indexOf(known) });
    }
  };

  /**
   * Takes what keepsake says, unless a change under way is newer, and what
   * goes on unless keepsake told newer meanwhile.
   */
  const take = (shoot: ShootView, isLive: boolean) => {
    if (inFlight > 0) {
      return;
    }
    const { problem } = get();
    known = shoot;
    isAhead = false;
    held.forgetFailed(shoot.choices);
    set({
      status: 'ready',
      index: indexOf(shoot),
      ...(isLive ? goingOnIn(shoot) : {}),
      // It answers again, so the notice that it doesn't has had its day,
      // unless a change was lost meanwhile.
      problem: problem === unreachable ? lost : problem,
    });
  };

  /** Says that loading failed, and asks again while the shoot is on the table. */
  const fail = (error: unknown, isMissing: boolean, askAgain: () => void) => {
    if (get().index === null) {
      set({ status: isMissing ? 'missing' : 'failed' });
    } else if (!isMissing) {
      fallBack();
      clearTimeout(again);
      again = isResting ? undefined : setTimeout(askAgain, askAgainAfter);
    }
    set({ problem: isMissing ? null : messageOf(error) });
  };

  /** How many reads were begun, so that an answer to an older one is left alone. */
  let reads = 0;

  const load = async (): Promise<void> => {
    clearTimeout(again);
    reads += 1;
    const read = reads;
    const told = held.told();
    try {
      const shoot = await readShoot(name);
      if (read === reads) {
        take(shoot, held.told() === told);
      }
    } catch (error) {
      const isMissing = await isGone(name, error, get().index !== null);
      if (read === reads) {
        fail(error, isMissing, () => {
          load().catch(() => undefined);
        });
      }
    }
  };

  return {
    ...held,
    name,
    saved,
    load,
    /** Whether the shoot is left alone, so that nothing is asked again. */
    rest: (does: boolean) => {
      isResting = does;
      clearTimeout(again);
    },
    isBusy: () => inFlight > 0,
    /** Waits until nothing is sent, and keepsake was read after that. */
    whenQuiet: () => quiet.promise,
    dismissProblem: () => {
      lost = null;
      set({ problem: null });
    },
    /** Sends a change, and puts things right when it fails. */
    send: async <Answer>(
      work: () => Promise<Answer>,
    ): Promise<Answer | null> => {
      inFlight += 1;
      quiet = inFlight === 1 ? quietOnce() : quiet;
      try {
        return await work();
      } catch (error) {
        isAhead = true;
        lost = messageOf(error);
        held.setUndos([]);
        set({ problem: lost });
        return null;
      } finally {
        inFlight -= 1;
        if (inFlight === 0) {
          await load().then(quiet.settle);
        }
      }
    },
    /** The id keepsake knows a mark by, once it has saved it. */
    idOf: async (id: string): Promise<string | null> =>
      isDraft(id) ? ((await saved.get(id)) ?? null) : id,
  };
};

export type Core = ReturnType<typeof makeCore>;
