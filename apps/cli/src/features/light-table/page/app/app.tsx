import { NewAlbum } from '../new/new-album.tsx';
import { Arriving } from '../shoots/arriving.tsx';
import { Shelf } from '../shoots/shelf.tsx';
import { useRoute } from './router.ts';
import { Shoot } from './shoot.tsx';

export const App = () => {
  const route = useRoute();
  const shoot = 'shoot' in route ? route.shoot : null;
  return (
    <>
      {route.screen === 'shoots' ? <Shelf /> : null}
      {route.screen === 'new' ? <NewAlbum folder={route.folder} /> : null}
      {'shoot' in route ? <Shoot key={route.shoot} route={route} /> : null}
      <Arriving shoot={shoot} />
    </>
  );
};
