import {
  QUIZ_CATEGORIES,
  type EliminationStage,
  type EliminationStanding,
  type EliminationView,
  type QuizReviewItem,
} from "@whizard/game-core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TOPIC_STYLES } from "../../catalog";
import { AddFromGame } from "../../FriendsScreen";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { Avatar } from "../../ui/Avatar";
import { Brand } from "../../ui/Chrome";
import { GeneratingArt } from "../../ui/GeneratingArt";
import { Icon } from "../../ui/Icon";
import { MuteButton } from "../../ui/MuteButton";
import { useServerNow } from "../../useServerNow";
import { parseQuizSettings } from "./QuizSettingsPanel";
import { ReportQuestion } from "./ReportQuestion";

type Stage<K extends EliminationStage["kind"]> = Extract<EliminationStage, { kind: K }>;

interface Props {
  view: EliminationView;
  client: RoomClient;
  room: RoomSnapshot;
  playerId: string;
  isHost: boolean;
  latency: ReactNode;
  onQuit: () => void;
}

interface Context extends Props {
  categoryId: string | null;
  categoryName: string;
  avatarOf: (playerId: string) => string | null;
}

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

/** Elimination: everyone on the same question, knock-outs between rounds, then a final. */
export function EliminationScreen(props: Props) {
  const { view, room } = props;
  const settings = parseQuizSettings(room.game.settings);
  const categoryName = QUIZ_CATEGORIES.find((c) => c.id === settings?.category)?.name ?? "Quiz";
  const avatars = new Map(room.players.map((p) => [p.id, p.avatar]));
  const context: Context = {
    ...props,
    categoryId: settings?.category ?? null,
    categoryName,
    avatarOf: (id) => avatars.get(id) ?? null,
  };
  const { stage } = view;
  switch (stage.kind) {
    case "question":
      return <Question key={`q${stage.index}`} context={context} stage={stage} />;
    case "reveal":
      return <Reveal key={`r${stage.index}`} context={context} stage={stage} />;
    case "cut":
      return <Cut key={`c${stage.round}`} context={context} stage={stage} />;
    case "final":
      return <FinalIntro context={context} stage={stage} />;
    case "done":
      return <Done context={context} stage={stage} />;
  }
}

function Bar({ context, timer }: { context: Context; timer?: ReactNode }) {
  const { view, room, onQuit, latency } = context;
  const where = view.inFinal
    ? view.suddenDeath
      ? "Sudden death"
      : "The Final"
    : view.round !== null
      ? `Round ${view.round} of ${view.rounds}`
      : "";
  return (
    <header className="game-bar">
      <div className="game-bar-row">
        <span className="bar-brand">
          <Brand />
        </span>
        <span className="room-label" translate="no">
          Room: {room.code}
        </span>
        <span className="progress elim-progress">
          {where}
          {/* Between questions (knock-outs, the final's intro) there's no question to count. */}
          {(view.stage.kind === "question" || view.stage.kind === "reveal") &&
            ` · Question ${view.questionNumber}`}
        </span>
        <span className="bar-end">
          <span className="pill elim-left" title="Players still in">
            <Icon name="users" size={18} />
            {view.aliveCount} in
          </span>
          {latency}
          {timer}
          <MuteButton />
          <button className="btn quit-btn" onClick={onQuit}>
            Quit
          </button>
        </span>
      </div>
    </header>
  );
}

/** Shown to anyone knocked out or who joined late. */
function Watching({ view }: { view: EliminationView }) {
  if (!view.me || view.me.status === "in" || view.me.status === "finalist") return null;
  return (
    <p className="elim-watching" role="status">
      <Icon name="users" size={18} />
      {view.me.status === "watching"
        ? "You joined mid-game, so you’re watching this one."
        : `You’re out${view.me.outRound ? ` (round ${view.me.outRound})` : ""}. Watching the rest.`}
    </p>
  );
}

