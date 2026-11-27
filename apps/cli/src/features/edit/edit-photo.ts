import { Effect, FileSystem, Option, Schema } from 'effect';
import { Box, EditRecord, type Photo, type Pick } from '../../shared/domain.ts';
import type { EditFiles } from '../../shared/edit-files.ts';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { withPhoto } from '../../shared/lock.ts';
import { removedBy } from '../../shared/removed.ts';
import { askReviewer, ReviewVision } from '../../shared/review-vision.ts';
import {
  atomically,
  exists,
  type OpenShoot,
  readJson,
  writeJson,
} from '../../shared/store.ts';
import { wishIn, writeWish } from '../../shared/wishes.ts';
import { isGoingOn, noteProgress } from './anew.ts';
import { bestEdit, captionOf, type Job, writeEdit } from './best-edit.ts';

import { type CorrectionFiles, correct } from './correct/correct.ts';
import { Change, findPlaces, inMarked, type Place } from './correct/places.ts';
import { keepEarlier } from './earlier.ts';
import { finish } from './finish.ts';
import { ImageModel } from './image-model.ts';
import { keptOnFace, removalsOnFaces } from './keep-originals.ts';
import { remembered } from './prepare.ts';
import { sentence } from './prompt.ts';
import { bothWishes, emptied } from './wishes.ts';

export type EditOptions = {
  /** How many versions the image model makes at once. */
  readonly versions: number;
  /** Starts over, from the crop. */
  readonly again: boolean;
  /** What the user wants to be done. */
  readonly wish: string | null;
  /** Where they want it, in fractions of the finished photo. */
  readonly areas: ReadonlyArray<Box>;
};

/** A photo to edit. */
export type ToEdit = {
  readonly pick: Pick;
  readonly photo: Photo;
};

/** How a photo was edited, if it has been. */
export const editOf = Effect.fn('editOf')(function* (
  open: OpenShoot,
  photo: string,
) {
  const files = open.files.edit(photo);
  return (yield* exists(files.final))
    ? yield* readJson(EditRecord, files.record)
    : Option.none<EditRecord>();
});

/** Forgets what is made anew. The camera's own picture is always kept. */
const forget = Effect.fn('forget')(function* (
  files: EditFiles,
  { again, wish }: EditOptions,
) {
  if (again) {
    yield* emptied(files.directory, [files.camera, files.wish, files.earlier]);
  } else if (wish !== null) {
    yield* emptied(files.directory, [
      files.camera,
      files.crop,
      files.input,
      files.earlier,
    ]);
  }
  if (wish !== null) {
    yield* writeWish(files.wish, wish);
  }
});

/** What came of a change to a finished photo, and that it is over. */
const Outcome = Schema.Struct({
  /** What was wanted and didn't work, each with why. */
  notDone: Schema.Array(Schema.String),
});
type Outcome = typeof Outcome.Type;

/** A photo's edit, and what was wanted of it and didn't work. */
export type Edited = Outcome & { readonly record: EditRecord };

const Areas = Schema.Array(Box);
const sameAreas = Schema.toEquivalence(Areas);

type ToChange = {
  readonly job: Job;
  readonly former: EditRecord;
  readonly files: CorrectionFiles;
  readonly wish: string;
  readonly areas: ReadonlyArray<Box>;
};

/** The models a change is made with, as what they make differs. */
const Models = Schema.Struct({
  imageModel: Schema.String,
  reviewModel: Schema.String,
});
const sameModels = Schema.toEquivalence(Models);

/**
 * Forgets an earlier change, but goes on with one that isn't over and is made
 * with the same models. One from before they were noted goes on, since what it
 * made was paid for.
 */
const begin = Effect.fn('begin')(function* ({ files, wish, areas }: ToChange) {
  const models = {
    imageModel: (yield* ImageModel).model,
    reviewModel: (yield* ReviewVision).model,
  };
  const modelsFile = `${files.directory}/models.json`;
  const before = yield* wishIn(files.wish);
  const areasBefore = yield* readJson(Areas, files.areas);
  const modelsBefore = yield* readJson(Models, modelsFile);
  const isSame =
    before === wish &&
    sameAreas(
      Option.getOrElse(areasBefore, () => []),
      areas,
    ) &&
    Option.match(modelsBefore, {
      onNone: () => true,
      onSome: (known) => sameModels(known, models),
    });
  if (!isSame || (yield* exists(files.outcome))) {
    yield* emptied(files.directory, []);
    yield* writeJson(Areas, files.areas, areas);
    yield* writeWish(files.wish, wish);
  }
  yield* writeJson(Models, modelsFile, models);
});

/** Changes single places of a finished photo. */
const changePlaces = Effect.fn('changePlaces')(function* (
  { job, former, files, wish, areas }: ToChange,
  places: ReadonlyArray<Place>,
) {
  const image = yield* ImageModel;
  const { file, description, attempts, left } = yield* askReviewer(
    correct({
      open: job.open,
      versions: job.versions,
      files,
      places,
      areas: areas.length === 0 ? null : areas,
    }),
  );
  const notDone = left.map(({ place, problem }) =>
    [...place.what, ...(problem === null ? [] : [problem])]
      .map(sentence)
      .join(' '),
  );
  if (file === null) {
    return { record: former, notDone } satisfies Edited;
  }
  const caption = captionOf(job, description ?? job.description, true);
  yield* atomically(files.final, (draft) =>
    finish(file, job.camera, draft, caption),
  ).pipe(withPhoto(job.open.files, job.photo.id));
  const record: EditRecord = {
    ...former,
    // Also where it was the camera's own picture before.
    version: 'ai',
    removed: yield* removedBy(former, job.files),
    model: image.model,
    review: [
      `Changed: ${sentence(wish)}`,
      ...notDone.map((what) => `Not done: ${what}`),
    ].join(' '),
    attempts,
  };
  const { record: recordFile, wish: wishFile } = job.files;
  yield* writeJson(EditRecord, recordFile, record);
  yield* writeWish(wishFile, bothWishes(yield* wishIn(wishFile), wish));
  return { record, notDone } satisfies Edited;
});

