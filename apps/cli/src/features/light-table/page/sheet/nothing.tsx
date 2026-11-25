import { sideButton } from '../ui/classes.ts';

// A table with no photos on it: what was asked for isn't there, or isn't
// there yet.

const saidOf = (isEmptyShoot: boolean, isGettingReady: boolean): string => {
  if (!isEmptyShoot) {
    return 'No photos here.';
  }
  return isGettingReady
    ? 'The photos lie here as soon as they are read.'
    : 'This album has no photos.';
};

export const Nothing = ({
  isEmptyShoot,
  isGettingReady,
  onEverything,
}: {
  /** Whether the album has no photos at all. */
  readonly isEmptyShoot: boolean;
  /** Whether keepsake is still reading them. */
  readonly isGettingReady: boolean;
  readonly onEverything: () => void;
}) => (
  <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
    <div className="pointer-events-auto flex flex-col items-center gap-5">
      <p
        className={`type-name text-center text-xl ${isEmptyShoot && isGettingReady ? 'paper-waits text-quiet' : 'text-lamp'}`}
      >
        {saidOf(isEmptyShoot, isGettingReady)}
      </p>
      {isEmptyShoot ? null : (
        <button className={sideButton} onClick={onEverything} type="button">
          Show everything
        </button>
      )}
    </div>
  </div>
);
