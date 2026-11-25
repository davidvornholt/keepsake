import type { Changed, Mark, NewMark } from '../../contract.ts';
import {
  handOverMarks,
  listenTo,
  makeMark,
  type Rating,
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
  withLabels,
  withMark,
  withoutMark,
  withRating,
  withSaved,
  withSeen,
} from './changes.ts';
import { type Core, makeCore } from './store-core.ts';

// The shoot as the page knows it. A change shows at once and is sent to
// keepsake; what keepsake then says replaces it.

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

  return {
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
      if (last.did === 'made') {
        await remove(last.mark.id);
      }
      const back = last.did === 'made' ? last.replaced : last.mark;
      if (back !== null) {
        put(wantedOf(back));
      }
    },
  };
};

const answering = (core: Core) => ({
  seen: async (id: string) => {
    core.setMarks((marks) => withSeen(marks, id, new Date().toISOString()));
    await core.send(() => seeMark(core.name, id));
  },
  /** Says how many marks went to an agent, or null when it failed. */
  handOver: async (): Promise<number | null> => {
    core.setUndos([]);
    const handed = await core.send(() => handOverMarks(core.name));
    return handed?.length ?? null;
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
  const onChanged = ({ revision, activity, agentWaitsSince }: Changed) => {
    core.set({ activity, agentWaitsSince });
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
    dismissProblem: () => core.set({ problem: null }),
    ...hinting(core),
    ...marking(core),
    ...answering(core),
    ...listening(core),
  };
};

export type ShootStore = ReturnType<typeof makeShootStore>;
