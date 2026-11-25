import { ArrowUpRight } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import type { Box, Mark, PhotoView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { markedIn } from '../data/derive.ts';
import {
  clockOf,
  dayAndMonth,
  dayOf,
  fileName,
  frameNumber,
} from '../data/format.ts';
import { exposureLine, standingOf, stateOf, whyOf } from '../data/words.ts';
import { lookOf, seedTextOf } from '../marks/kinds.ts';
import { WaxMark } from '../marks/wax-mark.tsx';
import { Mentioned, PhotoLink } from '../ui/photo-link.tsx';
import { Labels } from './labels.tsx';

// Everything there is to know about a photo, beside it: what the machine did
// to it, what the owner said, what the camera wrote down. Where it stands and
// why is said below the photo.

const iconSize = 14;

const Part = ({
  label,
  children,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}) => (
  <section>
    <h3 className="type-edge mb-1.5 text-quiet">{label}</h3>
    {children}
  </section>
);

/** Where the photo stands, for when the panel lies over what says so below it. */
const Standing = ({ photo }: { readonly photo: PhotoView }) => {
  const { index, state } = useShootContext();
  const said = standingOf(index, photo);
  const why = whyOf(index, photo, state.preparation !== null);
  return (
    <section aria-label="Where it stands">
      <p className="type-name text-[0.9375rem] text-lamp">{said.text}</p>
      {said.other === null ? null : (
        <div className="mt-2.5">
          <PhotoLink className="h-24" photo={said.other} />
        </div>
      )}
      {why === null ? null : (
        <p className="mt-2 text-print">
          <Mentioned text={why} />
        </p>
      )}
    </section>
  );
};

/** What the judging model said, unless that is already why the photo stands where it does. */
const Judged = ({ photo }: { readonly photo: PhotoView }) => {
  const { index, state } = useShootContext();
  const { verdict } = photo;
  const said = verdict?.reason ?? verdict?.description ?? '';
  const why = whyOf(index, photo, state.preparation !== null);
  return verdict === null || said === '' || said === why ? null : (
    <Part
      label={
        <>
          Score <span className="text-lamp">{verdict.score}/10</span>
        </>
      }
    >
      <p className="text-print">{said}</p>
    </Part>
  );
};

const Edited = ({
  photo,
  onPrinted,
}: {
  readonly photo: PhotoView;
  readonly onPrinted: (box: Box | null) => void;
}) => {
  const { edit } = photo;
  if (edit === null) {
    return null;
  }
  const { crop } = edit;
  const isBeyond =
    crop.left < 0 || crop.top < 0 || crop.right > 1 || crop.bottom > 1;
  return (
    <>
      {edit.isAi ? null : (
        <p className="text-print">
          The camera's own picture, cropped. No edited version was good enough.
        </p>
      )}
      <Part label="Crop">
        <p className="text-print">{edit.cropReason}</p>
        {isBeyond ? (
          <p className="mt-1.5 text-quiet">
            Reaches beyond the camera's picture. The rest is painted in.
          </p>
        ) : null}
      </Part>
      {edit.removed.length === 0 ? null : (
        <Part label="Removed">
          <ul className="-mx-2">
            {edit.removed.map(({ what, box }) => (
              <li key={`${what}-${box.left}-${box.top}`}>
                <button
                  className="w-full px-2 py-1 text-left text-print hover:bg-raised hover:text-lamp"
                  onBlur={() => onPrinted(null)}
                  onFocus={() => onPrinted(box)}
                  onPointerEnter={() => onPrinted(box)}
                  onPointerLeave={() => onPrinted(null)}
                  type="button"
                >
                  {what}
                </button>
              </li>
            ))}
          </ul>
        </Part>
      )}
      {edit.review === '' ? null : (
        <Part label="Review">
          <p className="text-print">{edit.review}</p>
        </Part>
      )}
      {edit.wish === null ? null : (
        <Part label="Asked for so far">
          <p className="text-print">{edit.wish}</p>
        </Part>
      )}
    </>
  );
};

const Said = ({ mark }: { readonly mark: Mark }) => {
  const look = lookOf[mark.kind];
  return (
    <li className="flex gap-2.5">
      <WaxMark
        className="mt-0.5 size-5"
        color={look.wax}
        seed={seedTextOf(mark.photo, mark.kind)}
        shape={look.shape}
      />
      <div className="min-w-0">
        <p className="text-print">
          {look.said}
          {mark.note === '' ? '' : `: ${mark.note}`}
        </p>
        <p className="type-edge mt-0.5 text-quiet">{stateOf(mark)}</p>
        {mark.answer === null || mark.answer.note === '' ? null : (
          <p className="mt-1 text-pencil-blue">{mark.answer.note}</p>
        )}
      </div>
    </li>
  );
};

const History = ({ photo }: { readonly photo: PhotoView }) => {
  const { index } = useShootContext();
  const { open, waiting, news, past } = markedIn(index, photo.id);
  const marks = [
    ...(open === null ? [] : [open]),
    ...news,
    ...waiting,
    ...past.toReversed(),
  ];
  return marks.length === 0 ? null : (
    <Part label="What you said">
      <ul className="flex flex-col gap-3">
        {marks.map((mark) => (
          <Said key={mark.id} mark={mark} />
        ))}
      </ul>
    </Part>
  );
};

const Camera = ({ photo }: { readonly photo: PhotoView }) => {
  const { index } = useShootContext();
  const number = frameNumber(index.numberOf.get(photo.id) ?? 0);
  const lines = [
    `${number} of ${index.shoot.photos.length}`,
    `${dayAndMonth(dayOf(photo.takenAt))}, ${clockOf(photo.takenAt)}`,
    ...[photo.camera, photo.lens].filter((part) => part !== null),
    exposureLine(photo).join('  '),
    fileName(photo.id),
  ].filter((line) => line !== '');
  return (
    <section
      aria-label="From the camera"
      className="type-edge flex flex-col gap-1 text-quiet"
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </section>
  );
};

export const Info = ({
  photo,
  isOver,
  labelRef,
  onPrinted,
}: {
  readonly photo: PhotoView;
  /** Whether it lies over what is said below the photo. */
  readonly isOver: boolean;
  readonly labelRef: RefObject<HTMLInputElement | null>;
  /** Shows where something was removed while it is pointed at. */
  readonly onPrinted: (box: Box | null) => void;
}) => {
  const { standing, edit } = photo;
  return (
    <div className="flex flex-col gap-5 text-[0.875rem] leading-[1.5]">
      {isOver ? <Standing photo={photo} /> : null}
      <Judged photo={photo} />
      {edit?.caption === null || edit === null ? null : (
        <Part label="Caption">
          <p className="text-print">{edit.caption}</p>
        </Part>
      )}
      <Edited onPrinted={onPrinted} photo={photo} />
      <History photo={photo} />
      <Part label="Labels">
        <Labels inputRef={labelRef} labels={photo.labels} photo={photo.id} />
      </Part>
      <Camera photo={photo} />
      {standing.kind === 'album' ? (
        <a
          className="type-label inline-flex items-center gap-1.5 self-start text-quiet hover:text-lamp"
          href={standing.url}
          rel="noreferrer"
          target="_blank"
        >
          Open in Immich
          <ArrowUpRight aria-hidden="true" size={iconSize} />
        </a>
      ) : null}
    </div>
  );
};
