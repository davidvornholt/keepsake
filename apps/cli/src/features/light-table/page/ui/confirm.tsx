import { type ReactNode, useEffect, useId, useRef } from 'react';
import { mainButton, sideButton } from './classes.ts';

// A question that has to be answered before something is done that can't be
// taken back. The answer that changes nothing is the one the keyboard is on.

export const Confirm = ({
  title,
  children,
  yes,
  no,
  onYes,
  onNo,
}: {
  readonly title: string;
  /** What happens, and what doesn't. */
  readonly children: ReactNode;
  /** What the two buttons say. */
  readonly yes: string;
  readonly no: string;
  readonly onYes: () => void;
  readonly onNo: () => void;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      className="m-auto w-[min(26rem,calc(100%-1.5rem))] bg-sheet p-6 text-print shadow-[0_18px_60px_var(--color-shade)] backdrop:bg-shade"
      onClose={onNo}
      onKeyDown={(event) => event.stopPropagation()}
      ref={ref}
    >
      <h2 className="type-name text-[1.1875rem] text-lamp" id={titleId}>
        {title}
      </h2>
      <div className="mt-3 text-quiet">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {/* The first button is the one the keyboard is on when it opens. */}
        <button className={sideButton} onClick={onNo} type="button">
          {no}
        </button>
        <button className={mainButton} onClick={onYes} type="button">
          {yes}
        </button>
      </div>
    </dialog>
  );
};
