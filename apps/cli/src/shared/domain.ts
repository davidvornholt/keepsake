import { Schema } from 'effect';

/** A rectangle in fractions of the image's width and height, from 0 to 1. */
export const Box = Schema.Struct({
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
});
export type Box = typeof Box.Type;

/** A folder of photos keepsake works on. */
export const Shoot = Schema.Struct({
  name: Schema.String,
  /** The folder the photos are in. keepsake only ever reads it. */
  source: Schema.String,
  /** Where and when, for the models: "Lisbon, May 2026". */
  about: Schema.NullOr(Schema.String),
  /** Where the photos were taken, if the camera's clock was set elsewhere. */
  timeZone: Schema.optionalKey(Schema.String),
});
export type Shoot = typeof Shoot.Type;

export const Photo = Schema.Struct({
  /** The file's path below the source, without its extension. */
  id: Schema.String,
  /** The file's path below the source. */
  file: Schema.String,
  /** The camera's clock without a time zone: 2026-03-30T18:04:05.120. */
  takenAt: Schema.String,
  camera: Schema.NullOr(Schema.String),
  lens: Schema.NullOr(Schema.String),
  /** In millimetres. */
  focalLength: Schema.NullOr(Schema.Finite),
  /** The EXIF orientation, 1 to 8. */
  orientation: Schema.Int,
  raw: Schema.Boolean,
  /** Whether the RAW file holds the camera's own full-size JPEG. */
  cameraJpeg: Schema.Boolean,
  /** A difference hash, for telling how alike two photos look. */
  hash: Schema.String,
});
export type Photo = typeof Photo.Type;

/** Photos of the same thing taken one after the other, such as a burst. */
export const Moment = Schema.Struct({
  /** The id of its first photo. */
  id: Schema.String,
  photos: Schema.Array(Schema.String),
});
export type Moment = typeof Moment.Type;

export const subjects = [
  'bird',
  'animal',
  'person',
  'landscape',
  'architecture',
  'plant',
  'food',
  'detail',
  'other',
] as const;

/** The model that was last asked to judge the whole shoot. */
export const Judge = Schema.Struct({ model: Schema.String });
export type Judge = typeof Judge.Type;

/** A photo that belongs in the album next to the best one of its moment. */
export const Further = Schema.Struct({
  photo: Schema.String,
  score: Schema.Int,
  description: Schema.String,
});
export type Further = typeof Further.Type;

/** What a vision model thinks of one moment. */
export const Verdict = Schema.Struct({
  moment: Schema.String,
  /** The photos it judged, so a changed moment is judged again. */
  photos: Schema.Array(Schema.String),
  model: Schema.String,
  /** The best photos, best first. */
  best: Schema.Array(Schema.String),
  /** From 1, throw away, to 10, outstanding, for the best photo. */
  score: Schema.Int,
  subject: Schema.Literals(subjects),
  /** What the best photo shows, for the edit prompt and the caption. */
  description: Schema.String,
  reason: Schema.String,
  /** Others of its best photos that show something clearly different. */
  further: Schema.Array(Further),
});
export type Verdict = typeof Verdict.Type;

/** A photo chosen for editing. */
export const Pick = Schema.Struct({
  photo: Schema.String,
  moment: Schema.String,
  score: Schema.Int,
  subject: Schema.Literals(subjects),
  description: Schema.String,
});
export type Pick = typeof Pick.Type;

export const PickList = Schema.Struct({
  model: Schema.String,
  maximum: Schema.NullOr(Schema.Int),
  /** Every photo that scored high enough. */
  candidates: Schema.Array(Pick),
  picks: Schema.Array(Pick),
  /** Photos left out because a pick shows the same thing better. */
  redundant: Schema.Array(Schema.String),
});
export type PickList = typeof PickList.Type;

/** The shapes a photo can be cropped to, as width to height. */
export const aspectNames = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
] as const;
export type AspectName = (typeof aspectNames)[number];

/** A shape's width divided by its height. */
export const ratioOf = (aspect: AspectName): number => {
  const [width, height] = aspect.split(':').map(Number);
  return (width ?? 1) / (height ?? 1);
};

/** A point in fractions of a picture's width and height. */
export const Point = Schema.Struct({ x: Schema.Finite, y: Schema.Finite });
export type Point = typeof Point.Type;

/** A person who can be recognised, in fractions of the cropped photo. */
export const Person = Schema.Struct({
  face: Box,
  /** Around everything that belongs to the person. */
  outline: Schema.Array(Point),
});
export type Person = typeof Person.Type;

/** A text or a logo in a photo, in fractions of the cropped photo. */
export const Sign = Schema.Struct({ text: Schema.String, box: Box });
export type Sign = typeof Sign.Type;

export const Crop = Schema.Struct({
  /** What stays, in fractions of the whole photo. */
  box: Box,
  aspect: Schema.Literals(aspectNames),
  /** The subject, in fractions of what stays. */
  subject: Box,
  reason: Schema.String,
});
export type Crop = typeof Crop.Type;

export const EditRecord = Schema.Struct({
  photo: Schema.String,
  /** `camera` when no AI version passed the review. */
  version: Schema.Literals(['ai', 'camera']),
  model: Schema.String,
  crop: Crop,
  review: Schema.String,
  /** How many versions the image model made. */
  attempts: Schema.Int,
});
export type EditRecord = typeof EditRecord.Type;

export const Publication = Schema.Struct({
  album: Schema.String,
  photos: Schema.Array(
    Schema.Struct({
      photo: Schema.String,
      asset: Schema.String,
      cameraAsset: Schema.String,
      /** The SHA-256 of the file that was published. */
      digest: Schema.String,
    }),
  ),
});
export type Publication = typeof Publication.Type;

/** The owner's own choice for one moment, to measure models against. */
export const Rating = Schema.Struct({
  moment: Schema.String,
  photos: Schema.Array(Schema.String),
  /** The best photo, or null if none is worth keeping. */
  best: Schema.NullOr(Schema.String),
  /** How good the best photo is: 0 to throw away, up to 5 stars. */
  stars: Schema.Int,
  /** Other photos worth keeping next to the best one. */
  further: Schema.Array(Schema.String),
});
export type Rating = typeof Rating.Type;
