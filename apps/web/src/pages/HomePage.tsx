import { useState, type CSSProperties } from "react";
import {
  CATALOG,
  GAME_GROUPS,
  cardWash,
  isPlayable,
  type CatalogGame,
  type GameGroup,
} from "../catalog";
import { linkTo } from "../router";
import { BottomSheet } from "../ui/BottomSheet";
import { createFailed, startRoom, TopLayout } from "../ui/Chrome";
import { useMediaQuery } from "../ui/common";
import { Icon } from "../ui/Icon";
import { LiveCount } from "../ui/LiveCount";
import { useToast } from "../ui/toast";

/** The most played game gets the big card; the rest share the grid beside it. */
const FEATURED = CATALOG.find((g) => g.id === "quiz")!;
/** Games ready to play come first, the ones still being made after them. */
const OTHERS = CATALOG.filter((g) => g !== FEATURED).sort(
  (a, b) => Number(isPlayable(b)) - Number(isPlayable(a)),
);
/** Cards per page on laptops and computers, where the screen doesn't scroll. */
const PAGE_SIZE = 6;
const GROUP_NAMES: Partial<Record<GameGroup, string>> = Object.fromEntries(
  GAME_GROUPS.map((g) => [g.id, g.name]),
);

/** The home screen: what to play, all on one screen on laptops and computers. */
export function HomePage() {
  const [group, setGroup] = useState<GameGroup | "all">("all");
  const [page, setPage] = useState(0);
  // Phones show only the featured game; a kind of game opens its games in a sheet instead.
  const [sheet, setSheet] = useState<GameGroup | "all" | null>(null);
  const paged = useMediaQuery("(min-width: 1100px)");

  const games = OTHERS.filter((g) => group === "all" || g.groups.includes(group));
  const pages = Math.max(1, Math.ceil(games.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = games.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <TopLayout active="home" className="play-page" screen>
      <section className="play" aria-labelledby="play-title">
        <header className="play-head">
          <LiveCount />
          <h1 id="play-title" className="display play-title">
            What do you want to <span className="gold-text">play?</span>
          </h1>
          <div className="play-chips" role="group" aria-label="Kinds of game">
            {GAME_GROUPS.map((g) => (
              <button
                key={g.id}
                className={`play-chip${sheet === g.id ? " is-open" : ""}`}
                aria-pressed={paged ? group === g.id : undefined}
                aria-haspopup={paged ? undefined : "dialog"}
                onClick={() => {
                  if (!paged) return setSheet(g.id);
                  setGroup(g.id);
                  setPage(0);
                }}
              >
                {g.icon && <Icon name={g.icon} size={paged ? 20 : 16} />}
                {g.name}
              </button>
            ))}
          </div>
        </header>
        {!paged && sheet && <GameSheet group={sheet} onClose={() => setSheet(null)} />}

        <div className="play-body">
          <Featured game={FEATURED} />

          {paged && (
            <div className="play-shelf">
              {shown.length === 0 ? (
                <p className="muted play-empty">No other games of this kind yet.</p>
              ) : (
                <ul className="play-grid" aria-label="Games">
                  {shown.map((g) => (
                    <GameCard key={g.id} game={g} />
                  ))}
                </ul>
              )}
              {pages > 1 && (
                <div className="play-pager">
                  <button
                    className="play-arrow"
                    aria-label="Previous games"
                    disabled={current === 0}
                    onClick={() => setPage(current - 1)}
                  >
                    <Icon name="chevronLeft" size={24} stroke={2.6} />
                  </button>
                  <span className="play-dots" aria-label={`Page ${current + 1} of ${pages}`}>
                    {Array.from({ length: pages }, (_, i) => (
                      <span key={i} className={i === current ? "on" : undefined} />
                    ))}
                  </span>
                  <button
                    className="play-arrow"
                    aria-label="More games"
                    disabled={current === pages - 1}
                    onClick={() => setPage(current + 1)}
                  >
                    <Icon name="chevronRight" size={24} stroke={2.6} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </TopLayout>
  );
}

/** A kind of game's games, in a sheet from the bottom, one card at a time to swipe through. */
function GameSheet({ group, onClose }: { group: GameGroup | "all"; onClose: () => void }) {
  const info = GAME_GROUPS.find((g) => g.id === group)!;
  const games = CATALOG.filter((g) => group === "all" || g.groups.includes(group)).sort(
    (a, b) => Number(isPlayable(b)) - Number(isPlayable(a)),
  );
  const [at, setAt] = useState(0);

  return (
    <BottomSheet
      labelledBy="game-sheet-title"
      className="game-sheet"
      onClose={onClose}
      header={(close) => (
        <div className="game-sheet-head">
          <h2 id="game-sheet-title" className="game-sheet-title">
            {info.icon && <Icon name={info.icon} size={20} />}
            {group === "all" ? "All games" : `${info.name} games`}
          </h2>
          <span className="game-sheet-count">{games.length}</span>
          <button className="game-sheet-close" aria-label="Close" onClick={close}>
            <Icon name="close" size={20} stroke={2.4} />
          </button>
        </div>
      )}
    >
      {games.length === 0 ? (
        <p className="muted play-empty">No games of this kind yet.</p>
      ) : (
        <>
          <ul
            className="game-sheet-cards"
            aria-label="Games"
            onScroll={(event) => {
              const list = event.currentTarget;
              const step = (list.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1;
              // The last card can't snap to the start, so the end of the row counts as it.
              const end = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
              setAt(end ? games.length - 1 : Math.round(list.scrollLeft / (step + 12)));
            }}
          >
            {games.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </ul>
          {games.length > 1 && (
            <span className="play-dots game-sheet-dots" aria-hidden="true">
              {games.map((g, i) => (
                <span key={g.id} className={i === at ? "on" : undefined} />
              ))}
            </span>
          )}
        </>
      )}
    </BottomSheet>
  );
}

/** The big card beside the mascot. */
function Featured({ game }: { game: CatalogGame }) {
  return (
    <article className="play-featured" aria-labelledby="featured-title">
      <img
        className="play-mascot"
        src="/art/mascot/hero.webp"
        alt=""
        width={866}
        height={857}
        fetchPriority="high"
      />
      <div className="featured-card" style={{ "--wash": cardWash(game.colors) } as CSSProperties}>
        <span className="featured-badge">
          <Icon name="crown" size={18} />
          Most played
        </span>
        <img className="featured-art" src={game.art} alt="" />
        <h2 id="featured-title" className="featured-title">
          {game.name}
        </h2>
        <p className="featured-tagline">Test your knowledge on anything!</p>
        <div className="featured-foot">
          <span className="players">
            <Icon name="users" size={20} />
            {game.players}
          </span>
          {game.groups.map((g) => (
            <span key={g} className="featured-tag">
              {GROUP_NAMES[g]}
            </span>
          ))}
          <a className="btn btn-gold featured-play" {...linkTo(game.href!)}>
            Play now
            <Icon name="arrowRight" size={22} stroke={2.6} />
          </a>
        </div>
      </div>
    </article>
  );
}

function GameCard({ game }: { game: CatalogGame }) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const style = { "--wash": cardWash(game.colors) } as CSSProperties;
  const label = `Play ${game.name}`;

  const action = game.href ? (
    <a className="play-btn" aria-label={label} {...linkTo(game.href)}>
      Play
      <Icon name="arrowRight" size={18} stroke={2.6} />
    </a>
  ) : game.starts ? (
    // Games without a page of their own open a room straight away.
    <button
      className="play-btn"
      aria-label={label}
      aria-busy={opening}
      disabled={opening}
      onClick={() => {
        setOpening(true);
        startRoom(undefined, game.starts).catch((error: unknown) => {
          setOpening(false);
          toast.show({ title: createFailed(error), status: "error" });
        });
      }}
    >
      {opening ? "Opening…" : "Play"}
      {!opening && <Icon name="arrowRight" size={18} stroke={2.6} />}
    </button>
  ) : (
    <span className="play-btn soon">Coming soon</span>
  );

  return (
    <li className={`play-card${isPlayable(game) ? "" : " unavailable"}`} style={style}>
      <img className="play-card-art" src={game.art} alt="" loading="lazy" />
      <h3 className="play-card-name">{game.name}</h3>
      <p className="play-card-desc">{game.description}</p>
      <div className="play-card-foot">
        <span className="players">
          <Icon name="users" size={18} />
          {game.players}
        </span>
        {action}
      </div>
    </li>
  );
}
