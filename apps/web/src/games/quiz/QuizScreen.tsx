import type { QuizStage, QuizStanding, QuizView } from "@whizard/game-core";
import { useEffect, useRef, useState } from "react";
import type { RoomClient } from "../../roomClient";
import { useServerNow } from "../../useServerNow";

type QuestionStage = Extract<QuizStage, { kind: "question" }>;
type AnswerStage = Extract<QuizStage, { kind: "answer" }>;

const LETTERS = ["A", "B", "C", "D"];

interface Props {
  view: QuizView;
  client: RoomClient;
  isHost: boolean;
}

export function QuizScreen({ view, client, isHost }: Props) {
  const { stage } = view;
  switch (stage.kind) {
    case "question":
      return <Question key={`q${stage.index}`} view={view} stage={stage} client={client} />;
    case "answer":
      return <Answer key={`a${stage.index}`} view={view} stage={stage} client={client} />;
    case "done":
      return <Results view={view} client={client} isHost={isHost} />;
    case "watching":
      return (
        <section className="card">
          <p className="notice">A game is in progress. You'll be in the next one.</p>
          {view.standings.length > 0 && <Standings standings={view.standings} total={view.total} />}
        </section>
      );
  }
}

function GameHeader({ view, index }: { view: QuizView; index: number }) {
  return (
    <div className="game-header">
      <span>
        Question {index + 1} of {view.total}
      </span>
      {view.me && <span className="score">{view.me.score.toLocaleString()} pts</span>}
    </div>
  );
}

function Question({
  view,
  stage,
  client,
}: {
  view: QuizView;
  stage: QuestionStage;
  client: RoomClient;
}) {
  const now = useServerNow(client.serverNow);
  const [visible, setVisible] = useState(() => client.serverNow() >= stage.startsAt);
  const shownAt = useRef<number | null>(null);
  const [picked, setPicked] = useState<number | null>(stage.myChoice);

  // Reveal exactly at the server's start time, and time the answer from that moment.
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
    const seconds = Math.max(1, Math.ceil((stage.startsAt - now) / 1000));
    return (
      <section className="card countdown" aria-live="polite">
        <p className="label">
          {stage.index === 0 ? "Get ready" : `Question ${stage.index + 1} of ${view.total}`}
        </p>
        <p className="countdown-number">{stage.index === 0 ? seconds : "…"}</p>
      </section>
    );
  }

  const choice = picked ?? stage.myChoice;
  const remaining = Math.max(0, stage.deadline - now);

  const handlePick = (index: number) => {
    if (choice !== null) return;
    setPicked(index);
    client.act({
      type: "answer",
      index: stage.index,
      choice: index,
      clientElapsedMs: elapsedSince(shownAt.current),
    });
  };

  return (
    <section className="card">
      <GameHeader view={view} index={stage.index} />
      <div
        className="timer"
        role="progressbar"
        aria-label="Time left"
        aria-valuemin={0}
        aria-valuemax={view.timeLimitMs}
        aria-valuenow={remaining}
      >
        <div style={{ width: `${(remaining / view.timeLimitMs) * 100}%` }} />
      </div>
      <h2 className="prompt">{stage.prompt}</h2>
      <div className="choices">
        {stage.choices.map((text, i) => (
          <button
            key={i}
            className={`choice${choice === i ? " selected" : ""}`}
            disabled={choice !== null}
            onClick={() => handlePick(i)}
          >
            <span className="letter">{LETTERS[i]}</span>
            {text}
          </button>
        ))}
      </div>
      {choice !== null && view.variant === "classic" && (
        <p className="hint" aria-live="polite">
          {stage.activeCount > 1
            ? `Waiting for the others · ${stage.answeredCount} of ${stage.activeCount} answered`
            : "Locked in."}
        </p>
      )}
    </section>
  );
}

