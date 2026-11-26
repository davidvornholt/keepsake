import process from 'node:process';
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect } from 'effect';
import { CliError, CliOutput, Command } from 'effect/cli';
import packageJson from '../../package.json' with { type: 'json' };
import { login, logout, status } from './account-commands.ts';
import { serve } from './light-table-commands.ts';
import { answer, marks, takeOut } from './mark-commands.ts';
import { report } from './output.ts';
import { bench, rate } from './rating-commands.ts';
import { run } from './run-command.ts';
import { scan, shoots, show } from './shoot-commands.ts';
import { cull, edit, explain, pick, publish } from './step-commands.ts';

export const keepsake = Command.make('keepsake').pipe(
  Command.withDescription(
    'Turn a folder of photos into a small album of beautiful ones: vision models choose the best frames, an image model edits them, and Immich shows them. Prints JSON. Never changes the photos themselves.',
  ),
  Command.withSubcommands([
    login,
    logout,
    status,
    run,
    scan,
    shoots,
    show,
    cull,
    pick,
    edit,
    publish,
    takeOut,
    explain,
    serve,
    marks,
    answer,
    rate,
    bench,
  ]),
);

// The CLI library prints a command's help to stdout before it fails on a
// parse error. Agents read stdout as data, so the help text is held back and
// printed only when it was asked for: by --help, or by naming a command group
// without one of its commands. Anything else the library prints, such as the
// version, passes straight through. A parse error becomes one JSON error on
// stderr like every other failure, so agents parse a single shape.
const program = Effect.gen(function* () {
  const stdout = yield* Console.Console;
  const formatter = yield* CliOutput.Formatter;
  let help: string | undefined;
  let heldHelp: string | undefined;
  const printHeldHelp = Effect.suspend(() =>
    heldHelp === undefined ? Effect.void : Console.log(heldHelp),
  );
  return yield* Command.runWith(keepsake, {
    version: packageJson.version,
    renderErrors: false,
  })(process.argv.slice(2)).pipe(
    Effect.provideService(CliOutput.Formatter, {
      ...formatter,
      formatHelpDoc: (doc) => {
        help = formatter.formatHelpDoc(doc);
        return help;
      },
    }),
    Effect.provideService(Console.Console, {
      ...stdout,
      log: (...args) => {
        if (args.length === 1 && args[0] === help) {
          heldHelp = help;
        } else {
          stdout.log(...args);
        }
      },
    }),
    Effect.andThen(printHeldHelp),
    Effect.catchTag('ShowHelp', (shown) =>
      shown.errors.length === 0
        ? printHeldHelp
        : report({
            _tag: 'UsageError',
            message: shown.errors.map((error) => error.message).join('\n'),
          }),
    ),
  );
}).pipe(
  Effect.catch((error) =>
    report(
      CliError.isCliError(error)
        ? { _tag: 'UsageError', message: error.message }
        : error,
    ),
  ),
  Effect.catchDefect((defect) =>
    report({ _tag: 'UnexpectedError', message: String(defect) }),
  ),
  Effect.provide(BunServices.layer),
);

if (import.meta.main) {
  // Ctrl-C interrupts the program instead of killing it, so it removes its
  // lock and saves what it spent.
  BunRuntime.runMain(program);
}
