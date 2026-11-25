import { Effect, Option, Schema } from 'effect';
import {
  Album,
  type Moment,
  PickList,
  Reason,
  Removed,
  type Verdict,
} from './domain.ts';
import { type OpenShoot, readJson } from './store.ts';
import { verdicts } from './verdicts.ts';

/** Where a photo stands, and why. */
export type Standing =
  | {
      readonly kind: 'album';
      /** The photo's page in Immich. */
      readonly url: string;
      readonly favorite: boolean;
    }
  /** Chosen for the album, but not published yet. */
  | { readonly kind: 'picked' }
  | {
      readonly kind: 'taken-out';
      readonly at: string;
      readonly because: string | null;
    }
  /** Another frame of its moment is better. */
  | { readonly kind: 'other-frame'; readonly of: string }
  | {
      readonly kind: 'left-out';
      readonly rule: 'repeat' | 'weaker' | 'score' | 'no-room' | 'unknown';
      /** The photo of the album that shows the same. */
      readonly repeats: string | null;
      readonly because: string | null;
    };

const Reasons = Schema.Array(Reason);
const Removals = Schema.Array(Removed);

export const readReasons = (open: OpenShoot) =>
  Effect.map(
    readJson(Reasons, open.files.reasons),
    Option.getOrElse((): ReadonlyArray<Reason> => []),
  );

export const readRemoved = (open: OpenShoot) =>
  Effect.map(
    readJson(Removals, open.files.removed),
    Option.getOrElse((): ReadonlyArray<Removed> => []),
  );

type Known = {
  readonly album: Album | null;
  readonly picks: PickList | null;
  readonly removed: ReadonlyArray<Removed>;
  readonly reasons: ReadonlyArray<Reason>;
};

/** Why a photo that is the best of its moment isn't in the album. */
const whyLeftOut = (
  { picks, reasons }: Known,
  verdict: Verdict | undefined,
  photo: string,
): Standing => {
  const reason = reasons.find((one) => one.photo === photo);
  const out = picks?.leftOut.find((one) => one.photo === photo);
  const own = verdict?.further.find((one) => one.photo === photo);
  const score = own?.score ?? verdict?.score;
  const isLow =
    picks !== null && score !== undefined && score < picks.minimumScore;
  // A reason was found with the album as it is now, so it counts more.
  const repeats =
    reason === undefined ? (out?.insteadOf ?? null) : reason.repeats;
  const because = reason?.because ?? null;
  const left = { kind: 'left-out', repeats, because } as const;
  if (repeats !== null) {
    return { ...left, rule: 'repeat' };
  }
  if (isLow) {
    return { ...left, rule: 'score' };
  }
  if (reason !== undefined) {
    return { ...left, rule: 'weaker' };
  }
  return { ...left, rule: out === undefined ? 'unknown' : 'no-room' };
};

const standingsIn = (
  known: Known,
  verdict: Verdict | undefined,
  { photos }: Moment,
): ReadonlyArray<readonly [string, Standing]> => {
  const inAlbum = new Map(
    (known.album?.photos ?? []).map((one) => [one.photo, one] as const),
  );
  const ownBest = [
    ...(verdict?.best.slice(0, 1) ?? photos.slice(0, 1)),
    ...(verdict?.further.map(({ photo }) => photo) ?? []),
  ];
  const removed = new Map(
    known.removed.map((one) => [one.photo, one] as const),
  );
  const isPicked = new Set(known.picks?.picks.map(({ photo }) => photo));
  const inIt = photos.filter((photo) => inAlbum.has(photo));
  const shown =
    inIt.length > 0
      ? inIt
      : photos.filter((photo) => isPicked.has(photo) && !removed.has(photo));
  const [best] = shown.length > 0 ? shown : ownBest;
  return photos.map((photo) => {
    const there = inAlbum.get(photo);
    if (there !== undefined) {
      return [
        photo,
        {
          kind: 'album',
          url: `${known.album?.server}/photos/${there.asset}`,
          favorite: there.favorite,
        },
      ];
    }
    const gone = removed.get(photo);
    if (gone !== undefined) {
      return [photo, { kind: 'taken-out', at: gone.at, because: gone.because }];
    }
    if (isPicked.has(photo)) {
      return [photo, { kind: 'picked' }];
    }
    const isOwn = shown.length === 0 && ownBest.includes(photo);
    return best === undefined || best === photo || isOwn
      ? [photo, whyLeftOut(known, verdict, photo)]
      : [photo, { kind: 'other-frame', of: best }];
  });
};

/** Where every photo of a shoot stands. */
export const standings = Effect.fn('standings')(function* (
  open: OpenShoot,
  model: string,
) {
  const judged = new Map(
    (yield* verdicts(open, model)).map(
      (verdict) => [verdict.moment, verdict] as const,
    ),
  );
  const known: Known = {
    album: Option.getOrNull(yield* readJson(Album, open.files.album)),
    picks: Option.getOrNull(yield* readJson(PickList, open.files.picks)),
    removed: yield* readRemoved(open),
    reasons: yield* readReasons(open),
  };
  return {
    ...known,
    verdicts: judged,
    of: new Map(
      open.moments.flatMap((moment) =>
        standingsIn(known, judged.get(moment.id), moment),
      ),
    ),
  };
});
export type Standings = Effect.Success<ReturnType<typeof standings>>;
