import { DateTime, Option } from 'effect';

const cameraPattern =
  /^(?<year>\d{4}):(?<month>\d\d):(?<day>\d\d) (?<time>\d\d:\d\d:\d\d)(?:\.\d+)?(?<offset>Z|[+-]\d\d:\d\d)$/u;
const isoPattern = /^(?<day>[\d-]+)T(?<time>[\d:]+)\.\d+(?<offset>.+)$/u;

const utc = '+00:00';

/**
 * What tells exiftool to write when a photo was taken as the clocks of another
 * time zone showed it. Nothing when the camera didn't say which zone its own
 * clock was set to.
 */
export const clockIn = (zone: string, taken: string): ReadonlyArray<string> => {
  const camera = cameraPattern.exec(taken.trim())?.groups;
  if (camera === undefined) {
    return [];
  }
  const { year, month, day, time, offset } = camera;
  const local = DateTime.make(`${year}-${month}-${day}T${time}${offset}`).pipe(
    Option.flatMap((moment) => DateTime.setZoneNamed(moment, zone)),
    Option.flatMapNullishOr(
      (moment) => isoPattern.exec(DateTime.formatIsoOffset(moment))?.groups,
    ),
  );
  return Option.match(local, {
    onNone: () => [],
    onSome: (clock) => {
      const shown = `${clock.day?.replaceAll('-', ':')} ${clock.time}`;
      const away = clock.offset === 'Z' ? utc : clock.offset;
      return [
        `-EXIF:DateTimeOriginal=${shown}`,
        `-EXIF:CreateDate=${shown}`,
        `-EXIF:ModifyDate=${shown}`,
        `-EXIF:OffsetTimeOriginal=${away}`,
        `-EXIF:OffsetTimeDigitized=${away}`,
        `-EXIF:OffsetTime=${away}`,
      ];
    },
  });
};
