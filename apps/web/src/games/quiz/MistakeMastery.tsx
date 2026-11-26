import { useState, useEffect } from "react";
import type { QuizReviewItem } from "@whizard/game-core";
import { clearBankMistakes, saveBankMistakes } from "../../storage";
import { play } from "../../sounds";
import { Icon } from "../../ui/Icon";
import { BackButton } from "../../ui/Study";

export interface MistakeMasteryProps {
  items: QuizReviewItem[];
  categoryName: string;
  bankId?: string | null;
  onDone: () => void;
  onExit: () => void;
}

const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * Practising the questions you missed, in the exam's night look: each one comes back until you
 * get it right, and a right answer clears it from the bank's mistakes.
 */
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
      <div className="exam">
        <header className="exam-top">
          <BackButton onClick={onDone}>Results</BackButton>
        </header>
        <div className="exam-body">
          <main className="exam-main drill-done">
            <p className="exam-count">{categoryName}</p>
            <h1 className="exam-prompt">
              All {totalItems} {totalItems === 1 ? "mistake" : "mistakes"} fixed
            </h1>
            <p className="study-note">You got every one you missed right.</p>
            <button type="button" className="s-btn gold big" onClick={onDone}>
              Back to results
            </button>
          </main>
        </div>
      </div>
    );
  }

  const isCorrect = selectedChoice === current.correctChoice;
  const progressPercent = Math.min(100, Math.round((masteredCount / totalItems) * 100));

  return (
    <div className="exam">
      <header className="exam-top">
        <BackButton onClick={onExit}>Done</BackButton>
        <div
          className="drill-progress"
          role="progressbar"
          aria-label="Mistakes fixed"
          aria-valuemin={0}
          aria-valuemax={totalItems}
          aria-valuenow={masteredCount}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="exam-bank" style={{ textAlign: "right" }}>
          {queue.length} left
        </span>
      </header>

      <div className="exam-body">
        <main className="exam-main">
          <p className="exam-count">Missed question · {categoryName}</p>
          <h1 className="exam-prompt">{current.prompt}</h1>

          <div className="exam-choices" role="group" aria-label="Answers">
            {current.choices.map((choice, i) => {
              let state = "";
              if (answered) {
                if (i === current.correctChoice) state = " right";
                else if (i === selectedChoice) state = " wrong";
                else state = " faded";
              }
              return (
                <button
                  key={i}
                  type="button"
                  className={`exam-choice${state}`}
                  disabled={answered}
                  onClick={() => handlePick(i)}
                >
                  <span className="letter" aria-hidden="true">
                    {letter(i)}
                  </span>
                  <span>{choice}</span>
                </button>
              );
            })}
          </div>

          <div aria-live="polite">
            {answered && (
              <div className="s-card">
                <p className={`drill-verdict ${isCorrect ? "right" : "wrong"}`}>
                  {isCorrect
                    ? "Right"
                    : `Not quite. It’s ${letter(current.correctChoice)}, ${current.choices[current.correctChoice]}. It comes back later.`}
                </p>
                {current.explanation && (
                  <p className="s-card-why">
                    {current.explanation}
                    {current.reference && ` (${current.reference})`}
                  </p>
                )}
              </div>
            )}
          </div>

          {answered && (
            <div className="exam-nav">
              <span className="grow" />
              <button type="button" className="s-btn accent" onClick={handleNext}>
                {isCorrect ? "Next" : "Got it"}
                <Icon name="chevronRight" size={18} stroke={2.2} />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
