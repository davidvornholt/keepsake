import type { PhotoView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { type Index, pencilOf } from '../data/derive.ts';
import { type Said, standingOf, whyOf } from '../data/words.ts';
import { lookOf } from '../marks/kinds.ts';
import { Mentioned } from '../ui/photo-link.tsx';

// Where a photo stands and why, in plain sight right below it: that it is
// in the album, or what kept it out, or that the owner put it in or took it
// out and that waits for other work.

const onItsWay = 'Keepsake does it as soon as the work going on now is done.';

/** What waits to be done to a photo, said as where it stands, if anything waits. */
const waitingOf = (index: Index, photo: PhotoView): Said | null => {
  const waits = index.waiting.get(photo.id);
  return waits === undefined
    ? null
    : {
        text: lookOf[pencilOf(waits)].said,
        other: null,
        because: onItsWay,
        tone: waits.choice.wants === 'in' ? 'in' : 'out',
      };
};

const dots: Readonly<Record<Said['tone'], string>> = {
  in: 'bg-lamp',
  out: 'border border-quiet',
  open: 'border border-rule',
};

export const StandingLine = ({ photo }: { readonly photo: PhotoView }) => {
  const { index, state } = useShootContext();
  const waiting = waitingOf(index, photo);
  const said = waiting ?? standingOf(index, photo);
  const why =
    waiting?.because ?? whyOf(index, photo, state.preparation !== null);
  const score = photo.verdict?.score ?? null;
  return (
    <div className="mx-auto flex min-h-12 w-full max-w-[46rem] items-center px-4 py-1">
      <div className="flex min-w-0 flex-1 items-baseline gap-3 text-[0.9375rem] leading-snug">
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${dots[said.tone]}`}
        />
        <p className="min-w-0 flex-1 text-pretty text-print">
          <strong className="type-label text-lamp">{said.text}</strong>
          {why === null ? null : (
            <span>
              . <Mentioned text={why} />
            </span>
          )}
        </p>
        {score === null ? null : (
          <p
            className="type-edge tabular shrink-0 text-quiet"
            title="What the judging model gave it, out of 10"
          >
            <span className="sr-only">Score </span>
            <span className="text-print">{score}</span>/10
          </p>
        )}
      </div>
    </div>
  );
};
