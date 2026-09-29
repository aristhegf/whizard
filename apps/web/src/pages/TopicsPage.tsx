import { TiltCard } from "@/components/motion/tilt-card";
import type { QuizCategory } from "@whizard/game-core";
import { useState, type CSSProperties } from "react";
import { fetchQuizCategories, type QuizCategoryInfo } from "../api";
import { TOPIC_STYLES, cardWash } from "../catalog";
import { createFailed, TopLayout, startRoom } from "../ui/Chrome";
import { HeadingHint } from "../ui/HeadingHint";
import { Icon } from "../ui/Icon";
import { useLoaded } from "../ui/common";

/** Shown first: the topics most people start with. */
const POPULAR: QuizCategory[] = [
  "bible",
  "general-knowledge",
  "history",
  "geography",
  "science",
  "nigerian-culture",
  "football",
  "movies",
  "music",
  "pop-culture",
  "animals",
];

const questionTotal = (c: QuizCategoryInfo) =>
  c.questions.easy + c.questions.medium + c.questions.hard;

export function TopicsPage() {
  const categories = useLoaded(fetchQuizCategories);
  const [filter, setFilter] = useState<QuizCategory | "popular">("popular");
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState<QuizCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byId = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const needle = query.trim().toLowerCase();
  const topics = POPULAR.filter((id) => byId.has(id))
    .map((id) => byId.get(id)!)
    .filter((c) => filter === "popular" || c.id === filter)
    .filter((c) => !needle || c.name.toLowerCase().includes(needle));

  const start = async (category: QuizCategory) => {
    setStarting(category);
    setError(null);
    try {
      await startRoom({ category });
    } catch (e) {
      setError(createFailed(e));
      setStarting(null);
    }
  };

  return (
    <TopLayout active="topics" className="topics-page" column>
      <header className="side-head">
        <div className="hint-row">
          <h1 className="page-title">Browse Quiz Topics</h1>
          <HeadingHint id="topics" label="About quiz topics">
            Pick a topic and start a game with your friends!
          </HeadingHint>
        </div>
        <div className="head-actions">
          <label className="search">
            <Icon name="search" />
            <span className="sr-only">Search topics</span>
            <input
              type="search"
              name="search"
              placeholder="Search topics…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </header>

      <div className="chips" role="group" aria-label="Topics">
        <button
          className="chip"
          aria-pressed={filter === "popular"}
          onClick={() => setFilter("popular")}
        >
          Popular
        </button>
        {POPULAR.filter((id) => byId.has(id)).map((id) => (
          <button
            key={id}
            className="chip"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {TOPIC_STYLES[id].chip}
          </button>
        ))}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {categories.error && <p className="error">{categories.error}</p>}

      <div className="topics-wrap">
        <ul className="topic-grid">
          {topics.map((c) => {
            const style = TOPIC_STYLES[c.id];
            return (
              <li key={c.id}>
                <TiltCard className="tilt tilt-topic" max={10}>
                  <button
                    className="topic-tile"
                    style={{ "--wash": cardWash(style.colors) } as CSSProperties}
                    disabled={starting !== null}
                    onClick={() => void start(c.id)}
                  >
                    <span className="topic-art">
                      <img src={style.art} alt="" loading="lazy" />
                    </span>
                    <span className="topic-foot">
                      <span className="topic-name">{starting === c.id ? "Starting…" : c.name}</span>
                      <span className="topic-count">{questionTotal(c)} questions</span>
                    </span>
                  </button>
                </TiltCard>
              </li>
            );
          })}
        </ul>
      </div>
    </TopLayout>
  );
}
