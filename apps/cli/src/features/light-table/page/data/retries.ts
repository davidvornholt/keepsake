// When something that didn't arrive is asked for again: soon at first, and
// less and less often. A keepsake that is away, or a picture that can't be
// had, isn't asked for with every frame that is drawn.

const firstWait = 1000;
export const longestWait = 30_000;
const growth = 2;

type Wait = { readonly wait: number; readonly until: number };

/** How long to wait after something failed once more, in milliseconds. */
export const waitAfter = (before: number | null): number =>
  before === null ? firstWait : Math.min(longestWait, before * growth);

export const makeRetries = (onDue: () => void) => {
  const waits = new Map<string, Wait>();
  return {
    failed: (key: string) => {
      const wait = waitAfter(waits.get(key)?.wait ?? null);
      waits.set(key, { wait, until: performance.now() + wait });
      setTimeout(onDue, wait);
    },
    arrived: (key: string) => {
      waits.delete(key);
    },
    /** Whether it failed so recently that it isn't asked for yet. */
    isHeld: (key: string): boolean =>
      performance.now() < (waits.get(key)?.until ?? 0),
  };
};
