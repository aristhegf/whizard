import { useState, type CSSProperties } from "react";
import { CATALOG, isPlayable, type CatalogGame } from "../catalog";
import { linkTo } from "../router";
import { CreateRoomButton, createFailed, startRoom, TopLayout } from "../ui/Chrome";
import { Icon } from "../ui/Icon";
import { LiveCount } from "../ui/LiveCount";
import { RoomGlow } from "../ui/RoomGlow";
import { useToast } from "../ui/toast";
import { tilt } from "../ui/tilt";
import { ToyScene } from "../ui/toys/ToyScene";

const STEPS = ["Pick a game", "Share the code or QR", "Everyone plays at once"];

/** The games people can play today, in the catalogue's order. */
const PLAYABLE = CATALOG.filter(isPlayable);

/** The home page for guests: the pitch, the games to pick from, and how a game gets going. */
export function WelcomePage() {
  return (
    <TopLayout active="welcome" className="welcome-page" reveal>
      <RoomGlow game={null} />
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <h1 id="welcome-title" className="poster welcome-title">
            Games are better <span className="gold-text">together</span>
          </h1>
          <p className="welcome-lead">
            Quick games for friends, family and couples. Share a code and play at once.
          </p>
          <div className="welcome-actions">
            <CreateRoomButton
              className="btn btn-gold welcome-btn"
              label="Create a room"
              arrow={false}
            />
            <a className="btn welcome-btn welcome-btn-quiet" {...linkTo("/games")}>
              See all games
            </a>
          </div>
        </div>
        <ToyScene
          className="welcome-art"
          mascot="/art/mascot/hero.webp"
          layout="hero"
          width={866}
          height={857}
        />
      </section>

      <Ribbon />

      <section className="welcome-pick" aria-labelledby="pick-title">
        <div className="welcome-pick-head">
          <h2 id="pick-title" className="poster welcome-h2">
            Pick a game
          </h2>
          <LiveCount variant="now" />
        </div>
        <ul className="welcome-strip" aria-label="Games">
          {PLAYABLE.map((game) => (
            <li key={game.id}>
              <PickCard game={game} />
            </li>
          ))}
        </ul>
      </section>

      <section id="how" className="welcome-how" aria-labelledby="how-title">
        <h2 id="how-title" className="sr-only">
          How it works
        </h2>
        <ol className="welcome-steps">
          {STEPS.map((step, i) => (
            <li key={step}>
              <span className="welcome-step-number" aria-hidden="true">
                {i + 1}
              </span>
              {step}
              {i < STEPS.length - 1 && (
                <Icon name="arrowRight" size={28} className="welcome-step-arrow" />
              )}
            </li>
          ))}
        </ol>
      </section>
    </TopLayout>
  );
}

/**
 * A neon ribbon across the page with the games' names running along it, each in its own
 * colour. Twice over, so it loops without a seam; the names are in the strip below too, so
 * screen readers skip it.
 */
function Ribbon() {
  const names = PLAYABLE.map((game) => (
    <span key={game.id} className="ribbon-name" style={{ "--c1": game.colors[0] } as CSSProperties}>
      {game.name}
      <Icon name="star" size={20} fill className="ribbon-star" />
    </span>
  ));
  return (
    <div className="welcome-ribbon-wrap" aria-hidden="true">
      <div className="welcome-ribbon">
        <div className="ribbon-track">
          <div className="ribbon-run">{names}</div>
          <div className="ribbon-run">{names}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * One game in the strip, as a small poster: its colours, its art and its name. Games with a page of their own go there; the rest
 * open a room with that game straight away, as on the Games page.
 */
function PickCard({ game }: { game: CatalogGame }) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const body = (
    <>
      <img className="welcome-card-art" src={game.art} alt="" width={310} height={320} />
      <span className="welcome-card-name poster">{opening ? "Opening…" : game.name}</span>
    </>
  );
  const look = {
    className: "game-poster welcome-card",
    style: { "--c1": game.colors[0], "--c2": game.colors[1] } as CSSProperties,
    ...tilt,
  };

  if (game.href) {
    return (
      <a {...look} aria-label={`Play ${game.name}`} {...linkTo(game.href)}>
        {body}
      </a>
    );
  }
  return (
    <button
      {...look}
      aria-label={`Play ${game.name}`}
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
      {body}
    </button>
  );
}
