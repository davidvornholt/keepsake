import type { Changed, HandOver, Mark, NewMark } from '../../contract.ts';
import {
  askForAgent,
  forgetShoot,
  goOnPreparing,
  handOverMarks,
  listenTo,
  makeMark,
  type Rating,
  saveFavorite,
  saveLabels,
  saveRating,
  seeMark,
  takeBackMark,
} from './api.ts';
import {
  draftOf,
  draftPrefix,
  replacedBy,
  tidyLabels,
  wantedOf,
  withFavorite,
  withLabels,
  withMark,
  withoutMark,
  withRating,
  withSaved,
  withSeen,
} from './changes.ts';
import { type Core, makeCore } from './store-core.ts';
import type { Undo } from './store-state.ts';

// The shoot as the page knows it. A change shows at once and is sent to
// keepsake; what keepsake then says replaces it.

/** The undos as they are once the mark with this id is known as `mark`. */
const renamed = (
  undos: ReadonlyArray<Undo>,
  id: string,
  mark: Mark,
): ReadonlyArray<Undo> => {
  const swap = (one: Mark): Mark => (one.id === id ? mark : one);
  return undos.map((undo) => {
    if (undo.did === 'favorite') {
      return undo;
    }
    return undo.did === 'made'
      ? {
          ...undo,
          mark: swap(undo.mark),
          replaced: undo.replaced === null ? null : swap(undo.replaced),
        }
      : { ...undo, mark: swap(undo.mark) };
  });
};

const marking = (core: Core) => {
  let drafts = 0;

  /** Makes a mark without remembering it for Undo. */
  const put = (wanted: NewMark): Mark | null => {
    const shoot = core.get().index?.shoot;
    if (shoot === undefined) {
      return null;
    }
    drafts += 1;
    const id = `${draftPrefix}${drafts}`;
    const draft = draftOf(wanted, id, new Date().toISOString());
    core.setMarks((marks) => withMark(marks, draft));
    const sending = core.send(() => makeMark(core.name, wanted));
    core.saved.set(
      id,
      sending.then((mark) => mark?.id ?? null),
    );
    sending.then((mark) => {
      if (mark !== null) {
        core.setMarks((marks) => withSaved(marks, id, mark));
        core.setUndos(renamed(core.undos(), id, mark));
      }
    });
    return draft;
  };

  const remove = async (id: string) => {
    core.setMarks((marks) => withoutMark(marks, id));
    await core.send(async () => {
      const real = await core.idOf(id);
      if (real !== null) {
        await takeBackMark(core.name, real);
      }
    });
  };

  /** Sets the heart without remembering it for Undo. */
  const heart = async (photo: string, favorite: boolean) => {
    const shoot = core.get().index?.shoot;
    if (shoot !== undefined) {
      core.setShoot(withFavorite(shoot, photo, favorite));
    }
    await core.send(() => saveFavorite(core.name, { photo, favorite }));
  };

  return {
    /** Sets or takes away the favorite heart of a photo in Immich, at once. */
    favorite: async (photo: string, favorite: boolean) => {
      core.setUndos([
        ...core.undos(),
        { did: 'favorite', photo, was: !favorite },
      ]);
      await heart(photo, favorite);
    },
    make: (wanted: NewMark): Mark | null => {
      const marks = core.get().index?.shoot.marks ?? [];
      const mark = put(wanted);
      if (mark !== null) {
        const replaced = replacedBy(marks, mark);
        core.setUndos([...core.undos(), { did: 'made', mark, replaced }]);
      }
      return mark;
    },
    takeBack: async (mark: Mark) => {
      core.setUndos([...core.undos(), { did: 'took-back', mark }]);
      await remove(mark.id);
    },
    undo: async () => {
      const last = core.undos().at(-1);
      if (last === undefined) {
        return;
      }
      core.setUndos(core.undos().slice(0, -1));
      if (last.did === 'favorite') {
        await heart(last.photo, last.was);
        return;
      }
      if (last.did === 'made') {
        await remove(last.mark.id);
      }
      const back = last.did === 'made' ? last.replaced : last.mark;
      const again = back === null ? null : put(wantedOf(back));
      if (back !== null && again !== null) {
        // What is done before refers to the mark as it is now.
        core.setUndos(renamed(core.undos(), back.id, again));
      }
    },
  };
};

