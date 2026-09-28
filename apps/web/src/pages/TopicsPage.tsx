import { TiltCard } from "@/components/motion/tilt-card";
import type { QuizCategory } from "@whizard/game-core";
import { useState, type CSSProperties } from "react";
import { useAccount } from "../account";
import { fetchQuizCategories, type QuizCategoryInfo } from "../api";
import { TOPIC_STYLES, cardWash } from "../catalog";
import { linkTo } from "../router";
import { Avatar } from "../ui/Avatar";
import { SideLayout, startRoom } from "../ui/Chrome";
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
  const account = useAccount();
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
    } catch {
      setError("Couldn’t create a room. Check your connection and try again.");
      setStarting(null);
    }
  };

  const user = account.status === "ready" ? account.user : null;

  return (
    <SideLayout active="topics" className="topics-page">
      <header className="side-head">
        <div>
          <h1 className="page-title">
            Browse Quiz <span className="gradient-text">Topics</span>
          </h1>
          <p className="page-sub">Pick a topic and start a game with your friends!</p>
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
          {user && (
            <a className="icon-btn" {...linkTo("/friends")} aria-label="Friend requests">
              <Icon name="bell" size={26} />
            </a>
          )}
          {user ? (
            <a className="me-link" {...linkTo("/account")} aria-label="Your profile">
              <Avatar id={user.avatar} name={user.username} size={56} />
            </a>
          ) : (
            <a className="btn signin-btn" {...linkTo("/account")}>
              Sign In
            </a>
          )}
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
    </SideLayout>
  );
}
