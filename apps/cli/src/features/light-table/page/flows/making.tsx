import { Check } from 'lucide-react';
import { useState } from 'react';
import type { Place } from '../app/route.ts';
import { go } from '../app/router.ts';
import { useShootContext } from '../app/shoot-context.ts';
import {
  percentOf,
  preparedAtLeast,
  preparedShare,
  preparing,
  progressOf,
  stepName,
} from '../data/activity.ts';
import { count } from '../data/format.ts';
import { mainButton, quietButton } from '../ui/classes.ts';
import { Confirm } from '../ui/confirm.tsx';
import { Key, Meter } from '../ui/controls.tsx';
import { GoOn } from './go-on.tsx';
import { makingOf } from './making-of.ts';
import { useCarrying } from './use-carrying.ts';
import { useTimeLeft } from './use-time-left.ts';

// An album being made, said at the foot of its table from the first photo
// that is read to the last one that is edited: keepsake gets it ready, the
// owner goes over the choice and orders it, and keepsake has it edited.

const checkSize = 12;
const panel =
  'pointer-events-auto mx-3 mb-3 w-[min(44rem,calc(100%-1.5rem))] bg-sheet px-5 py-4 shadow-[0_6px_28px_var(--color-shade)]';

/** Throws the album away, once the owner has said that they mean it. */
const ThrowAway = () => {
  const { index, store } = useShootContext();
  const [isAsked, setIsAsked] = useState(false);
  const name = index.shoot.title;
  return (
    <>
      <button
        className={`${quietButton} min-h-10`}
        onClick={() => setIsAsked(true)}
        type="button"
      >
        Throw away
      </button>
      {isAsked ? (
        <Confirm
          no="Keep it"
          onNo={() => setIsAsked(false)}
          onYes={() => {
            setIsAsked(false);
            store.forget().then(
              (isGone) => (isGone ? go({ screen: 'shoots' }, 'replace') : null),
              () => null,
            );
          }}
          title={`Throw away “${name}”?`}
          yes="Throw away"
        >
          <p>
            What keepsake chose and wrote down for this album is thrown away,
            and your marks on it. The folder with your photos isn’t touched, so
            you can make the album again.
          </p>
        </Confirm>
      ) : null}
    </>
  );
};

/** The steps that get an album ready: those done, the one now, those to come. */
const Step = ({
  step,
  is,
  isStopped,
}: {
  readonly step: string;
  readonly is: 'done' | 'now' | 'to-come';
  readonly isStopped: boolean;
}) => {
  const { state } = useShootContext();
  const dot =
    is === 'now' ? `bg-current ${isStopped ? '' : 'pencil-pulse'}` : '';
  return (
    <li
      aria-current={is === 'now' ? 'step' : undefined}
      className="flex items-center gap-1.5 text-quiet aria-[current=step]:text-lamp"
    >
      {is === 'done' ? (
        <Check aria-hidden="true" size={checkSize} strokeWidth={3} />
      ) : (
        <span
          aria-hidden="true"
          className={`size-2 rounded-full border border-current ${dot}`}
        />
      )}
      {stepName({ step, done: 0, total: 0, photos: [] })}
      {is === 'now' && state.activity !== null ? (
        <span className="tabular text-quiet">{progressOf(state.activity)}</span>
      ) : null}
      {is === 'done' ? <span className="sr-only">, done</span> : null}
    </li>
  );
};

const Steps = ({
  at,
  isStopped,
}: {
  readonly at: number;
  readonly isStopped: boolean;
}) => (
  <ol className="type-edge mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
    {preparing.map(({ step }, index) => {
      const before = index < at ? 'done' : 'to-come';
      return (
        <Step
          is={index === at ? 'now' : before}
          isStopped={isStopped}
          key={step}
          step={step}
        />
      );
    })}
  </ol>
);

/** Keepsake gets the album ready, or stopped doing so. */
const GettingReady = ({ stopped }: { readonly stopped: string | null }) => {
  const { index, state, store } = useShootContext();
  const found = preparing.findIndex(
    ({ step }) => step === state.activity?.step,
  );
  // Between two steps nothing is said; the one before then still counts.
  const least = preparedAtLeast({
    photos: index.shoot.photos.length,
    chosen: index.chosen,
  });
  const [reached, setReached] = useState(least);
  const share = Math.max(
    reached.share,
    least.share,
    preparedShare(state.activity),
  );
  const at = Math.max(reached.at, least.at, found);
  if (at !== reached.at || share !== reached.share) {
    setReached({ at, share });
  }
  const left = useTimeLeft(stopped === null ? share : null);
  return (
    <section aria-label="Getting the album ready" className={panel}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="type-name text-[1.0625rem] text-lamp">
          {stopped === null
            ? 'Keepsake is getting the album ready'
            : 'Getting the album ready has stopped'}
        </h2>
        <p className="type-edge tabular ml-auto flex gap-x-4 text-print">
          {left === null ? null : <span className="text-quiet">{left}</span>}
          <span>{percentOf(share)}</span>
        </p>
      </div>
      <Meter
        className="mt-3 w-full"
        label={`${percentOf(share)} ready`}
        share={share}
      />
      <Steps at={at} isStopped={stopped !== null} />
      {stopped === null ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4">
          <p className="min-w-0 flex-1 basis-64 text-quiet">
            It looks at every photo, puts those that show the same in one stack,
            and chooses the best. It goes on when you leave.
          </p>
          <ThrowAway />
        </div>
      ) : (
        <>
          <p className="mt-3 text-wax-yellow" role="alert">
            {stopped}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              className={mainButton}
              onClick={() => {
                store.goOn().catch(() => undefined);
              }}
              type="button"
            >
              Go on
            </button>
            <p className="min-w-0 flex-1 basis-48 text-quiet">
              It goes on where it stopped. Nothing it did is lost.
            </p>
            <ThrowAway />
          </div>
        </>
      )}
    </section>
  );
};

