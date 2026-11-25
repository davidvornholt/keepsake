import { useEffect } from 'react';

const name = 'Keepsake';

/** Names the tab after what is shown. */
export const useTitle = (...parts: ReadonlyArray<string | null>): void => {
  const title = [...parts.filter((part) => part !== null), name].join(' · ');
  useEffect(() => {
    document.title = title;
  }, [title]);
};
