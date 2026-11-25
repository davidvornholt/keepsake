import { sideButton } from '../ui/classes.ts';

// A table with no photos on it: what was asked for isn't there.

export const Nothing = ({
  isEmptyShoot,
  onEverything,
}: {
  /** Whether the shoot has no photos at all. */
  readonly isEmptyShoot: boolean;
  readonly onEverything: () => void;
}) => (
  <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
    <div className="pointer-events-auto flex flex-col items-center gap-5">
      <p className="type-name text-center text-lamp text-xl">
        {isEmptyShoot ? 'This shoot has no photos.' : 'No photos here.'}
      </p>
      {isEmptyShoot ? null : (
        <button className={sideButton} onClick={onEverything} type="button">
          Show everything
        </button>
      )}
    </div>
  </div>
);
