import { QUIZ_CATEGORIES, type QuizSettings } from "@whizard/game-core";
import { useEffect, useRef, useState } from "react";
import { fetchQuizCategories, type QuizCategoryInfo } from "../../api";
import { TOPIC_STYLES } from "../../catalog";

type Category = QuizSettings["category"];

/**
 * The quiz's topics as a grid of choices, for the lobby's topic chooser and for choosing a game.
 * Topics with no questions yet show as coming soon and can't be picked. `onPick` gets the topic
 * tapped, even when it's the one already chosen.
 */
export function TopicOptions({
  value,
  labelledBy,
  onPick,
}: {
  value: Category;
  labelledBy: string;
  onPick: (category: Category) => void;
}) {
  const [available, setAvailable] = useState<QuizCategoryInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchQuizCategories()
      .then((result) => !cancelled && setAvailable(result))
      .catch(() => !cancelled && setAvailable([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const empty = (id: Category) => {
    if (!available) return false;
    const info = available.find((i) => i.id === id);
    return !info || info.questions.easy + info.questions.medium + info.questions.hard === 0;
  };

  return (
    <div className="topic-options" role="radiogroup" aria-labelledby={labelledBy}>
      {QUIZ_CATEGORIES.map((c) => {
        const soon = empty(c.id) && c.id !== value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={c.id === value}
            className="topic-option"
            disabled={soon}
            onClick={() => onPick(c.id)}
          >
            <img src={TOPIC_STYLES[c.id].art} alt="" loading="lazy" />
            <span>{c.name}</span>
            {soon && <span className="dim small">Soon</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The lobby's topic chooser, opened from the pencil on the Quiz card. */
export function TopicPicker({
  value,
  onPick,
  onClose,
}: {
  value: Category;
  onPick: (category: Category) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="app-dialog topic-picker"
      aria-labelledby="topic-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the dimmed backdrop closes it.
        if (event.target === dialog.current) onClose();
      }}
    >
      <h2 id="topic-picker-title" className="section-title">
        Choose a topic
      </h2>
      <TopicOptions
        value={value}
        labelledBy="topic-picker-title"
        onPick={(category) => {
          if (category !== value) onPick(category);
          onClose();
        }}
      />
      <div className="dialog-actions">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
