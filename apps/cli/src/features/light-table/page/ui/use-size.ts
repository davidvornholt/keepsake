import { type RefObject, useEffect, useState } from 'react';

type Size = { readonly width: number; readonly height: number };

const nothing: Size = { width: 0, height: 0 };

/** The size of an element, kept up to date. Nothing until it is measured. */
export const useSize = (ref: RefObject<HTMLElement | null>): Size => {
  const [size, setSize] = useState(nothing);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const measure = () =>
      setSize((before) =>
        before.width === element.clientWidth &&
        before.height === element.clientHeight
          ? before
          : { width: element.clientWidth, height: element.clientHeight },
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [ref]);
  return size;
};
