import { type SyntheticEvent, useId, useState } from 'react';
import type { FolderLook } from '../../contract.ts';
import { everything } from '../app/route.ts';
import { go } from '../app/router.ts';
import { lookIntoFolder, makeShoot } from '../data/api.ts';
import {
  clockOf,
  count,
  dayAndMonth,
  dayOf,
  localStamp,
  span,
} from '../data/format.ts';
import { field, mainButton } from '../ui/classes.ts';
import { Img } from '../ui/placed.tsx';
import { useFocused } from '../ui/use-focused.ts';
import { Joining } from './joining.tsx';
import {
  aboutOf,
  clockThere,
  maximumFor,
  timeZones,
  titleOf,
} from './proposal.ts';
import type { Folder } from './tree.ts';
import { type Loaded, useLoaded } from './use-loaded.ts';
import { useIsShown, whileShown } from './while-shown.ts';

// The second step: what the album is called and what it is about, whether
// the camera's clock was right, and how many photos the album may have.
// Everything is proposed, so that pressing the button is enough.

const heading = 'type-name text-[1.0625rem] text-lamp';
const radio = 'mt-[3px] size-4 shrink-0 accent-lamp';

/** A few photos of the folder, each with what the camera's clock said. */
const Samples = ({ look }: { readonly look: Loaded<FolderLook> }) => {
  if (look.status === 'failed') {
    return (
      <p className="mt-5 text-quiet">
        The photos couldn’t be shown: {look.problem}
      </p>
    );
  }
  if (look.status === 'loading') {
    return (
      <div
        aria-hidden="true"
        className="paper-waits mt-5 h-[7.25rem] w-full bg-sheet"
      />
    );
  }
  return (
    <ul
      aria-label="Some of its photos"
      className="mt-5 flex h-[7.25rem] gap-1.5 overflow-x-auto overscroll-x-contain"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the row scrolls sideways, and the arrow keys can do that only once the keyboard is on it
      tabIndex={0}
    >
      {look.value.samples.map(({ src, takenAt, width, height }, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: two samples can be of the same second, and their order never changes
        <li className="shrink-0" key={`${takenAt} ${at}`}>
          <Img
            alt=""
            className="h-24 w-auto bg-dark"
            size={{ width, height }}
            src={src}
          />
          <span className="type-edge mt-1.5 block text-quiet">
            {clockOf(takenAt)}
          </span>
        </li>
      ))}
    </ul>
  );
};

type Clock = {
  /** Whether the camera showed the time of the place, or still that of home. */
  readonly was: 'there' | 'home';
  readonly timeZone: string;
};

