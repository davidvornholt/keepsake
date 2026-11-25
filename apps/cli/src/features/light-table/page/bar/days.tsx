import type { Day, Index } from '../data/derive.ts';
import { dayAndMonth, dayAndShortMonth, weekdayOf } from '../data/format.ts';
import { chosenWords } from '../data/words.ts';

// The days of the shoot as one line: each as wide as the photos taken on it,
// lit as far as they went into the album. A day that is pressed is the only
// one on the table.

const whole = 100;
const least = '2.75rem';

const titleOf = (index: Index, day: Day): string =>
  [
    `${weekdayOf(day.date)}, ${dayAndMonth(day.date)}`,
    `${day.taken} taken`,
    ...chosenWords(index, day),
    `${day.moments} moments`,
    ...(day.edited > 0 ? [`${day.edited} edited`] : []),
  ].join(' · ');

const DayButton = ({
  title,
  day,
  isOnly,
  isDimmed,
  onDay,
}: {
  /** The day and what was counted on it, in words. */
  readonly title: string;
  readonly day: Day;
  readonly isOnly: boolean;
  readonly isDimmed: boolean;
  readonly onDay: (day: string | null) => void;
}) => (
  <button
    aria-pressed={isOnly}
    className="group/day flex h-10 w-full min-w-0 flex-col justify-center gap-1.5 px-px text-left"
    onClick={() => onDay(isOnly ? null : day.date)}
    title={title}
    type="button"
  >
    <span
      className={`type-label truncate text-[0.75rem] transition-colors duration-150 group-hover/day:text-lamp ${
        isOnly ? 'text-lamp' : 'text-quiet'
      }`}
    >
      {dayAndShortMonth(day.date)}
    </span>
    <svg
      aria-hidden="true"
      className={`h-[5px] w-full transition-opacity duration-150 group-hover/day:opacity-100 ${
        isDimmed ? 'opacity-40' : 'opacity-100'
      }`}
      preserveAspectRatio="none"
      viewBox={`0 0 ${whole} 1`}
    >
      <rect className="fill-rule" height="1" width={whole} />
      <rect
        className="fill-lamp"
        height="1"
        width={(whole * (day.inAlbum + day.picked)) / Math.max(1, day.taken)}
      />
    </svg>
  </button>
);

export const Days = ({
  index,
  only,
  onDay,
}: {
  readonly index: Index;
  /** The only day on the table, if one was chosen. */
  readonly only: string | null;
  readonly onDay: (day: string | null) => void;
}) => (
  <ul
    aria-label="Days"
    className="grid min-w-0 flex-1 basis-80 gap-x-1 max-lg:order-last max-lg:basis-full lg:flex-[1.4] lg:basis-[24rem]"
    ref={(list) => {
      // Each day is as wide as the photos taken on it, which no class knows.
      list?.style.setProperty(
        'grid-template-columns',
        index.days.map(({ taken }) => `minmax(${least}, ${taken}fr)`).join(' '),
      );
    }}
  >
    {index.days.map((day) => (
      <li className="min-w-0" key={day.date}>
        <DayButton
          day={day}
          isDimmed={only !== null && only !== day.date}
          isOnly={only === day.date}
          title={titleOf(index, day)}
          onDay={onDay}
        />
      </li>
    ))}
  </ul>
);
