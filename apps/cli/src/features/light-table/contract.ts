import type { Box } from '../../shared/domain.ts';
import type { Standing } from '../../shared/standing.ts';
import type { Mark } from './schemas.ts';

// What the page and the server send each other. Only types and constants, so
// the page needs nothing of the rest of keepsake.

export type { Box } from '../../shared/domain.ts';
export type { Standing } from '../../shared/standing.ts';
export type { MarkKind } from './kinds.ts';
export type { Mark, NewLabels, NewMark } from './schemas.ts';

/**
 * A picture to show. `?width=` with one of `pictureWidths` gives a WebP of
 * about that width; without it, the file itself.
 */
export type Picture = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /** A ThumbHash in base64. */
  readonly placeholder: string;
};

const small = 320;
const middle = 640;
const large = 1280;
const largest = 2048;
export const pictureWidths = [small, middle, large, largest] as const;

export type Edit = {
  readonly at: string;
  /** False when no AI version passed the review, so it is the camera's own. */
  readonly isAi: boolean;
  readonly picture: Picture;
  /** The finished photos it replaced, newest first. */
  readonly earlier: ReadonlyArray<{
    readonly at: string;
    readonly picture: Picture;
  }>;
  /**
   * What it shows, in fractions of the camera's picture. It may reach beyond
   * that, where the image model continued the scene.
   */
  readonly crop: Box;
  readonly cropReason: string;
  /** Where its subject is, in fractions of the finished photo. */
  readonly subject: Box;
  readonly caption: string | null;
  /** What the owner wanted of it so far. */
  readonly wish: string | null;
  /** What the reviewing model thinks of it. */
  readonly review: string;
  /** What was removed, in fractions of the finished photo. */
  readonly removed: ReadonlyArray<{ readonly what: string; readonly box: Box }>;
};

export type PhotoView = {
  readonly id: string;
  /** When it was taken by the clocks there: 2026-03-30T18:04:05+08:00. */
  readonly takenAt: string;
  readonly moment: string;
  readonly camera: string | null;
  readonly lens: string | null;
  readonly focalLength: number | null;
  readonly aperture: number | null;
  readonly exposure: number | null;
  readonly iso: number | null;
  /** The camera's own picture. */
  readonly picture: Picture;
  /** The same in full size, which can take a second to get. */
  readonly full: Picture;
  readonly standing: Standing;
  /** What the judging model says, for the best photos of a moment. */
  readonly verdict: {
    readonly score: number;
    readonly subject: string;
    readonly description: string;
    readonly reason: string | null;
  } | null;
  readonly edit: Edit | null;
  readonly labels: ReadonlyArray<string>;
};

/** What a keepsake command is doing with the shoot right now. */
export type Activity = {
  readonly step: string;
  readonly done: number;
  readonly total: number;
  /** The photos being worked on. */
  readonly photos: ReadonlyArray<string>;
};

export type Question = {
  readonly moment: string;
  readonly photos: ReadonlyArray<string>;
};

/** GET /api/shoots/<shoot> */
export type ShootView = {
  readonly name: string;
  /** "Lisbon, May 2026" */
  readonly about: string | null;
  /** Changes whenever anything below does. */
  readonly revision: string;
  readonly album: {
    readonly name: string;
    /** Its page in Immich. */
    readonly url: string;
    readonly readAt: string;
  } | null;
  /** The score from which photos were picked, and how many at most. */
  readonly picked: {
    readonly minimumScore: number;
    readonly maximum: number | null;
  } | null;
  readonly dollars: {
    readonly spent: number;
    /** About what one edit or change costs. */
    readonly perEdit: number;
  };
  /** In the order they were taken. */
  readonly photos: ReadonlyArray<PhotoView>;
  readonly moments: ReadonlyArray<{
    readonly id: string;
    readonly photos: ReadonlyArray<string>;
  }>;
  readonly marks: ReadonlyArray<Mark>;
  readonly activity: Activity | null;
  /** Since when an agent waits for marks. */
  readonly agentWaitsSince: string | null;
  /** What the owner was asked to rate, with what was rated already. */
  readonly rating: {
    readonly questions: ReadonlyArray<Question>;
    readonly ratings: ReadonlyArray<{
      readonly moment: string;
      readonly best: string | null;
      readonly stars: number;
      readonly further: ReadonlyArray<string>;
    }>;
  } | null;
};

/** GET /api/shoots */
export type ShootList = {
  readonly shoots: ReadonlyArray<{
    readonly name: string;
    readonly about: string | null;
    readonly from: string;
    readonly to: string;
    readonly photos: number;
    readonly inAlbum: number;
    /** Marks that aren't handed over, and those answered but not looked at. */
    readonly openMarks: number;
    readonly newAnswers: number;
    /**
     * Up to 60 photos of the album, or the best of the shoot. The first few, for
     * any number of them, stand for the whole.
     */
    readonly covers: ReadonlyArray<Picture>;
  }>;
};

/** GET /api/shoots/<shoot>/events, as server-sent events called `changed`. */
export type Changed = {
  readonly revision: string;
  readonly activity: Activity | null;
  readonly agentWaitsSince: string | null;
};
