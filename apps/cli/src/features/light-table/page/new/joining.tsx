import type { AlbumList } from '../../contract.ts';
import { readAlbums } from '../data/api.ts';
import { count, span } from '../data/format.ts';
import { sideButton } from '../ui/classes.ts';
import { useLoaded } from './use-loaded.ts';

// The first publish of a shoot joins the owner's one album in Immich that has
// its title, and publishes nothing when several of theirs have it, or one
// whose owner photos can't tell, so the owner learns that while they still
// choose the name. Names are told apart as keepsake does: without case or
// spaces at the ends.

type Album = AlbumList['albums'][number];

const keyOf = (name: string) => name.trim().toLowerCase();

const whenOf = ({ first, last }: Album) =>
  first === null ? 'no photos yet' : `photos of ${span(first, last ?? first)}`;

/** What becomes of the photos in Immich, said under the name. */
const said = (albums: ReadonlyArray<Album>) => {
  const unknown = albums.find(({ whose }) => whose === 'unknown');
  if (unknown !== undefined) {
    return `Immich has an album called ${unknown.name}, with ${whenOf(unknown)}, and Keepsake can’t tell whether it is yours or one shared with you, so it won’t publish the photos. Give this album another name.`;
  }
  const own = albums.filter(({ whose }) => whose === 'own');
  const [first] = own;
  if (first !== undefined && own.length === 1) {
    return `Immich has an album called ${first.name} already, with ${whenOf(first)}. The photos join it when they are published.`;
  }
  if (first !== undefined) {
    return `Immich has ${count(own.length, 'album')} called ${first.name}, with ${own.map(whenOf).join('; ')}. Keepsake can’t tell which one the photos should join, so it won’t publish them. Give this album another name, or rename all but one of them in Immich.`;
  }
  const [shared] = albums;
  return shared === undefined || typeof shared.whose !== 'object'
    ? ''
    : `${shared.whose.sharedBy} shared an album called ${shared.name} with you, with ${whenOf(shared)}. The photos go into a new album of your own instead.`;
};

export const Joining = ({
  id,
  title,
}: {
  readonly id: string;
  readonly title: string;
}) => {
  const { loaded, retry } = useLoaded('albums', readAlbums);
  if (loaded.status === 'failed') {
    return (
      <div className="mt-3 max-w-[36rem]" id={id}>
        <p aria-live="polite" className="text-wax-yellow">
          Keepsake couldn’t look for albums of this name in Immich, so it can’t
          say whether the photos join one: {loaded.problem}
        </p>
        <button className={`${sideButton} mt-3`} onClick={retry} type="button">
          Look again
        </button>
      </div>
    );
  }
  const key = keyOf(title);
  let words = '';
  if (key !== '' && loaded.status === 'loading') {
    words = 'Looking for albums of this name in Immich.';
  } else if (key !== '' && loaded.status === 'ready') {
    words = said(loaded.value.albums.filter(({ name }) => keyOf(name) === key));
  }
  return (
    <p
      aria-live="polite"
      className={`mt-3 max-w-[36rem] empty:hidden ${loaded.status === 'loading' ? 'text-quiet' : 'text-print'}`}
      id={id}
    >
      {words}
    </p>
  );
};
