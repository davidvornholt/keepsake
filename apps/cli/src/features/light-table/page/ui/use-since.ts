import { useState } from 'react';

/**
 * When something appeared, in milliseconds, so that it can be drawn by hand
 * from that moment. Null for what was there from the start.
 */
export const useSince = (key: string | null): number | null => {
  const [held, setHeld] = useState<{
    readonly key: string | null;
    readonly since: number | null;
  }>({ key, since: null });
  if (held.key !== key) {
    setHeld({ key, since: performance.now() });
  }
  return held.key === key ? held.since : performance.now();
};