function Question({ context, stage }: { context: Context; stage: Stage<"question"> }) {
  const { view, client } = context;
  const now = useServerNow(client.serverNow);
  const [visible, setVisible] = useState(() => client.serverNow() >= stage.startsAt);
  const shownAt = useRef<number | null>(null);
  const [picked, setPicked] = useState<number | null>(stage.myChoice);
  const countdown = Math.max(1, Math.ceil((stage.startsAt - now) / 1000));
  const remaining = Math.max(0, stage.deadline - now);
  const secondsLeft = Math.ceil(remaining / 1000);

  useEffect(() => {
    if (!visible) play("tick");
  }, [visible, countdown]);
  useEffect(() => {
    if (stage.playing && picked === null && visible && secondsLeft > 0 && secondsLeft <= 5) {
      play("hurry");
    }
  }, [stage.playing, picked, visible, secondsLeft]);
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
        <Bar context={context} />
        <div className="countdown" aria-live="polite">
          {topic ? (
            // As in Classic and Speed: the topic "generates" through the countdown.
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
          <span className="pill pill-glow">Elimination · {context.categoryName}</span>
        </div>
      </div>
    );
  }

  const pick = (choice: number) => {
    if (picked !== null || !stage.playing) return;
    setPicked(choice);
    client.act({
      type: "answer",
      index: stage.index,
      choice,
      clientElapsedMs: elapsedSince(shownAt.current),
    });
  };
  const fraction = remaining / view.timeLimitMs;
  const timer = (
    <span
      className={`timer-pill${fraction < 0.25 ? " low" : ""}`}
      role="progressbar"
      aria-label="Time left"
      aria-valuemin={0}
      aria-valuemax={view.timeLimitMs}
      aria-valuenow={remaining}
    >
      <Icon name="clock" size={22} stroke={2.4} />
      {secondsLeft}s
    </span>
  );

  return (
    <div className="game">
      <Bar context={context} timer={timer} />
      <div className="game-layout">
        <div className="game-main">
          <Watching view={view} />
          <span className="pill pill-glow">{context.categoryName}</span>
          <h2 className="prompt">{stage.prompt}</h2>
          <div className="choices">
            {stage.choices.map((text, i) => (
              <button
                key={i}
                className={`choice${picked === i ? " picked" : ""}`}
                disabled={picked !== null || !stage.playing}
                onClick={() => pick(i)}
              >
                {text}
              </button>
            ))}
          </div>
          {stage.playing && picked !== null && (
            <p className="muted center" role="status">
              Locked in. Waiting for the others… {stage.answeredCount} of {stage.aliveCount}{" "}
              answered
            </p>
          )}
        </div>
        <Board context={context} />
      </div>
    </div>
  );
}

function Reveal({ context, stage }: { context: Context; stage: Stage<"reveal"> }) {
  const { view } = context;
  useEffect(() => {
    if (stage.playing) play(stage.correct ? "correct" : "wrong");
  }, [stage.playing, stage.correct]);
  const verdict = !stage.playing
    ? `The answer: ${stage.choices[stage.correctChoice]}`
    : stage.myChoice === null
      ? "Time’s up"
      : stage.correct
        ? "Correct"
        : "Wrong";
  return (
    <div className="game">
      <Bar context={context} />
      <div className="game-layout">
        <div className="game-main">
          <Watching view={view} />
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
          <p
            className={`verdict ${stage.correct || !stage.playing ? "good" : "bad"}`}
            role="status"
          >
            {verdict}
            {stage.points > 0 && <span className="points">+{stage.points}</span>}
          </p>
        </div>
        <Board context={context} />
      </div>
    </div>
  );
}

