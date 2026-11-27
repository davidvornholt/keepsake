// Writes a made-up shoot, the way the commands would have left it.
import { join } from 'node:path';
import type {
  Album,
  EditRecord,
  Moment,
  Photo,
  PickList,
  Reason,
  Removed,
  Shoot,
  Verdict,
} from '../../src/shared/domain.ts';
import { handed, marks } from './marks.ts';
import { type MadeUp, moments } from './moments.ts';
import { drawn } from './pictures.ts';

/** How far the shoot is: each step has what those before it have. */
const steps = ['scanned', 'culled', 'chosen', 'edited', 'published'] as const;

export type Wanted = {
  readonly name: string;
  readonly title: string;
  readonly about: string;
  readonly step: (typeof steps)[number];
  /** Whether the owner was asked to rate some of its moments. */
  readonly toRate?: boolean;
  /** Why getting it ready stopped, when the page was doing that. */
  readonly stopped?: string;
  /** Whether the owner ordered the album of what was chosen. */
  readonly isOrdered?: boolean;
  /** The year and month it was taken in. */
  readonly month: string;
  /** Makes its pictures different from those of other shoots. */
  readonly seed: number;
  /** Why taking out the photo in front of D60 failed, when the page tried. */
  readonly failedTakeOut?: string;
};

const model = 'claude/claude-opus-5-5';
const minimumScore = 7;
const size = { width: 720, height: 480 };
const previewSize = { width: 480, height: 320 };
const readAt = '2026-05-09T12:00:00.000Z';

const idsOf = (index: number, { frames }: MadeUp) =>
  Array.from({ length: frames }, (_, frame) => `D${(index + 1) * 10 + frame}`);

const all = moments.map((moment, index) => {
  const photos = idsOf(index, moment);
  return { ...moment, index, photos, id: photos[0] ?? '' };
});
type Told = (typeof all)[number];

const bestOf = ({ photos }: Told) => photos.at(-1) ?? '';
const judged = all.filter(({ standing }) => standing.kind !== 'unjudged');
const inAlbum = all.filter(({ standing }) => standing.kind === 'album');
const edited = all.filter(({ standing }) =>
  ['album', 'picked'].includes(standing.kind),
);

const monthLength = 7;

const photoOf = (
  { at, index }: Told,
  month: string,
  [frame, id]: readonly [number, string],
): Photo => ({
  id,
  file: `${id}.ARW`,
  takenAt: `${month}${at.slice(monthLength)}.${frame}00`,
  utcOffset: '+01:00',
  camera: 'ILCE-7M4',
  lens: index % 3 === 0 ? 'Sigma 24-70mm F2.8 DG DN Art' : null,
  focalLength: 24 + index * 5,
  aperture: 2.8 + (index % 4),
  exposure: 1 / (60 * (1 + (index % 8))),
  iso: 100 * (1 + (index % 5)),
  orientation: 1,
  ...previewSize,
  raw: true,
  cameraJpeg: true,
  hash: '0000000000000000',
});

const verdictOf = (told: Told): Verdict => ({
  moment: told.id,
  photos: told.photos,
  model,
  best: [bestOf(told), ...told.photos.slice(0, -1)],
  score: told.score,
  subject: told.subject as Verdict['subject'],
  description: told.description,
  reason: 'It is sharp, and the light is good.',
  further: [],
});

const picksOf = (): PickList => {
  const good = judged.filter(({ score }) => score >= minimumScore);
  const candidates = good.map((told) => ({
    photo: bestOf(told),
    moment: told.id,
    score: told.score,
    subject: told.subject as Verdict['subject'],
    description: told.description,
  }));
  const isPicked = new Set(
    good
      .filter(({ standing }) =>
        ['album', 'picked', 'taken-out'].includes(standing.kind),
      )
      .map(bestOf),
  );
  return {
    model,
    minimumScore,
    maximum: isPicked.size,
    candidates,
    picks: candidates.filter(({ photo }) => isPicked.has(photo)),
    leftOut: candidates
      .filter(({ photo }) => !isPicked.has(photo))
      .map(({ photo }) => ({ photo, insteadOf: null })),
  };
};

