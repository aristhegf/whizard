import { useState, useEffect, useRef, useMemo, type FormEvent } from "react";
import type { PlayerBankDetail, PlayerBankQuestion } from "@whizard/protocol";
import type { QuizReviewItem } from "@whizard/game-core";
import { HorizontalAlert } from "@/components/styled-alert";
import { saveBankMistakes } from "../../storage";
import { completeGroupAssignment } from "../../social";
import { play } from "../../sounds";
import { BottomSheet } from "../../ui/BottomSheet";
import { TopLayout } from "../../ui/Chrome";
import { Icon } from "../../ui/Icon";
import { Answer, BackButton, dotted, plural } from "../../ui/Study";
import { linkTo } from "../../router";
import { MistakeMastery } from "./MistakeMastery";
import { ReportQuestion } from "./ReportQuestion";

export interface CbtQuestion {
  id: string;
  originalIndex: number;
  prompt: string;
  choices: string[];
  correctChoiceIndex: number;
  explanation: string;
  reference: string | null;
}

export function prepareCbtQuestions(
  rawQuestions: PlayerBankQuestion[],
  count: number,
  randomizeOrder: boolean,
): CbtQuestion[] {
  const pool = rawQuestions.map((q, idx) => ({ q, originalIndex: idx }));
  if (randomizeOrder) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = temp;
    }
  }
  const selected = pool.slice(0, Math.min(count, pool.length));
  return selected.map(({ q, originalIndex }) => {
    const originalCorrect = q.choices[0] ?? "";
    const shuffledChoices = [...q.choices];
    for (let i = shuffledChoices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffledChoices[i]!;
      shuffledChoices[i] = shuffledChoices[j]!;
      shuffledChoices[j] = temp;
    }
    const correctIndex = shuffledChoices.indexOf(originalCorrect);
    return {
      id: q.id,
      originalIndex,
      prompt: q.prompt,
      choices: shuffledChoices,
      correctChoiceIndex: correctIndex >= 0 ? correctIndex : 0,
      explanation: q.explanation,
      reference: q.reference ?? null,
    };
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const letter = (i: number) => String.fromCharCode(65 + i);

const COUNT_PRESETS = [5, 10, 15, 20, 30, 40];
const TIME_PRESETS = [5, 10, 15, 20, 30, 45, 60];

export interface CbtExamScreenProps {
  bank: PlayerBankDetail;
  onExit: () => void;
  assignmentContext?: {
    groupId: string;
    assignmentId: string;
  } | null;
}

export function CbtExamScreen({ bank, onExit, assignmentContext }: CbtExamScreenProps) {
  const totalAvailable = bank.questions.length;

  // Setup options
  const [phase, setPhase] = useState<"setup" | "exam" | "results">("setup");
  const [questionCount, setQuestionCount] = useState<number>(() =>
    Math.min(20, Math.max(5, totalAvailable)),
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(() => {
    const initialQ = Math.min(20, Math.max(5, totalAvailable));
    return initialQ >= 30 ? 30 : initialQ >= 20 ? 20 : initialQ >= 15 ? 15 : 10;
  });
  const [shuffleQuestions, setShuffleQuestions] = useState(true);

  // Active exam state
  const [examQuestions, setExamQuestions] = useState<CbtQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalTimeSeconds, setTotalTimeSeconds] = useState(0);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<"missed" | "all" | "flagged">("missed");
  const [drillingMistakes, setDrillingMistakes] = useState(false);
  const [assignmentSubmitted, setAssignmentSubmitted] = useState<string | null>(null);

  // Group assignment context resolution
  const resolvedAssignment = useMemo(() => {
    if (assignmentContext) return assignmentContext;
    try {
      if (typeof window !== "undefined") {
        const query = new URLSearchParams(window.location.search);
        const qGroup = query.get("group");
        const qAssign = query.get("assignment");
        if (qGroup && qAssign) return { groupId: qGroup, assignmentId: qAssign };

        const stored = sessionStorage.getItem("whizard_active_assignment");
        if (stored) {
          const parsed = JSON.parse(stored) as { groupId: string; assignmentId: string };
          if (parsed.groupId && parsed.assignmentId) return parsed;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, [assignmentContext]);

  // Start Exam
  const handleStartExam = () => {
    if (totalAvailable === 0) return;
    const questions = prepareCbtQuestions(bank.questions, questionCount, shuffleQuestions);
    setExamQuestions(questions);
    setCurrentIndex(0);
    setAnswers({});
    setFlagged(new Set());
    setAutoSubmitted(false);
    setReviewFilter("missed");
    const totalSec = timeLimitMinutes * 60;
    setSecondsLeft(totalSec);
    setTotalTimeSeconds(totalSec);
    setPhase("exam");
    play("go");
  };

  // Timer countdown. The latest submit lives in a ref, so the interval runs once
  // per exam and still submits the answers given right up to the last second.
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (phase !== "exam") return;
    let left = totalTimeSeconds;
    const interval = setInterval(() => {
      left -= 1;
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) {
        clearInterval(interval);
        setAutoSubmitted(true);
        submitRef.current();
      } else if (left === 60) {
        play("hurry");
      } else if (left <= 5) {
        play("tick");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, totalTimeSeconds]);

  // Handle Pick Choice: picking the chosen answer again clears it.
  const handleSelectChoice = (choiceIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [currentIndex]: prev[currentIndex] === choiceIndex ? null : choiceIndex,
    }));
  };

  // Toggle Flag
  const toggleFlag = (index: number) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Submit Exam
  const handleSubmitExam = () => {
    // Once only: the clock and the Submit button can both get here.
    if (phase !== "exam") return;
    setShowConfirmSubmit(false);
    setMapOpen(false);
    setPhase("results");
    play("fanfare");

    // Calculate mistakes and save
    const missedItems: string[] = [];
    let score = 0;
    examQuestions.forEach((q, idx) => {
      const selected = answers[idx];
      if (selected === q.correctChoiceIndex) {
        score++;
      } else {
        missedItems.push(q.id);
      }
    });

    if (missedItems.length > 0) {
      saveBankMistakes(bank.id, missedItems);
    }
    if (missedItems.length === 0) setReviewFilter("all");

    // Auto submit to study group assignment if attached
    if (resolvedAssignment) {
      void completeGroupAssignment(
        resolvedAssignment.groupId,
        resolvedAssignment.assignmentId,
        score,
        examQuestions.length,
      );
      try {
        sessionStorage.removeItem("whizard_active_assignment");
      } catch {
        // ignore
      }
      setAssignmentSubmitted(resolvedAssignment.groupId);
    }
  };

  useEffect(() => {
    submitRef.current = handleSubmitExam;
  });

  // Calculated Results
  const answeredCount = useMemo(() => {
    return Object.values(answers).filter((val) => val !== null && val !== undefined).length;
  }, [answers]);

  const unansweredCount = examQuestions.length - answeredCount;

  const scoreCount = useMemo(() => {
    let score = 0;
    examQuestions.forEach((q, idx) => {
      if (answers[idx] === q.correctChoiceIndex) score++;
    });
    return score;
  }, [examQuestions, answers]);

  const percentage =
    examQuestions.length > 0 ? Math.round((scoreCount / examQuestions.length) * 100) : 0;
  const timeUsedSeconds = Math.max(0, totalTimeSeconds - secondsLeft);

  const reviewItems: QuizReviewItem[] = useMemo(() => {
    return examQuestions.map((q, idx) => {
      const myChoice = answers[idx] ?? null;
      const correct = myChoice === q.correctChoiceIndex;
      return {
        index: idx,
        questionId: q.id,
        prompt: q.prompt,
        choices: q.choices,
        correctChoiceIndex: q.correctChoiceIndex,
        correctChoice: q.correctChoiceIndex,
        myChoice,
        correct,
        points: correct ? 100 : 0,
        explanation: q.explanation || null,
        reference: q.reference || null,
      };
    });
  }, [examQuestions, answers]);

  const missedReviewItems = useMemo(
    () => reviewItems.filter((item) => !item.correct),
    [reviewItems],
  );

  // 1. SETUP PHASE
  if (phase === "setup") {
    const counts = COUNT_PRESETS.filter((n) => n < totalAvailable);
    return (
      <TopLayout active={null} className="study-page" column>
        <div className="study">
          <div className="study-top">
            <BackButton onClick={onExit}>{bank.name}</BackButton>
          </div>
          <div>
            <h1 className="study-title">Timed exam</h1>
            <p className="study-meta">
              {dotted(bank.exam, bank.subject, plural(totalAvailable, "question"))}
            </p>
          </div>

          <form
            className="s-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleStartExam();
            }}
          >
            <fieldset className="s-field">
              <legend className="s-label">Questions</legend>
              <div className="s-chips">
                {counts.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="s-chip"
                    aria-pressed={questionCount === n}
                    onClick={() => {
                      setQuestionCount(n);
                      // The time that suits that many questions.
                      if (n <= 10) setTimeLimitMinutes(10);
                      else if (n <= 20) setTimeLimitMinutes(20);
                      else setTimeLimitMinutes(30);
                    }}
                  >
                    {n}
                  </button>
                ))}
                {totalAvailable > 0 && (
                  <button
                    type="button"
                    className="s-chip"
                    aria-pressed={Math.min(questionCount, totalAvailable) === totalAvailable}
                    onClick={() => {
                      setQuestionCount(totalAvailable);
                      setTimeLimitMinutes(Math.max(10, Math.ceil(totalAvailable * 1.0)));
                    }}
                  >
                    All {totalAvailable}
                  </button>
                )}
              </div>
            </fieldset>

            <fieldset className="s-field">
              <legend className="s-label">Time</legend>
              <div className="s-chips">
                {TIME_PRESETS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className="s-chip"
                    aria-pressed={timeLimitMinutes === mins}
                    onClick={() => setTimeLimitMinutes(mins)}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="s-check">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
              />
              Shuffle questions and answers
            </label>

            <p className="study-note">
              Answers stay hidden until you submit. When time runs out, it submits itself.
            </p>

            <button type="submit" className="s-btn gold big block" disabled={totalAvailable === 0}>
              <Icon name="play" size={20} fill />
              Start · {plural(Math.min(questionCount, totalAvailable), "question")},{" "}
              {timeLimitMinutes} min
            </button>
          </form>
        </div>
      </TopLayout>
    );
  }

  // 2. RESULTS & REVIEW PHASE
  if (phase === "results") {
    if (drillingMistakes && missedReviewItems.length > 0) {
      return (
        <MistakeMastery
          items={missedReviewItems}
          categoryName={bank.name}
          bankId={bank.id}
          onDone={() => setDrillingMistakes(false)}
          onExit={() => setDrillingMistakes(false)}
        />
      );
    }

    const wrongCount = missedReviewItems.filter((item) => item.myChoice !== null).length;
    const skippedCount = missedReviewItems.length - wrongCount;
    const shown = reviewItems.filter((item) =>
      reviewFilter === "missed"
        ? !item.correct
        : reviewFilter === "flagged"
          ? flagged.has(item.index)
          : true,
    );
    const filters = [
      { id: "missed", label: "Missed", count: missedReviewItems.length },
      { id: "all", label: "All", count: reviewItems.length },
      { id: "flagged", label: "Flagged", count: flagged.size },
    ] as const;

    return (
      <TopLayout active={null} className="study-page" column>
        <div className="study">
          <div className="study-top">
            <BackButton onClick={onExit}>{bank.name}</BackButton>
          </div>

          <div>
            <h1 className="study-kicker">
              {autoSubmitted
                ? "Timed exam · time ran out"
                : `Timed exam · done in ${formatTime(timeUsedSeconds)}`}
            </h1>
            <p className="s-score">
              <span className="s-score-pct">{percentage}%</span>
              <span className="s-score-of">
                {scoreCount} of {examQuestions.length}
              </span>
            </p>
          </div>

          <dl className="s-stats">
            <div className="s-stat right">
              <dt>Right</dt>
              <dd>{scoreCount}</dd>
            </div>
            <div className="s-stat wrong">
              <dt>Wrong</dt>
              <dd>{wrongCount}</dd>
            </div>
            <div className="s-stat">
              <dt>Skipped</dt>
              <dd>{skippedCount}</dd>
            </div>
          </dl>

          {missedReviewItems.length > 0 ? (
            <button
              type="button"
              className="s-btn gold big block"
              onClick={() => setDrillingMistakes(true)}
            >
              Practise the {missedReviewItems.length} you missed
            </button>
          ) : (
            <button type="button" className="s-btn gold big block" onClick={handleStartExam}>
              <Icon name="repeat" size={20} />
              Take it again
            </button>
          )}

          <div className="s-actions">
            {missedReviewItems.length > 0 && (
              <button type="button" className="s-link" onClick={handleStartExam}>
                <Icon name="repeat" size={18} />
                Take it again
              </button>
            )}
            {assignmentSubmitted && (
              <a
                className="s-link"
                {...linkTo(`/groups/${encodeURIComponent(assignmentSubmitted)}`)}
              >
                <Icon name="users" size={18} />
                Saved to your study group
              </a>
            )}
          </div>

          <div className="study-section-head">
            {/* The chips below say which answers show; the heading names them for a screen reader. */}
            <h2 className="sr-only" id="review-title">
              {reviewFilter === "missed"
                ? "Missed"
                : reviewFilter === "flagged"
                  ? "Flagged"
                  : "All answers"}
            </h2>
          </div>
          <div className="s-chips" role="group" aria-label="Show">
            {filters
              .filter((f) => f.id !== "flagged" || f.count > 0)
              .map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="s-chip"
                  aria-pressed={reviewFilter === f.id}
                  onClick={() => setReviewFilter(f.id)}
                >
                  {f.label} {f.count}
                </button>
              ))}
          </div>

          {shown.length === 0 ? (
            <p className="s-empty">Nothing here.</p>
          ) : (
            <ol className="s-list" aria-labelledby="review-title">
              {shown.map((item) => (
                <li key={item.index} className="s-card exam-review-item">
                  <p className="s-q-text" style={{ margin: 0 }}>
                    <span className="s-q-num">{item.index + 1}</span> {item.prompt}
                  </p>
                  {item.correct ? (
                    <Answer kind="right">{item.choices[item.correctChoice]}</Answer>
                  ) : (
                    <>
                      {item.myChoice === null ? (
                        <Answer kind="skipped">Skipped</Answer>
                      ) : (
                        <Answer kind="wrong">{item.choices[item.myChoice]}</Answer>
                      )}
                      <Answer kind="right">{item.choices[item.correctChoice]}</Answer>
                    </>
                  )}
                  {item.explanation && (
                    <p className="s-card-why">
                      {item.explanation}
                      {item.reference && ` (${item.reference})`}
                    </p>
                  )}
                  <ReportQuestion questionId={item.questionId} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </TopLayout>
    );
  }

  // 3. THE EXAM ITSELF
  const currentQ = examQuestions[currentIndex];
  if (!currentQ) return null;

  const currentAnswer = answers[currentIndex] ?? null;
  const isCurrentFlagged = flagged.has(currentIndex);
  const isLast = currentIndex === examQuestions.length - 1;
  const summary = `${answeredCount} answered · ${flagged.size} flagged`;

  const stateOf = (idx: number) => {
    const done = answers[idx] !== null && answers[idx] !== undefined;
    return { done, flag: flagged.has(idx), cur: idx === currentIndex };
  };

  const map = (onPick: (idx: number) => void) => (
    <div className="exam-map">
      {examQuestions.map((_, idx) => {
        const s = stateOf(idx);
        return (
          <button
            key={idx}
            type="button"
            className={`exam-num${s.done ? " is-done" : ""}${s.flag ? " is-flag" : ""}${s.cur ? " is-cur" : ""}`}
            aria-label={[
              `Question ${idx + 1}`,
              s.done ? "answered" : "not answered",
              s.flag ? "flagged" : "",
            ]
              .filter(Boolean)
              .join(", ")}
            aria-current={s.cur ? "step" : undefined}
            onClick={() => onPick(idx)}
          >
            {idx + 1}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="exam">
      <header className="exam-top">
        <span className="exam-bank">{bank.name}</span>
        <p
          className={`exam-timer${secondsLeft <= 60 ? " critical" : secondsLeft <= 180 ? " low" : ""}`}
          role="timer"
          aria-label="Time left"
        >
          {formatTime(secondsLeft)}
        </p>
        <button type="button" className="s-btn gold" onClick={() => setShowConfirmSubmit(true)}>
          Submit
        </button>
      </header>

      <div className="exam-body">
        <main className="exam-main">
          <button
            type="button"
            className="exam-strip"
            aria-haspopup="dialog"
            onClick={() => setMapOpen(true)}
          >
            <span className="exam-strip-row">
              <span>{summary}</span>
              <span>
                All questions <Icon name="grid" size={16} />
              </span>
            </span>
            <span className="exam-bars" aria-hidden="true">
              {examQuestions.map((_, idx) => {
                const s = stateOf(idx);
                return (
                  <span
                    key={idx}
                    className={
                      s.cur ? "is-cur" : s.flag ? "is-flag" : s.done ? "is-done" : undefined
                    }
                  />
                );
              })}
            </span>
          </button>

          <p className="exam-count">
            Question {currentIndex + 1} of {examQuestions.length}
          </p>
          <h1 className="exam-prompt">{currentQ.prompt}</h1>

          <div className="exam-choices" role="group" aria-label="Answers">
            {currentQ.choices.map((choiceText, cIdx) => (
              <button
                key={cIdx}
                type="button"
                className="exam-choice"
                aria-pressed={currentAnswer === cIdx}
                onClick={() => handleSelectChoice(cIdx)}
              >
                <span className="letter" aria-hidden="true">
                  {letter(cIdx)}
                </span>
                <span>{choiceText}</span>
              </button>
            ))}
          </div>

          <div className="exam-nav">
            <button
              type="button"
              className="s-btn"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
            >
              <Icon name="chevronLeft" size={18} stroke={2.2} />
              Back
            </button>
            <button
              type="button"
              className="s-btn"
              aria-pressed={isCurrentFlagged}
              onClick={() => toggleFlag(currentIndex)}
            >
              <Icon name="flag" size={18} fill={isCurrentFlagged} />
              {isCurrentFlagged ? "Flagged" : "Flag"}
            </button>
            <span className="grow" />
            <button
              type="button"
              className="s-btn accent"
              onClick={() => {
                if (isLast) setShowConfirmSubmit(true);
                else setCurrentIndex((idx) => idx + 1);
              }}
            >
              {isLast ? "Finish" : "Next"}
              <Icon name="chevronRight" size={18} stroke={2.2} />
            </button>
          </div>
        </main>

        <aside className="exam-rail" aria-label="All questions">
          <p className="exam-map-summary">{summary}</p>
          {map(setCurrentIndex)}
        </aside>
      </div>

      {mapOpen && (
        <BottomSheet
          labelledBy="exam-map-title"
          className="s-sheet exam-sheet"
          onClose={() => setMapOpen(false)}
          header={() => (
            <h2 id="exam-map-title" className="s-sheet-title">
              {summary}
            </h2>
          )}
        >
          {(close) =>
            map((idx) => {
              setCurrentIndex(idx);
              close();
            })
          }
        </BottomSheet>
      )}

      <HorizontalAlert
        open={showConfirmSubmit}
        onOpenChange={setShowConfirmSubmit}
        tone="gold"
        title="Submit your exam?"
        description={
          unansweredCount > 0
            ? `${plural(unansweredCount, "question")} still unanswered. You can’t change answers after this.`
            : "You can’t change answers after this."
        }
        confirmLabel="Submit"
        cancelLabel="Keep going"
        onConfirm={handleSubmitExam}
      />
    </div>
  );
}
