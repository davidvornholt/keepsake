import type { PhotoView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { type Said, standingOf, whyOf } from '../data/words.ts';
import { Mentioned } from '../ui/photo-link.tsx';

// Where a photo stands and why, in plain sight right below it: that it is
// in the album, or what kept it out.

const dots: Readonly<Record<Said['tone'], string>> = {
  in: 'bg-lamp',
  out: 'border border-quiet',
  open: 'border border-rule',
};

export const StandingLine = ({ photo }: { readonly photo: PhotoView }) => {
  const { index, state } = useShootContext();
  const said = standingOf(index, photo);
  const why = whyOf(index, photo, state.preparation !== null);
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
