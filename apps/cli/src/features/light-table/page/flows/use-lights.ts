import { type RefObject, useEffect } from 'react';
import type { Engine } from '../sheet/engine.ts';

/**
 * Turns the lights of the table down for as long as something lies over it.
 * Without a level it leaves them to whatever is shown next.
 */
export const useLights = (
  engineRef: RefObject<Engine | null>,
  level: number | null,
): void => {
  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null || level === null) {
      return;
    }
    engine.table.lights.target = level;
    engine.request();
    return () => {
      engine.table.lights.target = 1;
      engine.request();
    };
  }, [engineRef, level]);
};
