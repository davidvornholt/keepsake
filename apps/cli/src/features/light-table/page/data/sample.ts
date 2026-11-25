import type {
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

/** A photo that lies behind another, which shows the same. */
export const sampleBehind = (
  id: string,
  front: string,
  change: Partial<PhotoView> = {},
): PhotoView =>
  samplePhoto(id, {
    stack: front,
    standing: { kind: 'similar', to: front, because: null },
    ...change,
  });

export const sampleMark = (id: string, change: Partial<Mark> = {}): Mark => ({
  id,
  photo: id,
  kind: 'take-out',
  note: '',
  boxes: [],
  other: null,
  madeAt: '2026-05-21T09:00:00.000Z',
  handedOverAt: null,
  answer: null,
  seenAt: null,
  ...change,
});

export const sampleShoot = (
  photos: ReadonlyArray<PhotoView>,
  marks: ReadonlyArray<Mark> = [],
): ShootView => ({
  name: 'lisbon',
  about: 'Lisbon, May 2026',
  revision: 'one',
  album: null,
  picked: { minimumScore: 7, maximum: 170 },
  dollars: { spent: 0, perEdit: 0.75 },
  photos,
  stacks: [...Map.groupBy(photos, (photo) => photo.stack)].map(
    ([front, own]) => ({ front, photos: own.map((photo) => photo.id) }),
  ),
  marks,
  activity: null,
  preparation: null,
  agent: { waitsSince: null, canStart: true, started: null },
  ordered: null,
  rating: null,
});
