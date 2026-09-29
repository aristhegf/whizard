import { linkTo } from "../router";
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

/** The home page for guests: what Whizard is, how it works, and a way in. */
export function WelcomePage() {
  return (
    <TopLayout active="home">
      <section className="hero">
        <LiveCount />
        <div className="hero-copy">
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
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="stage-glow" />
          <img src="/art/mascot/hero.webp" alt="" width={866} height={857} fetchPriority="high" />
        </div>
        <ul className="features">
          {FEATURES.map((f) => (
            <li key={f.title} className="feature panel">
              <span className="feature-icon">
                <Icon name={f.icon} size={22} />
              </span>
              <span>
                <strong>{f.title}</strong>
                <span className="muted">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

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

      <section id="about" className="welcome-about panel" aria-labelledby="about-title">
        <h2 id="about-title" className="section-title">
          About Whizard
        </h2>
        <p className="muted">
          Whizard is a free place to play quick games with the people you care about, in the same
          room or on the other side of the world. Everyone gets the same challenge at the same
          moment, with nothing to install. Accounts are optional; they keep your stats and let you
          ping friends when you’re free.
        </p>
      </section>
    </TopLayout>
  );
}
