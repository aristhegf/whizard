import {
  LEVEL_NAMES,
  QUIZ_CATEGORIES,
  QUIZ_VARIANTS,
  type AnyQuizView,
  type QuizReviewItem,
  type QuizStage,
  type QuizStanding,
  type QuizView,
} from "@whizard/game-core";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useAccount } from "../../account";
import { TOPIC_STYLES } from "../../catalog";
import { AddFromGame } from "../../FriendsScreen";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { useServerNow } from "../../useServerNow";
import { Avatar } from "../../ui/Avatar";
import {
  PlayBoard,
  PlayFaces,
  PlayFrame,
  PlayScreen,
  PlayTimer,
  rowsFrom,
  Staged,
  timerMs,
} from "../play";
import { GeneratingArt } from "../../ui/GeneratingArt";
import { Brand } from "../../ui/Chrome";
import { Icon } from "../../ui/Icon";
import { parseQuizSettings } from "./QuizSettingsPanel";
import { EliminationScreen } from "./EliminationScreen";
import { ReportQuestion } from "./ReportQuestion";
import { play } from "../../sounds";
import { Podium } from "../../ui/Podium";
import { buildCard } from "../../share/outcomes";
import { useShareResults } from "../../share/ShareResults";

type QuestionStage = Extract<QuizStage, { kind: "question" }>;
type AnswerStage = Extract<QuizStage, { kind: "answer" }>;

/** Guests with friends have no setting of their own: a glance at the result, then the next question. */
const QUICK_RESULT_MS = 1000;
/** The pause, or an explanation to read: time to take it in, with Skip. */
const PAUSED_RESULT_MS = 3000;

interface Props {
  view: QuizView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  /** The connection indicator, shown in the top bar. */
  latency: ReactNode;
  /** Leaves the room. Asks first while the game is still running. */
  onQuit: () => void;
}

interface GameContext extends Props {
  categoryId: string | null;
  categoryName: string;
  /** How it's being played, e.g. "Classic · Medium". */
  subtitle: string;
  avatarOf: (playerId: string) => string | null;
}

/** Classic and Speed here; Elimination has a screen of its own. */
export function QuizScreen(props: Omit<Props, "view"> & { view: AnyQuizView }) {
  const { view } = props;
  if ("mode" in view && view.mode === "elimination") {
    return <EliminationScreen {...props} view={view} />;
  }
  return <StandardQuiz {...props} view={view as QuizView} />;
}

