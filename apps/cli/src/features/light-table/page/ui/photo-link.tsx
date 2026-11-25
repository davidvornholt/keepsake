import type { MouseEvent, ReactNode } from 'react';
import { pictureWidths } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { partsOf } from '../data/mentions.ts';
import { Thumb } from './placed.tsx';

const [small] = pictureWidths;

const isPlain = (event: MouseEvent): boolean =>
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) &&
  event.button === 0;

/** A photo of the shoot as a small picture that leads to it. */
export const PhotoLink = ({
  photo,
  className = 'h-[4.5rem]',
  how = 'replace',
  children,
}: {
  readonly photo: string;
  /** The height of the picture, as a class. */
  readonly className?: string;
  /** Whether Back leads here again afterwards. Not from one photo to another. */
  readonly how?: 'push' | 'replace';
  readonly children?: ReactNode;
}) => {
  const { index, hrefOfPhoto, openPhoto } = useShootContext();
  const view = index.byId.get(photo);
  if (view === undefined) {
    return null;
  }
  const number = index.numberOf.get(photo) ?? 0;
  return (
    <a
      className="group/link inline-flex items-center gap-2 align-middle"
      href={hrefOfPhoto(photo)}
      onClick={(event) => {
        if (isPlain(event)) {
          event.preventDefault();
          openPhoto(photo, how);
        }
      }}
    >
      <Thumb
        alt={`Photo ${number}`}
        className={`${className} w-auto rounded-[2px] outline-1 outline-transparent outline-offset-1 transition-[outline-color] group-hover/link:outline-lamp`}
        picture={view.edit?.picture ?? view.picture}
        width={small}
      />
      {children}
    </a>
  );
};

/** A sentence in which the photos it names are shown instead of their file names. */
export const Mentioned = ({ text }: { readonly text: string }) => {
  const { index } = useShootContext();
  let seen = 0;
  return partsOf(index, text).map((part) => {
    seen += 1;
    return part.kind === 'text' ? (
      part.text
    ) : (
      <PhotoLink
        className="mx-0.5 h-[2.25em]"
        key={`${part.photo}-${seen}`}
        photo={part.photo}
      />
    );
  });
};
