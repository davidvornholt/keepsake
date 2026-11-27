import { useShootContext } from '../app/shoot-context.ts';
import { count, dollarsOf } from '../data/format.ts';
import { Meter } from '../ui/controls.tsx';
import { GoOn } from './go-on.tsx';
import { useCarrying } from './use-carrying.ts';
import { Working } from './working.tsx';

// How keepsake carries out what was handed over, and what it waits for when
// it can't go on without the owner.

const Pulse = () => (
  <span
    aria-hidden="true"
    className="pencil-pulse size-2.5 shrink-0 rounded-full border-2 border-pencil-blue"
  />
);

/** How far the album that was ordered has got. */
const Ordered = () => {
  const { index } = useShootContext();
  const { ordered, photos } = index.shoot;
  if (ordered === null) {
    return null;
  }
  const picked = photos.filter(({ standing }) => standing.kind === 'picked');
  const edited = picked.filter(({ edit }) => edit !== null).length;
  const whole = picked.length;
  return (
    <div className="mt-4">
      <p className="flex flex-wrap items-baseline gap-x-3 text-print">
        <span>
          {index.hasAlbum ? 'More photos are' : 'The album is'} ordered, for at
          most {dollarsOf(ordered.dollars)}.
        </span>
        <span className="type-edge tabular text-quiet">
          {edited} of {count(whole, 'photo')} edited
        </span>
      </p>
      <Meter
        className="mt-2 w-full"
        label={`${edited} of ${whole} photos edited`}
        share={whole === 0 ? 0 : edited / whole}
      />
      <p className="mt-2 text-quiet">
        Finished photos go into the album in Immich together, at the end.
      </p>
    </div>
  );
};

/** What keepsake does about what it was given, or what it waits for. */
export const CarryingStatus = () => {
  const { state } = useShootContext();
  const carrying = useCarrying();
  if (carrying.is === 'idle') {
    return state.activity === null ? null : (
      <Working activity={state.activity} />
    );
  }
  return (
    <div>
      {carrying.is === 'stopped' ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="min-w-0 flex-1 basis-64 text-print">
            <span className="type-label block text-lamp">Waits for you</span>
            {carrying.stopped.reason}
          </p>
          <GoOn carrying={carrying} />
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-pencil-blue">
          <Pulse />
          <span>Keepsake is at work on it.</span>
        </p>
      )}
      {state.activity === null ? null : (
        <div className="mt-3">
          <Working activity={state.activity} />
        </div>
      )}
      <Ordered />
    </div>
  );
};
