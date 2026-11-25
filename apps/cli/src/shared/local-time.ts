import { DateTime, Effect, Option } from 'effect';
import type { Photo, Shoot } from './domain.ts';
import { InvalidInput } from './errors/errors.ts';

const isoPattern = /^(?<clock>[\d-]+T[\d:]+)(?:\.\d+)?(?<offset>.+)$/u;

/**
 * When a photo was taken, as the clocks there showed it: 2026-03-30T18:04:05,
 * with how far they were from UTC if the camera told it.
 */
export const takenThere = (
  { timeZone }: Pick<Shoot, 'timeZone'>,
  { takenAt, utcOffset }: Pick<Photo, 'takenAt' | 'utcOffset'>,
): string => {
  if (utcOffset === null) {
    return takenAt.slice(0, takenAt.indexOf('.'));
  }
  const there = DateTime.make(`${takenAt}${utcOffset}`).pipe(
    Option.flatMap((moment) =>
      timeZone === undefined
        ? Option.none()
        : DateTime.setZoneNamed(moment, timeZone),
    ),
    Option.flatMapNullishOr(
      (moment) => isoPattern.exec(DateTime.formatIsoOffset(moment))?.groups,
    ),
  );
  return Option.match(there, {
    onNone: () => `${takenAt.slice(0, takenAt.indexOf('.'))}${utcOffset}`,
    onSome: ({ clock, offset }) => `${clock}${offset}`,
  });
};

/** A time zone, if there is one with this name. */
export const checkTimeZone = (zone: string) =>
  Option.isSome(DateTime.zoneMakeNamed(zone))
    ? Effect.succeed(zone)
    : Effect.fail(
        new InvalidInput({
          message: `There is no time zone called ${JSON.stringify(zone)}. Use a name such as Europe/Lisbon.`,
        }),
      );
