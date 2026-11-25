import { WaxMark } from '../marks/wax-mark.tsx';
import { Key } from '../ui/controls.tsx';
import { starNames, starsUpTo } from './rating.ts';
import type { Saving } from './use-rating.ts';

// The answers: none to five stars, each with what it means.

/** Each star is begun this long after the one before, in milliseconds. */
const perStar = 45;

const Stars = ({
  stars,
  isLit,
  since,
}: {
  readonly stars: number;
  readonly isLit: boolean;
  readonly since: number | null;
}) => (
  <span
    aria-label={stars === 1 ? '1 star' : `${stars} stars`}
    className="flex"
    role="img"
  >
    {starsUpTo(stars).map((at) => (
      <WaxMark
        className="size-[1.125rem]"
        color={isLit ? 'wax-white' : 'quiet'}
        key={at}
        seed={`star-${stars}-${at}`}
        shape="star"
        since={since === null ? null : since + at * perStar}
      />
    ))}
  </span>
);

const StarButton = ({
  stars,
  name,
  isGiven,
  since,
  onRate,
}: {
  readonly stars: number;
  readonly name: string;
  readonly isGiven: boolean;
  /** When it was given just now, so its stars are drawn from then. */
  readonly since: number | null;
  readonly onRate: (stars: number) => void;
}) => (
  <button
    aria-keyshortcuts={String(stars)}
    aria-pressed={isGiven}
    className="type-label flex min-h-12 flex-col items-center justify-center gap-1 rounded-[3px] px-3 text-[0.8125rem] text-quiet transition-colors duration-150 hover:bg-raised hover:text-lamp aria-pressed:text-lamp lg:flex-row lg:gap-2.5 lg:px-3.5"
    onClick={() => onRate(stars)}
    type="button"
  >
    <Key>{stars}</Key>
    {stars === 0 ? null : <Stars isLit={isGiven} since={since} stars={stars} />}
    <span className="whitespace-nowrap">{name}</span>
  </button>
);

type Props = {
  /** Whether one photo is shown; while several are compared, only "none" is an answer. */
  readonly isLarge: boolean;
  /** The stars given before, if any. */
  readonly given: number | null;
  readonly saving: Saving | null;
  readonly labelledBy: string;
  readonly onRate: (stars: number) => void;
};

export const StarButtons = ({
  isLarge,
  given,
  saving,
  labelledBy,
  onRate,
}: Props) => {
  const lit = saving?.stars ?? given;
  const names = isLarge ? starNames : ['none of them'];
  return (
    <fieldset
      aria-labelledby={labelledBy}
      className="grid grid-cols-3 justify-center gap-1 data-[large=false]:grid-cols-1 sm:flex"
      data-large={isLarge}
      disabled={saving !== null}
    >
      {names.map((name, stars) => (
        <StarButton
          isGiven={lit === stars}
          key={name}
          name={name}
          onRate={onRate}
          since={
            saving !== null && saving.stars === stars ? saving.since : null
          }
          stars={stars}
        />
      ))}
    </fieldset>
  );
};
