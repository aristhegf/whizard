import {
  QUIZ_CATEGORIES,
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
import { GeneratingArt } from "../../ui/GeneratingArt";
import { Brand } from "../../ui/Chrome";
import { Icon } from "../../ui/Icon";
import { parseQuizSettings } from "./QuizSettingsPanel";
import { EliminationScreen } from "./EliminationScreen";
import { ReportQuestion } from "./ReportQuestion";
import { play } from "../../sounds";
import { MuteButton } from "../../ui/MuteButton";

type QuestionStage = Extract<QuizStage, { kind: "question" }>;
type AnswerStage = Extract<QuizStage, { kind: "answer" }>;

/** Playing with friends: a glance at the right answer, then straight on. */
const QUICK_RESULT_MS = 1000;
/** Playing solo, or signed in and asked for them: time to read the explanation, with Skip. */
const EXPLAINED_RESULT_MS = 3000;

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
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const context: GameContext = {
    ...props,
    categoryId: settings?.category ?? null,
    categoryName,
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
        <div className="game">
          <GameBar context={context} index={null} />
          <div className="game-layout">
            <div className="game-main">
              <p className="watching">A game is in progress. You’ll be in the next one.</p>
            </div>
            <LiveBoard context={context} />
          </div>
        </div>
      );
  }
}