/** Moves what was made of a photo to where its edit is kept. */
const moved = (from: EditFiles, to: EditFiles) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* emptied(to.directory, [
      to.camera,
      to.crop,
      to.input,
      to.final,
      to.record,
      to.earlier,
      from.directory,
    ]);
    for (const name of yield* fs.readDirectory(from.directory)) {
      yield* fs.rename(`${from.directory}/${name}`, `${to.directory}/${name}`);
    }
    yield* fs.remove(from.directory, { recursive: true });
  }).pipe(
    Effect.catchTag('PlatformError', ({ message }) =>
      Effect.fail(new StoreFailed({ message })),
    ),
  );

/** What was to be removed and stays in an edit, since it is on a face. */
const keptOnFaces = ({
  best,
  prepared,
}: Effect.Success<ReturnType<typeof bestEdit>>): ReadonlyArray<string> =>
  best === null
    ? []
    : removalsOnFaces(prepared.originals, prepared.removed).map(
        (what) => `${sentence(what)} ${sentence(keptOnFace)}`,
      );

/** Edits all of a photo anew. The edit it has stays until that is better. */
const changeAll = Effect.fn('changeAll')(function* ({
  job,
  former,
  files,
  wish,
}: ToChange) {
  const { crop, input, record: recordFile, wish: wishFile } = job.files;
  const wanted = bothWishes(yield* wishIn(wishFile), wish);
  const anew: Job = {
    ...job,
    wish: wanted,
    files: { ...files, crop, input, record: recordFile },
  };
  const made = yield* bestEdit(anew);
  if (made.best === null) {
    return { record: former, notDone: [made.notes] } satisfies Edited;
  }
  const record = yield* writeEdit(anew, made);
  yield* writeWish(files.wish, wanted);
  yield* moved(files, job.files);
  return { record, notDone: keptOnFaces(made) } satisfies Edited;
});

/** Changes a finished photo, as little of it as the wish is about. */
const change = Effect.fn('change')(function* (toChange: ToChange) {
  const { job, former, files, wish, areas } = toChange;
  yield* begin(toChange);
  const removed = yield* removedBy(former, job.files);
  const found = yield* remembered(
    Change,
    files.places,
    askReviewer(
      findPlaces(
        files.final,
        wish,
        areas,
        removed.map(({ what }) => what),
      ),
    ),
  );
  const { everywhere, places } = inMarked(found, areas);
  if (!everywhere && places.length === 0) {
    const nothing =
      areas.length === 0
        ? 'The photo shows nothing that the wish is about.'
        : 'Nothing that the wish is about can change inside the marked places alone.';
    return { record: toChange.former, notDone: [nothing] } satisfies Edited;
  }
  return everywhere
    ? yield* changeAll(toChange)
    : yield* changePlaces(toChange, places);
});

/**
 * Crops, edits and reviews one photo and writes the finished file, or changes
 * the one there is as the user wants.
 */
export const editPhoto = Effect.fn('editPhoto')(function* (
  open: OpenShoot,
  { pick, photo }: ToEdit,
  options: EditOptions,
  /** The command that starts it over or edits it with a wish, if one does. */
  anew: string | null,
) {
  const files = open.files.edit(photo.id);
  const jobFor = (wanted: string | null): Job => ({
    open,
    pick,
    photo,
    files,
    camera: {
      original: `${open.shoot.source}/${photo.file}`,
      timeZone: open.shoot.timeZone,
    },
    description: pick.description,
    wish: wanted,
    versions: options.versions,
  });
  const { wish, areas, again } = options;
  const former = Option.getOrNull(yield* editOf(open, photo.id));
  const isResumed = anew !== null && (yield* isGoingOn(files, anew));
  const noted = (notDone: ReadonlyArray<string> | null) =>
    noteProgress(files, anew, notDone);
  if (!isResumed) {
    yield* keepEarlier(files);
  }
  // Marked places change alone, also in the camera's own picture.
  const isChange =
    former !== null && (former.version === 'ai' || areas.length > 0);
  if (wish !== null && wish !== '' && !again && isChange) {
    const { correction } = files;
    const changed = yield* change({
      job: jobFor(wish),
      former,
      files: correction,
      wish,
      areas,
    });
    yield* writeJson(Outcome, correction.outcome, {
      notDone: changed.notDone,
    });
    yield* noted(changed.notDone);
    return changed;
  }
  // What this command made before it stopped stays, since it cost money.
  if (!isResumed) {
    yield* forget(files, options).pipe(withPhoto(open.files, photo.id));
    yield* noted(null);
  }
  const job = jobFor(yield* wishIn(files.wish));
  const made = yield* bestEdit(job);
  const record = yield* writeEdit(job, made);
  const left = keptOnFaces(made);
  yield* noted(left);
  return { record, notDone: left } satisfies Edited;
});
