import { useState, useEffect } from "react";
import type { QuizReviewItem } from "@whizard/game-core";
import { clearBankMistakes, saveBankMistakes } from "../../storage";
import { play } from "../../sounds";
import { Icon } from "../../ui/Icon";
import { Brand } from "../../ui/Chrome";

export interface MistakeMasteryProps {
  items: QuizReviewItem[];
  categoryName: string;
  bankId?: string | null;
  onDone: () => void;
  onExit: () => void;
}

export function MistakeMastery({
  items,
  categoryName,
  bankId,
  onDone,
  onExit,
}: MistakeMasteryProps) {
  // Ensure bank mistakes are recorded if a bank is attached
  useEffect(() => {
    if (bankId && items.length > 0) {
      saveBankMistakes(
        bankId,
        items.map((i) => i.questionId),
      );
    }
  }, [bankId, items]);

  const [queue, setQueue] = useState<QuizReviewItem[]>(() => items.map((item) => ({ ...item })));
  const [masteredCount, setMasteredCount] = useState(0);
  const totalItems = items.length;

  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const current = queue[0];
  const finished = !current || queue.length === 0;

  useEffect(() => {
    if (finished && totalItems > 0) {
      play("fanfare");
    }
  }, [finished, totalItems]);

  const handlePick = (index: number) => {
    if (answered || !current) return;
    setSelectedChoice(index);
    setAnswered(true);

    const isCorrect = index === current.correctChoice;
    if (isCorrect) {
      play("correct");
      setMasteredCount((c) => c + 1);
      if (bankId) {
        clearBankMistakes(bankId, [current.questionId]);
      }
    } else {
      play("wrong");
    }
  };

  const handleNext = () => {
    if (!current) return;
    const isCorrect = selectedChoice === current.correctChoice;
    setSelectedChoice(null);
    setAnswered(false);

    if (isCorrect) {
      // Remove successfully answered question from queue
      setQueue((q) => q.slice(1));
    } else {
      // Move missed question to the back of the queue for spaced reinforcement
      setQueue((q) => [...q.slice(1), current]);
    }
  };

  if (finished) {
    return (
      <div className="results mistake-mastery-finished">
        <header className="results-bar">
          <Brand />
          <button className="btn bar-pill" onClick={onDone}>
            <Icon name="arrowLeft" size={20} />
            <span>Results</span>
          </button>
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
            <h2 className="display results-title">Mastery Achieved! 🎉</h2>
            <span className="pill">
              <Icon name="trophy" size={18} />
              {categoryName} • {totalItems} {totalItems === 1 ? "Mistake" : "Mistakes"} Mastered
            </span>
          </div>

          <div className="panel solo-score">
            <p className="label">Mistake Drill Complete</p>
            <p className="big-score">100%</p>
            <p className="muted">
              You corrected every missed question and reinforced the right answers.
            </p>
          </div>

          <div className="results-actions">
            <button className="btn btn-primary" onClick={onDone}>
              <Icon name="check" size={20} />
              Back to Results
            </button>
          </div>
        </section>
      </div>
    );
  }

  const isCorrect = selectedChoice === current.correctChoice;
  const progressPercent = Math.min(100, Math.round((masteredCount / totalItems) * 100));

  return (
    <div className="game-screen mistake-mastery-screen">
      <header className="game-bar">
        <button className="btn bar-pill" onClick={onExit}>
          <Icon name="arrowLeft" size={18} />
          <span>Exit Drill</span>
        </button>
        <div className="mistake-mastery-status">
          <span className="mistake-progress-label">
            Mastered {masteredCount} of {totalItems}
          </span>
          <div className="mistake-progress-track">
            <div className="mistake-progress-bar" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <span className="pill small mistake-remaining-badge">
          {queue.length} {queue.length === 1 ? "left" : "left"}
        </span>
      </header>

      <main className="game-layout">
        <section className="game-main">
          <span className="pill">
            <Icon name="repeat" size={18} />
            Mistake Review · Question {masteredCount + 1}
          </span>

          <h1 className="prompt">{current.prompt}</h1>

          <div className="choices">
            {current.choices.map((choice, i) => {
              let stateClass = "";
              if (answered) {
                if (i === current.correctChoice) stateClass = " correct";
                else if (i === selectedChoice) stateClass = " wrong";
                else stateClass = " faded";
              }
              return (
                <button
                  key={i}
                  className={`choice${stateClass}`}
                  disabled={answered}
                  onClick={() => handlePick(i)}
                >
                  <span className="choice-label">{["A", "B", "C", "D"][i] || i + 1}.</span> {choice}
                </button>
              );
            })}
          </div>

          {answered && (
            <div className="mistake-feedback-card panel">
              <div className="feedback-head">
                <span className={`verdict ${isCorrect ? "good" : "bad"}`}>
                  {isCorrect ? "✓ Excellent Correction!" : "✗ Needs Review"}
                </span>
                {!isCorrect && (
                  <p className="feedback-hint">
                    Correct answer:{" "}
                    <strong>
                      {["A", "B", "C", "D"][current.correctChoice]}.{" "}
                      {current.choices[current.correctChoice]}
                    </strong>
                    . We’ll show this question again until it sticks!
                  </p>
                )}
              </div>

              {current.explanation && (
                <p className="explanation">
                  {current.explanation}
                  {current.reference && (
                    <>
                      {" "}
                      <span className="reference">({current.reference})</span>
                    </>
                  )}
                </p>
              )}

              <button className="btn btn-primary btn-next-mistake" onClick={handleNext}>
                {isCorrect ? "Continue" : "Got It · Next"}
                <Icon name="arrowRight" size={18} />
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
