import { AVATAR_IDS } from "@whizard/protocol";
import type { CSSProperties } from "react";
import { fetchCommunityStats } from "../api";
import { linkTo } from "../router";
import { Avatar } from "../ui/Avatar";
import { CreateRoomButton, TopLayout } from "../ui/Chrome";
import { useLoaded } from "../ui/common";
import { Icon, type IconName } from "../ui/Icon";
import { WORLD_PINS } from "./worldPins";

const BELIEFS: { icon: IconName; tone: string; title: string; text: string }[] = [
  {
    icon: "users",
    tone: "purple",
    title: "Connection First",
    text: "Games are better when shared.",
  },
  {
    icon: "bulb",
    tone: "orange",
    title: "Learning Can Be Fun",
    text: "Knowledge feels different when it’s a game.",
  },
  {
    icon: "heart",
    tone: "pink",
    title: "For Everyone",
    text: "From friends to families, classrooms to communities.",
  },
  {
    icon: "globe",
    tone: "green",
    title: "A More Playful World",
    text: "We believe in the power of play to bring people together.",
  },
];

const n = (value: number) => value.toLocaleString("en-US");

const loadStats = () => fetchCommunityStats();

/** Who we are and why Whizard exists, with the community's real numbers. */
export function AboutPage() {
  const { data: stats } = useLoaded(loadStats);
  const pins = (stats?.countries ?? [])
    .filter((c) => WORLD_PINS[c.name])
    .map((c) => ({
      code: c.name,
      at: WORLD_PINS[c.name]!,
      share: c.count / stats!.countriesTotal,
    }));

  return (
    <TopLayout variant="site" active="about">
      <div className="about-page">
        <section className="about-hero panel" aria-labelledby="about-title">
          <div className="about-hero-copy">
            <p className="pill about-pill">
              <Icon name="crown" size={16} fill />
              About Whizard
            </p>
            <h1 id="about-title" className="display about-title">
              More Than
              <br />
              Just a Quiz.
            </h1>
            <p className="about-lead">
              Whizard is a multiplayer game platform that brings people together through fun,
              friendly competition. Play, learn, and make memories with your friends, family,
              classmates, or community — all in one place.
            </p>
            <div className="about-actions">
              <CreateRoomButton className="btn btn-gold about-btn" />
              <a className="btn about-btn" {...linkTo("/games")}>
                Explore Games
              </a>
            </div>
          </div>
          <img
            className="about-hero-art"
            src="/art/about/hero.webp"
            alt=""
            aria-hidden="true"
            width={1100}
            height={858}
            fetchPriority="high"
          />
        </section>

        <section className="about-story panel" aria-labelledby="story-title">
          <div className="about-copy">
            <h2 id="story-title" className="display about-heading">
              Built for People, Not Just Players.
            </h2>
            <p className="about-text">
              Whizard started with a simple idea: quizzes are more fun together. What began as a
              personal project to make game nights with friends more exciting has grown into a
              platform used by families, friends, schools, churches and communities around the
              world.
            </p>
          </div>
          <img
            className="about-story-art"
            src="/art/about/story.webp"
            alt="The Whizard mascot lifts a trophy with its friends. From game nights with friends, to classrooms and schools, to churches and communities, and people worldwide."
            width={1400}
            height={724}
            loading="lazy"
          />
        </section>

        <section className="about-beliefs panel" aria-labelledby="beliefs-title">
          <h2 id="beliefs-title" className="display about-heading">
            Fun Brings People Closer
          </h2>
          <ul className="beliefs">
            {BELIEFS.map((belief) => (
              <li key={belief.title} className={`belief tone-${belief.tone}`}>
                <span className="belief-icon" aria-hidden="true">
                  <Icon name={belief.icon} size={26} />
                </span>
                <h3>{belief.title}</h3>
                <p>{belief.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="about-impact panel" aria-labelledby="impact-title">
          <div className="about-copy">
            <h2 id="impact-title" className="display about-heading">
              A Growing Global Community
            </h2>
            <p className="about-text">
              People are already playing, creating and competing on Whizard — and we’re just getting
              started.
            </p>
            <ul className="impact-stats">
              <ImpactStat
                icon="games"
                tone="purple"
                label="Games played"
                value={stats?.totals.gamesPlayed}
              />
              <ImpactStat
                icon="users"
                tone="blue"
                label="Players joined"
                value={stats?.totals.playersJoined}
              />
              <ImpactStat
                icon="door"
                tone="orange"
                label="Game rooms created"
                value={stats?.totals.roomsCreated}
              />
              <ImpactStat
                icon="bolt"
                tone="pink"
                label="Questions played"
                value={stats?.totals.questionsPlayed}
              />
            </ul>
          </div>
          <div className="impact-world">
            <div className="world-map impact-map" aria-hidden="true">
              <img src="/art/stats/world.svg" alt="" width={103} height={53} loading="lazy" />
              {pins.map((pin) => (
                <span
                  key={pin.code}
                  className="world-pin"
                  style={
                    {
                      left: `${(pin.at[0] / 103) * 100}%`,
                      top: `${((pin.at[1] + 1) / 53) * 100}%`,
                      "--size": `${8 + Math.round(Math.sqrt(pin.share) * 14)}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <div className="impact-people">
              <span className="impact-faces" aria-hidden="true">
                {AVATAR_IDS.slice(0, 6).map((id) => (
                  <Avatar key={id} id={id} name="" size={40} />
                ))}
              </span>
              <a className="impact-players" {...linkTo("/stats")}>
                <Icon name="globe" size={22} />
                Players from around the world
              </a>
            </div>
          </div>
        </section>

        <section className="about-cta panel" aria-labelledby="about-cta-title">
          <div className="about-copy">
            <h2 id="about-cta-title" className="about-cta-title">
              Ready to be part of the story?
            </h2>
            <p className="about-text">
              Create a room, invite your friends, and experience the fun for yourself.
            </p>
          </div>
          <div className="about-actions">
            <CreateRoomButton className="btn btn-gold about-btn" />
            <a className="btn about-btn" {...linkTo("/games")}>
              Explore Games
            </a>
          </div>
        </section>
      </div>
    </TopLayout>
  );
}

function ImpactStat({
  icon,
  tone,
  label,
  value,
}: {
  icon: IconName;
  tone: string;
  label: string;
  value: number | undefined;
}) {
  return (
    <li className={`impact-stat tone-${tone}`}>
      <span className="impact-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <span className="impact-text">
        <strong>{value === undefined ? "–" : n(value)}</strong>
        <span>{label}</span>
      </span>
    </li>
  );
}
