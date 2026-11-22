import { useState, useEffect, useMemo, useCallback, type FormEvent } from "react";
import type { PlayerBankDetail, PlayerBankQuestion } from "@whizard/protocol";
import type { QuizReviewItem } from "@whizard/game-core";
import { saveBankMistakes } from "../../storage";
import { completeGroupAssignment } from "../../social";
import { play } from "../../sounds";
import { Icon } from "../../ui/Icon";
import { LogoMark } from "../../ui/Logo";
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

function Brand() {
  return (
    <a className="brand" translate="no" {...linkTo("/")} aria-label="Whizard home">
      <LogoMark />
      <span>Whizard</span>
    </a>
  );
}

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
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<"all" | "incorrect" | "correct" | "flagged">(
    "all",
  );
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
    const totalSec = timeLimitMinutes * 60;
    setSecondsLeft(totalSec);
    setTotalTimeSeconds(totalSec);
    setPhase("exam");
    play("go");
  };

  // Submit Exam
  const handleSubmitExam = useCallback(() => {
    setShowConfirmSubmit(false);
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
  }, [examQuestions, answers, bank.id, resolvedAssignment]);

  // Timer countdown
  useEffect(() => {
    if (phase !== "exam") return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setAutoSubmitted(true);
          handleSubmitExam();
          return 0;
        }
        if (prev === 61) {
          play("hurry");
        } else if (prev <= 6 && prev > 1) {
          play("tick");
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, examQuestions, answers, handleSubmitExam]);

  // Handle Pick Choice
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
    return (
      <div className="cbt-container">
        <header className="results-bar">
          <Brand />
          <button className="btn bar-pill" onClick={onExit}>
            <Icon name="arrowLeft" size={20} />
            <span>Back to Bank</span>
          </button>
        </header>

        <section className="cbt-setup-card">
          <div className="cbt-setup-header">
            <span className="pill pill-glow">
              <Icon name="clock" size={16} /> Timed CBT Simulation
            </span>
            <h1 className="display" style={{ margin: "12px 0 6px" }}>
              {bank.name}
            </h1>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {bank.exam && <span className="bank-badge">{bank.exam}</span>}
              {bank.subject && <span className="bank-badge">{bank.subject}</span>}
              <span className="bank-badge ready">{totalAvailable} questions in bank</span>
            </div>
            <p
              className="muted"
              style={{ maxWidth: 520, margin: "12px auto 0", fontSize: "0.95rem" }}
            >
              Experience real exam conditions: continuous countdown timer, randomized choices, and
              instant delayed scoring with comprehensive explanations after submission.
            </p>
          </div>

          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleStartExam();
            }}
            className="cbt-setup-form"
          >
            <div className="setting">
              <label htmlFor="cbt-q-count" className="setting-label">
                <span>Number of Questions</span>
                <span className="muted small">Max {totalAvailable}</span>
              </label>
              <div className="cbt-pill-selector">
                {[5, 10, 15, 20, 30, 40]
                  .filter((n) => n <= totalAvailable || (n === 5 && totalAvailable > 0))
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`cbt-select-pill${questionCount === n ? " selected" : ""}`}
                      onClick={() => {
                        setQuestionCount(Math.min(n, totalAvailable));
                        // Update recommended time
                        if (n <= 10) setTimeLimitMinutes(10);
                        else if (n <= 20) setTimeLimitMinutes(20);
                        else setTimeLimitMinutes(30);
                      }}
                    >
                      {n} Questions
                    </button>
                  ))}
                {totalAvailable > 0 && (
                  <button
                    type="button"
                    className={`cbt-select-pill${questionCount === totalAvailable ? " selected" : ""}`}
                    onClick={() => {
                      setQuestionCount(totalAvailable);
                      setTimeLimitMinutes(Math.max(10, Math.ceil(totalAvailable * 1.0)));
                    }}
                  >
                    All ({totalAvailable})
                  </button>
                )}
              </div>
            </div>

            <div className="setting">
              <label htmlFor="cbt-time-limit" className="setting-label">
                <span>Time Limit</span>
                <span className="muted small">Countdown clock</span>
              </label>
              <div className="cbt-pill-selector">
                {[5, 10, 15, 20, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`cbt-select-pill${timeLimitMinutes === mins ? " selected" : ""}`}
                    onClick={() => setTimeLimitMinutes(mins)}
                  >
                    {mins} mins
                  </button>
                ))}
              </div>
            </div>

            <div className="setting" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                id="cbt-shuffle"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: "#8b5cf6" }}
              />
              <label htmlFor="cbt-shuffle" style={{ cursor: "pointer", fontWeight: 600 }}>
                Shuffle question and choice order
              </label>
            </div>

            <div className="cbt-rules-callout">
              <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#facc15" }}>
                ⚡ Exam Mode Pressure Rules:
              </p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.9rem", color: "var(--muted)" }}>
                <li>Answers are locked without immediate feedback during the test.</li>
                <li>You can flag questions and navigate back and forth at any time.</li>
                <li>The exam will auto-submit if the timer expires.</li>
                <li>Detailed explanations and score breakdown are revealed after submission.</li>
              </ul>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-large btn-block"
              disabled={totalAvailable === 0}
            >
              <Icon name="play" size={22} fill />
              Start Exam Simulation ({questionCount} Questions · {timeLimitMinutes} Mins)
            </button>
          </form>
        </section>
      </div>
    );
  }

  // 2. RESULTS & IN-DEPTH REVIEW PHASE
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

    const filteredReviews = reviewItems.filter((item) => {
      if (reviewFilter === "incorrect") return !item.correct;
      if (reviewFilter === "correct") return item.correct;
      if (reviewFilter === "flagged") return flagged.has(item.index);
      return true;
    });

    const gradeLabel =
      percentage >= 80
        ? "Outstanding! Distinction 🌟"
        : percentage >= 60
          ? "Credit / Pass! 👍"
          : "Needs Improvement 📚";

    return (
      <div className="results cbt-results-screen">
        <header className="results-bar">
          <Brand />
          <span className="bar-end">
            <button className="btn bar-pill" onClick={onExit}>
              <Icon name="arrowLeft" size={20} />
              <span>Question Bank</span>
            </button>
          </span>
        </header>

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
              {autoSubmitted ? "Time’s Up! Exam Submitted" : "Exam Simulation Complete"}
            </h2>
            <span className="pill">
              <Icon name="trophy" size={18} />
              {bank.name} • {examQuestions.length} Questions
            </span>
          </div>

          {assignmentSubmitted && (
            <div
              className="bank-practice-card"
              style={{ margin: "14px 0", width: "100%", textAlign: "center" }}
            >
              <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#6ee7b7" }}>
                🎯 CBT Exam result recorded on your Study Group leaderboard!
              </p>
              <a
                className="btn btn-primary"
                {...linkTo(`/groups/${encodeURIComponent(assignmentSubmitted)}`)}
              >
                View Study Group
              </a>
            </div>
          )}

          <div className="panel solo-score cbt-score-card">
            <p className="label">Your CBT Score</p>
            <p className="big-score">
              {scoreCount}{" "}
              <span style={{ fontSize: "1.8rem", color: "var(--muted)" }}>
                / {examQuestions.length}
              </span>
            </p>
            <p
              style={{
                fontSize: "1.2rem",
                fontWeight: 700,
                margin: "4px 0",
                color: percentage >= 60 ? "#4ade80" : "#fb7185",
              }}
            >
              {percentage}% — {gradeLabel}
            </p>
            <p className="muted small" style={{ margin: "4px 0 12px" }}>
              Completed in {formatTime(timeUsedSeconds)} of {timeLimitMinutes}:00 limit
            </p>

            <div className="cbt-summary-pills">
              <span className="cbt-stat-pill good">
                <Icon name="check" size={16} /> {scoreCount} Correct
              </span>
              <span className="cbt-stat-pill bad">
                <Icon name="close" size={16} /> {examQuestions.length - scoreCount} Incorrect
              </span>
              <span className="cbt-stat-pill warn">
                <Icon name="flag" size={16} /> {flagged.size} Flagged
              </span>
              <span className="cbt-stat-pill muted">
                <Icon name="clock" size={16} /> {formatTime(timeUsedSeconds)} Used
              </span>
            </div>
          </div>

          <div className="results-actions">
            {missedReviewItems.length > 0 && (
              <button
                className="btn btn-primary btn-practice-mistakes"
                onClick={() => setDrillingMistakes(true)}
              >
                <Icon name="repeat" size={20} />
                Practice Missed Questions ({missedReviewItems.length})
              </button>
            )}
            <button className="btn" onClick={handleStartExam}>
              <Icon name="play" size={20} fill />
              Retake Exam Simulation
            </button>
            <button className="btn" onClick={onExit}>
              <Icon name="arrowLeft" size={20} />
              Back to Bank
            </button>
          </div>
        </section>

        {/* In-depth Review Section */}
        <section className="panel review-panel" style={{ marginTop: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              Question-by-Question Review & Explanations
            </h2>
            <div className="cbt-review-filter-tabs">
              <button
                type="button"
                className={`tab-btn${reviewFilter === "all" ? " active" : ""}`}
                onClick={() => setReviewFilter("all")}
              >
                All ({reviewItems.length})
              </button>
              <button
                type="button"
                className={`tab-btn${reviewFilter === "incorrect" ? " active" : ""}`}
                onClick={() => setReviewFilter("incorrect")}
              >
                Incorrect ({missedReviewItems.length})
              </button>
              <button
                type="button"
                className={`tab-btn${reviewFilter === "correct" ? " active" : ""}`}
                onClick={() => setReviewFilter("correct")}
              >
                Correct ({scoreCount})
              </button>
              {flagged.size > 0 && (
                <button
                  type="button"
                  className={`tab-btn${reviewFilter === "flagged" ? " active" : ""}`}
                  onClick={() => setReviewFilter("flagged")}
                >
                  Flagged ({flagged.size})
                </button>
              )}
            </div>
          </div>

          <ol className="cbt-review-list">
            {filteredReviews.map((item) => {
              const isFlagged = flagged.has(item.index);
              return (
                <li key={item.index} className={`cbt-review-card ${item.correct ? "good" : "bad"}`}>
                  <div className="cbt-review-card-header">
                    <span className="cbt-review-q-num">
                      Question {item.index + 1}
                      {isFlagged && <span className="flag-badge">🚩 Flagged</span>}
                    </span>
                    <span className={`cbt-review-status-pill ${item.correct ? "good" : "bad"}`}>
                      {item.correct
                        ? "✓ Correct (+1)"
                        : item.myChoice === null
                          ? "⚠️ Unanswered"
                          : "✗ Incorrect"}
                    </span>
                  </div>

                  <p className="cbt-review-prompt">{item.prompt}</p>

                  <div className="cbt-review-choices">
                    {item.choices.map((choiceText, cIdx) => {
                      const isCorrectChoice = cIdx === item.correctChoice;
                      const isMyChoice = cIdx === item.myChoice;
                      let toneClass = "faded";
                      if (isCorrectChoice) toneClass = "correct";
                      else if (isMyChoice) toneClass = "wrong";

                      return (
                        <div key={cIdx} className={`cbt-review-choice ${toneClass}`}>
                          <span className="choice-letter" aria-hidden="true">
                            {letter(cIdx)}
                          </span>
                          <span className="choice-text">{choiceText}</span>
                          {isCorrectChoice && (
                            <span className="indicator-badge correct">✓ Correct Answer</span>
                          )}
                          {isMyChoice && !isCorrectChoice && (
                            <span className="indicator-badge wrong">✗ Your Pick</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {item.explanation && (
                    <div className="cbt-review-explanation">
                      <p className="explanation-title">💡 Explanation:</p>
                      <p className="explanation-text">{item.explanation}</p>
                      {item.reference && (
                        <p className="explanation-ref">Source / Reference: {item.reference}</p>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 8 }}>
                    <ReportQuestion questionId={item.questionId} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    );
  }

  // 3. ACTIVE CBT EXAM PHASE
  const currentQ = examQuestions[currentIndex];
  if (!currentQ) return null;

  const currentAnswer = answers[currentIndex] ?? null;
  const isCurrentFlagged = flagged.has(currentIndex);

  const isLowTime = secondsLeft <= 180;
  const isCriticalTime = secondsLeft <= 60;

  return (
    <div className="cbt-exam-screen">
      {/* Top CBT Navigation Bar */}
      <header className="cbt-header">
        <div className="cbt-header-left">
          <span className="cbt-exam-title">{bank.name}</span>
          <span className="cbt-badge">CBT Mode</span>
        </div>

        <div className="cbt-header-center">
          <div
            className={`cbt-timer${isCriticalTime ? " critical" : isLowTime ? " low" : ""}`}
            role="timer"
            aria-label="Remaining exam time"
          >
            <Icon name="clock" size={18} />
            <span>{formatTime(secondsLeft)}</span>
          </div>
        </div>

        <div className="cbt-header-right">
          <button
            type="button"
            className="btn btn-warning-glow btn-small"
            onClick={() => setShowConfirmSubmit(true)}
          >
            Submit Exam
          </button>
        </div>
      </header>

      {/* Main Layout: Question Column + Jump Palette */}
      <div className="cbt-layout">
        <main className="cbt-main-panel">
          <div className="cbt-question-header">
            <span className="cbt-q-counter">
              Question <b>{currentIndex + 1}</b> of {examQuestions.length}
            </span>
            <button
              type="button"
              className={`cbt-flag-toggle${isCurrentFlagged ? " flagged" : ""}`}
              onClick={() => toggleFlag(currentIndex)}
              aria-label="Flag question for review"
            >
              <Icon name="flag" size={18} fill={isCurrentFlagged} />
              <span>{isCurrentFlagged ? "Flagged for review" : "Flag for review"}</span>
            </button>
          </div>

          <h2 className="cbt-prompt">{currentQ.prompt}</h2>

          <div className="choices cbt-choices">
            {currentQ.choices.map((choiceText, cIdx) => {
              const isSelected = currentAnswer === cIdx;
              return (
                <button
                  key={cIdx}
                  type="button"
                  className={`choice cbt-choice${isSelected ? " picked" : ""}`}
                  onClick={() => handleSelectChoice(cIdx)}
                >
                  <span className="choice-letter" aria-hidden="true">
                    {letter(cIdx)}
                  </span>
                  <span className="choice-text">{choiceText}</span>
                </button>
              );
            })}
          </div>

          {currentAnswer !== null && (
            <div style={{ textAlign: "center", margin: "10px 0" }}>
              <button
                type="button"
                className="btn-link small muted"
                onClick={() =>
                  setAnswers((prev) => ({
                    ...prev,
                    [currentIndex]: null,
                  }))
                }
              >
                Clear choice
              </button>
            </div>
          )}

          {/* Action Row */}
          <div className="cbt-nav-row">
            <button
              type="button"
              className="btn btn-nav"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
            >
              <Icon name="chevronLeft" size={20} /> Previous
            </button>

            <button
              type="button"
              className="btn btn-nav btn-primary"
              onClick={() => {
                if (currentIndex < examQuestions.length - 1) {
                  setCurrentIndex((idx) => idx + 1);
                } else {
                  setShowConfirmSubmit(true);
                }
              }}
            >
              {currentIndex < examQuestions.length - 1 ? (
                <>
                  Next <Icon name="chevronRight" size={20} />
                </>
              ) : (
                <>
                  Review & Submit <Icon name="check" size={20} />
                </>
              )}
            </button>
          </div>
        </main>

        {/* Question Jump Palette */}
        <aside className="cbt-palette-panel">
          <div className="cbt-palette-header">
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Questions</h3>
            <span className="muted small">
              {answeredCount}/{examQuestions.length} answered
            </span>
          </div>

          <div className="cbt-palette-grid">
            {examQuestions.map((_, idx) => {
              const isAns = answers[idx] !== null && answers[idx] !== undefined;
              const isFlg = flagged.has(idx);
              const isCur = idx === currentIndex;

              let statusClass = "";
              if (isCur) statusClass += " current";
              if (isAns) statusClass += " answered";
              if (isFlg) statusClass += " flagged";

              return (
                <button
                  key={idx}
                  type="button"
                  className={`cbt-palette-btn${statusClass}`}
                  onClick={() => setCurrentIndex(idx)}
                  title={`Question ${idx + 1}${isFlg ? " (Flagged)" : ""}${isAns ? " (Answered)" : ""}`}
                >
                  {idx + 1}
                  {isFlg && <span className="palette-flag-dot" />}
                </button>
              );
            })}
          </div>

          <div className="cbt-palette-legend">
            <div className="legend-item">
              <span className="legend-box answered" /> Answered ({answeredCount})
            </div>
            <div className="legend-item">
              <span className="legend-box unanswered" /> Unanswered ({unansweredCount})
            </div>
            <div className="legend-item">
              <span className="legend-box flagged" /> Flagged ({flagged.size})
            </div>
          </div>
        </aside>
      </div>

      {/* Confirmation Submit Dialog */}
      {showConfirmSubmit && (
        <div className="cbt-modal-backdrop" onClick={() => setShowConfirmSubmit(false)}>
          <div className="cbt-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="cbt-modal-title">Submit Exam Simulation?</h3>
            <p className="muted" style={{ margin: "8px 0 16px" }}>
              Are you sure you want to finish? You cannot change your answers after submission.
            </p>

            <div className="cbt-modal-stats">
              <div className="cbt-modal-stat-box">
                <span className="stat-num good">{answeredCount}</span>
                <span className="stat-label">Answered</span>
              </div>
              <div className="cbt-modal-stat-box">
                <span className={`stat-num ${unansweredCount > 0 ? "warn" : "muted"}`}>
                  {unansweredCount}
                </span>
                <span className="stat-label">Unanswered</span>
              </div>
              <div className="cbt-modal-stat-box">
                <span className="stat-num warn">{flagged.size}</span>
                <span className="stat-label">Flagged</span>
              </div>
            </div>

            {unansweredCount > 0 && (
              <p className="cbt-modal-warning">
                ⚠️ You have {unansweredCount} unanswered questions remaining.
              </p>
            )}

            <div className="cbt-modal-actions">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => handleSubmitExam()}
              >
                Yes, Submit Exam
              </button>
              <button
                type="button"
                className="btn btn-block"
                onClick={() => setShowConfirmSubmit(false)}
              >
                Return to Exam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
