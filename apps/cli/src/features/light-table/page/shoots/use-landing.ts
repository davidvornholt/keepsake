import { type RefObject, useEffect, useEffectEvent } from 'react';
import type { PhotoView } from '../../contract.ts';
import type { Engine } from '../sheet/engine.ts';
import { restingOnScreen } from '../sheet/table.ts';
import {
  endArrival,
  isArriving,
  landArrival,
  targetsOf,
  useArrival,
} from './arrival.ts';

/**
 * Sends the photos that came along from the start to where they lie on the
 * table, once the table is laid out.
 */
export const useLanding = (
  shoot: string,
  photos: ReadonlyArray<PhotoView>,
  engineRef: RefObject<Engine | null>,
): void => {
  const arrival = useArrival();
  const isWaited = arrival !== null && arrival.targets === null;

  const land = useEffectEvent(() => {
    const engine = engineRef.current;
    if (engine === null || arrival === null) {
      endArrival();
      return;
    }
    const { table } = engine;
    landArrival(
      shoot,
      targetsOf(arrival.flying, photos, (id) => restingOnScreen(table, id)),
    );
  });

  useEffect(() => {
    if (!(isWaited && isArriving(shoot))) {
      return;
    }
    // A frame later the bar is measured, and the frames lie where they stay.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(land);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [isWaited, shoot]);
};
