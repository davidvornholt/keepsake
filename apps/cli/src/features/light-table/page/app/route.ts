// The address of everything the page shows. A photo's address is the one
// agents link to: /<shoot>/photos/<photo>.

export const shows = ['all', 'album', 'left'] as const;
export type Show = (typeof shows)[number];

export const whys = [
  'repeat',
  'weaker',
  'score',
  'no-room',
  'unknown',
  'taken-out',
  'other-frame',
] as const;
export type Why = (typeof whys)[number];

/** Which photos lie on the table. */
export type Filters = {
  readonly show: Show;
  readonly day: string | null;
  readonly why: Why | null;
  readonly label: string | null;
};

export const everything: Filters = {
  show: 'all',
  day: null,
  why: null,
  label: null,
};

export type Route =
  | { readonly screen: 'shoots' }
  | {
      readonly screen: 'sheet' | 'hand-over' | 'answers' | 'rate';
      readonly shoot: string;
      readonly filters: Filters;
    }
  | {
      readonly screen: 'photo';
      readonly shoot: string;
      readonly photo: string;
      readonly filters: Filters;
      /** False when the address says nothing about what lies on the table. */
      readonly isPlaced: boolean;
    };

/** A shoot with something of its own shown: the table, or what lies over it. */
export type Place = Exclude<
  Route,
  { readonly screen: 'shoots' } | { readonly screen: 'photo' }
>;

const oneOf = <Name extends string>(
  names: ReadonlyArray<Name>,
  value: string | null,
): Name | null => names.find((name) => name === value) ?? null;

const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;

const filtersOf = (search: URLSearchParams): Filters => {
  const day = search.get('day');
  const show = oneOf(shows, search.get('show')) ?? 'all';
  return {
    show,
    day: day !== null && dayPattern.test(day) ? day : null,
    why: show === 'left' ? oneOf(whys, search.get('why')) : null,
    label: search.get('label'),
  };
};

const decoded = (part: string): string => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

const screens = ['hand-over', 'answers', 'rate'] as const;

/** What an address shows. */
export const routeOf = (pathname: string, query: string): Route => {
  const [shoot, kind, ...rest] = pathname
    .split('/')
    .filter((part) => part !== '')
    .map(decoded);
  if (shoot === undefined) {
    return { screen: 'shoots' };
  }
  const search = new URLSearchParams(query);
  const filters = filtersOf(search);
  if (kind === 'photos' && rest.length > 0) {
    return {
      screen: 'photo',
      shoot,
      // An id with slashes also arrives when they weren't encoded.
      photo: rest.join('/'),
      filters,
      isPlaced: search.has('show'),
    };
  }
  return { screen: oneOf(screens, kind ?? null) ?? 'sheet', shoot, filters };
};

const queryOf = (filters: Filters, isPlaced: boolean): string => {
  const search = new URLSearchParams();
  if (isPlaced || filters.show !== 'all') {
    search.set('show', filters.show);
  }
  if (filters.day !== null) {
    search.set('day', filters.day);
  }
  if (filters.why !== null && filters.show === 'left') {
    search.set('why', filters.why);
  }
  if (filters.label !== null) {
    search.set('label', filters.label);
  }
  const query = search.toString();
  return query === '' ? '' : `?${query}`;
};

/** The address of something the page shows. */
export const hrefOf = (route: Route): string => {
  if (route.screen === 'shoots') {
    return '/';
  }
  const shoot = `/${encodeURIComponent(route.shoot)}`;
  if (route.screen === 'photo') {
    return `${shoot}/photos/${encodeURIComponent(route.photo)}${queryOf(route.filters, route.isPlaced)}`;
  }
  const tail = route.screen === 'sheet' ? '' : `/${route.screen}`;
  return `${shoot}${tail}${queryOf(route.filters, false)}`;
};

/** The same place with other photos on the table. */
export const withFilters = (route: Route, change: Partial<Filters>): Route =>
  route.screen === 'shoots'
    ? route
    : { ...route, filters: { ...route.filters, ...change } };
