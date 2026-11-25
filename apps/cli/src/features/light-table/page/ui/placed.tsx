import type { ReactNode, RefObject } from 'react';
import type { Picture as PictureData } from '../../contract.ts';
import { blurOf } from '../data/pictures.ts';

// The two things no class can say: where something lies when that follows
// from the size of a picture, and the picture itself.

type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

/** An element at a place that is worked out, not designed. */
export const Placed = ({
  rect,
  className,
  children,
  blur = '',
  placedRef,
}: {
  readonly rect: Rect;
  readonly className?: string;
  readonly children?: ReactNode;
  /** A blurred picture behind what it holds, until that has arrived. */
  readonly blur?: string;
  readonly placedRef?: RefObject<HTMLDivElement | null>;
}) => (
  <div
    className={`absolute ${className ?? ''}`}
    ref={placedRef}
    // biome-ignore lint/nursery/noInlineStyles: the place follows from the size of a picture, which no class can know
    style={{
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      backgroundImage: blur === '' ? undefined : `url("${blur}")`,
      backgroundSize: '100% 100%',
    }}
  >
    {children}
  </div>
);

/** A picture. Decorative unless it is given words. */
export const Img = ({
  src,
  alt = '',
  className,
  isUrgent = false,
  size,
}: {
  readonly src: string;
  readonly alt?: string;
  readonly className?: string;
  /** Its size in pixels, so that it keeps its shape before it has arrived. */
  readonly size?: { readonly width: number; readonly height: number };
  /** Whether it is decoded before the frame it appears in, at the cost of that frame. */
  readonly isUrgent?: boolean;
}) => (
  // biome-ignore lint/performance/noImgElement: the rule is for Next.js; this page has no image component, and keepsake serves the sizes itself
  <img
    alt={alt}
    className={className}
    decoding={isUrgent ? 'sync' : 'async'}
    draggable={false}
    height={size?.height}
    src={src}
    width={size?.width}
  />
);

const aspectWidth = 1000;

/**
 * A small picture that keeps its shape while it loads, with its blur behind
 * it. `width` is one of the widths keepsake serves.
 */
export const Thumb = ({
  picture,
  width,
  alt = '',
  className,
}: {
  readonly picture: PictureData;
  readonly width: number;
  readonly alt?: string;
  readonly className?: string;
}) => {
  const blur = blurOf(picture);
  return (
    <svg
      aria-hidden={alt === ''}
      aria-label={alt === '' ? undefined : alt}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role={alt === '' ? undefined : 'img'}
      viewBox={`0 0 ${aspectWidth} ${(aspectWidth * picture.height) / picture.width}`}
    >
      {alt === '' ? null : <title>{alt}</title>}
      {blur === '' ? null : (
        <image
          height="100%"
          href={blur}
          preserveAspectRatio="none"
          width="100%"
        />
      )}
      <image
        height="100%"
        href={`${picture.src}?width=${width}`}
        preserveAspectRatio="none"
        width="100%"
      />
    </svg>
  );
};
