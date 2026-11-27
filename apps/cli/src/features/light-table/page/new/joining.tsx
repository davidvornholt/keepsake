import type { AlbumList } from '../../contract.ts';
import { readAlbums } from '../data/api.ts';
import { count, span } from '../data/format.ts';
import { useLoaded } from './use-loaded.ts';

// The first publish of a shoot joins the one album in Immich that has its
// title, and publishes nothing when several have it, so the owner learns
// that while they still choose the name.

type Album = AlbumList['albums'][number];

const whenOf = ({ first, last }: Album) =>
  first === null ? 'no photos yet' : `photos of ${span(first, last ?? first)}`;

/** What becomes of the album's name in Immich, said under the name. */
const said = (albums: ReadonlyArray<Album>, title: string) => {
  const [only] = albums;
  if (only === undefined) {
    return '';
  }
  if (albums.length === 1) {
    return `Immich has an album called ${title} already, with ${whenOf(only)}. The photos join it when they are published.`;
  }
  return `Immich has ${count(albums.length, 'album')} called ${title}, with ${albums.map(whenOf).join('; ')}. Keepsake can’t tell which one the photos should join, so it won’t publish them. Give this album another name, or rename all but one of them in Immich.`;
};

export const Joining = ({
  id,
  title,
}: {
  readonly id: string;
  readonly title: string;
}) => {
  const { loaded } = useLoaded('albums', readAlbums);
  // Without Immich there is nothing to say, and nothing stops the album.
  const albums =
    loaded.status === 'ready'
      ? loaded.value.albums.filter(({ name }) => name === title.trim())
      : [];
  return (
    <p
      aria-live="polite"
      className="mt-3 max-w-[36rem] text-print empty:hidden"
      id={id}
    >
      {said(albums, title.trim())}
    </p>
  );
};
