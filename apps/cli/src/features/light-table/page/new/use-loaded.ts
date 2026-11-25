import { useEffect, useState } from 'react';

// Something keepsake is asked for once, for as long as it is shown.

export type Loaded<Value> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: Value }
  | { readonly status: 'failed'; readonly problem: string };

const loading = { status: 'loading' } as const;

/** Asks for something, and again when the key changes or `retry` is called. */
export const useLoaded = <Value>(
  key: string,
  load: () => Promise<Value>,
): { readonly loaded: Loaded<Value>; readonly retry: () => void } => {
  const [loaded, setLoaded] = useState<Loaded<Value>>(loading);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: asking again is what `key` and `attempt` are for; `load` is a new function every time
  useEffect(() => {
    let isWanted = true;
    setLoaded(loading);
    load().then(
      (value) => {
        if (isWanted) {
          setLoaded({ status: 'ready', value });
        }
      },
      (error: unknown) => {
        if (isWanted) {
          setLoaded({
            status: 'failed',
            problem:
              error instanceof Error ? error.message : 'Something went wrong.',
          });
        }
      },
    );
    return () => {
      isWanted = false;
    };
  }, [key, attempt]);
  return { loaded, retry: () => setAttempt((times) => times + 1) };
};