const reasons = all.flatMap((told): ReadonlyArray<Reason> => {
  const { standing } = told;
  if (standing.kind !== 'repeat' && standing.kind !== 'weaker') {
    return [];
  }
  const other =
    standing.kind === 'repeat' ? all[standing.number - 1] : undefined;
  return [
    {
      photo: bestOf(told),
      repeats: other === undefined ? null : bestOf(other),
      because: standing.because,
      model,
    },
  ];
});

const removed = all.flatMap(
  (told): ReadonlyArray<Removed> =>
    told.standing.kind === 'taken-out'
      ? [{ photo: bestOf(told), at: readAt, because: told.standing.because }]
      : [],
);

const albumOf = ({ title, name }: Wanted): Album => ({
  id: `album-${name}`,
  name: title,
  server: 'https://photos.example.com',
  readAt,
  photos: inAlbum.map((told) => ({
    photo: bestOf(told),
    asset: `asset-${told.id}`,
    favorite: told.standing.kind === 'album' && told.standing.favorite === true,
  })),
});

const whole = { left: 0, top: 0, right: 1, bottom: 1 };
const subject = { left: 0.3, top: 0.3, right: 0.7, bottom: 0.75 };

const recordOf = (told: Told): EditRecord => ({
  photo: bestOf(told),
  version: told.version ?? 'ai',
  model: 'azure/gpt-image-2.5-sunburst',
  crop: {
    box: told.crop ?? whole,
    aspect: '3:2',
    subject,
    reason: 'It leaves out the empty edge and gives the subject room.',
  },
  review:
    told.version === undefined
      ? 'The light is warmer, and everything is where it was.'
      : 'Both versions changed the trees, so this is the camera’s picture.',
  attempts: 2,
});

const write = (root: string, path: string, value: unknown) =>
  Bun.write(
    join(root, path),
    value instanceof Buffer ? new Uint8Array(value) : JSON.stringify(value),
  );

const writeEdit = (root: string, told: Told, seed: number) => {
  const id = bestOf(told);
  const folder = join('edits', id);
  const { crop = whole, version, removed: gone = [], earlier = 0 } = told;
  const own = {
    seed,
    part: crop,
    width: Math.round(size.width * (crop.right - crop.left)),
    height: Math.round(size.height * (crop.bottom - crop.top)),
  };
  const look = version === 'camera' ? 'camera' : 'edited';
  const replaced = Array.from({ length: earlier }, (_, index) =>
    write(
      root,
      join(folder, 'earlier', `${Date.parse(readAt) + index}.jpg`),
      drawn({ ...own, look: 'camera' }),
    ),
  );
  return Promise.all([
    write(root, join(folder, 'edit.json'), recordOf(told)),
    write(root, join(folder, 'removals.json'), gone),
    write(root, join(folder, 'wish.json'), { wish: told.wish ?? '' }),
    write(root, join(folder, 'description.json'), {
      description: told.description,
    }),
    write(
      root,
      join(folder, `${id}.jpg`),
      drawn({ ...size, seed, look: 'camera' }),
    ),
    write(root, join(folder, `${id}-keepsake.jpg`), drawn({ ...own, look })),
    ...replaced,
  ]);
};

/** The frames before the best one show a little less of it. */
const partOf = ({ photos }: Told, frame: number) => {
  const off = (photos.length - 1 - frame) * 0.02;
  return { left: off, top: off / 2, right: 1 - off / 2, bottom: 1 - off };
};

const writeCulled = (root: string) =>
  Promise.all([
    write(root, 'judge.json', { model }),
    ...judged.map((told) =>
      write(
        root,
        join('verdicts', model.replace('/', '--'), `${told.id}.json`),
        verdictOf(told),
      ),
    ),
  ]);

const perEdit = 0.75;

const writeChosen = (root: string, wanted: Wanted) =>
  Promise.all([
    write(root, 'picks.json', picksOf()),
    write(root, 'reasons.json', reasons),
    ...(wanted.isOrdered === true
      ? [
          write(root, join('hand-overs', 'order.json'), {
            id: 'order',
            at: readAt,
            dollars: edited.length * perEdit,
            spentBefore: 0,
            marks: [],
            album: picksOf().picks.map(({ photo }) => photo),
            fulfilledAt: null,
          }),
        ]
      : []),
  ]);

