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
  /** Nothing was chosen yet. */
  | { readonly kind: 'open' }
  | {
      readonly kind: 'taken-out';
      readonly at: string;
      readonly because: string | null;
    }
  /** It shows the same as another photo, which stands for it. */
  | {
      readonly kind: 'similar';
      readonly to: string;
      /** What the other one does better, if a model was asked. */
      readonly because: string | null;
    }
  /** Not strong enough for the album. */
  | { readonly kind: 'left-out'; readonly because: string | null };

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

const byPhoto = <A extends { readonly photo: string }>(
  list: ReadonlyArray<A>,
): ReadonlyMap<string, A> => new Map(list.map((one) => [one.photo, one]));

/** What is known, by photo. */
const factsOf = ({ album, picks, removed, reasons }: Known) => ({
  server: album?.server ?? '',
  inAlbum: byPhoto(album?.photos ?? []),
  removed: byPhoto(removed),
  reasons: byPhoto(reasons),
  picked: new Set(picks?.picks.map(({ photo }) => photo)),
  instead: new Map(
    picks?.leftOut.map(({ photo, insteadOf }) => [photo, insteadOf]),
  ),
  isDecided: picks !== null || album !== null,
});
type Facts = ReturnType<typeof factsOf>;

const isChosen = ({ inAlbum, picked, removed }: Facts, photo: string) =>
  inAlbum.has(photo) || (picked.has(photo) && !removed.has(photo));

/** The photo of these that was taken closest to another one of the moment. */
const closest = (
  { photos }: Moment,
  candidates: ReadonlyArray<string>,
  photo: string,
): string | undefined => {
  const at = photos.indexOf(photo);
  const away = (one: string) => Math.abs(photos.indexOf(one) - at);
  return candidates.toSorted((left, right) => away(left) - away(right))[0];
};

/** The photos of a moment that stand for the others. */
const frontsOf = (
  facts: Facts,
  verdict: Verdict | undefined,
  { photos }: Moment,
): ReadonlyArray<string> => {
  const chosen = photos.filter((photo) => isChosen(facts, photo));
  return chosen.length > 0
    ? chosen
    : [
        ...(verdict?.best.slice(0, 1) ?? photos.slice(0, 1)),
        ...(verdict?.further.map(({ photo }) => photo) ?? []),
      ];
};

/** Where a photo stands that was neither chosen nor taken out. */
const notChosen = (
  facts: Facts,
  moment: Moment,
  fronts: ReadonlyArray<string>,
  photo: string,
): Standing => {
  const reason = facts.reasons.get(photo);
  const said =
    // A reason was found with the album as it is now, so it counts more.
    reason === undefined ? facts.instead.get(photo) : reason.repeats;
  const to = fronts.includes(photo)
    ? (said ?? undefined)
    : closest(moment, fronts, photo);
  if (to !== undefined) {
    return { kind: 'similar', to, because: null };
  }
  return facts.isDecided
    ? { kind: 'left-out', because: null }
    : { kind: 'open' };
};

/** Where the photos of a moment stand, and which of them stand for others. */
const within = (facts: Facts, verdict: Verdict | undefined, moment: Moment) => {
  const fronts = frontsOf(facts, verdict, moment);
  const standingOf = (photo: string): Standing => {
    const there = facts.inAlbum.get(photo);
    if (there !== undefined) {
      const { asset, favorite } = there;
      return {
        kind: 'album',
        url: `${facts.server}/photos/${asset}`,
        favorite,
      };
    }
    const gone = facts.removed.get(photo);
    if (gone !== undefined) {
      return { kind: 'taken-out', at: gone.at, because: gone.because };
    }
    return facts.picked.has(photo)
      ? { kind: 'picked' }
      : notChosen(facts, moment, fronts, photo);
  };
  return {
    fronts,
    of: moment.photos.map((photo) => [photo, standingOf(photo)] as const),
  };
};

/**
 * Lets every photo that shows the same as another one point right at the one
 * that stands for all of them, also when there are others in between, and
 * gives the reasons that are about that one.
 */
const resolved = (
  { reasons }: Facts,
  found: ReadonlyMap<string, Standing>,
): ReadonlyMap<string, Standing> => {
  const frontOf = (photo: string, passed: ReadonlySet<string>): string => {
    const standing = found.get(photo);
    return standing?.kind === 'similar' && !passed.has(standing.to)
      ? frontOf(standing.to, new Set([...passed, standing.to]))
      : photo;
  };
  const because = (photo: string, to: string | null) => {
    const reason = reasons.get(photo);
    return reason?.repeats === to ? reason.because : null;
  };
  const final = (photo: string, standing: Standing): Standing => {
    if (standing.kind === 'left-out') {
      return { kind: 'left-out', because: because(photo, null) };
    }
    if (standing.kind !== 'similar') {
      return standing;
    }
    const to = frontOf(photo, new Set([photo]));
    // Two that each point at the other stand for nothing.
    const isLost = found.get(to)?.kind === 'similar' || !found.has(to);
    return isLost
      ? { kind: 'left-out', because: because(photo, null) }
      : { kind: 'similar', to, because: because(photo, to) };
  };
  return new Map(
    [...found].map(([photo, standing]) => [photo, final(photo, standing)]),
  );
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
  const facts = factsOf(known);
  const moments = open.moments.map((moment) =>
    within(facts, judged.get(moment.id), moment),
  );
  return {
    ...known,
    verdicts: judged,
    /** The photos that stand for others of their moment, chosen or not. */
    fronts: new Set(moments.flatMap(({ fronts }) => fronts)),
    of: resolved(facts, new Map(moments.flatMap(({ of }) => of))),
  };
});
export type Standings = Effect.Success<ReturnType<typeof standings>>;

/** The photo in front of the stack that a photo is in. */
export const frontOf = ({ of }: Pick<Standings, 'of'>, photo: string) => {
  const standing = of.get(photo);
  return standing?.kind === 'similar' ? standing.to : photo;
};
