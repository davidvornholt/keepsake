import type { Activity } from '../../contract.ts';
import { progressOf, shareOf, stepName } from '../data/activity.ts';
import { Meter } from '../ui/controls.tsx';

// Keepsake at work, said in its blue pencil: what it does and how far it is.

export const Working = ({ activity }: { readonly activity: Activity }) => (
  <div>
    <p className="flex items-baseline gap-2.5 text-pencil-blue">
      <span
        aria-hidden="true"
        className="pencil-pulse size-2.5 shrink-0 self-center rounded-full border-2 border-pencil-blue"
      />
      <span className="type-label text-[0.9375rem]">{stepName(activity)}</span>
      <span className="type-edge tabular ml-auto">{progressOf(activity)}</span>
    </p>
    {activity.total > 0 ? (
      <Meter
        className="mt-2.5 w-full"
        label={`${stepName(activity)}, ${progressOf(activity)}`}
        share={shareOf(activity)}
        tone="fill-pencil-blue"
      />
    ) : null}
  </div>
);
