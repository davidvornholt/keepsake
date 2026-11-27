import type { RefObject } from 'react';
import type { PhotoView } from '../../contract.ts';
import { Words } from './answer.tsx';
import { StandingLine } from './standing-line.tsx';
import type { Word } from './word.ts';

// What is said about some photos, laid out to be measured and not seen.

const nothing = () => undefined;

export const Unseen = ({
  photos,
  wordFor,
  unseenRef,
}: {
  readonly photos: ReadonlyArray<PhotoView | undefined>;
  /** What keepsake or the owner says about a photo. */
  readonly wordFor: (photo: PhotoView, isWriting: boolean) => Word | null;
  readonly unseenRef: RefObject<HTMLDivElement | null>;
}) => (
  <div
    aria-hidden="true"
    className="pointer-events-none invisible absolute start-0 end-(--beside) top-0"
    ref={unseenRef}
  >
    {photos
      .filter((photo) => photo !== undefined)
      .map((photo) => {
        const word = wordFor(photo, false);
        return (
          <div data-of={photo.id} key={photo.id}>
            <StandingLine photo={photo} />
            {word === null ? null : (
              <Words
                hasBefore={(photo.edit?.earlier.length ?? 0) > 0}
                onBefore={nothing}
                onEdit={nothing}
                onSeen={nothing}
                word={word}
              />
            )}
          </div>
        );
      })}
  </div>
);
