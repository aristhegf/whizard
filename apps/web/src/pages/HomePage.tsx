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

/** Desktop uses the full catalogue grid; phones use a compact swipeable game rail. */
/** Eight cards fit the intended two-row desktop layout. */
const PAGE_SIZE = 8;
const GROUP_NAMES: Partial<Record<GameGroup, string>> = Object.fromEntries(
  GAME_GROUPS.map((g) => [g.id, g.name]),
);

/** The home screen: what to play, all on one screen on laptops and computers. */
export function HomePage() {
  const [group, setGroup] = useState<GameGroup | "all">("all");
  const [page, setPage] = useState(0);
  // Phones show only the featured game; a kind of game opens its games in a sheet instead.
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const paged = useMediaQuery("(min-width: 1100px)");

  const games = CATALOG.filter((g) => group === "all" || g.groups.includes(group)).sort(
    (a, b) => Number(isPlayable(b)) - Number(isPlayable(a)),
  );
  const pages = Math.max(1, Math.ceil(games.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = games.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <TopLayout active="home" className="play-page" screen reveal>
      <section className="play" aria-labelledby="play-title">
        <header className="play-head">
          <LiveCount />
          <img
            className="play-hero-art"
            src="/art/mascot/hero.webp"
            alt=""
            width={866}
            height={857}
          />
          <h1 id="play-title" className="display play-title">
            What do you want to <span className="gold-text">play?</span>
          </h1>
          <p className="play-subtitle">Pick a game, invite your friends, and let the fun begin.</p>
          <div className="play-chips" role="group" aria-label="Kinds of game">
            {GAME_GROUPS.map((g) => (
              <button
                key={g.id}
                className={group === g.id ? "play-chip is-open" : "play-chip"}
                aria-pressed={group === g.id}
                onClick={() => {
                  setGroup(g.id);
                  setPage(0);
                }}
              >
                {g.icon && <Icon name={g.icon} size={20} />}
                {g.name}
              </button>
            ))}
          </div>
          {!paged && (
            <button
              className="play-mobile-categories"
              aria-haspopup="dialog"
              onClick={() => setCategoriesOpen(true)}
            >
              <Icon name="grid" size={18} />
              Categories
              <span>{GAME_GROUPS.find((g) => g.id === group)?.name ?? "All"}</span>
              <Icon name="chevronDown" size={18} />
            </button>
          )}
        </header>
        {!paged && categoriesOpen && (
          <CategorySheet
            selected={group}
            onSelect={(next) => {
              setGroup(next);
              setPage(0);
              setCategoriesOpen(false);
            }}
            onClose={() => setCategoriesOpen(false)}
          />
        )}

        <div className="play-body">
          {!paged && (
            <div className="play-mobile-shelf">
              <ul className="play-mobile-cards" aria-label="Games to play">
                {games.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </ul>
            </div>
          )}

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
function CategorySheet({
  selected,
  onSelect,
  onClose,
}: {
  selected: GameGroup | "all";
  onSelect: (group: GameGroup | "all") => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      labelledBy="category-sheet-title"
      className="category-sheet"
      onClose={onClose}
      header={(close) => (
        <div className="category-sheet-head">
          <h2 id="category-sheet-title">Game Categories</h2>
          <button className="game-sheet-close" aria-label="Close categories" onClick={close}>
            <Icon name="close" size={20} stroke={2.4} />
          </button>
        </div>
      )}
    >
      <div className="category-options" role="group" aria-label="Game Categories">
        {GAME_GROUPS.map((g) => (
          <button
            key={g.id}
            className="category-option"
            aria-pressed={selected === g.id}
            onClick={() => onSelect(g.id)}
          >
            {g.icon ? <Icon name={g.icon} size={20} /> : <Icon name="grid" size={20} />}
            <span>{g.name === "All" ? "All Games" : g.name}</span>
            {selected === g.id && <Icon name="check" size={18} />}
          </button>
        ))}
      </div>
    </BottomSheet>
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
      <img className="play-card-art" src={game.art} alt="" />
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