function Cut({ context, stage }: { context: Context; stage: Stage<"cut"> }) {
  const { view, client, playerId, avatarOf } = context;
  const now = useServerNow(client.serverNow);
  const meOut = stage.out.some((p) => p.playerId === playerId);
  const through = view.me?.status === "in" || view.me?.status === "finalist";
  useEffect(() => {
    if (meOut) play("wrong");
    else if (through) play("correct");
  }, [meOut, through]);
  const seconds = Math.max(0, Math.ceil((stage.until - now) / 1000));
  return (
    <div className="game">
      <Bar context={context} />
      <section className="elim-cut panel" aria-labelledby="cut-title">
        <p className="elim-kicker">Round {stage.round} results</p>
        <h2 className="display" id="cut-title">
          {stage.out.length === 0 ? "Nobody goes this round" : `${stage.out.length} knocked out`}
        </h2>
        {stage.tieKept && (
          <p className="muted">
            {stage.out.length === 0
              ? "It was a tie at the line, so everyone stays."
              : "A tie at the line kept an extra player in."}
          </p>
        )}
        {stage.out.length > 0 && (
          <ul className="elim-out">
            {stage.out.map((p) => (
              <li key={p.playerId} className={p.playerId === playerId ? "me" : ""}>
                <Avatar id={avatarOf(p.playerId)} name={p.nickname} size={56} />
                <span>{p.playerId === playerId ? "You" : p.nickname}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={`elim-you ${meOut ? "bad" : through ? "good" : ""}`} role="status">
          {meOut
            ? `You’re out! You finished ${view.me?.rank ? ordinal(view.me.rank) : "this game"}. Stay and watch the rest.`
            : through
              ? stage.next === "final"
                ? "You’re in the final!"
                : "You’re through to the next round!"
              : ""}
        </p>
        <p className="muted">
          {stage.next === "final" ? "The final starts" : `Round ${stage.round + 1} starts`} in{" "}
          {seconds}s
        </p>
      </section>
    </div>
  );
}

function FinalIntro({ context, stage }: { context: Context; stage: Stage<"final"> }) {
  const { client, playerId, avatarOf } = context;
  const now = useServerNow(client.serverNow);
  useEffect(() => play("go"), []);
  const [a, b] = stage.finalists;
  const seconds = Math.max(0, Math.ceil((stage.until - now) / 1000));
  const face = (p: typeof a) =>
    p && (
      <div className="elim-finalist">
        <Avatar id={avatarOf(p.playerId)} name={p.nickname} size={110} />
        <strong>{p.playerId === playerId ? "You" : p.nickname}</strong>
      </div>
    );
  return (
    <div className="game">
      <Bar context={context} />
      <section className="elim-final panel" aria-labelledby="final-title">
        <p className="elim-kicker">Two left</p>
        <h2 className="display" id="final-title">
          The <span className="gradient-text">Final</span>
        </h2>
        <div className="elim-versus">
          {face(a)}
          <span className="elim-vs" aria-label="versus">
            VS
          </span>
          {face(b)}
        </div>
        <p className="muted">
          Scores go back to zero. Three questions, most points wins; if it’s level, sudden death.
        </p>
        <p className="countdown-number small">{seconds}</p>
      </section>
    </div>
  );
}

/** Everyone's standing: who's still in, then who went out when. */
function Board({ context }: { context: Context }) {
  const { view, playerId, avatarOf } = context;
  const finalScores = new Map((view.finalScores ?? []).map((f) => [f.playerId, f.score]));
  return (
    <aside className="panel live-board" aria-label="Players">
      <h2 className="live-title">{view.inFinal ? "Final" : `${view.aliveCount} still in`}</h2>
      <ol>
        {view.standings.map((s) => (
          <li
            key={s.playerId}
            className={`${s.playerId === playerId ? "me" : ""}${s.status === "out" || s.status === "left" ? " gone" : ""}`}
          >
            <span className="rank">{s.rank}</span>
            <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={40} />
            <span className="name">{s.playerId === playerId ? "You" : s.nickname}</span>
            <span className="pts">
              {s.status === "out"
                ? `Out · R${s.outRound}`
                : s.status === "left"
                  ? "Left"
                  : (finalScores.get(s.playerId) ?? s.score).toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

const STATUS: Record<EliminationStanding["status"], string> = {
  in: "Still in",
  finalist: "Finalist",
  winner: "Winner",
  "runner-up": "Runner-up",
  out: "Out",
  left: "Left",
};

function Done({ context, stage }: { context: Context; stage: Stage<"done"> }) {
  const { view, client, isHost, playerId, room, categoryName, avatarOf } = context;
  useEffect(() => play("fanfare"), []);
  const winner = stage.winner;
  const iWon = winner?.playerId === playerId;
  const usernames = room.players.flatMap((p) => (p.username ? [p.username] : []));
  const share = async () => {
    const text = iWon
      ? `I won an Elimination ${categoryName} quiz on Whizard! 🏆`
      : `Play an Elimination ${categoryName} quiz with me on Whizard!`;
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
      <div className="results-layout">
        <section className="results-main elim-winner">
          <p className="elim-kicker">Elimination · {categoryName}</p>
          {winner ? (
            <>
              <div className="elim-crowned">
                <span className="podium-crown" aria-hidden="true">
                  <Icon name="crown" size={52} fill />
                </span>
                <Avatar id={avatarOf(winner.playerId)} name={winner.nickname} size={150} />
              </div>
              <h2 className="display results-title">
                {iWon ? (
                  <>
                    You <span className="gradient-text">won!</span>
                  </>
                ) : (
                  <>
                    {winner.nickname} <span className="gradient-text">wins!</span>
                  </>
                )}
              </h2>
            </>
          ) : (
            <h2 className="display results-title">Game over</h2>
          )}
          {view.me && !iWon && view.me.rank && (
            <p className="muted center">
              You finished {ordinal(view.me.rank)}
              {view.me.outRound ? `, out in round ${view.me.outRound}` : ""}.
            </p>
          )}
          {isHost ? (
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
          )}
        </section>
        <aside className="panel rankings" aria-labelledby="rankings-title">
          <h2 className="rankings-title" id="rankings-title">
            <Icon name="trophy" size={24} />
            Final Rankings
          </h2>
          <ol className="board">
            {view.standings.map((s) => (
              <li
                key={s.playerId}
                className={[
                  s.status === "winner" ? "first" : "",
                  s.playerId === playerId ? "me" : "",
                  s.status === "left" ? "gone" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={`rank rank-${s.rank}`}>{s.rank}</span>
                <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={40} />
                <span className="name">{s.nickname}</span>
                <span className="playing">
                  {s.status === "out" ? `Out in round ${s.outRound}` : STATUS[s.status]}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      <AddFromGame usernames={usernames} />
      {stage.review.length > 0 && <Review review={stage.review} />}
    </div>
  );
}

function Review({ review }: { review: QuizReviewItem[] }) {
  return (
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
            {item.explanation && <p className="explanation">{item.explanation}</p>}
            <ReportQuestion questionId={item.questionId} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Milliseconds since a `performance.now()` reading, or 0 if there isn’t one yet. */
function elapsedSince(start: number | null): number {
  return start === null ? 0 : Math.round(performance.now() - start);
}
