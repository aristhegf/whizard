import { TiltCard } from "@/components/motion/tilt-card";
import { useState, type CSSProperties } from "react";
import { cardWash } from "../catalog";
import { artSrc, useTopics } from "../topics";
import { createFailed, TopLayout, startRoom } from "../ui/Chrome";
import { HeadingHint } from "../ui/HeadingHint";
import { Icon } from "../ui/Icon";
import { browseRows, isComingSoon } from "../topicTiles";

export function TopicsPage() {
  const { topics: rows, loading, error: loadError } = useTopics("public");
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topics = browseRows(rows, query);

  const start = async (category: string) => {
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

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loadError && <p className="error">{loadError}</p>}

      <div className="topics-wrap">
        <ul className="topic-grid">
          {topics.map((row) => {
            const soon = isComingSoon(row, loading);
            return (
              <li key={row.id}>
                <TiltCard className="tilt tilt-topic" max={10}>
                  <button
                    className="topic-tile"
                    style={{ "--wash": cardWash(row.colors) } as CSSProperties}
                    disabled={starting !== null || soon}
                    onClick={() => void start(row.id)}
                  >
                    <span className="topic-art">
                      <img src={artSrc(row)} alt="" loading="lazy" />
                    </span>
                    <span className="topic-foot">
                      <span className="topic-name">
                        {starting === row.id ? "Starting…" : row.name}
                      </span>
                      {soon && <span className="topic-count">Coming soon</span>}
                      <span className="topic-tagline">{row.tagline}</span>
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
