import type { QuizReviewItem, QuizStage, QuizStanding, QuizView } from "@whizard/game-core";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAccount } from "../../account";
import type { RoomClient } from "../../roomClient";
import { useServerNow } from "../../useServerNow";

type QuestionStage = Extract<QuizStage, { kind: "question" }>;
type AnswerStage = Extract<QuizStage, { kind: "answer" }>;

const LETTERS = ["A", "B", "C", "D"];
/** Playing with friends: a glance at the right answer, then straight on. */
const QUICK_RESULT_MS = 1000;
/** Playing solo, or signed in and asked for them: time to read the explanation, with Skip. */
const EXPLAINED_RESULT_MS = 3000;

interface Props {
  view: QuizView;
  client: RoomClient;
  playerId: string;
  isHost: boolean;
}

export function QuizScreen({ view, client, playerId, isHost }: Props) {
  const { stage } = view;
  switch (stage.kind) {
    case "question":
      return <Question key={`q${stage.index}`} view={view} stage={stage} client={client} />;
    case "answer":
      return <Answer key={`a${stage.index}`} view={view} stage={stage} client={client} />;
    case "done":
      return (
        <Results
          view={view}
          review={stage.review}
          client={client}
          playerId={playerId}
          isHost={isHost}
        />
      );
    case "watching":
      return (
        <div className="screen">
          <p className="muted">A game is in progress. You’ll be in the next one.</p>
          <Leaderboard standings={view.standings} />
        </div>
      );
  }
}

function Progress({ view, index }: { view: QuizView; index: number }) {
  return (
    <div className="progress">
      <span>
        {index + 1} <span className="of">/ {view.total}</span>
      </span>
      {view.me && <span>{view.me.score.toLocaleString()} pts</span>}
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
  const [picked, setPicked] = useState<number | null>(null);

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
    return (
      <div className="screen countdown" aria-live="polite">
        <p className="label">Get ready</p>
        <p className="countdown-number">{Math.max(1, Math.ceil((stage.startsAt - now) / 1000))}</p>
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

  return (
    <div className="screen">
      <Progress view={view} index={stage.index} />
      {view.timed && (
        <div
          className={`timer${fraction < 0.25 ? " low" : ""}`}
          role="progressbar"
          aria-label="Time left"
          aria-valuemin={0}
          aria-valuemax={view.timeLimitMs}
          aria-valuenow={remaining}
        >
          <div style={{ width: `${fraction * 100}%` }} />
        </div>
      )}
      <h2 className="prompt">{stage.prompt}</h2>
      <div className="choices">
        {stage.choices.map((text, i) => (
          <button
            key={i}
            className={`choice${picked === i ? " picked" : ""}`}
            disabled={picked !== null}
            onClick={() => handlePick(i)}
          >
            <span className="letter">{LETTERS[i]}</span>
            {text}
          </button>
        ))}
      </div>
    </div>
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

  const verdict = stage.myChoice === null ? "Time’s up" : stage.correct ? "Correct" : "Wrong";

  return (
    <div className="screen result">
      <Progress view={view} index={stage.index} />
      <h2 className="prompt">{stage.prompt}</h2>
      <div className="choices">
        {stage.choices.map((text, i) => {
          const tone =
            i === stage.correctChoice ? " correct" : i === stage.myChoice ? " wrong" : " faded";
          return (
            <div key={i} className={`choice${tone}`}>
              <span className="letter">{LETTERS[i]}</span>
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
          <div className="dock next-row">
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
  );
}

function Results({
  view,
  review,
  client,
  playerId,
  isHost,
}: {
  view: QuizView;
  review: QuizReviewItem[];
  client: RoomClient;
  playerId: string;
  isHost: boolean;
}) {
  const solo = view.playerCount === 1;
  return (
    <div className="screen">
      {solo && view.me ? (
        <div className="stack">
          <p className="label">Your score</p>
          <p className="big-score">{view.me.score.toLocaleString()}</p>
          <p className="muted">
            {view.me.correctCount} of {view.total} correct
          </p>
        </div>
      ) : (
        <div className="stack">
          <h2 className="label">{view.final ? "Final results" : "Results so far"}</h2>
          <Leaderboard standings={view.standings} me={playerId} />
          {!view.final && <p className="muted small">Waiting for everyone to finish…</p>}
        </div>
      )}

      {view.final &&
        (isHost ? (
          <div className="stack">
            <button className="btn btn-primary" onClick={() => client.startGame()}>
              Play again
            </button>
            <button className="btn" onClick={() => client.backToLobby()}>
              Change settings
            </button>
          </div>
        ) : (
          <p className="muted">Waiting for the host to start the next game.</p>
        ))}

      {review.length > 0 && (
        <section className="stack" aria-labelledby="review-title">
          <h2 className="label" id="review-title">
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
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Leaderboard({ standings, me = null }: { standings: QuizStanding[]; me?: string | null }) {
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
          <span className="rank">{s.rank}</span>
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
