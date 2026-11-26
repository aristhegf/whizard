import { useState } from "react";
import { CATALOG, isPlayable, type CatalogGame } from "../catalog";
import { linkTo } from "../router";
import { CreateRoomButton, createFailed, startRoom, TopLayout } from "../ui/Chrome";
import { Icon } from "../ui/Icon";
import { LiveCount } from "../ui/LiveCount";
import { useToast } from "../ui/toast";

const STEPS = ["Pick a game", "Share the code or QR", "Everyone plays at once"];

/** The games people can play today, in the catalogue's order. */
const PLAYABLE = CATALOG.filter(isPlayable);

/** The home page for guests: the pitch, the games to pick from, and how a game gets going. */
export function WelcomePage() {
  return (
    <TopLayout active="welcome" className="welcome-page" reveal>
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <h1 id="welcome-title" className="display welcome-title">
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
        <img
          className="welcome-art"
          src="/art/mascot/crew.webp"
          srcSet="/art/mascot/crew-768.webp 768w, /art/mascot/crew.webp 1536w"
          sizes="(min-width: 900px) 600px, 100vw"
          alt=""
          width={1536}
          height={1024}
          fetchPriority="high"
        />
      </section>

      <section className="welcome-pick" aria-labelledby="pick-title">
        <div className="welcome-pick-head">
          <h2 id="pick-title" className="display welcome-h2">
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
 * One game in the strip: its art and name. Games with a page of their own go there; the rest
 * open a room with that game straight away, as on the Games page.
 */
function PickCard({ game }: { game: CatalogGame }) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const body = (
    <>
      <img className="welcome-card-art" src={game.art} alt="" width={320} height={320} />
      <span className="welcome-card-name">{opening ? "Opening…" : game.name}</span>
    </>
  );

  if (game.href) {
    return (
      <a className="welcome-card" aria-label={`Play ${game.name}`} {...linkTo(game.href)}>
        {body}
      </a>
    );
  }
  return (
    <button
      className="welcome-card"
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
