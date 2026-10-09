import type { QuizSettings } from "@whizard/game-core";
import { useEffect, useRef } from "react";
import { artSrc, useTopics } from "../../topics";
import { isPickerSoon } from "../../topicTiles";

type Category = QuizSettings["category"];

/**
 * The quiz's topics as a grid of choices, for the lobby's topic chooser and for choosing a game.
 * It maps the live catalogue — new topics appear on their own — and topics with no questions yet
 * show as coming soon and can't be picked. `onPick` gets the topic tapped, even when it's the one
 * already chosen.
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
  const { topics, loading } = useTopics("public");

  return (
    <div className="topic-options" role="radiogroup" aria-labelledby={labelledBy}>
      {topics.map((row) => {
        const soon = isPickerSoon(row, value, loading);
        return (
          <button
            key={row.id}
            type="button"
            role="radio"
            aria-checked={row.id === value}
            className="topic-option"
            disabled={soon}
            onClick={() => onPick(row.id)}
          >
            <img src={artSrc(row)} alt="" loading="lazy" />
            <span>{row.name}</span>
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
