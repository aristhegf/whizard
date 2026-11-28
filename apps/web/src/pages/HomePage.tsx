import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CATALOG, GAME_GROUPS, isPlayable, type CatalogGame, type GameGroup } from "../catalog";
import { linkTo } from "../router";
import { BottomSheet } from "../ui/BottomSheet";
import { CardLandscape } from "../ui/CardLandscape";
import { createFailed, startRoom, TopLayout } from "../ui/Chrome";
import { useMediaQuery } from "../ui/common";
import { RoomGlow } from "../ui/RoomGlow";
import { Icon } from "../ui/Icon";
import { LiveCount } from "../ui/LiveCount";
import { ToyScene } from "../ui/toys/ToyScene";
import { useToast } from "../ui/toast";

/**
 * The home screen: what to play, on one screen. The games are a row of cards at their own shape,
 * as tall as the screen allows, to swipe or page through with the arrows at either end.
 */
export function HomePage() {
  const [group, setGroup] = useState<GameGroup | "all">("all");
  // On phones a kind of game is picked in a sheet.
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [mobileIndex, setMobileIndex] = useState(0);
  // The game the room glows for: the one under the mouse on a computer.
  const [hovered, setHovered] = useState<string | null>(null);
  // Whether the row is at its start or its end, for the arrows.
  const [ends, setEnds] = useState({ start: true, end: false });
  const shelfRef = useRef<HTMLUListElement>(null);
  const paged = useMediaQuery("(min-width: 1100px)");

  const games = CATALOG.filter((g) => group === "all" || g.groups.includes(group)).sort(
    (a, b) => Number(isPlayable(b)) - Number(isPlayable(a)),
  );

  // The room lights up in the colours of the game in front of you: the one under the mouse, or
  // the first one in view.
  const spotlight = (paged && hovered) || games[mobileIndex]?.id;

  const chooseGroup = (next: GameGroup | "all") => {
    setGroup(next);
    setHovered(null);
    setMobileIndex(0);
    shelfRef.current?.scrollTo({ left: 0 });
  };

  const onShelfScroll = () => {
    const shelf = shelfRef.current;
    const card = shelf?.firstElementChild as HTMLElement | null;
    if (!shelf || !card) return;
    const gap = parseFloat(getComputedStyle(shelf).columnGap || "0");
    setMobileIndex(Math.round(shelf.scrollLeft / (card.offsetWidth + gap)));
    setEnds({
      start: shelf.scrollLeft <= 2,
      end: shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 2,
    });
  };

  // A new kind of game, or a resized window, changes how much of the row fits.
  useEffect(() => {
    onShelfScroll();
    const shelf = shelfRef.current;
    if (!shelf) return;
    const resized = new ResizeObserver(() => onShelfScroll());
    resized.observe(shelf);
    return () => resized.disconnect();
  }, [group]);

  /** One card along, either way. */
  const step = (direction: 1 | -1) => {
    const shelf = shelfRef.current;
    const card = shelf?.firstElementChild as HTMLElement | null;
    if (!shelf || !card) return;
    const gap = parseFloat(getComputedStyle(shelf).columnGap || "0");
    shelf.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: "smooth" });
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
          <div className="play-mobile-shelf">
            <div className="play-shelf-track">
              <ul
                ref={shelfRef}
                className="play-mobile-cards"
                aria-label={paged ? "Games" : "Games to play"}
                onScroll={onShelfScroll}
              >
                {games.map((game, i) => (
                  <GameCard key={game.id} game={game} index={i} onSpotlight={setHovered} />
                ))}
              </ul>
              {/* At either end of the page: there are more games to swipe to. */}
              <button
                className="play-arrow play-arrow-prev"
                aria-label="Previous games"
                disabled={ends.start}
                onClick={() => step(-1)}
              >
                <Icon name="chevronLeft" size={24} stroke={2.6} />
              </button>
              <button
                className="play-arrow play-arrow-next"
                aria-label="More games"
                disabled={ends.end}
                onClick={() => step(1)}
              >
                <Icon name="chevronRight" size={24} stroke={2.6} />
              </button>
            </div>
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

  // The whole card plays: a link or a button stretched over it, named for screen readers.
  const hit = game.href ? (
    <a className="wx-hit" aria-label={label} {...linkTo(game.href)} />
  ) : game.starts ? (
    // Games without a page of their own open a room straight away.
    <button
      className="wx-hit"
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
    />
  ) : null;
  // "1-20 players" as just "1-20".
  const players = game.players.replace(/\s*players?$/i, "");

  // From Uiverse.io by KSAplay - https://uiverse.io/KSAplay/strong-donkey-70
  // MIT License, Copyright (c) KSAplay (Kenny)
  // The layout of the "Minimalist Weather Card": the landscape on top, then the game's name, what
  // it is and how many play in rows on white.
  return (
    <li
      className={`wx-card play-card${isPlayable(game) ? "" : " unavailable"}`}
      style={style}
      onPointerEnter={() => onSpotlight?.(game.id)}
      onFocus={() => onSpotlight?.(game.id)}
    >
      <CardLandscape art={game.art} />
      <section className="wx-content">
        <div className="wx-forecast">
          <div>
            <h3 className="wx-name">{game.name}</h3>
          </div>
          <div className="wx-separator" />
          <div>
            <p className="wx-desc">{game.description}</p>
            <p className="wx-players">
              {isPlayable(game) ? players : "Soon"}
              {isPlayable(game) && <span className="sr-only"> players</span>}
            </p>
          </div>
        </div>
      </section>
      {hit}
    </li>
  );
}
