import type {
  RoundsKnockoutStage,
  SpotItEliminationView,
  SpotItPuzzleView,
  SpotItReveal,
  WordPuzzleView,
  WordReveal,
  WordRushEliminationView,
} from "@whizard/game-core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CATALOG } from "../../catalog";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { useServerNow } from "../../useServerNow";
import {
  Board,
  Cut,
  Done,
  eliminationWhere,
  FinalIntro,
  Watching,
  type EliminationContext,
} from "../elimination/parts";
import { PlayToast } from "../../ui/gameNotice";
import { Icon } from "../../ui/Icon";
import { PlayFaces, PlayTimer, PlayTop } from "../play";
import { elapsedSince } from "../quiz/QuizScreen";
import {
  facesOf,
  Reveal,
  RoundsReview,
  SPOT_PROMPTS,
  SpotGrid,
  SpotPuzzle,
  Staged,
  timerMs,
  VERDICTS,
  WordPuzzle,
} from "./RoundsScreen";

// Word Rush and Spot It in Elimination: everyone on the same word or grid at once, knock-outs
// between rounds, then a final. The knock-out screens are the quiz's.

type View = WordRushEliminationView | SpotItEliminationView;
type AnyStage = RoundsKnockoutStage<
  WordPuzzleView | SpotItPuzzleView,
  string | number,
  WordReveal | SpotItReveal
>;
type Stage<K extends AnyStage["kind"]> = Extract<AnyStage, { kind: K }>;

interface Props {
  view: View;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  latency: ReactNode;
  onQuit: () => void;
}

interface Context extends EliminationContext {
  view: View;
}

export function RoundsEliminationScreen(props: Props) {
  const { view, room } = props;
  const game = CATALOG.find((g) => g.id === view.game);
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const context: Context = {
    ...props,
    avatarOf: (id) => avatars.get(id) ?? null,
    title: game?.name ?? "Game",
    noun: view.game === "word-rush" ? "Word" : "Grid",
    art: game?.art ?? "/art/mascot/run.webp",
    colors: game?.colors ?? ["#6b45ff", "#23145a"],
  };
  const stage = view.stage as AnyStage;
  switch (stage.kind) {
    case "question":
      return <Question key={`q${stage.index}`} context={context} stage={stage} />;
    case "reveal":
      return <Answer key={`r${view.questionNumber}`} context={context} stage={stage} />;
    case "cut":
      return <Cut key={`c${stage.round}`} context={context} stage={stage} />;
    case "final":
      return <FinalIntro context={context} stage={stage} />;
    case "done":
      return (
        <Done context={context} stage={stage}>
          <RoundsReview game={view.game} results={stage.results} />
        </Done>
      );
  }
}

/** Where the game is, as plain text, and how many are still in; bare Settings and Quit. */
function Top({ context }: { context: Context }) {
  return (
    <PlayTop
      latency={context.latency}
      onQuit={context.onQuit}
      label={
        <>
          <span className="elim-progress">{eliminationWhere(context) || context.title}</span>
          <span className="play-alive"> · {context.view.aliveCount} in</span>
        </>
      }
    />
  );
}