const writeEdited = (root: string, wanted: Wanted) =>
  Promise.all([
    write(root, 'spending.json', {
      'azure/gpt-image-2.5-sunburst': {
        calls: 24,
        inputTokens: 90_000,
        outputTokens: 210_000,
        dollars: 7.02,
      },
    }),
    ...edited.map((told) => writeEdit(root, told, wanted.seed + told.index)),
  ]);

const writePublished = (root: string, wanted: Wanted) =>
  Promise.all([
    write(root, 'removed.json', removed),
    write(root, 'album.json', albumOf(wanted)),
    write(
      root,
      'labels.json',
      Object.fromEntries([
        [shownOf('D60'), ['print']],
        [shownOf('D120'), ['print', 'calendar']],
      ]),
    ),
    ...marks.map(({ handedOverAt, ...mark }) =>
      write(root, join('marks', `${mark.id}.json`), {
        ...mark,
        photo: shownOf(mark.photo),
      }),
    ),
    write(root, join('hand-overs', 'marks.json'), {
      id: 'marks',
      at: handed,
      dollars: perEdit,
      spentBefore: 0,
      marks: marks.flatMap(({ id, handedOverAt }) =>
        handedOverAt === null ? [] : [id],
      ),
      album: null,
      fulfilledAt: null,
    }),
  ]);

/** The best photo of the moment that begins with this one. */
const shownOf = (first: string) => {
  const told = all.find(({ id }) => id === first);
  return told === undefined ? first : bestOf(told);
};

/** Writes the shoot into keepsake's folder of shoots. */
export const writeShoot = async (shoots: string, wanted: Wanted) => {
  const root = join(shoots, wanted.name);
  const progress = steps.indexOf(wanted.step);
  const shoot: Shoot = {
    name: wanted.name,
    source: join(root, 'no-photos-here'),
    title: wanted.title,
    about: wanted.about,
    timeZone: 'Europe/Lisbon',
  };
  await Promise.all([
    write(root, 'shoot.json', shoot),
    write(
      root,
      'photos.json',
      all.flatMap((told) =>
        [...told.photos.entries()].map((frame) =>
          photoOf(told, wanted.month, frame),
        ),
      ),
    ),
    write(
      root,
      'moments.json',
      all.map(({ id, photos }): Moment => ({ id, photos })),
    ),
    ...all.flatMap((told) =>
      told.photos.map((id, frame) =>
        write(
          root,
          join('previews', `${id}.jpg`),
          drawn({
            ...previewSize,
            seed: wanted.seed + told.index,
            part: partOf(told, frame),
            look: 'camera',
          }),
        ),
      ),
    ),
    ...(progress >= 1 ? [writeCulled(root)] : []),
    ...(progress >= 2 ? [writeChosen(root, wanted)] : []),
    ...(progress >= 3 ? [writeEdited(root, wanted)] : []),
    ...(progress >= 4 ? [writePublished(root, wanted)] : []),
    ...(wanted.stopped === undefined
      ? []
      : [
          write(root, 'preparation.json', {
            process: 0,
            since: readAt,
            maximum: null,
            stopped: wanted.stopped,
          }),
        ]),
    ...(wanted.failedTakeOut === undefined
      ? []
      : [
          write(root, 'choices.json', [
            {
              action: 'failed',
              photo: shownOf('D60'),
              wants: 'out',
              because: 'You didn’t want it in the album.',
              madeAt: readAt,
              failed: wanted.failedTakeOut,
            },
          ]),
        ]),
    ...(wanted.toRate === true
      ? [
          write(root, 'to-rate.json', ['D10', 'D60', 'D120']),
          write(root, 'ratings.json', [
            {
              moment: 'D10',
              photos: all[0]?.photos,
              best: 'D12',
              stars: 4,
              further: ['D10'],
            },
          ]),
        ]
      : []),
  ]);
};
