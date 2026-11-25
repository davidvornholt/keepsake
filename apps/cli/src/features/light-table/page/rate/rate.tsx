import { type RefObject, useId, useRef, useState } from 'react';
import type { ShootView } from '../../contract.ts';
import type { Place } from '../app/route.ts';
import { goBack } from '../app/router.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { useLights } from '../flows/use-lights.ts';
import { WaxMark } from '../marks/wax-mark.tsx';
import { Stage } from '../photo/stage.tsx';
import type { Engine } from '../sheet/engine.ts';
import { mainButton } from '../ui/classes.ts';
import { type Keys, useKeys } from '../ui/keys.ts';
import { useLingering } from '../ui/use-lingering.ts';
import { useSize } from '../ui/use-size.ts';
import { useTitle } from '../ui/use-title.ts';
import { Compare } from './compare.tsx';
import { questionOf } from './rating.ts';
import { StarButtons } from './stars.tsx';
import { RateHead, RateTools } from './tools.tsx';
import { keysOf, type RateView, useRateView } from './use-rate-view.ts';
import { type RatingFlow, useRating } from './use-rating.ts';

// Rating: for each moment the owner was asked about, the best photo and how
// good it is, judged by the eye alone. Nothing a model said is in sight.

type Asked = NonNullable<ShootView['rating']>;

const nothing = () => undefined;
const noKeys: Keys = [];
/** How long the rating takes to make way for the table, in milliseconds. */
const leaves = 200;

const Done = ({ onClose }: { readonly onClose: () => void }) => {
  const [since] = useState(() => performance.now());
  return (
    <div className="absolute inset-0 grid place-content-center justify-items-center gap-8">
      <WaxMark
        className="size-24"
        color="wax-white"
        seed="all-rated"
        shape="tick"
        since={since}
      />
      <button className={mainButton} onClick={onClose} type="button">
        Back to the table
      </button>
    </div>
  );
};

type Parts = { readonly flow: RatingFlow; readonly view: RateView };

/** The photos: all of the moment next to each other, or one of them large. */
const Photos = ({ flow, view }: Parts) => {
  const { step, question } = flow;
  const { shown, from } = view;
  const tilesRef = useRef(new Map<number, HTMLButtonElement>());
  return (
    <>
      {view.photos.length > 1 ? (
        <div
          className="absolute inset-0 transition-opacity duration-200 data-[shown=false]:opacity-0 motion-reduce:transition-none"
          data-shown={view.isComparing || view.isLeaving}
          inert={!view.isComparing}
          key={`all:${question?.moment}`}
        >
          <Compare
            focused={view.focused}
            isOn={view.isComparing}
            kept={step.kept}
            onChoose={flow.choose}
            onFocus={view.setFocused}
            onKeep={flow.toggleKept}
            photos={view.photos}
            rating={flow.ratings.get(question?.moment ?? '')}
            tiles={view.tiles}
            tilesRef={tilesRef}
          />
        </div>
      ) : null}
      {shown === undefined ? null : (
        <Stage
          finished={null}
          from={
            flow.side === 0 && from !== undefined
              ? { rect: from, shows: 'camera' }
              : null
          }
          handleRef={view.stageRef}
          ink={view.ink}
          isDrawing={false}
          clip={null}
          key={`one:${shown.id}`}
          look="edit"
          onClose={nothing}
          onOffset={nothing}
          onSeen={null}
          photo={shown}
          room={view.room}
          wide={view.room}
          entry={
            flow.side === 0 ? null : { x: flow.side * view.room.w, speed: 0 }
          }
          wanted={{
            onSwipe: flow.turn,
            onDismiss: view.compareAgain,
            onPull: nothing,
            onBox: nothing,
          }}
        />
      )}
    </>
  );
};

const Answers = ({
  flow,
  view,
  labelledBy,
}: Parts & { readonly labelledBy: string }) => {
  const { shown } = view;
  return (
    <footer className="flex shrink-0 flex-col gap-1 px-2 pt-1 pb-2">
      <StarButtons
        given={flow.ratings.get(flow.question?.moment ?? '')?.stars ?? null}
        isLarge={!view.isComparing}
        labelledBy={labelledBy}
        onRate={flow.rate}
        saving={flow.saving}
      />
      {shown === undefined ? null : (
        <RateTools
          count={view.photos.length}
          isKept={view.isKept}
          onAll={view.compareAgain}
          onKeep={() => flow.toggleKept(shown.id)}
          onZoom={() => view.stageRef.current?.toggleZoom()}
        />
      )}
    </footer>
  );
};

type Props = {
  readonly sheet: Place;
  readonly asked: Asked;
  readonly engineRef: RefObject<Engine | null>;
};

const Rating = ({
  sheet,
  asked,
  engineRef,
  isLeaving,
}: Props & { readonly isLeaving: boolean }) => {
  const { index } = useShootContext();
  const flow = useRating(asked);
  const mainRef = useRef<HTMLDivElement>(null);
  const size = useSize(mainRef);
  const view = useRateView(flow, size);
  const questionId = useId();
  const close = () => goBack(sheet);
  useLights(engineRef, isLeaving ? null : 0);
  useTitle('Rate', index.shoot.about ?? index.shoot.name);
  useKeys(isLeaving ? noKeys : keysOf(flow, view, close));

  return (
    <section
      aria-labelledby={questionId}
      className="absolute inset-0 z-30 flex flex-col bg-dark starting:opacity-0 transition-opacity duration-200 data-[leaving=true]:opacity-0 motion-reduce:transition-none"
      data-leaving={isLeaving}
      inert={isLeaving}
    >
      <RateHead
        at={flow.step.at}
        onBack={flow.back}
        onClose={close}
        question={questionOf(flow.questions, flow.step)}
        questionId={questionId}
        questionRef={(element) => {
          view.questionRef.current = element;
        }}
        rated={
          flow.questions.filter(({ moment }) => flow.ratings.has(moment)).length
        }
        total={flow.questions.length}
      />
      <div className="relative min-h-0 flex-1" ref={mainRef}>
        {flow.question === undefined ? <Done onClose={close} /> : null}
        {size.width > 0 ? <Photos flow={flow} view={view} /> : null}
      </div>
      {flow.question === undefined ? null : (
        <Answers flow={flow} labelledBy={questionId} view={view} />
      )}
    </section>
  );
};

/** The rating, which stays for a moment while it makes way for the table. */
export const Rate = ({
  isWanted,
  asked,
  ...props
}: Omit<Props, 'asked'> & {
  readonly isWanted: boolean;
  /** Null when nobody asked for a rating. */
  readonly asked: Asked | null;
}) => {
  const { isThere, isLeaving } = useLingering(
    isWanted && asked !== null,
    leaves,
  );
  return isThere && asked !== null ? (
    <Rating asked={asked} isLeaving={isLeaving} {...props} />
  ) : null;
};
