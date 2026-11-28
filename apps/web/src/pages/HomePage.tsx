import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CATALOG, GAME_GROUPS, isPlayable, type CatalogGame, type GameGroup } from "../catalog";
import { linkTo, useSearchParam } from "../router";
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
  // The kind of game is picked in the side panel, as `?kind=` in the address.
  const kind = useSearchParam("kind");
  const group = (GAME_GROUPS.find((g) => g.id === kind)?.id ?? "all") as GameGroup | "all";
  const groupName = GAME_GROUPS.find((g) => g.id === group)?.name;
  const [mobileIndex, setMobileIndex] = useState(0);
  // The game the room glows for: the one under the mouse on a computer.
  // Kept with the kind of game it was for, so picking another kind lets it go.
  const [hover, setHover] = useState<{ group: string; id: string } | null>(null);
  // Whether the row is at its start or its end, for the arrows.
  const [ends, setEnds] = useState({ start: true, end: false });
  const shelfRef = useRef<HTMLUListElement>(null);
  const paged = useMediaQuery("(min-width: 1100px)");

  const games = CATALOG.filter((g) => group === "all" || g.groups.includes(group)).sort(
    (a, b) => Number(isPlayable(b)) - Number(isPlayable(a)),
  );

  // The room lights up in the colours of the game in front of you: the one under the mouse, or
  // the top one of the first column in view (two games to a column).
  const hovered = hover?.group === group ? hover.id : null;
  const spotlight = (paged && hovered) || games[mobileIndex * 2]?.id;

  const onShelfScroll = () => {
    const shelf = shelfRef.current;
    const card = shelf?.firstElementChild as HTMLElement | null;
    if (!shelf || !card) return;
    const gap = parseFloat(getComputedStyle(shelf).columnGap || "0");
    setMobileIndex(Math.round(shelf.scrollLeft / (card.offsetWidth + gap)));
    setEnds({
      // A few pixels' grace: snapping can leave the row a little off its very start or end.
      start: shelf.scrollLeft <= 8,
      end: shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 8,
    });
  };

  // A new kind of game starts the row from the beginning; it, or a resized window, changes how
  // much of the row fits.
  useEffect(() => {
    shelfRef.current?.scrollTo({ left: 0 });
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

  return (
    <TopLayout active="home" className="play-page" screen reveal>
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
          {/* The kind of game picked in the side panel, with a way back to all of them. */}
          {group !== "all" && (
            <a className="play-kind" data-group={group} {...linkTo("/games")}>
              <span>{groupName}</span>
              <Icon name="close" size={14} stroke={2.6} />
              <span className="sr-only">: show all games</span>
            </a>
          )}
        </header>
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
                  <GameCard
                    key={game.id}
                    game={game}
                    index={i}
                    onSpotlight={(id) => setHover({ group, id })}
                  />
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
          </div>
        </div>
      </section>
    </TopLayout>
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
