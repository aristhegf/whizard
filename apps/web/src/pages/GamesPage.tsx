import { useState, type CSSProperties } from "react";
import { CATALOG, GAME_GROUPS, cardWash, type CatalogGame, type GameGroup } from "../catalog";
import { linkTo } from "../router";
import { TopLayout } from "../ui/Chrome";
import { Icon } from "../ui/Icon";

export function GamesPage() {
  const [group, setGroup] = useState<GameGroup | "all">("all");
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const games = CATALOG.filter(
    (g) =>
      (group === "all" || g.groups.includes(group)) &&
      (!needle || `${g.name} ${g.description}`.toLowerCase().includes(needle)),
  );

  const search = (
    <label className="search">
      <Icon name="search" />
      <span className="sr-only">Search games</span>
      <input
        type="search"
        name="search"
        placeholder="Search games…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
  );

  return (
    <TopLayout variant="app" active="games">
      <section className="browse">
        <header className="browse-head">
          <div>
            <h1 className="page-title">
              Choose a <span className="soft-text">Game</span>
            </h1>
            <p className="page-sub">
              <strong className="soft-text">Something for every mood.</strong> Pick a game and get
              your friends in!
            </p>
          </div>
          <img
            className="head-mascot"
            src="/art/mascot/wave.webp"
            alt=""
            width={451}
            height={520}
          />
        </header>

        <div className="browse-tools">
          {search}
          <div className="chips" role="group" aria-label="Kinds of game">
            {GAME_GROUPS.map((g) => (
              <button
                key={g.id}
                className="chip"
                aria-pressed={group === g.id}
                onClick={() => setGroup(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>

        {games.length === 0 ? (
          <p className="muted">No games match that yet.</p>
        ) : (
          <ul className="game-grid">
            {games.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </ul>
        )}
      </section>
    </TopLayout>
  );
}

function GameCard({ game }: { game: CatalogGame }) {
  const body = (
    <>
      <span className="game-art">
        <img src={game.art} alt="" loading="lazy" />
      </span>
      <span className="game-text">
        <strong className="game-name">{game.name}</strong>
        <span className="game-desc">{game.description}</span>
      </span>
      <span className="game-foot">
        <span className="players">
          <Icon name="users" size={18} />
          {game.players}
        </span>
        {game.href ? (
          <span className="go" aria-hidden="true">
            <Icon name="arrowRight" size={20} stroke={2.4} />
          </span>
        ) : (
          <span className="soon">Coming soon</span>
        )}
      </span>
      {game.href && <Icon name="chevronRight" className="row-chevron" size={20} />}
    </>
  );
  const style = { "--wash": cardWash(game.colors) } as CSSProperties;
  return (
    <li>
      {game.href ? (
        <a className="game-card" style={style} {...linkTo(game.href)}>
          {body}
        </a>
      ) : (
        <div
          className="game-card unavailable"
          style={style}
          aria-label={`${game.name}, coming soon`}
        >
          {body}
        </div>
      )}
    </li>
  );
}
