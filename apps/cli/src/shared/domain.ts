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
  /** The album's name in Immich and on the page: "Lisbon". */
  title: Schema.String,
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
  /** How far that clock was from UTC, such as +02:00, if the camera said so. */
  utcOffset: Schema.NullOr(Schema.String),
  camera: Schema.NullOr(Schema.String),
  lens: Schema.NullOr(Schema.String),
  /** In millimetres. */
  focalLength: Schema.NullOr(Schema.Finite),
  /** The f-number. */
  aperture: Schema.NullOr(Schema.Finite),
  /** In seconds. */
  exposure: Schema.NullOr(Schema.Finite),
  iso: Schema.NullOr(Schema.Finite),
  /** The EXIF orientation, 1 to 8. */
  orientation: Schema.Int,
  /** In pixels, the right way up. */
  width: Schema.Int,
  height: Schema.Int,
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
  /** From 1, throw away, to 10, a highlight, for the best photo. */
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

/** A candidate that wasn't picked. */
export const LeftOut = Schema.Struct({
  photo: Schema.String,
  /** The candidate that shows the same better, or null for lack of room. */
  insteadOf: Schema.NullOr(Schema.String),
});
export type LeftOut = typeof LeftOut.Type;

export const PickList = Schema.Struct({
  model: Schema.String,
  minimumScore: Schema.Int,
  maximum: Schema.NullOr(Schema.Int),
  /** Every photo that scored high enough. */
  candidates: Schema.Array(Pick),
  picks: Schema.Array(Pick),
  leftOut: Schema.Array(LeftOut),
});
export type PickList = typeof PickList.Type;

/** Why a photo isn't in the album, found by looking at it next to the album. */
export const Reason = Schema.Struct({
  photo: Schema.String,
  /** A photo of the album that shows the same better. */
  repeats: Schema.NullOr(Schema.String),
  because: Schema.String,
  model: Schema.String,
});
export type Reason = typeof Reason.Type;

/** A photo of the album in Immich. */
export const AlbumPhoto = Schema.Struct({
  photo: Schema.String,
  asset: Schema.String,
  favorite: Schema.Boolean,
});
export type AlbumPhoto = typeof AlbumPhoto.Type;

/** The album as Immich last had it. */
export const Album = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The web address of Immich. */
  server: Schema.String,
  readAt: Schema.String,
  photos: Schema.Array(AlbumPhoto),
});
export type Album = typeof Album.Type;

/** A photo that was taken out of the album. */
export const Removed = Schema.Struct({
  photo: Schema.String,
  at: Schema.String,
  because: Schema.NullOr(Schema.String),
  /**
   * The id of the album it went missing from. Without one it stays out of
   * every album, as the owner asked or as records from before ids were kept.
   */
  album: Schema.optionalKey(Schema.String),
});
export type Removed = typeof Removed.Type;

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

/** Points along an outline, in order. */
export const Outline = Schema.Array(Point);
export type Outline = typeof Outline.Type;

/** A person who can be recognised, in fractions of the cropped photo. */
export const Person = Schema.Struct({
  face: Box,
  /** Around everything that belongs to the person. */
  outline: Outline,
});
export type Person = typeof Person.Type;

/** A text or a logo in a photo, in fractions of the cropped photo. */
export const Sign = Schema.Struct({ text: Schema.String, box: Box });
export type Sign = typeof Sign.Type;

/** Something that is to be removed from a photo, and where it is. */
export const Removal = Schema.Struct({ what: Schema.String, box: Box });
export type Removal = typeof Removal.Type;

export const Crop = Schema.Struct({
  /**
   * What the finished photo shows, in fractions of the whole photo. It may
   * reach beyond the photo, where the image model continues the scene.
   */
  box: Box,
  aspect: Schema.Literals(aspectNames),
  /** The subject, in fractions of what the finished photo shows. */
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
  /**
   * What the edit took out of the photo, in fractions of the finished photo.
   * Edits from before it was noted took out what `removals.json` lists.
   */
  removed: Schema.optionalKey(Schema.Array(Removal)),
});
export type EditRecord = typeof EditRecord.Type;

/**
 * What Immich answered to the shoot's upload of a file: whether it made a new
 * asset of it, and whether the shoot put the asset into the album. Immich
 * keeps a file once, so the asset may be the owner's or another shoot's, and
 * be in the album already. Records from before keepsake noted this have
 * neither: all their uploads were keepsake's own files, which it put there.
 */
const Ownership = {
  created: Schema.optionalKey(Schema.Boolean),
  added: Schema.optionalKey(Schema.Boolean),
};

/** A photo keepsake uploaded to an album. */
export const PublishedPhoto = Schema.Struct({
  photo: Schema.String,
  asset: Schema.String,
  cameraAsset: Schema.String,
  /** The SHA-256 of the file that was published. */
  digest: Schema.String,
  /**
   * Earlier uploads of the photo that keepsake made and put into the album,
   * which may wait there for the trash.
   */
  replaced: Schema.optionalKey(Schema.Array(Schema.String)),
  ...Ownership,
});
export type PublishedPhoto = typeof PublishedPhoto.Type;

/**
 * The upload of a photo whose finished file Immich took, noted as soon as it
 * answered, before the rest of the photo is sent. It is noted under `photos`
 * once all of the photo is sent.
 */
export const SendingPhoto = Schema.Struct({
  photo: Schema.String,
  asset: Schema.String,
  ...Ownership,
});
export type SendingPhoto = typeof SendingPhoto.Type;

/**
 * An upload that a publish from before keepsake noted every upload found by
 * its file's name, `<photo>-keepsake.jpg`, and that keepsake took on once as
 * the photo's. It is keepsake's own.
 */
export const AdoptedPhoto = Schema.Struct({
  photo: Schema.String,
  asset: Schema.String,
});
export type AdoptedPhoto = typeof AdoptedPhoto.Type;

/** What keepsake published to an album it published to before the last. */
export const EarlierAlbum = Schema.Struct({
  album: Schema.String,
  albumId: Schema.String,
  /**
   * Whether the album was this account's own rather than shared with it, when
   * keepsake last published to it. Missing in records from before it noted it.
   */
  owned: Schema.optionalKey(Schema.Boolean),
  photos: Schema.Array(PublishedPhoto),
  sending: Schema.optionalKey(Schema.Array(SendingPhoto)),
  adopted: Schema.optionalKey(Schema.Array(AdoptedPhoto)),
});
export type EarlierAlbum = typeof EarlierAlbum.Type;

export const Publication = Schema.Struct({
  /** The album's name when keepsake last published to it. */
  album: Schema.String,
  /** Missing only in records from before keepsake kept the album's id. */
  albumId: Schema.optionalKey(Schema.String),
  /** Whether the album is this account's own, as for an earlier album. */
  owned: Schema.optionalKey(Schema.Boolean),
  /** What was published to this album, and to no other. */
  photos: Schema.Array(PublishedPhoto),
  sending: Schema.optionalKey(Schema.Array(SendingPhoto)),
  adopted: Schema.optionalKey(Schema.Array(AdoptedPhoto)),
  /**
   * Whether the uploads that `album.json` named by their file's name were
   * taken on, which happens once, so nothing is found by name after it.
   * Missing in records from before keepsake noted every upload.
   */
  namesAdopted: Schema.optionalKey(Schema.Boolean),
  /** Replaced uploads that no `publish` has named under `outdated` yet. */
  outdated: Schema.optionalKey(Schema.Array(Schema.String)),
  /** The other albums keepsake published to, by their id. */
  elsewhere: Schema.optionalKey(Schema.Array(EarlierAlbum)),
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
