import type {
  Choice,
  Edit,
  Mark,
  PhotoView,
  Picture,
  ShootView,
  Standing,
} from '../../contract.ts';

// A made-up shoot for the tests of the page's own logic.

const landscape = { width: 3000, height: 2000 } as const;

export const samplePicture = (
  name: string,
  size: { readonly width: number; readonly height: number } = landscape,
): Picture => ({ src: `/pictures/${name}`, ...size, placeholder: '' });

export const sampleEdit = (name: string, change: Partial<Edit> = {}): Edit => ({
  at: '2026-05-20T10:00:00.000Z',
  isAi: true,
  picture: samplePicture(`${name}/final`),
  earlier: [],
  crop: { left: 0, top: 0, right: 1, bottom: 1 },
  cropReason: '',
  subject: { left: 0, top: 0, right: 1, bottom: 1 },
  caption: null,
  wish: null,
  review: '',
  removed: [],
  ...change,
});

const inAlbum: Standing = { kind: 'album', url: '', favorite: false };

export const samplePhoto = (
  id: string,
  change: Partial<PhotoView> = {},
): PhotoView => ({
  id,
  takenAt: '2026-05-01T10:00:00+01:00',
  stack: id,
  moment: id,
  camera: null,
  lens: null,
  focalLength: null,
  aperture: null,
  exposure: null,
  iso: null,
  picture: samplePicture(`${id}/preview`),
  full: samplePicture(`${id}/camera`),
  standing: inAlbum,
  verdict: null,
  edit: null,
  labels: [],
  ...change,
});

/** A photo that lies behind another of its moment, which shows the same. */
export const sampleBehind = (
  id: string,
  front: string,
  change: Partial<PhotoView> = {},
): PhotoView =>
  samplePhoto(id, {
    stack: front,
    moment: front,
    standing: { kind: 'similar', to: front, because: null },
    ...change,
  });

export const sampleMark = (id: string, change: Partial<Mark> = {}): Mark => ({
  id,
  photo: id,
  note: '',
  boxes: [],
  madeAt: '2026-05-21T09:00:00.000Z',
  handedOverAt: null,
  answer: null,
  seenAt: null,
  ...change,
});

/** A photo the owner took out, which waits to be done. */
export const sampleChoice = (
  photo: string,
  change: Partial<Choice> = {},
): Choice => ({
  action: `for-${photo}`,
  photo,
  wants: 'out',
  because: 'You didn’t want it in the album.',
  madeAt: '2026-05-21T09:00:00.000Z',
  failed: null,
  ...change,
});

export const sampleShoot = (
  photos: ReadonlyArray<PhotoView>,
  marks: ReadonlyArray<Mark> = [],
  choices: ReadonlyArray<Choice> = [],
): ShootView => ({
  name: 'lisbon',
  title: 'Lisbon',
  about: 'Lisbon, May 2026',
  revision: 'one',
  album: null,
  picked: { minimumScore: 7, maximum: 170 },
  dollars: { spent: 0, perEdit: 0.75, hold: 0.74 },
  photos,
  stacks: [...Map.groupBy(photos, (photo) => photo.stack)].map(
    ([front, own]) => ({ front, photos: own.map((photo) => photo.id) }),
  ),
  marks,
  choices,
  activity: null,
  preparation: null,
  carrying: { since: null, stopped: null },
  added: [],
  ordered: null,
  rating: null,
});
