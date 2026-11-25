import type { RefObject } from 'react';
import type { Rect } from '../sheet/layout.ts';
import { Img, Placed } from '../ui/placed.tsx';

// A picture that lies on the plane of a photo: the finished one, or the
// camera's under it.

export const Layer = ({
  src,
  file = null,
  rect,
  blur,
  layerRef,
}: {
  readonly src: string | null;
  /** The picture's own file, laid over its copy once it is there. */
  readonly file?: string | null;
  readonly rect: Rect;
  readonly blur: string;
  readonly layerRef?: RefObject<HTMLDivElement | null>;
}) => (
  <Placed blur={blur} placedRef={layerRef} rect={rect}>
    {src === null ? null : (
      <Img className="size-full" isUrgent={true} src={src} />
    )}
    {file === null ? null : (
      <Img className="absolute inset-0 size-full" src={file} />
    )}
  </Placed>
);
