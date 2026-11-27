import { describe, expect, it } from 'bun:test';
import { everything, hrefOf, routeOf, withFilters } from './route.ts';

describe('routeOf', () => {
  it('reads the start page and a shoot', () => {
    expect(routeOf('/', '')).toEqual({ screen: 'shoots' });
    expect(routeOf('/lisbon', '')).toEqual({
      screen: 'sheet',
      shoot: 'lisbon',
      filters: everything,
    });
    expect(routeOf('/lisbon/hand-over', '').screen).toBe('hand-over');
    expect(routeOf('/lisbon/news', '').screen).toBe('news');
    // As it was called before.
    expect(routeOf('/lisbon/answers', '').screen).toBe('news');
    expect(routeOf('/lisbon/rate', '').screen).toBe('rate');
    expect(routeOf('/lisbon/anything', '').screen).toBe('sheet');
  });

  it('reads the making of an album, of a folder or of one still to choose', () => {
    expect(routeOf('/', '?new')).toEqual({ screen: 'new', folder: null });
    expect(routeOf('/', '?new=2026%2F2026-03-31%20Gardens')).toEqual({
      screen: 'new',
      folder: '2026/2026-03-31 Gardens',
    });
    // A shoot can be called anything, "new" too.
    expect(routeOf('/new', '')).toMatchObject({
      screen: 'sheet',
      shoot: 'new',
    });
  });

  it('reads a walk through what is new in all the albums', () => {
    const walk = routeOf('/lisbon/news', '?show=album&across');
    expect(walk).toEqual({
      screen: 'news',
      shoot: 'lisbon',
      filters: { ...everything, show: 'album' },
      across: true,
    });
    expect(hrefOf(walk)).toBe('/lisbon/news?show=album&across');
    expect(
      hrefOf({
        screen: 'news',
        shoot: 'lisbon',
        filters: everything,
        across: true,
      }),
    ).toBe('/lisbon/news?across');
    // Only what is new is walked through.
    expect(routeOf('/lisbon/rate', '?across')).not.toHaveProperty('across');
  });

  it('reads the photo keepsake links to', () => {
    expect(routeOf('/lisbon/photos/_DSC0001', '')).toEqual({
      screen: 'photo',
      shoot: 'lisbon',
      photo: '_DSC0001',
      filters: everything,
      isPlaced: false,
    });
  });

  it('reads a photo whose id has slashes, encoded or not', () => {
    const encoded = routeOf('/lisbon/photos/day%201%2Fa%20b', '?show=album');
    expect(encoded).toMatchObject({ photo: 'day 1/a b', isPlaced: true });
    expect(routeOf('/lisbon/photos/day/a', '')).toMatchObject({
      photo: 'day/a',
    });
  });

  it('reads which photos lie on the table', () => {
    const route = routeOf(
      '/lisbon',
      '?show=left&day=2026-05-01&why=weak&label=for%20print',
    );
    expect(route).toMatchObject({
      filters: {
        show: 'left',
        day: '2026-05-01',
        why: 'weak',
        label: 'for print',
      },
    });
  });

  it('ignores what it does not know', () => {
    expect(
      routeOf('/lisbon', '?show=nothing&day=tomorrow&why=repeat'),
    ).toMatchObject({ filters: everything });
    expect(routeOf('/%E0%A4%A', '')).toMatchObject({ shoot: '%E0%A4%A' });
  });
});

describe('hrefOf', () => {
  it('writes what routeOf reads', () => {
    const addresses = [
      '/',
      '/lisbon',
      '/lisbon/hand-over',
      '/lisbon?show=left&day=2026-05-01&why=taken-out',
      '/?new',
      '/?new=2026%2F2026-03-31%20Gardens',
      '/lisbon/photos/day%2Fa?show=all',
      '/lisbon/photos/a?show=album&label=for+print',
    ];
    for (const address of addresses) {
      const [path = '', query = ''] = address.split('?');
      expect(hrefOf(routeOf(path, query))).toBe(address);
    }
  });

  it('changes the filters and keeps the place', () => {
    const route = withFilters(routeOf('/lisbon/photos/a', ''), {
      show: 'album',
    });
    expect(hrefOf(route)).toBe('/lisbon/photos/a?show=album');
    expect(withFilters({ screen: 'shoots' }, { show: 'left' })).toEqual({
      screen: 'shoots',
    });
    const making = { screen: 'new', folder: 'Camera' } as const;
    expect(withFilters(making, { show: 'left' })).toEqual(making);
  });
});