/** The choice is made: the owner goes over it, and orders the album. */
const Chosen = ({ sheet }: { readonly sheet: Place }) => {
  const { index } = useShootContext();
  const { photos } = index.shoot;
  return (
    <section
      aria-label="The choice"
      className={`${panel} flex flex-wrap items-center gap-x-5 gap-y-3`}
    >
      <div className="min-w-0 flex-1 basis-72">
        <h2 className="type-name text-[1.0625rem] text-lamp">
          {index.chosen} of {count(photos.length, 'photo')} chosen for the album
        </h2>
        <p className="mt-1.5 text-quiet">
          Go over the choice: take out what you don’t want, put in what you
          miss, both at once. Nothing is edited until you order the album.
        </p>
      </div>
      <div className="flex items-center gap-x-4">
        <ThrowAway />
        <button
          aria-keyshortcuts="H"
          className={`${mainButton} whitespace-nowrap`}
          onClick={() => go({ ...sheet, screen: 'hand-over' })}
          type="button"
        >
          Order the album <Key>H</Key>
        </button>
      </div>
    </section>
  );
};

/** The album is ordered: how many of its photos are edited, and how it goes. */
const Ordered = ({ sheet }: { readonly sheet: Place }) => {
  const { index, state } = useShootContext();
  const carrying = useCarrying();
  const picked = index.shoot.photos.filter(
    ({ standing }) => standing.kind === 'picked',
  );
  const edited = picked.filter(({ edit }) => edit !== null).length;
  const stopped = carrying.is === 'stopped' ? carrying : null;
  // An album that is there already gets more photos; a new one is made.
  const what = index.hasAlbum ? 'More photos are' : 'The album is';
  return (
    <section aria-label="The order" className={panel}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="type-name text-[1.0625rem] text-lamp">
          {stopped === null ? `${what} being edited` : `${what} ordered`}
        </h2>
        <p className="type-edge tabular ml-auto text-print">
          {edited} of {count(picked.length, 'photo')} edited
        </p>
      </div>
      <Meter
        className="mt-3 w-full"
        label={`${edited} of ${picked.length} photos edited`}
        share={picked.length === 0 ? 0 : edited / picked.length}
        tone="fill-pencil-blue"
      />
      {stopped === null ? null : (
        <p className="mt-3 text-wax-yellow" role="alert">
          {stopped.stopped.reason}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {stopped === null ? (
          <p className="flex min-w-0 flex-1 basis-64 items-center gap-2.5 text-pencil-blue">
            <span
              aria-hidden="true"
              className="pencil-pulse size-2.5 shrink-0 rounded-full border-2 border-pencil-blue"
            />
            <span>
              Keepsake is at work
              {state.activity === null
                ? ''
                : `: ${stepName(state.activity).toLowerCase()}`}
              <span className="text-quiet">
                . Finished photos go into the album in Immich together, at the
                end.
              </span>
            </span>
          </p>
        ) : (
          <>
            <GoOn carrying={stopped} />
            <p className="min-w-0 flex-1 basis-48 text-quiet">
              It goes on where it stopped. Nothing it did is lost.
            </p>
          </>
        )}
        <button
          aria-keyshortcuts="H"
          className={`${quietButton} min-h-10`}
          onClick={() => go({ ...sheet, screen: 'hand-over' })}
          type="button"
        >
          The order
        </button>
      </div>
    </section>
  );
};

/** What is said about the making of the album, while it is being made. */
export const Making = ({ sheet }: { readonly sheet: Place }) => {
  const { index, state } = useShootContext();
  const making = makingOf({ index, state });
  if (making === 'ready') {
    return <GettingReady stopped={state.preparation?.stopped ?? null} />;
  }
  if (making === 'ordered') {
    return <Ordered sheet={sheet} />;
  }
  return making === 'chosen' ? <Chosen sheet={sheet} /> : null;
};
