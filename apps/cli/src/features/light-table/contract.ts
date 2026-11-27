import type { Box } from '../../shared/domain.ts';
import type { Standing } from '../../shared/standing.ts';
import type { Mark } from './schemas.ts';

// What the page and the server send each other. Only types and constants, so
// the page needs nothing of the rest of keepsake.

export type { Box } from '../../shared/domain.ts';
export type { Standing } from '../../shared/standing.ts';
export type { MarkKind } from './kinds.ts';
export type {
  Favorite,
  HandOver,
  Mark,
  NewLabels,
  NewMark,
  NewShoot,
} from './schemas.ts';

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
  /** The photo in front of its stack, which can be this one. */
  readonly stack: string;
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

/**
 * What a keepsake command is doing with the shoot right now. Getting a new
 * shoot ready takes `scan`, `cull`, `pick` and `explain`, one after the other;
 * `edit` and `publish` come after the hand-over.
 */
export type Activity = {
  readonly step: string;
  readonly done: number;
  readonly total: number;
  /** The photos being worked on. */
  readonly photos: ReadonlyArray<string>;
};

/** The program that gets a new shoot ready, until it is through. */
export type Preparation = {
  readonly since: string;
  /** Why it stopped before it was through. It goes on when the owner says so. */
  readonly stopped: string | null;
};

/** The agent that acts on what the owner hands over. */
export type Agent = {
  /** Since when one waits for marks. */
  readonly waitsSince: string | null;
  /** Whether the page starts one when none waits. */
  readonly canStart: boolean;
  /** The one it started last. */
  readonly started: {
    readonly at: string;
    /** Where the owner can read along, if it said so. */
    readonly link: string | null;
    /** Why it couldn't be started. */
    readonly failed: string | null;
  } | null;
};

/** Photos that show the same. */
export type Stack = {
  /** The photo in front, which stands for the others. */
  readonly front: string;
  /** All of them, also the one in front, in the order they were taken. */
  readonly photos: ReadonlyArray<string>;
};

export type Question = {
  readonly moment: string;
  readonly photos: ReadonlyArray<string>;
};

/** GET /api/shoots/<shoot> */
export type ShootView = {
  readonly name: string;
  /** The album's name: "Lisbon". Null for shoots from before there was one. */
  readonly title: string | null;
  /** Where and when, for the models: "Lisbon, May 2026" */
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
  /** Every photo is in one of them, if only by itself. In the order of their fronts. */
  readonly stacks: ReadonlyArray<Stack>;
  readonly marks: ReadonlyArray<Mark>;
  readonly activity: Activity | null;
  readonly preparation: Preparation | null;
  readonly agent: Agent;
  /**
   * That the owner wants the chosen photos edited and put into an album, for at
   * most so many dollars, until that is done.
   */
  readonly ordered: { readonly at: string; readonly dollars: number } | null;
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
    readonly title: string | null;
    readonly about: string | null;
    /** When the first and the last photo were taken; null until there are any. */
    readonly from: string | null;
    readonly to: string | null;
    readonly photos: number;
    readonly inAlbum: number;
    /** Photos chosen for the album that aren't in it yet. */
    readonly picked: number;
    readonly preparation: Preparation | null;
    readonly activity: Activity | null;
    readonly isOrdered: boolean;
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
  readonly preparation: Preparation | null;
  readonly agent: Agent;
};

/** GET /api/folders */
export type FolderList = {
  /** False when keepsake wasn't told where the owner's photos are. */
  readonly canAdd: boolean;
  /** Folders with photos right in them or in folders below, newest first. */
  readonly folders: ReadonlyArray<{
    readonly path: string;
    /** The folder's own name, and those it is in, outermost first. */
    readonly name: string;
    readonly within: ReadonlyArray<string>;
    readonly photos: number;
    /** When its files were last changed, which is about when they were taken. */
    readonly from: string;
    readonly to: string;
    /** The shoot that is made from it already. */
    readonly shoot: string | null;
  }>;
};

/** GET /api/folders/look?path=<path> */
export type FolderLook = {
  readonly path: string;
  readonly photos: number;
  /** The camera's clock at the first and the last photo, without a time zone. */
  readonly from: string;
  readonly to: string;
  /** A few of its photos as data URLs, with the camera's clock. */
  readonly samples: ReadonlyArray<{
    readonly src: string;
    readonly takenAt: string;
    readonly width: number;
    readonly height: number;
  }>;
};
