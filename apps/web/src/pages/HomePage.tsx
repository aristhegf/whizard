import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@whizard/game-core";
import { useState, type FormEvent } from "react";
import { fetchRoomStatus } from "../api";
import { linkTo, navigate, roomPath } from "../router";
import { loadSession } from "../storage";
import { useShakeOnError } from "../ui/errorShake";
import { CreateRoomButton, TopLayout } from "../ui/Chrome";
import { Icon, type IconName } from "../ui/Icon";
import { LiveCount } from "../ui/LiveCount";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "device", title: "Play on any device", text: "Phones, tablets, or desktop" },
  { icon: "link", title: "No downloads", text: "Just a link and you’re in" },
  { icon: "heart", title: "Perfect for any group", text: "Friends, family, work or couples" },
];

const STEPS = [
  { title: "Create a room", text: "Pick a game and a topic. You get a room code and a link." },
  { title: "Invite your people", text: "Send the link or show the QR code. Nobody needs an app." },
  { title: "Play together", text: "Everyone starts at once and plays at their own pace." },
];

/** Why a room code can't be used right now, or null if it can. Asks the server. */
async function codeProblem(code: string): Promise<string | null> {
  const status = await fetchRoomStatus(code);
  if (!status) return "No room has that code. Check it, or ask the host for a new one.";
  // Someone who's already in the room can always go back to it.
  if (loadSession(code)) return null;
  // A game already running is fine: without late join, they wait in the room for the next one.
  if (status.full) return "That room is full.";
  return null;
}

export function HomePage() {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState("");
  const { ref, isError, message } = useShakeOnError<HTMLInputElement>(error, attempt);

  const fail = (message: string) => {
    setError(message);
    setAttempt((n) => n + 1);
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    if (checking) return;
    const normalized = normalizeRoomCode(code);
    if (!normalized) return fail(`Room codes are ${ROOM_CODE_LENGTH} letters and numbers.`);
    setChecking(true);
    try {
      const problem = await codeProblem(normalized);
      if (problem) fail(problem);
      else navigate(roomPath(normalized));
    } catch {
      fail("Couldn’t check that code. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <TopLayout active="home">
      <section className="hero">
        <div className="hero-copy">
          <LiveCount />
          <p className="pill hero-pill">
            <Icon name="users" size={20} />
            Play Together, Anywhere
          </p>
          <h1 className="display hero-title">
            Games
            <br />
            Are Better
            <br />
            <span className="gradient-text">Together</span>
          </h1>
          <p className="hero-lead">
            Fun multiplayer games for friends, families, couples and teams. No downloads. Just play.
          </p>
          <div className="hero-actions">
            <CreateRoomButton className="btn btn-gold btn-hero" />
            <a className="btn btn-hero" {...linkTo("/games")}>
              Explore Games
            </a>
          </div>
          <div className={`t-input-wrap join-code-wrap${isError ? " is-error" : ""}`}>
            <form className="join-code" onSubmit={(event) => void join(event)}>
              <input
                ref={ref}
                className={`code-input t-input${isError ? " is-error" : ""}`}
                name="code"
                aria-label="Room code"
                aria-invalid={isError}
                aria-describedby="code-error"
                placeholder="Have a code? e.g. K7QX2M"
                value={code}
                maxLength={ROOM_CODE_LENGTH + 4}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setCode(event.target.value);
                  setError(null);
                }}
              />
              <button className="btn btn-small" type="submit" disabled={checking}>
                {checking ? "Checking…" : "Join"}
              </button>
            </form>
            <p id="code-error" className="t-error-msg error small" role="alert">
              {message}
            </p>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="stage-glow" />
          <img src="/art/mascot/hero.webp" alt="" width={866} height={857} fetchPriority="high" />
        </div>
      </section>

      <ul className="features">
        {FEATURES.map((f) => (
          <li key={f.title} className="feature panel">
            <span className="feature-icon">
              <Icon name={f.icon} size={26} />
            </span>
            <span>
              <strong>{f.title}</strong>
              <span className="muted">{f.text}</span>
            </span>
          </li>
        ))}
      </ul>

      <section id="how" className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="display section-display">
          How it works
        </h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="panel">
              <span className="step-number">{i + 1}</span>
              <strong>{s.title}</strong>
              <span className="muted">{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="about" className="about panel" aria-labelledby="about-title">
        <h2 id="about-title" className="section-title">
          About Whizard
        </h2>
        <p className="muted">
          Whizard is a free place to play quick games with the people you care about, in the same
          room or on the other side of the world. Everyone gets the same challenge at the same
          moment, with nothing to install. Accounts are optional; they keep your stats and let you
          ping friends when you’re free.
        </p>
        <div className="link-row">
          <a className="btn-link" {...linkTo("/stats")}>
            Stats
          </a>
          <a className="btn-link" {...linkTo("/privacy")}>
            Privacy
          </a>
        </div>
      </section>
    </TopLayout>
  );
}
