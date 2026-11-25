import { X } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useState } from 'react';
import { useShootContext } from '../app/shoot-context.ts';

// The owner's own words on a photo. Labels that are in use are offered.

const mostOffered = 8;
const iconSize = 12;

const Offered = ({
  labels,
  typed,
  onAdd,
}: {
  readonly labels: ReadonlyArray<string>;
  readonly typed: string;
  readonly onAdd: (label: string) => void;
}) => {
  const { index } = useShootContext();
  const offered = index.labels
    .map(({ label }) => label)
    .filter(
      (label) =>
        !labels.includes(label) &&
        label.toLowerCase().includes(typed.trim().toLowerCase()),
    )
    .slice(0, mostOffered);
  return offered.length === 0 ? null : (
    <ul
      aria-label="Labels in use"
      className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
    >
      {offered.map((label) => (
        <li key={label}>
          <button
            className="type-label text-quiet text-sm hover:text-lamp"
            onClick={() => onAdd(label)}
            type="button"
          >
            {label}
          </button>
        </li>
      ))}
    </ul>
  );
};

export const Labels = ({
  photo,
  labels,
  inputRef,
}: {
  readonly photo: string;
  readonly labels: ReadonlyArray<string>;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}) => {
  const { store } = useShootContext();
  const [typed, setTyped] = useState('');
  const add = (label: string) => {
    store.label(photo, [...labels, label]);
    setTyped('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && typed.trim() !== '') {
      add(typed);
    } else if (event.key === 'Backspace' && typed === '' && labels.length > 0) {
      store.label(photo, labels.slice(0, -1));
    } else if (event.key === 'Escape') {
      event.currentTarget.blur();
    }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-rule border-b pb-1.5 focus-within:border-lamp">
        {labels.map((label) => (
          <span
            className="type-label inline-flex items-center gap-1 bg-raised py-0.5 pr-1 pl-2 text-print text-sm"
            key={label}
          >
            {label}
            <button
              aria-label={`Remove the label ${label}`}
              className="grid size-5 place-items-center text-quiet hover:text-lamp"
              onClick={() =>
                store.label(
                  photo,
                  labels.filter((one) => one !== label),
                )
              }
              type="button"
            >
              <X aria-hidden="true" size={iconSize} />
            </button>
          </span>
        ))}
        <input
          aria-label="Add a label"
          autoCapitalize="none"
          className="min-w-24 flex-1 bg-transparent py-1 text-print text-sm outline-none placeholder:text-quiet"
          enterKeyHint="done"
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={labels.length === 0 ? 'Add a label' : ''}
          ref={inputRef}
          value={typed}
        />
      </div>
      <Offered labels={labels} onAdd={add} typed={typed} />
    </div>
  );
};