/** Whether the camera's clock was right where the photos were taken. */
const ClockCheck = ({
  first,
  clock,
  onClock,
}: {
  /** What the camera's clock said at the first photo. */
  readonly first: string;
  readonly clock: Clock;
  readonly onClock: (clock: Clock) => void;
}) => {
  const nameId = useId();
  const zonesId = useId();
  const there = clockThere(first, clock.timeZone);
  return (
    <fieldset className="mt-9">
      <legend className={heading}>Was the camera’s clock right?</legend>
      <p className="mt-2 max-w-[36rem] text-quiet">
        The camera says the first photo was taken at{' '}
        <span className="text-print">
          {clockOf(first)} on {dayAndMonth(dayOf(first))}
        </span>
        . The album is sorted by day, and the models are told the time of day,
        so it matters whether that is what the clocks said there.
      </p>
      <label className="mt-3 flex min-h-10 items-start gap-3 py-2">
        <input
          checked={clock.was === 'there'}
          className={radio}
          name={nameId}
          onChange={() => onClock({ ...clock, was: 'there' })}
          type="radio"
        />
        <span>Yes, that is what the clocks said there</span>
      </label>
      <label className="flex min-h-10 items-start gap-3 py-2">
        <input
          checked={clock.was === 'home'}
          className={radio}
          name={nameId}
          onChange={() => onClock({ ...clock, was: 'home' })}
          type="radio"
        />
        <span>No, the camera still showed the time at home</span>
      </label>
      {clock.was === 'home' ? (
        <div className="mt-1 ml-7">
          <label className="block">
            <span className="text-print">Where were the photos taken?</span>
            <input
              aria-describedby={`${zonesId}-then`}
              autoCapitalize="off"
              autoComplete="off"
              className={`${field} mt-2 max-w-[22rem]`}
              list={zonesId}
              onChange={(event) =>
                onClock({ ...clock, timeZone: event.target.value.trim() })
              }
              placeholder="Europe/Lisbon"
              spellCheck={false}
              value={clock.timeZone}
            />
          </label>
          <datalist id={zonesId}>
            {timeZones().map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <p
            aria-live="polite"
            className="mt-2 text-quiet"
            id={`${zonesId}-then`}
          >
            {there === null
              ? 'A time zone, written like Europe/Lisbon or Asia/Tokyo.'
              : `Then the first photo was taken at ${there} there.`}
          </p>
        </div>
      ) : null}
    </fieldset>
  );
};

type Limit = { readonly has: boolean; readonly most: string };

const HowMany = ({
  photos,
  limit,
  onLimit,
}: {
  readonly photos: number;
  readonly limit: Limit;
  readonly onLimit: (limit: Limit) => void;
}) => (
  <fieldset className="mt-9">
    <legend className={heading}>How many photos may the album have?</legend>
    <p className="mt-2 max-w-[36rem] text-quiet">
      Keepsake chooses the best of the {count(photos, 'photo')}, and fewer than
      this when fewer are good. You can put in and take out photos afterwards.
    </p>
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <label className="flex items-center gap-3">
        <span className="whitespace-nowrap">At most</span>
        <input
          className={`${field} w-24 text-center disabled:border-raised disabled:text-quiet`}
          disabled={!limit.has}
          inputMode="numeric"
          max={photos}
          min={1}
          onChange={(event) => onLimit({ ...limit, most: event.target.value })}
          required={limit.has}
          type="number"
          value={limit.most}
        />
      </label>
      <label className="flex min-h-10 items-center gap-3">
        <input
          checked={!limit.has}
          className="size-4 shrink-0 accent-lamp"
          onChange={(event) =>
            onLimit({ ...limit, has: !event.target.checked })
          }
          type="checkbox"
        />
        <span>As many as are good</span>
      </label>
    </div>
  </fieldset>
);

/** Any moment, to see whether a time zone is one this device knows. */
const noon = '2026-01-01T12:00';

/** What is sent, or null while something is still missing. */
const wantedOf = (
  folder: Folder,
  { title, about }: { readonly title: string; readonly about: string },
  clock: Clock,
  limit: Limit,
) => {
  const most = Number(limit.most);
  const isClockKnown =
    clock.was === 'there' || clockThere(noon, clock.timeZone) !== null;
  const isLimitKnown = !limit.has || (Number.isInteger(most) && most >= 1);
  const isSaid = title.trim() !== '' && about.trim() !== '';
  return isSaid && isClockKnown && isLimitKnown
    ? {
        folder: folder.path,
        title: title.trim(),
        about: about.trim(),
        timeZone: clock.was === 'home' ? clock.timeZone : null,
        maximum: limit.has ? most : null,
      }
    : null;
};

export const Details = ({ folder }: { readonly folder: Folder }) => {
  const titleId = useId();
  const aboutId = useId();
  const titleRef = useFocused<HTMLInputElement>();
  const { loaded: look } = useLoaded(folder.path, () =>
    lookIntoFolder(folder.path),
  );
  // The camera's clock where keepsake has read it, the files' own until then.
  const from =
    look.status === 'ready' ? look.value.from : localStamp(folder.from);
  const to = look.status === 'ready' ? look.value.to : localStamp(folder.to);
  const [typedTitle, setTypedTitle] = useState<string | null>(null);
  const [typedAbout, setTypedAbout] = useState<string | null>(null);
  const [clock, setClock] = useState<Clock>({ was: 'there', timeZone: '' });
  const [limit, setLimit] = useState<Limit>({
    has: true,
    most: String(maximumFor(folder.photos)),
  });
  const [isSending, setIsSending] = useState(false);
  const isShown = useIsShown();
  const [problem, setProblem] = useState<string | null>(null);
  const title = typedTitle ?? titleOf(folder);
  const about = typedAbout ?? aboutOf(folder, from, to);
  const wanted = wantedOf(folder, { title, about }, clock, limit);

  const make = (event: SyntheticEvent) => {
    event.preventDefault();
    if (wanted === null || isSending) {
      return;
    }
    setIsSending(true);
    setProblem(null);
    whileShown(makeShoot(wanted), isShown, {
      onDone: (shoot) =>
        go({ screen: 'sheet', shoot, filters: everything }, 'replace'),
      onFailed: (error) => {
        setIsSending(false);
        setProblem(
          error instanceof Error ? error.message : 'Something went wrong.',
        );
      },
    }).catch(() => undefined);
  };

  return (
    <form className="pt-8" onSubmit={make}>
      <h2 className="type-name break-words text-[1.375rem] text-lamp">
        {folder.name}
      </h2>
      <p className="type-edge mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-quiet">
        <span>{count(folder.photos, 'photo')}</span>
        <span>{span(from, to)}</span>
        {folder.within.length > 0 ? (
          <span>In {folder.within.join(' / ')}</span>
        ) : null}
      </p>
      <Samples look={look} />
      <label className={`mt-9 block ${heading}`} htmlFor={titleId}>
        What is the album called?
      </label>
      <p className="mt-2 max-w-[36rem] text-quiet" id={`${titleId}-more`}>
        The place or the event the photos show, by its common English name where
        it has one, such as Vienna for Wien. Leave out the date and the country,
        since Immich shows them.
      </p>
      <input
        ref={titleRef}
        aria-describedby={`${titleId}-more ${titleId}-joins`}
        className={`${field} mt-3`}
        id={titleId}
        maxLength={120}
        onChange={(event) => setTypedTitle(event.target.value)}
        placeholder="Lisbon"
        required={true}
        value={title}
      />
      <Joining id={`${titleId}-joins`} title={title} />
      <label className={`mt-9 block ${heading}`} htmlFor={aboutId}>
        Where and when?
      </label>
      <p className="mt-2 max-w-[36rem] text-quiet" id={`${aboutId}-more`}>
        The models that choose and edit are told this about the photos.
      </p>
      <input
        aria-describedby={`${aboutId}-more`}
        className={`${field} mt-3`}
        id={aboutId}
        maxLength={120}
        onChange={(event) => setTypedAbout(event.target.value)}
        placeholder="Lisbon, May 2026"
        required={true}
        value={about}
      />
      {look.status === 'ready' ? (
        <ClockCheck clock={clock} first={from} onClock={setClock} />
      ) : null}
      <HowMany limit={limit} onLimit={setLimit} photos={folder.photos} />
      <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-raised border-t pt-5">
        <button
          className={`${mainButton} whitespace-nowrap`}
          disabled={wanted === null || isSending}
          type="submit"
        >
          {isSending ? 'Making the album' : 'Make the album'}
        </button>
        <p className="min-w-0 flex-1 basis-64 text-quiet">
          Keepsake then looks at all {count(folder.photos, 'photo')} and
          chooses. You can watch or leave. Nothing is edited until you have gone
          over the choice and ordered it.
        </p>
      </div>
      <p aria-live="assertive" className="mt-4 text-wax-yellow empty:hidden">
        {problem ?? ''}
      </p>
    </form>
  );
};
