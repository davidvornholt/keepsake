import { type PhotoView, pictureWidths } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import type { Pile } from '../data/derive.ts';
import { standingName, standingOf } from '../data/words.ts';
import { Thumb } from '../ui/placed.tsx';
import { prefersReducedMotion } from '../ui/theme.ts';

// The photos that show the same as the one looked at, as one strip: the
// stack it lies in on the table. The one in front says where it stands;
// each of the others says why it lies behind.

const [small] = pictureWidths;

const isPlain = (event: {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly button: number;
}): boolean =>
  !(event.metaKey || event.ctrlKey || event.shiftKey) && event.button === 0;

/** The strips that have shown a frame already; from then on they glide to the next. */
const placed = new WeakSet<Element>();

/** Brings the frame that is shown into the middle of the strip. */
const intoSight = (link: HTMLElement | null) => {
  const item = link?.closest('li');
  const list = item?.closest('ul');
  if (!(item && list)) {
    return;
  }
  const middle = item.offsetLeft - list.offsetLeft + item.offsetWidth / 2;
  list.scrollTo({
    left: middle - list.clientWidth / 2,
    behavior:
      placed.has(list) && !prefersReducedMotion() ? 'smooth' : 'instant',
  });
  placed.add(list);
};

/** One photo of the stack, and under the one in front where it stands. */
const Frame = ({
  photo,
  pile,
  isShown,
  onShow,
}: {
  readonly photo: PhotoView;
  readonly pile: Pile;
  readonly isShown: boolean;
  readonly onShow: (photo: string) => void;
}) => {
  const { index, hrefOfPhoto } = useShootContext();
  const isFront = photo.id === pile.front.id;
  const said = standingOf(index, photo);
  const number = index.numberOf.get(photo.id) ?? 0;
  const why = said.because === null ? '' : `, because: ${said.because}`;
  return (
    <li className="relative shrink-0">
      <a
        aria-current={isShown ? 'true' : undefined}
        aria-label={`Photo ${number}: ${isFront ? said.text : `behind it${why}`}`}
        className="block rounded-[2px] outline-2 outline-transparent outline-offset-1 transition-[outline-color,opacity] duration-150 hover:opacity-100 aria-[current]:opacity-100 aria-[current]:outline-lamp data-[front=false]:opacity-55"
        data-front={isFront}
        href={hrefOfPhoto(photo.id)}
        onClick={(event) => {
          if (isPlain(event)) {
            event.preventDefault();
            onShow(photo.id);
          }
        }}
        ref={isShown ? intoSight : undefined}
        title={
          isFront
            ? said.text
            : (said.because ?? 'Shows the same as the one in front')
        }
      >
        <Thumb
          className="h-11 w-auto rounded-[2px]"
          picture={photo.edit?.picture ?? photo.picture}
          width={small}
        />
      </a>
      {isFront ? (
        <span
          aria-hidden="true"
          className="type-edge absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap text-[0.625rem] text-lamp"
        >
          {standingName(pile.front)}
        </span>
      ) : null}
    </li>
  );
};

export const StackStrip = ({
  pile,
  shown,
  onShow,
}: {
  readonly pile: Pile;
  /** The photo that is looked at. */
  readonly shown: string;
  readonly onShow: (photo: string) => void;
}) => (
  <nav
    aria-label={`Stack of ${pile.photos.length} photos that show the same`}
    className="mx-auto flex h-[74px] w-full max-w-[46rem] items-start gap-3 px-4 pt-2"
    data-stack={pile.photos.length}
  >
    <p className="type-edge flex h-11 shrink-0 flex-col justify-center gap-0.5 text-quiet">
      <span className="text-print">
        {pile.photos.length} show <br className="sm:hidden" />
        the same
      </span>
      <span aria-hidden="true" className="max-sm:hidden">
        ↑ ↓ go through them
      </span>
    </p>
    <ul className="-mt-1 -ml-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overflow-y-hidden px-1 pt-1 pb-[18px] [scrollbar-width:none]">
      {pile.photos.map((photo) => (
        <Frame
          isShown={photo.id === shown}
          key={photo.id}
          onShow={onShow}
          photo={photo}
          pile={pile}
        />
      ))}
    </ul>
  </nav>
);
