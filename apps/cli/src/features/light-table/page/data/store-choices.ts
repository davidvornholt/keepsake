import type { NewChoice } from '../../contract.ts';
import { sendChoice } from './api.ts';
import { draftPrefix, withChoice } from './changes.ts';
import type { Core } from './store-core.ts';
import type { Choosing, Undo } from './store-state.ts';

/** The undos with the choice noted under `was` now noted under `is`. */
const renoted = (
  undos: ReadonlyArray<Undo>,
  was: string,
  is: string,
): ReadonlyArray<Undo> =>
  undos.map((undo) =>
    undo.did === 'chose' && undo.action === was
      ? { ...undo, action: is }
      : undo,
  );

/** Puts photos in and takes them out, and takes that back. */
export const choosing = (core: Core) => {
  /**
   * The action keepsake gave each choice, by the one the page showed it
   * under until then, which a choice made meanwhile may refer to.
   */
  const given = new Map<string, string>();
  let drafts = 0;

  /**
   * Puts a photo in or takes one out without remembering it for Undo, and
   * tells `noted` the action keepsake noted it under.
   */
  const send = async (wanted: NewChoice, noted: (action: string) => void) => {
    drafts += 1;
    const draft = `${draftPrefix}choice-${drafts}`;
    const shoot = core.get().index?.shoot;
    if (shoot !== undefined) {
      core.setShoot(
        withChoice(shoot, wanted, {
          now: new Date().toISOString(),
          action: draft,
          isWorking: core.get().activity !== null,
        }),
      );
    }
    await core.send(async () => {
      const action = await sendChoice(core.name, wanted);
      given.set(draft, action);
      noted(action);
    });
  };

  return {
    /**
     * Puts a photo in or takes one out, at once or as soon as nothing else
     * changes the album.
     */
    choose: async ({ wanted, back, restores }: Choosing) => {
      const undo: Undo = { did: 'chose', back, restores, action: null };
      core.setUndos([...core.undos(), undo]);
      // Its action is known before keepsake is read again, which says
      // whether it could be done.
      await send(wanted, (action) => {
        core.setUndos(
          core.undos().map((one) => (one === undo ? { ...undo, action } : one)),
        );
      });
    },
    /**
     * Takes back the choice that is undone last, once keepsake said whether
     * it could do what was sent, since a choice it couldn't do leaves
     * nothing to take back.
     */
    undo: async (asked: Extract<Undo, { did: 'chose' }>) => {
      await core.whenQuiet();
      const undos = core.undos();
      const last = undos.at(-1);
      if (last?.did !== 'chose' || last.back !== asked.back) {
        return;
      }
      core.setUndos(undos.slice(0, -1));
      const { restores } = last;
      // What waited is chosen again under another action, which the choice
      // that waited is now known by.
      await send(last.back, (action) => {
        if (restores !== null) {
          core.setUndos(
            renoted(core.undos(), given.get(restores) ?? restores, action),
          );
        }
      });
    },
  };
};