function Answer({
  view,
  stage,
  client,
}: {
  view: QuizView;
  stage: AnswerStage;
  client: RoomClient;
}) {
  const now = useServerNow(client.serverNow, stage.nextAt !== null);
  const [advancing, setAdvancing] = useState(false);
  const seconds =
    stage.nextAt === null ? null : Math.max(0, Math.ceil((stage.nextAt - now) / 1000));

  const verdict = stage.myChoice === null ? "Time's up" : stage.correct ? "Correct!" : "Not quite";

  return (
    <section className="card">
      <GameHeader view={view} index={stage.index} />
      <h2 className="prompt">{stage.prompt}</h2>
      <div className="choices">
        {stage.choices.map((text, i) => {
          const state =
            i === stage.correctChoice ? " correct" : i === stage.myChoice ? " wrong" : " dim";
          return (
            <div key={i} className={`choice${state}`} aria-current={i === stage.myChoice}>
              <span className="letter">{LETTERS[i]}</span>
              {text}
            </div>
          );
        })}
      </div>
      <p className={`verdict ${stage.correct ? "good" : "bad"}`} role="status">
        {verdict}
        {stage.points > 0 && <span className="points"> +{stage.points}</span>}
      </p>
      {stage.explanation && (
        <p className="explanation">
          {stage.explanation}
          {stage.reference && (
            <>
              {" "}
              <span className="reference">({stage.reference})</span>
            </>
          )}
        </p>
      )}

      {view.variant === "classic" ? (
        <>
          {view.standings.length > 1 && (
            <Standings standings={view.standings} total={view.total} compact />
          )}
          <p className="hint">
            {stage.isLast ? "Final results coming up…" : `Next question in ${seconds ?? 0}…`}
          </p>
        </>
      ) : (
        <button
          className="primary"
          disabled={advancing}
          onClick={() => {
            setAdvancing(true);
            client.act({ type: "next" });
          }}
        >
          {stage.isLast ? "See results" : "Next question"}
        </button>
      )}
    </section>
  );
}

function Results({
  view,
  client,
  isHost,
}: {
  view: QuizView;
  client: RoomClient;
  isHost: boolean;
}) {
  const solo = view.standings.length === 1;
  const me = view.me;
  return (
    <section className="card">
      <h2 className="section-title">{view.final ? "Final results" : "Results so far"}</h2>
      {solo && me ? (
        <div className="solo-result">
          <p className="big-score">{me.score.toLocaleString()}</p>
          <p className="hint">
            {me.correctCount} of {view.total} correct
          </p>
        </div>
      ) : (
        <Standings standings={view.standings} total={view.total} />
      )}
      {!view.final && <p className="hint">Waiting for everyone to finish…</p>}
      {view.final &&
        (isHost ? (
          <div className="stack">
            <button className="primary" onClick={() => client.startGame()}>
              Play again
            </button>
            <button onClick={() => client.backToLobby()}>Change settings</button>
          </div>
        ) : (
          <p className="hint">Waiting for the host to start the next game.</p>
        ))}
    </section>
  );
}

function Standings({
  standings,
  total,
  compact = false,
}: {
  standings: QuizStanding[];
  total: number;
  compact?: boolean;
}) {
  const rows = compact ? standings.slice(0, 5) : standings;
  return (
    <ol className={`standings${compact ? " compact" : ""}`}>
      {rows.map((s) => (
        <li key={s.playerId} className={s.left ? "offline" : ""}>
          <span className="rank">{s.rank}</span>
          <span className="nickname">{s.nickname}</span>
          <span className="detail">
            {s.left
              ? "Left"
              : compact
                ? `${s.correctCount} correct`
                : s.finished
                  ? `${s.correctCount}/${total} · ${formatSeconds(s.totalTimeMs)}`
                  : `On question ${Math.min(s.answeredCount + 1, total)} of ${total}`}
          </span>
          <span className="score">{s.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

/** Milliseconds since a `performance.now()` reading, or 0 if there isn't one yet. */
function elapsedSince(start: number | null): number {
  return start === null ? 0 : Math.round(performance.now() - start);
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
