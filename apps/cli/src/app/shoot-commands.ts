import { Effect, Option } from 'effect';
import { Argument, Command } from 'effect/cli';
import {
  listShoots,
  showPhoto,
  showShoot,
} from '../features/overview/overview.ts';
import { scan as scanFolder } from '../features/scan/scan.ts';
import { openShoot } from '../shared/store.ts';
import {
  optionalString,
  shootArgument,
  visionModel,
} from './command-inputs.ts';
import { emit } from './output.ts';

export const folderArgument = Argument.String('folder').pipe(
  Argument.withDescription(
    'The folder with the photos. keepsake reads it and the folders below it, and never changes them.',
  ),
);

export const scanFlags = {
  name: optionalString(
    'name',
    "What to call the shoot (default: the folder's name)",
  ),
  about: optionalString(
    'about',
    'Where and when the photos were taken, for the models, such as "Lisbon, May 2026"',
  ),
};

export const scan = Command.make(
  'scan',
  { folder: folderArgument, ...scanFlags },
  (input) => Effect.flatMap(scanFolder(input), emit),
).pipe(
  Command.withDescription(
    'Read a folder of photos, make previews, and group photos of the same moment, such as bursts. Run it again after adding photos.',
  ),
);

export const shoots = Command.make('shoots', {}, () =>
  Effect.flatMap(listShoots, (list) => emit({ shoots: list })),
).pipe(Command.withDescription('List the shoots on this machine'));

export const show = Command.make(
  'show',
  {
    shoot: shootArgument,
    photo: Argument.String('photo').pipe(
      Argument.withDescription('A photo, to show everything about it'),
      Argument.optional,
    ),
    model: visionModel,
  },
  ({ shoot, photo, model }) =>
    Effect.gen(function* () {
      const open = yield* openShoot(shoot);
      yield* emit(
        Option.isSome(photo)
          ? yield* showPhoto(open, model, photo.value)
          : yield* showShoot(open, model),
      );
    }),
).pipe(
  Command.withDescription(
    'Show where a shoot stands: what was judged, picked, edited and published, and what it cost. With a photo, show its moment, verdict, edit and files.',
  ),
);