const answering = (core: Core) => ({
  seen: async (id: string) => {
    core.setMarks((marks) => withSeen(marks, id, new Date().toISOString()));
    await core.send(() => seeMark(core.name, id));
  },
  /**
   * Hands the marks over, and agrees to what acting on them costs at most.
   * Says how many marks went to an agent, or null when it failed.
   */
  handOver: async (agreed: HandOver): Promise<number | null> => {
    core.setUndos([]);
    const handed = await core.send(async () => {
      // A mark that is still being saved is handed over by the id it gets.
      const ids = await Promise.all(agreed.marks.map(core.idOf));
      const marks = ids.filter((id) => id !== null);
      return handOverMarks(core.name, { ...agreed, marks });
    });
    return handed?.length ?? null;
  },
  /** Has an agent act on what was handed over before. */
  startAgent: async (): Promise<void> => {
    await core.send(() => askForAgent(core.name));
  },
  /** Goes on with getting the album ready, after it stopped. */
  goOn: async (): Promise<void> => {
    await core.send(() => goOnPreparing(core.name));
  },
  /** Throws the album away. Says whether it is gone. */
  forget: async (): Promise<boolean> => {
    core.rest(true);
    try {
      await forgetShoot(core.name);
      return true;
    } catch (error) {
      core.rest(false);
      core.set({
        problem: error instanceof Error ? error.message : 'It is still there.',
      });
      return false;
    }
  },
  label: async (photo: string, labels: ReadonlyArray<string>) => {
    const tidy = tidyLabels(labels);
    const shoot = core.get().index?.shoot;
    if (shoot !== undefined) {
      core.setShoot(withLabels(shoot, photo, tidy));
    }
    await core.send(() => saveLabels(core.name, { photo, labels: tidy }));
  },
  rate: async (rating: Rating): Promise<boolean> => {
    const isSaved = await core.send(async () => {
      await saveRating(core.name, rating);
      return true;
    });
    const shoot = core.get().index?.shoot;
    if (isSaved === true && shoot !== undefined) {
      core.setShoot(withRating(shoot, rating));
    }
    return isSaved === true;
  },
});

const listening = (core: Core) => {
  let stop: (() => void) | null = null;
  const onChanged = ({ revision, activity, preparation, agent }: Changed) => {
    core.set({ activity, preparation, agent });
    if (!core.isBusy() && revision !== core.get().index?.shoot.revision) {
      core.load();
    }
  };
  const onConnection = (isConnected: boolean) => {
    const wasLost = !core.get().isConnected;
    core.set({ isConnected });
    if (isConnected && wasLost) {
      core.load();
    }
  };
  return {
    start: () => {
      core.rest(false);
      core.load();
      stop = listenTo(core.name, { onChanged, onConnection });
    },
    stop: () => {
      stop?.();
      core.rest(true);
    },
  };
};

/** How long a hint stays, in milliseconds. */
const hintTime = 3200;

const hinting = (core: Core) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    /** Says something for a moment. */
    hint: (text: string) => {
      clearTimeout(timer);
      core.set({ hint: text });
      timer = setTimeout(() => core.set({ hint: null }), hintTime);
    },
  };
};

export const makeShootStore = (name: string) => {
  const core = makeCore(name);
  return {
    name,
    subscribe: core.subscribe,
    get: core.get,
    reload: core.load,
    dismissProblem: core.dismissProblem,
    /** Whether keepsake saved a mark, once it answered. */
    isSaved: async (id: string): Promise<boolean> =>
      (await core.idOf(id)) !== null,
    ...hinting(core),
    ...marking(core),
    ...answering(core),
    ...listening(core),
  };
};

export type ShootStore = ReturnType<typeof makeShootStore>;
