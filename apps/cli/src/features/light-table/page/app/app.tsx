import { Arriving } from '../shoots/arriving.tsx';
import { Shoots } from '../shoots/shoots.tsx';
import { useRoute } from './router.ts';
import { Shoot } from './shoot.tsx';

export const App = () => {
  const route = useRoute();
  return (
    <>
      {route.screen === 'shoots' ? (
        <Shoots />
      ) : (
        <Shoot key={route.shoot} route={route} />
      )}
      <Arriving shoot={route.screen === 'shoots' ? null : route.shoot} />
    </>
  );
};
