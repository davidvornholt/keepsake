import { useEffect, useId, useRef, useState } from 'react';
import { WaxMark } from '../marks/wax-mark.tsx';
import { sideButton } from '../ui/classes.ts';

// What the owner says to an agent when the page couldn't start one itself.

const sentence = 'Go through my Keepsake marks';
/** How long the page says that the sentence was copied, in milliseconds. */
const saidFor = 2400;

/** Copies with the clipboard, or by selecting where a page isn't trusted with it. */
const copy = async (field: HTMLInputElement): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(sentence);
    return true;
  } catch {
    field.select();
    return document.execCommand('copy');
  }
};

export const Sentence = ({ lead }: { readonly lead: string }) => {
  const labelId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [copiedAt, setCopiedAt] = useState<number | null>(null);

  useEffect(() => {
    if (copiedAt === null) {
      return;
    }
    const waiting = setTimeout(() => setCopiedAt(null), saidFor);
    return () => clearTimeout(waiting);
  }, [copiedAt]);

  const onCopy = async () => {
    const field = fieldRef.current;
    if (field !== null && (await copy(field))) {
      setCopiedAt(performance.now());
    }
  };

  return (
    <div>
      <p className="text-print" id={labelId}>
        {lead}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-x-2 border border-rule py-1.5 pr-1.5 pl-4 focus-within:border-quiet">
        <input
          aria-labelledby={labelId}
          // As wide as the sentence, so that on a narrow screen the button goes below it instead of hiding its end.
          className="type-name field-sizing-content min-w-0 max-w-full flex-auto bg-transparent py-2 text-[1.0625rem] text-lamp outline-none"
          onFocus={(event) => event.target.select()}
          readOnly={true}
          ref={fieldRef}
          value={sentence}
        />
        <button
          className={`${sideButton} shrink-0`}
          onClick={() => {
            onCopy().catch(() => undefined);
          }}
          type="button"
        >
          {copiedAt === null ? null : (
            <WaxMark
              className="size-4"
              color="wax-white"
              seed="copied"
              shape="tick"
              since={copiedAt}
            />
          )}
          <span aria-live="polite">
            {copiedAt === null ? 'Copy' : 'Copied'}
          </span>
        </button>
      </div>
    </div>
  );
};