function Question({ context, stage }: { context: Context; stage: Stage<"question"> }) {
  const { view, client } = context;
  const now = useServerNow(client.serverNow);
  const [visible, setVisible] = useState(() => client.serverNow() >= stage.startsAt);
  const shownAt = useRef<number | null>(null);
  const countdown = Math.max(1, Math.ceil((stage.startsAt - now) / 1000));
  const remaining = Math.max(0, stage.deadline - now);
  const secondsLeft = Math.ceil(remaining / 1000);
  const busy = stage.playing && stage.myResult === null;

  useEffect(() => {
    if (!visible) play("tick");
  }, [visible, countdown]);
  useEffect(() => {
    if (busy && visible && secondsLeft > 0 && secondsLeft <= 5) play("hurry");
  }, [busy, visible, secondsLeft]);
  useEffect(() => {
    if (stage.tried.length > 0) play("wrong");
  }, [stage.tried.length]);
  useEffect(() => {
    if (visible) {
      shownAt.current ??= performance.now();
      return;
    }
    const timer = setTimeout(
      () => setVisible(true),
      Math.max(0, stage.startsAt - client.serverNow()),
    );
    return () => clearTimeout(timer);
  }, [visible, stage.startsAt, client]);

  if (!visible) {
    return (
      <div className="game play">
        <Top context={context} />
        <div className="countdown" aria-live="polite">
          <img className="countdown-game-art" src={context.art} alt="" />
          <p className="countdown-label">Get ready</p>
          <p className="countdown-number">{countdown}</p>
          <span className="pill pill-glow">Elimination · {context.title}</span>
        </div>
        <PlayToast />
      </div>
    );
  }

  const guess = (value: string | number) =>
    client.act({
      type: "guess",
      index: stage.index,
      guess: value,
      clientElapsedMs: elapsedSince(shownAt.current),
    });
  const skip = () => client.act({ type: "skip", index: stage.index });
  const waiting = `Waiting for the others… ${stage.answeredCount} of ${stage.aliveCount} done`;
  const board = <Board context={context} />;
  const waitingOnOthers = stage.playing && !!stage.myResult;

  return (
    <div className="game play">
      <Top context={context} />
      {/* Beside the puzzle on a computer; while waiting for the others, at the side. */}
      <div className={`game-layout${waitingOnOthers ? "" : " staged"}`}>
        <div className="game-main play-main play-column rounds-main">
          <PlayTimer ms={timerMs(remaining)} low={remaining / view.timeLimitMs < 0.25} />
          <Watching view={view} />
          {!stage.playing ? (
            <Spectate game={view.game} puzzle={stage.puzzle} aside={board} />
          ) : stage.myResult ? (
            <div className="elim-waiting">
              <img
                src={
                  stage.myResult.outcome === "solved"
                    ? "/art/mascot/podium.webp"
                    : "/art/mascot/wave.webp"
                }
                alt=""
              />
              <p
                className={`verdict ${stage.myResult.outcome === "solved" ? "good" : "bad"}`}
                role="status"
              >
                {VERDICTS[stage.myResult.outcome]}
                {stage.myResult.points > 0 && (
                  <span className="points">+{stage.myResult.points}</span>
                )}
              </p>
            </div>
          ) : view.game === "word-rush" ? (
            <WordPuzzle
              puzzle={stage.puzzle as WordPuzzleView}
              tried={stage.tried as string[]}
              triesLeft={stage.triesLeft}
              onGuess={guess}
              onSkip={skip}
              aside={board}
            />
          ) : (
            <SpotPuzzle
              grid={stage.puzzle as SpotItPuzzleView}
              tried={stage.tried as number[]}
              triesLeft={stage.triesLeft}
              onTap={guess}
              aside={board}
            />
          )}
          {!busy && <p className="muted center">{waiting}</p>}
          <PlayFaces faces={facesOf(context)} playerId={context.playerId} />
          {/* Word Rush's give-up sits in its own row of buttons, with Check. */}
          {busy && view.game === "spot-it" && (
            <div className="play-actions">
              <button className="play-pill" onClick={skip}>
                <Icon name="skip" size={20} />
                Skip this grid
              </button>
            </div>
          )}
        </div>
        {waitingOnOthers && board}
      </div>
      <PlayToast />
    </div>
  );
}

/** Knocked out, or joined late: the puzzle, to follow along. */
function Spectate({
  game,
  puzzle,
  aside,
}: {
  game: View["game"];
  puzzle: WordPuzzleView | SpotItPuzzleView;
  aside?: ReactNode;
}) {
  if (game === "spot-it") {
    const grid = puzzle as SpotItPuzzleView;
    return (
      <div className="spot-puzzle">
        <p className="play-task">{SPOT_PROMPTS[grid.kind]}</p>
        <Staged aside={aside}>
          <SpotGrid grid={grid} />
        </Staged>
      </div>
    );
  }
  const word = puzzle as WordPuzzleView;
  const letters = word.type === "unscramble" ? word.letters : word.pattern;
  return (
    <div className="word-puzzle">
      <p className="word-kind">
        <span className="pill pill-glow">{word.hint}</span>
      </p>
      <Staged aside={aside}>
        <div className="word-slots" aria-label="The puzzle">
          {letters.map((letter, i) => (
            <span key={i} className={`word-slot${letter ? " filled" : ""}`}>
              {letter ?? ""}
            </span>
          ))}
        </div>
      </Staged>
    </div>
  );
}

function Answer({ context, stage }: { context: Context; stage: Stage<"reveal"> }) {
  const { view } = context;
  const result = stage.result;
  const solved = result?.outcome === "solved";
  useEffect(() => {
    if (stage.playing) play(solved ? "correct" : "wrong");
  }, [stage.playing, solved]);
  return (
    <div className="game play">
      <Top context={context} />
      <div className="game-layout staged">
        <div className="game-main play-main rounds-main">
          <Watching view={view} />
          <Reveal game={view.game} reveal={stage.reveal} aside={<Board context={context} />} />
          {stage.playing && result && (
            <p className={`verdict ${solved ? "good" : "bad"}`} role="status">
              {VERDICTS[result.outcome]}
              {result.points > 0 && <span className="points">+{result.points}</span>}
            </p>
          )}
          <PlayFaces faces={facesOf(context)} playerId={context.playerId} />
        </div>
      </div>
      <PlayToast />
    </div>
  );
}
