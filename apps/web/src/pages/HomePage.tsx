import { useRef, useState, type CSSProperties } from "react";
import { CATALOG, GAME_GROUPS, isPlayable, type CatalogGame, type GameGroup } from "../catalog";
import { linkTo } from "../router";
import { BottomSheet } from "../ui/BottomSheet";
import { createFailed, startRoom, TopLayout } from "../ui/Chrome";
import { useMediaQuery } from "../ui/common";
import { RoomGlow } from "../ui/RoomGlow";
import { Icon } from "../ui/Icon";
import { LiveCount } from "../ui/LiveCount";
import { tilt } from "../ui/tilt";
import { ToyScene } from "../ui/toys/ToyScene";
import { useToast } from "../ui/toast";

/** Eight cards fit the intended two-row desktop layout. */
const PAGE_SIZE = 8;

/** The home screen: what to play, all on one screen on laptops and computers. */
export function HomePage() {
  const [group, setGroup] = useState<GameGroup | "all">("all");
  const [page, setPage] = useState(0);
  // Phones show one featured game at a time; a kind of game opens its games in a sheet instead.
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [mobileIndex, setMobileIndex] = useState(0);
  // The game the room glows for: the one under the mouse on a computer.
  const [hovered, setHovered] = useState<string | null>(null);
  const shelfRef = useRef<HTMLUListElement>(null);
  const paged = useMediaQuery("(min-width: 1100px)");

  const games = CATALOG.filter((g) => group === "all" || g.groups.includes(group)).sort(
    (a, b) => Number(isPlayable(b)) - Number(isPlayable(a)),
  );
  const pages = Math.max(1, Math.ceil(games.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = games.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  // The room lights up in the colours of the game in front of you: the card on a phone's screen,
  // or the one under the mouse.
  const spotlight = paged ? (hovered ?? shown[0]?.id) : games[mobileIndex]?.id;

  const chooseGroup = (next: GameGroup | "all") => {
    setGroup(next);
    setHovered(null);
    setPage(0);
    setMobileIndex(0);
    shelfRef.current?.scrollTo({ left: 0 });
  };

  const onShelfScroll = () => {
    const shelf = shelfRef.current;
    const card = shelf?.firstElementChild as HTMLElement | null;
    if (!shelf || !card) return;
    const gap = parseFloat(getComputedStyle(shelf).columnGap || "0");
    setMobileIndex(Math.round(shelf.scrollLeft / (card.offsetWidth + gap)));
  };

  const goToGame = (index: number) => {
    const shelf = shelfRef.current;
    const card = shelf?.children[index] as HTMLElement | undefined;
    if (!shelf || !card) return;
    const gap = parseFloat(getComputedStyle(shelf).columnGap || "0");
    shelf.scrollTo({ left: index * (card.offsetWidth + gap), behavior: "smooth" });
  };

  return (
    <TopLayout
      active="home"
      className={categoriesOpen ? "play-page is-picking" : "play-page"}
      screen
      reveal
    >
      <RoomGlow game={spotlight} />
      <section className="play" aria-labelledby="play-title">
        <header className="play-head">
          <LiveCount />
          {/* Phones: three small toys drifting slowly behind the title, and no mascot. */}
          {!paged && <ToyScene className="play-drift" layout="drift" />}
          {paged && (
            <ToyScene
              className="play-hero-art"
              mascot="/art/mascot/hero.webp"
              layout="band"
              width={866}
              height={857}
            />
          )}
          <h1 id="play-title" className="poster play-title">
            What do you want to <span className="gold-text">play?</span>
          </h1>
          <p className="play-subtitle">Pick a game, invite your friends, and let the fun begin.</p>
          <div className="play-chips" role="group" aria-label="Kinds of game">
            {GAME_GROUPS.map((g) => (
              <button
                key={g.id}
                data-group={g.id}
                className={group === g.id ? "play-chip is-open" : "play-chip"}
                aria-pressed={group === g.id}
                onClick={() => chooseGroup(g.id)}
              >
                {g.icon && <Icon name={g.icon} size={20} />}
                {g.name}
              </button>
            ))}
          </div>
          {!paged && (
            <button
              data-group={group}
              className="play-mobile-categories"
              aria-haspopup="dialog"
              onClick={() => setCategoriesOpen(true)}
            >
              <Icon name="grid" size={16} />
              <span className="sr-only">Categories</span>
              <span>{GAME_GROUPS.find((g) => g.id === group)?.name ?? "All Games"}</span>
              <Icon name="chevronDown" size={16} />
            </button>
          )}
        </header>
        {!paged && categoriesOpen && (
          <CategorySheet
            selected={group}
            onSelect={(next) => {
              chooseGroup(next);
              setCategoriesOpen(false);
            }}
            onClose={() => setCategoriesOpen(false)}
          />
        )}

        <div className="play-body">
          {!paged && (
            <div className="play-mobile-shelf">
              <ul
                ref={shelfRef}
                className="play-mobile-cards"
                aria-label="Games to play"
                onScroll={onShelfScroll}
              >
                {games.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </ul>
              {games.length > 1 && (
                <div className="play-mobile-dots" role="group" aria-label="Game pages">
                  {games.map((game, i) => (
                    <button
                      key={game.id}
                      className={i === mobileIndex ? "on" : undefined}
                      aria-label={`Show ${game.name}`}
                      aria-current={i === mobileIndex}
                      onClick={() => goToGame(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {paged && (
            <div className="play-shelf">
              {shown.length === 0 ? (
                <p className="muted play-empty">No other games of this kind yet.</p>
              ) : (
                <ul className="play-grid" aria-label="Games">
                  {shown.map((g, i) => (
                    <GameCard key={g.id} game={g} index={i} onSpotlight={setHovered} />
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
            data-group={g.id}
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

/** One game as a poster: its own colours, its art in a burst of light, its name big. */
function GameCard({
  game,
  index = 0,
  onSpotlight,
}: {
  game: CatalogGame;
  index?: number;
  /** Lights the room in this game's colours, while the mouse or focus is on its card. */
  onSpotlight?: (game: string) => void;
}) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const style = {
    "--c1": game.colors[0],
    "--c2": game.colors[1],
    "--i": index,
  } as CSSProperties;
  const label = `Play ${game.name}`;

  // The round gold Play button, with a crown on top.
  const face = (
    <>
      <Icon name="crown" size={22} fill className="play-btn-crown" />
      <Icon name="play" size={24} fill className="play-btn-glyph" />
    </>
  );
  const action = game.href ? (
    <a className="play-btn" aria-label={label} {...linkTo(game.href)}>
      {face}
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
      {face}
    </button>
  ) : (
    <span className="play-btn soon">Coming soon</span>
  );

  return (
    <li
      className={`game-poster play-card${isPlayable(game) ? "" : " unavailable"}`}
      style={style}
      {...tilt}
      onPointerEnter={() => onSpotlight?.(game.id)}
      onFocus={() => onSpotlight?.(game.id)}
    >
      <div className="play-card-stage" aria-hidden="true">
        <img className="play-card-art" src={game.art} alt="" width={310} height={320} />
      </div>
      <div className="play-card-body">
        <span className="play-card-badge" aria-hidden="true">
          <Icon name={game.icon} size={26} stroke={2.4} />
          <Icon name="crown" size={14} fill className="play-card-badge-crown" />
        </span>
        <h3 className="play-card-name">{game.name}</h3>
        <p className="play-card-desc">{game.description}</p>
        <span className="players">
          <Icon name="users" size={14} />
          {game.players}
        </span>
        {action}
      </div>
    </li>
  );
}
