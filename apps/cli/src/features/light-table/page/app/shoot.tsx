import { useEffect } from 'react';
import { endArrival, isArriving } from '../shoots/arrival.ts';
import { noteOpened } from '../shoots/opened.ts';
import { mainButton, sideButton } from '../ui/classes.ts';
import { useTitle } from '../ui/use-title.ts';
import { Loaded } from './loaded.tsx';
import type { Within } from './route.ts';
import { go } from './router.ts';
import { useShoot } from './use-shoot.ts';

/** What is shown while there is no shoot to show. */
const Waiting = ({
  status,
  name,
  problem,
  onRetry,
}: {
  readonly status: 'loading' | 'ready' | 'missing' | 'failed';
  readonly name: string;
  readonly problem: string | null;
  readonly onRetry: () => void;
}) => {
  useTitle(name);
  const hasNoShoot = status === 'missing' || status === 'failed';
  useEffect(() => {
    if (hasNoShoot) {
      endArrival();
    }
  }, [hasNoShoot]);
  if (status === 'missing') {
    return (
      <main className="grid h-full place-items-center p-6">
        <div className="max-w-[28rem]">
          <h1 className="type-name text-lamp text-xl">
            There is no album called {name}.
          </h1>
          <button
            className={`${mainButton} mt-6`}
            onClick={() => go({ screen: 'shoots' }, 'replace')}
            type="button"
          >
            All albums
          </button>
        </div>
      </main>
    );
  }
  if (status === 'failed') {
    return (
      <main className="grid h-full place-items-center p-6">
        <div className="max-w-[28rem]">
          <h1 className="type-name text-lamp text-xl">
            Keepsake doesn’t answer.
          </h1>
          {problem === null ? null : (
            <p className="mt-2 text-quiet">{problem}</p>
          )}
          <button
            className={`${sideButton} mt-6`}
            onClick={onRetry}
            type="button"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }
  // The photos of the start are still there and wait for the table.
  if (isArriving(name)) {
    return <main aria-busy="true" className="h-full" />;
  }
  return (
    <main aria-busy="true" className="relative h-full overflow-hidden">
      <div className="paper-waits absolute inset-x-1.5 top-36 bottom-0 bg-sheet shadow-[0_3px_9px_var(--color-shade)] sm:inset-x-[22px] sm:top-[118px]">
        <p className="type-edge late-arrival px-2.5 pt-[7px] text-quiet">
          Laying out the photos
        </p>
      </div>
    </main>
  );
};

export const Shoot = ({ route }: { readonly route: Within }) => {
  const { state, store } = useShoot(route.shoot);
  useEffect(() => noteOpened(route.shoot), [route.shoot]);
  if (state.index === null) {
    return (
      <Waiting
        name={route.shoot}
        onRetry={store.reload}
        problem={state.problem}
        status={state.status}
      />
    );
  }
  return (
    <Loaded index={state.index} route={route} state={state} store={store} />
  );
};
