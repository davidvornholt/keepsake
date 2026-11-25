import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FolderList } from '../../contract.ts';
import type { Route } from '../app/route.ts';
import { go, goBack } from '../app/router.ts';
import { readFolders } from '../data/api.ts';
import { iconButton, sideButton } from '../ui/classes.ts';
import { useKeys } from '../ui/keys.ts';
import { useTitle } from '../ui/use-title.ts';
import { Details } from './details.tsx';
import { Folders } from './folders.tsx';
import { useLoaded } from './use-loaded.ts';

// Making an album, which the owner does alone: they choose the folder, say
// what it is about, and keepsake looks through it. No agent is needed.

const iconSize = 20;
const shelf: Route = { screen: 'shoots' };
const choosing: Route = { screen: 'new', folder: null };
const steps = ['Folder', 'About it', 'Keepsake chooses'] as const;

/** The steps there are, and which one this is. */
const Steps = ({ at }: { readonly at: number }) => (
  <ol
    aria-label="Steps"
    className="type-edge ml-auto flex flex-wrap justify-end gap-x-4 gap-y-1 text-quiet"
  >
    {steps.map((step, index) => (
      <li
        aria-current={index === at ? 'step' : undefined}
        className="aria-[current=step]:text-lamp"
        key={step}
      >
        {index + 1} {step}
      </li>
    ))}
  </ol>
);

/** Something said in place of the folders, when there are none to show. */
const Said = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}) => (
  <div className="max-w-[36rem] pt-10">
    <h2 className="type-name text-[1.375rem] text-lamp">{title}</h2>
    {children}
  </div>
);

const bodyOf = (
  { canAdd, folders }: FolderList,
  folder: string | null,
): ReactNode => {
  if (!canAdd) {
    return (
      <Said title="Keepsake wasn’t told where your photos are.">
        <p className="mt-3 text-quiet">
          So it can’t make an album from this page. Start it again with the
          folders your photos are in, and they are listed here.
        </p>
      </Said>
    );
  }
  if (folders.length === 0) {
    return (
      <Said title="No photos were found.">
        <p className="mt-3 text-quiet">
          None of the folders keepsake was told of has photos in it. A drive
          that isn’t connected can be why.
        </p>
      </Said>
    );
  }
  if (folder === null) {
    return <Folders folders={folders} />;
  }
  const chosen = folders.find(({ path }) => path === folder);
  return chosen === undefined ? (
    <Said title="That folder isn’t one keepsake knows.">
      <button
        className={`${sideButton} mt-6`}
        onClick={() => go(choosing, 'replace')}
        type="button"
      >
        Choose a folder
      </button>
    </Said>
  ) : (
    <Details folder={chosen} key={chosen.path} />
  );
};

export const NewAlbum = ({ folder }: { readonly folder: string | null }) => {
  const { loaded, retry } = useLoaded('folders', readFolders);
  useTitle('New album');
  const back = () => goBack(folder === null ? shelf : choosing);
  useKeys([['Escape', back]], [['Escape', back]]);
  const backTo = folder === null ? 'All albums' : 'Another folder';
  return (
    <main
      aria-busy={loaded.status === 'loading'}
      className="h-full overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto max-w-[46rem] px-3 pb-20 sm:px-6">
        <header className="flex items-center gap-1 pt-1.5">
          <button
            aria-keyshortcuts="Escape"
            aria-label={backTo}
            className={iconButton}
            onClick={back}
            title={backTo}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={iconSize} />
          </button>
          <h1 className="type-name text-[1.0625rem] text-lamp">New album</h1>
          <Steps at={folder === null ? 0 : 1} />
        </header>
        <div className="px-2 sm:px-3">
          {loaded.status === 'loading' ? (
            <p className="type-edge late-arrival pt-10 text-quiet">
              Looking for your folders
            </p>
          ) : null}
          {loaded.status === 'failed' ? (
            <Said title="Keepsake doesn’t answer.">
              <p className="mt-3 text-quiet">{loaded.problem}</p>
              <button
                className={`${sideButton} mt-6`}
                onClick={retry}
                type="button"
              >
                Try again
              </button>
            </Said>
          ) : null}
          {loaded.status === 'ready' ? bodyOf(loaded.value, folder) : null}
        </div>
      </div>
    </main>
  );
};
