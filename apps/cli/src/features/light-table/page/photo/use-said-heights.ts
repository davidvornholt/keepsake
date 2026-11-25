import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

// What is said about a photo can be a few words or many lines, and all of
// it is to be read. So that a photo, and those before and after it, have
// their place from the start, what is said about each is laid out once more
// where nobody sees it, and measured here.

/** How tall what is said about a photo is, by the photo. */
export type SaidHeights = ReadonlyMap<string, number>;

const measure = (element: HTMLElement): SaidHeights =>
  new Map(
    [...element.children].flatMap((child) =>
      child instanceof HTMLElement && child.dataset.of !== undefined
        ? [[child.dataset.of, child.offsetHeight] as const]
        : [],
    ),
  );

const isSame = (one: SaidHeights, other: SaidHeights): boolean =>
  one.size === other.size &&
  [...one].every(([photo, height]) => other.get(photo) === height);

export const useSaidHeights = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<SaidHeights>(new Map());
  const take = useCallback(() => {
    if (ref.current !== null) {
      const now = measure(ref.current);
      setHeights((known) => (isSame(known, now) ? known : now));
    }
  }, []);
  useLayoutEffect(take);
  // They also change on their own, such as when the typeface arrives.
  useEffect(() => {
    if (ref.current === null) {
      return;
    }
    const observer = new ResizeObserver(take);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [take]);
  return { ref, heights };
};
