import { judge, printed, run } from './command-fixtures.ts';
import { fakeTools, type Run } from './fake-tools.ts';

// The page's server runs keepsake for what is handed over. In tests that is
// keepsake itself, in this process, with the fakes of everything outside.

/** The commands that look at photos, which use the test's reviewing model. */
const reviewing = new Set(['edit', 'explain']);

/**
 * Runs the commands the page starts with keepsake as this process's own,
 * with the fake models. `before` may stand in for one, as by failing, and
 * `after` runs once one is through.
 */
export const keepsakeInProcess = (
  before: (args: ReadonlyArray<string>) => string | undefined = () => undefined,
  after: (args: ReadonlyArray<string>) => void = () => undefined,
) => {
  const outputs = new Map<Run, { output: string } | { error: string }>();
  fakeTools.pause = (called) => {
    if (called.command !== 'keepsake') {
      return;
    }
    return (async () => {
      const instead = before(called.args);
      if (instead !== undefined) {
        outputs.set(called, { error: instead });
        return;
      }
      const extra = reviewing.has(called.args[0] ?? '')
        ? ['--review-model', judge]
        : [];
      const result = await run(...called.args, ...extra);
      after(called.args);
      outputs.set(
        called,
        result._tag === 'Success'
          ? { output: JSON.stringify(printed()) }
          : {
              error: JSON.stringify({
                error: {
                  tag: (result.failure as { _tag: string })._tag,
                  message: (result.failure as { message: string }).message,
                },
              }),
            },
      );
    })();
  };
  fakeTools.programs.keepsake = (called) => {
    const outcome = outputs.get(called);
    if (outcome === undefined || 'error' in outcome) {
      throw new Error(outcome?.error ?? 'keepsake didn’t run');
    }
    return outcome.output;
  };
};

/** A keepsake command that fails as another command holds the shoot. */
export const busy = JSON.stringify({
  error: { tag: 'ShootBusy', message: 'Another command is working on it.' },
});

/** What the page ran keepsake for, each as its arguments. */
export const keepsakeRuns = () =>
  fakeTools.runs
    .filter(({ command }) => command === 'keepsake')
    .map(({ args }) => args.join(' '));
