import {
  QUIZ_CATEGORIES,
  type EliminationStage,
  type EliminationView,
  type QuizReviewItem,
} from "@whizard/game-core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TOPIC_STYLES } from "../../catalog";
import type { RoomClient, RoomSnapshot } from "../../roomClient";
import { play } from "../../sounds";
import { GeneratingArt } from "../../ui/GeneratingArt";
import { useServerNow } from "../../useServerNow";
import {
  Bar,
  Board,
  Cut,
  Done as SharedDone,
  FinalIntro,
  TimerPill,
  Watching,
  type EliminationContext,
} from "../elimination/parts";
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

interface Context extends Props, Omit<EliminationContext, "view"> {
  categoryId: string | null;
  categoryName: string;
}

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
    title: `${categoryName} Quiz`,
    noun: "Question",
    art:
      TOPIC_STYLES[settings?.category as keyof typeof TOPIC_STYLES]?.art ?? "/art/games/quiz.webp",
    colors: TOPIC_STYLES[settings?.category as keyof typeof TOPIC_STYLES]?.colors ?? [
      "#ff8c1a",
      "#4a1530",
    ],
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
  const timer = <TimerPill remaining={remaining} limitMs={view.timeLimitMs} />;

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

function Done({ context, stage }: { context: Context; stage: Stage<"done"> }) {
  return (
    <SharedDone context={context} stage={stage}>
      {stage.review.length > 0 && <Review review={stage.review} />}
    </SharedDone>
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