function GameBar({
  context,
  index,
  timer,
}: {
  context: GameContext;
  index: number | null;
  timer?: ReactNode;
}) {
  const { view, room, onQuit, latency } = context;
  const answered = index === null ? 0 : index + (view.stage.kind === "answer" ? 1 : 0);
  return (
    <header className="game-bar">
      <div className="game-bar-row">
        <span className="bar-brand">
          <Brand />
        </span>
        <span className="room-label" translate="no">
          Room: {room.code}
        </span>
        {index !== null && (
          <span className="progress">
            Question {index + 1} / {view.total}
          </span>
        )}
        <span className="bar-end">
          {latency}
          {timer}
          <MuteButton />
          <button className="btn quit-btn" onClick={onQuit}>
            Quit
          </button>
        </span>
      </div>
      {index !== null && (
        <div className="question-progress" aria-hidden="true">
          <div style={{ width: `${(answered / Math.max(1, view.total)) * 100}%` }} />
        </div>
      )}
    </header>
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
      <div className="game">
        <GameBar context={context} index={null} />
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
      </div>
    );
  }

  const remaining = Math.max(0, stage.deadline - now);
  const fraction = remaining / view.timeLimitMs;

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

  const timer = view.timed ? (
    <span
      className={`timer-pill${fraction < 0.25 ? " low" : ""}`}
      role="progressbar"
      aria-label="Time left"
      aria-valuemin={0}
      aria-valuemax={view.timeLimitMs}
      aria-valuenow={remaining}
    >
      <Icon name="clock" size={22} stroke={2.4} />
      {Math.ceil(remaining / 1000)}s
    </span>
  ) : undefined;

  return (
    <div className="game">
      <GameBar context={context} index={stage.index} timer={timer} />
      <div className="game-layout">
        <div className="game-main">
          <span className="pill pill-glow">{context.categoryName}</span>
          <h2 className="prompt">{stage.prompt}</h2>
          <div className="choices">
            {stage.choices.map((text, i) => (
              <button
                key={i}
                className={`choice${picked === i ? " picked" : ""}`}
                disabled={picked !== null}
                onClick={() => handlePick(i)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <LiveBoard context={context} />
      </div>
    </div>
  );
}

function Answer({ context, stage }: { context: GameContext; stage: AnswerStage }) {
  const { view, client } = context;
  const account = useAccount();
  const wantsExplanations = account.status === "ready" && !!account.user?.showExplanations;
  const explained = view.playerCount === 1 || wantsExplanations;
  const sent = useRef(false);
  const next = () => {
    if (sent.current) return;
    sent.current = true;
    client.act({ type: "next" });
  };
  const left = useCountdown(explained ? EXPLAINED_RESULT_MS : QUICK_RESULT_MS, next);
  useEffect(() => play(stage.correct ? "correct" : "wrong"), [stage.correct]);

  const verdict = stage.myChoice === null ? "Time’s up" : stage.correct ? "Correct" : "Wrong";

  return (
    <div className="game">
      <GameBar context={context} index={stage.index} />
      <div className="game-layout">
        <div className="game-main">
          <span className="pill pill-glow">{context.categoryName}</span>
          <h2 className="prompt">{stage.prompt}</h2>
          <div className="choices">
            {stage.choices.map((text, i) => {
              const tone =
                i === stage.correctChoice ? " correct" : i === stage.myChoice ? " wrong" : " faded";
              return (
                <div key={i} className={`choice${tone}`}>
                  {text}
                </div>
              );
            })}
          </div>
          <p className={`verdict ${stage.correct ? "good" : "bad"}`} role="status">
            {verdict}
            {stage.points > 0 && <span className="points">+{stage.points}</span>}
          </p>
          {explained && (
            <>
              {stage.explanation && <Explanation item={stage} />}
              <div className="next-row">
                <span className="muted">
                  {stage.isLast ? "Results" : "Next"} in {Math.ceil(left / 1000)}
                </span>
                <button className="btn" onClick={next}>
                  Skip
                </button>
              </div>
            </>
          )}
        </div>
        <LiveBoard context={context} />
      </div>
    </div>
  );
}

/** Everyone's points as they play. Only on tablets and computers; phones leave it out. */
function LiveBoard({ context }: { context: GameContext }) {
  const { view, playerId, avatarOf } = context;
  if (view.standings.length === 0) return null;
  return (
    <aside className="panel live-board" aria-label="Live scores">
      <h2 className="live-title">
        {view.standings.length} {view.standings.length === 1 ? "player" : "players"}
      </h2>
      <ol>
        {view.standings.map((s) => (
          <li
            key={s.playerId}
            className={`${s.playerId === playerId ? "me" : ""}${s.left ? " gone" : ""}`}
          >
            <span className="rank">{s.rank}</span>
            <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={40} />
            <span className="name">{s.playerId === playerId ? "You" : s.nickname}</span>
            <span className="pts">{s.left ? "Left" : s.score.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </aside>
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

  const share = async () => {
    const text = view.me
      ? `I scored ${view.me.score.toLocaleString()} in a ${categoryName} quiz on Whizard!`
      : `Play a ${categoryName} quiz with me on Whizard!`;
    try {
      if (navigator.share) await navigator.share({ title: "Whizard", text, url: location.origin });
      else await navigator.clipboard.writeText(`${text} ${location.origin}`);
    } catch {
      // Dismissed or blocked.
    }
  };

  return (
    <div className="results">
      <header className="results-bar">
        <Brand />
        <span className="bar-end">
          <button className="btn bar-pill" onClick={() => void share()}>
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
            <h2 className="display results-title">
              Game <span className="gradient-text">Results</span>
            </h2>
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
            <Podium standings={podium} avatarOf={avatarOf} />
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
                <button className="btn" onClick={() => void share()}>
                  <Icon name="share" size={20} />
                  Share Results
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

const PODIUM_ORDER = [1, 0, 2];

function Podium({
  standings,
  avatarOf,
}: {
  standings: QuizStanding[];
  avatarOf: (id: string) => string | null;
}) {
  return (
    <div className="podium" aria-label="Top three">
      <span className="confetti" aria-hidden="true" />
      {PODIUM_ORDER.map((i) => {
        const s = standings[i];
        if (!s) return <div key={i} className="podium-place empty" />;
        return (
          <div key={s.playerId} className={`podium-place place-${i + 1}`}>
            <div className="podium-face">
              {i === 0 && (
                <span className="podium-crown" aria-hidden="true">
                  <Icon name="crown" size={44} fill />
                </span>
              )}
              <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={i === 0 ? 150 : 118} />
              <span className="podium-rank">{i + 1}</span>
            </div>
            <div className="podium-block">
              <span className="podium-name">{s.nickname}</span>
              <span className="podium-score">{s.score.toLocaleString()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Leaderboard({
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
function useCountdown(ms: number, onDone: () => void): number {
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
function elapsedSince(start: number | null): number {
  return start === null ? 0 : Math.round(performance.now() - start);
}
