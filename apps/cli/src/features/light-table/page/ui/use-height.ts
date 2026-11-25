import { useEffect, useRef, useState } from 'react';

/** The height of an element, kept up to date, such as the bar's above the table. */
export const useHeight = <Kind extends HTMLElement>(fallback: number) => {
  const ref = useRef<Kind>(null);
  const [height, setHeight] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(element.offsetHeight)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, height };
};