function StandardQuiz(props: Props) {
  const { view, room } = props;
  const settings = parseQuizSettings(room.game.settings);
  const categoryName = QUIZ_CATEGORIES.find((c) => c.id === settings?.category)?.name ?? "Quiz";
  const subtitle = [
    QUIZ_VARIANTS.find((v) => v.id === settings?.variant)?.name,
    settings ? LEVEL_NAMES[settings.difficulty] : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const context: GameContext = {
    ...props,
    categoryId: settings?.category ?? null,
    categoryName,
    subtitle,
    avatarOf: (id) => avatars.get(id) ?? null,
  };

  const { stage } = view;
  switch (stage.kind) {
    case "question":
      return <Question key={`q${stage.index}`} context={context} stage={stage} />;
    case "answer":
      return <Answer key={`a${stage.index}`} context={context} stage={stage} />;
    case "done":
      return <Results context={context} review={stage.review} />;
    case "watching":
      return (
        <PlayScreen
          label={categoryName}
          latency={props.latency}
          onQuit={props.onQuit}
          side={<LiveBoard context={context} />}
        >
          <p className="watching">A game is in progress. You’ll be in the next one.</p>
          <PlayFaces faces={facesOf(context)} playerId={props.playerId} />
        </PlayScreen>
      );
  }
}

/** A, B, C, D on the answers. */
const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * The screen every standard-quiz stage shares, in the game look (`games/play.tsx`): the
 * question count at the top left, the big timer in Speed, the topic, then the question and its
 * answers with the scores beside them on a computer, faces on a phone, and the buttons last.
 */
function QuizPlay({
  context,
  index,
  timer,
  actions,
  children,
}: {
  context: GameContext;
  index: number;
  timer?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { view, categoryName, subtitle, latency, onQuit, playerId } = context;
  return (
    <PlayScreen
      label={
        <span className="progress">
          Question <b>{index + 1}</b> of {view.total}
        </span>
      }
      latency={latency}
      onQuit={onQuit}
      className="quiz-main"
    >
      {timer}
      <p className="play-task quiz-topic">{[categoryName, subtitle].filter(Boolean).join(" · ")}</p>
      <Staged wide aside={<LiveBoard context={context} />}>
        {children}
      </Staged>
      <PlayFaces faces={facesOf(context)} playerId={playerId} />
      {actions}
    </PlayScreen>
  );
}

/** The answers to pick from: flat night tiles, lettered, the one you pick turning purple. */
export function Choices({
  choices,
  picked,
  disabled,
  onPick,
}: {
  choices: string[];
  picked: number | null;
  disabled: boolean;
  onPick: (choice: number) => void;
}) {
  return (
    <div className="choices">
      {choices.map((text, i) => (
        <button
          key={i}
          className={`choice${picked === i ? " picked" : ""}`}
          disabled={disabled}
          onClick={() => onPick(i)}
        >
          <span className="choice-letter" aria-hidden="true">
            {letter(i)}
          </span>
          {text}
        </button>
      ))}
    </div>
  );
}

/** The answers once the question closes: the right one green, yours red if it wasn't. */
export function RevealedChoices({
  choices,
  correct,
  mine,
}: {
  choices: string[];
  correct: number;
  mine: number | null;
}) {
  return (
    <div className="choices">
      {choices.map((text, i) => {
        const tone = i === correct ? " correct" : i === mine ? " wrong" : " faded";
        return (
          <div key={i} className={`choice${tone}`}>
            <span className="choice-letter" aria-hidden="true">
              {letter(i)}
            </span>
            {text}
          </div>
        );
      })}
    </div>
  );
}

function Question({ context, stage }: { context: GameContext; stage: QuestionStage }) {
  const { view, client } = context;
  const now = useServerNow(client.serverNow);
  const [visible, setVisible] = useState(() => client.serverNow() >= stage.startsAt);
  const shownAt = useRef<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const hadCountdown = useRef(!visible);
  const countdown = Math.max(1, Math.ceil((stage.startsAt - now) / 1000));
  const secondsLeft = Math.ceil(Math.max(0, stage.deadline - now) / 1000);

  // A tick for each second of the countdown, then "go" as the question appears.
  useEffect(() => {
    if (!visible) play("tick");
  }, [visible, countdown]);
  useEffect(() => {
    if (visible && hadCountdown.current) play("go");
  }, [visible]);
  // In Speed, a quiet tick for each of the last five seconds.
  useEffect(() => {
    if (visible && view.timed && picked === null && secondsLeft > 0 && secondsLeft <= 5) {
      play("hurry");
    }
  }, [visible, view.timed, picked, secondsLeft]);

  // Everyone’s first question appears at the same server moment; answers are timed from then.
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
    const topic = TOPIC_STYLES[context.categoryId as keyof typeof TOPIC_STYLES];
    return (
      <PlayFrame label={context.categoryName} latency={context.latency} onQuit={context.onQuit}>
        <div className="countdown" aria-live="polite">
          {topic ? (
            // The topic "generates" through the countdown, and appears for the last second.
            <GeneratingArt
              className="countdown-art"
              src={topic.art}
              colors={[topic.colors[0], "#8b24fd", "#4a8dff", topic.colors[0], "#b05bff"]}
              background={topic.colors[1]}
              reveal={countdown <= 1}
            />
          ) : (
            <img src="/art/mascot/run.webp" alt="" width={441} height={480} />
          )}
          <p className="countdown-label">Get ready</p>
          <p className="countdown-number">{countdown}</p>
          <span className="pill pill-glow">{context.categoryName}</span>
        </div>
      </PlayFrame>
    );
  }

  const remaining = Math.max(0, stage.deadline - now);

  const handlePick = (choice: number) => {
    if (picked !== null) return;
    setPicked(choice);
    client.act({
      type: "answer",
      index: stage.index,
      choice,
      clientElapsedMs: elapsedSince(shownAt.current),
    });
  };

  const note =
    picked !== null
      ? "Answer locked in"
      : view.playerCount > 1
        ? "Everyone answers at the same time…"
        : "Choose your answer";

  return (
    <QuizPlay
      context={context}
      index={stage.index}
      timer={
        view.timed && (
          <PlayTimer ms={timerMs(remaining)} low={remaining / view.timeLimitMs < 0.25} />
        )
      }
    >
      <h2 className="prompt">{stage.prompt}</h2>
      <Choices
        choices={stage.choices}
        picked={picked}
        disabled={picked !== null}
        onPick={handlePick}
      />
      <p className="quiz-note">{note}</p>
    </QuizPlay>
  );
}

function Answer({ context, stage }: { context: GameContext; stage: AnswerStage }) {
  const { view, client } = context;
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  // Signed-in players choose the pacing in Settings: "Pause 3 seconds" waits (with Skip), and
  // "Go straight on" asks for the next question before this result has even painted. Guests,
  // who have no setting of their own, get the explanation flow when solo and a one-second
  // glance with friends. Explanations show only when the result waits to be read; with friends
  // they always wait for the results.
  const explained = view.playerCount === 1 && (user?.showExplanations ?? true);
  const paused = user ? user.pauseAfterAnswer : view.playerCount === 1;
  const straightOn = user !== null && !paused;
  const sent = useRef(false);
  const next = () => {
    if (sent.current) return;
    sent.current = true;
    client.act({ type: "next" });
  };
  // Straight on: the next question comes immediately, not after a countdown.
  const goStraightOn = useEffectEvent(() => {
    if (straightOn) next();
  });
  useEffect(() => {
    goStraightOn();
  }, [straightOn]);
  const left = useCountdown(paused ? PAUSED_RESULT_MS : QUICK_RESULT_MS, next);
  useEffect(() => play(stage.correct ? "correct" : "wrong"), [stage.correct]);

  const verdict = stage.myChoice === null ? "Time’s up" : stage.correct ? "Correct" : "Wrong";

  return (
    <QuizPlay
      context={context}
      index={stage.index}
      actions={
        paused && (
          <div className="play-actions">
            <button className="play-pill go" onClick={next}>
              Skip
            </button>
          </div>
        )
      }
    >
      <h2 className="prompt">{stage.prompt}</h2>
      <RevealedChoices
        choices={stage.choices}
        correct={stage.correctChoice}
        mine={stage.myChoice}
      />
      <div className="quiz-result">
        <p className={`verdict ${stage.correct ? "good" : "bad"}`} role="status">
          {verdict}
          {stage.points > 0 && <span className="points">+{stage.points}</span>}
        </p>
        {paused && explained && stage.explanation && <Explanation item={stage} />}
        {paused && (
          <p className="quiz-note">
            {stage.isLast ? "Results" : "Next"} in {Math.ceil(left / 1000)}
          </p>
        )}
      </div>
    </QuizPlay>
  );
}

/** Everyone's scores as faces, for phones. */
const facesOf = ({ view, room }: GameContext) =>
  rowsFrom(view.standings, room, (s) => s.score.toLocaleString());

function LiveBoard({ context }: { context: GameContext }) {
  const { view, playerId, avatarOf } = context;
  return <ScoreBoard standings={view.standings} playerId={playerId} avatarOf={avatarOf} bars />;
}

/** Everyone's points as they play. Only on tablets and computers; phones leave it out. */
/** A quiz-style board: points, with bars and medals when `bars` is on. Drawn by `PlayBoard`. */
export function ScoreBoard({
  standings,
  playerId,
  avatarOf,
  bars = false,
}: {
  standings: QuizStanding[];
  playerId: string;
  avatarOf: (id: string) => string | null;
  /** A bar under each name showing how close they are to the leader, and medals for the top three. */
  bars?: boolean;
}) {
  const top = Math.max(1, ...standings.map((s) => s.score));
  return (
    <PlayBoard
      rows={standings.map((s) => ({
        playerId: s.playerId,
        nickname: s.nickname,
        avatar: avatarOf(s.playerId),
        rank: s.rank,
        value: s.left ? "Left" : s.score.toLocaleString(),
        gone: s.left,
        ...(bars ? { bar: s.score / top } : {}),
      }))}
      playerId={playerId}
      medals={bars}
    />
  );
}

function Results({ context, review }: { context: GameContext; review: QuizReviewItem[] }) {
  const { view, client, playerId, isHost, room, categoryName, avatarOf } = context;
  const solo = view.playerCount === 1;
  const podium = view.final && !solo ? view.standings.filter((s) => !s.left).slice(0, 3) : [];
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  useEffect(() => {
    if (view.final) play("fanfare");
  }, [view.final]);

  const text = view.me
    ? `I scored ${view.me.score.toLocaleString()} in a ${categoryName} quiz on Whizard!`
    : `Play a ${categoryName} quiz with me on Whizard!`;
  const settings = parseQuizSettings(room.game.settings);
  const topic = TOPIC_STYLES[context.categoryId as keyof typeof TOPIC_STYLES];
  const level = settings ? LEVEL_NAMES[settings.difficulty] : "";
  const { open: share, dialog: shareDialog } = useShareResults(
    buildCard({
      title: `${categoryName} Quiz`,
      subtitle: [QUIZ_VARIANTS.find((v) => v.id === settings?.variant)?.name, level]
        .filter(Boolean)
        .join(" · "),
      art: topic?.art ?? "/art/games/quiz.webp",
      colors: topic?.colors ?? ["#ff8c1a", "#4a1530"],
      // The board once everyone's done; until then, the sharer's own result.
      rows:
        view.final && !solo
          ? view.standings
              .filter((s) => !s.left)
              .map((s) => ({
                playerId: s.playerId,
                nickname: s.nickname,
                avatar: avatarOf(s.playerId),
                value: s.score,
                label: `${s.score.toLocaleString()} pts`,
                timeMs: s.timeMs,
              }))
          : [],
      me: playerId,
      score: { value: (view.me?.score ?? 0).toLocaleString(), unit: "points" },
      correct: view.me ? { got: view.me.correctCount, of: view.total } : null,
      items: view.total,
      facts: [
        { icon: "❓", value: String(view.total), label: "Questions" },
        { icon: "✅", value: `${view.me?.correctCount ?? 0}/${view.total}`, label: "Correct" },
        { icon: "🎯", value: level || "Quiz", label: "Level" },
      ],
    }),
    text,
  );

  return (
    <div className="results">
      <header className="results-bar">
        <Brand />
        <span className="bar-end">
          <button className="btn bar-pill" onClick={share}>
            <Icon name="share" size={20} />
            <span>Share</span>
          </button>
          <button className="btn bar-pill" onClick={context.onQuit}>
            <Icon name="home" size={20} />
            <span>Home</span>
          </button>
        </span>
      </header>

      <div className={`results-layout${solo ? " solo" : ""}`}>
        <section className="results-main">
          <img
            className="results-mascot"
            src="/art/mascot/podium.webp"
            alt=""
            width={590}
            height={620}
          />
          <div className="results-head">
            <h2 className="display results-title">Game Results</h2>
            <span className="pill">
              <Icon name="trophy" size={18} />
              {categoryName} • {view.total} Questions
            </span>
          </div>

          {solo && view.me ? (
            <div className="panel solo-score">
              <p className="label">Your score</p>
              <p className="big-score">{view.me.score.toLocaleString()}</p>
              <p className="muted">
                {view.me.correctCount} of {view.total} correct
              </p>
            </div>
          ) : podium.length > 0 ? (
            <Podium
              entries={podium.map((p) => ({ ...p, label: p.score.toLocaleString() }))}
              avatarOf={avatarOf}
            />
          ) : (
            <p className="muted center waiting-note">Waiting for everyone to finish…</p>
          )}

          {view.final &&
            (isHost ? (
              <div className="results-actions">
                <button className="btn btn-primary" onClick={() => client.startGame()}>
                  <Icon name="play" size={20} fill />
                  Play Again
                </button>
                <button className="btn" onClick={() => client.backToLobby()}>
                  <Icon name="games" size={22} />
                  Change Game
                </button>
              </div>
            ) : (
              <p className="muted center">Waiting for the host to start the next game.</p>
            ))}
        </section>

        {!solo && (
          <aside className="panel rankings" aria-labelledby="rankings-title">
            <h2 className="rankings-title" id="rankings-title">
              <Icon name="trophy" size={24} />
              {view.final ? "Final Rankings" : "Results so far"}
            </h2>
            <Leaderboard standings={view.standings} me={playerId} avatarOf={avatarOf} />
          </aside>
        )}
      </div>

      {view.final && !solo && <AddFromGame usernames={usernames} />}
      {shareDialog}

      {review.length > 0 && (
        <section className="panel review-panel" aria-labelledby="review-title">
          <h2 className="section-title" id="review-title">
            Your answers
          </h2>
          <ol className="review">
            {review.map((item) => (
              <li key={item.index}>
                <p className="q">
                  {item.index + 1}. {item.prompt}
                </p>
                {!item.correct && (
                  <p className="line bad">
                    ✗ {item.myChoice === null ? "No answer" : item.choices[item.myChoice]}
                  </p>
                )}
                <p className="line good">✓ {item.choices[item.correctChoice]}</p>
                {item.explanation && <Explanation item={item} />}
                <ReportQuestion questionId={item.questionId} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export function Leaderboard({
  standings,
  me,
  avatarOf,
}: {
  standings: QuizStanding[];
  me: string;
  avatarOf: (id: string) => string | null;
}) {
  return (
    <ol className="board">
      {standings.map((s) => (
        <li
          key={s.playerId}
          className={[
            s.rank === 1 && s.finished ? "first" : "",
            s.playerId === me ? "me" : "",
            s.left ? "gone" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={`rank rank-${s.rank}`}>{s.rank}</span>
          <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={40} />
          <span className="name">{s.nickname}</span>
          {s.left ? (
            <span className="playing">Left</span>
          ) : s.finished ? (
            <span className="pts">{s.score.toLocaleString()}</span>
          ) : (
            <span className="playing">Playing…</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Explanation({ item }: { item: Pick<QuizReviewItem, "explanation" | "reference"> }) {
  return (
    <p className="explanation">
      {item.explanation}
      {item.reference && (
        <>
          {" "}
          <span className="reference">({item.reference})</span>
        </>
      )}
    </p>
  );
}

/** Counts down from `ms`, calling `onDone` once at zero. Returns the milliseconds left. */
export function useCountdown(ms: number, onDone: () => void): number {
  const [left, setLeft] = useState(ms);
  const done = useEffectEvent(onDone);

  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, ms - (performance.now() - start));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        done();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [ms]);

  return left;
}

/** Milliseconds since a `performance.now()` reading, or 0 if there isn’t one yet. */
export function elapsedSince(start: number | null): number {
  return start === null ? 0 : Math.round(performance.now() - start);
}
