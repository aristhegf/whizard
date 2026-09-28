import { ActionSwapCascadeText } from "@/components/motion/action-swap-cascade";
import { Tooltip } from "@/components/motion/tooltip";
import { QUIZ_CATEGORIES, type QuizCategory } from "@whizard/game-core";
import type {
  CommunityStats,
  LeaderboardEntry,
  StatsEntry,
  TrendingEntry,
} from "@whizard/protocol";
import { useState, type CSSProperties, type ReactNode } from "react";
import { fetchCommunityStats } from "../api";
import { CATALOG, TOPIC_STYLES } from "../catalog";
import { linkTo } from "../router";
import { Avatar } from "../ui/Avatar";
import { CreateRoomButton, TopLayout } from "../ui/Chrome";
import { useLoaded } from "../ui/common";
import { Loading } from "../ui/Loading";
import { Icon, type IconName } from "../ui/Icon";
import { countryShares } from "./communityStats";
import { WORLD_PINS } from "./worldPins";

const n = (value: number) => value.toLocaleString("en-US");

/** How many rows a list shows before "View all". */
const SHORT_LIST = 5;
/** Top Players: the podium, then this many more beside it before "View full leaderboard". */
const PODIUM = 3;
const LEADERBOARD_SHORT = 8;

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

function flag(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

function topicName(id: string): string {
  return QUIZ_CATEGORIES.find((c) => c.id === id)?.name ?? id;
}

function topicArt(id: string): string | undefined {
  return TOPIC_STYLES[id as QuizCategory]?.art;
}

function gameName(id: string): string {
  return CATALOG.find((g) => g.id === id)?.name ?? id;
}

function trendingName(entry: TrendingEntry): string {
  if (entry.game === "quiz" && entry.topic) return `${topicName(entry.topic)} Quiz`;
  return gameName(entry.game);
}

function trendingArt(entry: TrendingEntry): string | undefined {
  if (entry.game === "quiz" && entry.topic) return topicArt(entry.topic);
  return CATALOG.find((g) => g.id === entry.game)?.art;
}

const loadStats = () => fetchCommunityStats();

/** The public stats page: what the Whizard community plays, and who wins. */
export function StatsPage() {
  const { data: stats, error, reload } = useLoaded(loadStats);

  return (
    <TopLayout variant="site" active="stats">
      <div className="community">
        <section className="community-hero" aria-labelledby="stats-title">
          <div className="community-hero-copy">
            <p className="pill community-pill">
              <Icon name="chart" size={18} />
              Community stats
            </p>
            <h1 id="stats-title" className="display community-title">
              The world
              <br />
              is playing
              <br />
              <span className="purple-text">Whizard</span>
            </h1>
            <p className="community-tagline">
              Real people. <span className="purple-text">Real games. Real fun.</span>
            </p>
            <p className="community-lead">
              From friends and families to classrooms and couples, Whizard brings people together
              through games.
            </p>
          </div>
          <img
            className="community-hero-art"
            src="/art/stats/hero.webp"
            alt=""
            aria-hidden="true"
            width={1200}
            height={772}
            fetchPriority="high"
          />
        </section>

        {error && !stats && (
          <p className="error" role="alert">
            Couldn’t load the stats. {error}{" "}
            <button className="btn-link" onClick={reload}>
              Try again
            </button>
          </p>
        )}

        <dl className="totals">
          <Total
            icon="games"
            tone="purple"
            label="Games played"
            value={stats?.totals.gamesPlayed}
          />
          <Total
            icon="users"
            tone="blue"
            label="Players joined"
            hint="Each player in each game counts once, so one player in three games counts three times."
            value={stats?.totals.playersJoined}
          />
          <Total
            icon="door"
            tone="orange"
            label="Game rooms created"
            value={stats?.totals.roomsCreated}
          />
          <Total
            icon="bolt"
            tone="pink"
            label="Questions played"
            hint="Each question counts once for every player in the game."
            value={stats?.totals.questionsPlayed}
          />
        </dl>

        <div className="community-panels">
          <MostPlayedGames entries={stats?.games} />
          <PopularTopics entries={stats?.topics} />
          <AroundTheWorld stats={stats} />
        </div>

        <CurrentlyPopular entries={stats?.trending} />
        <TopPlayers leaders={stats?.leaderboard} />

        <section className="community-cta panel" aria-labelledby="community-cta-title">
          <div className="community-cta-copy">
            <div className="community-cta-head">
              <span className="community-cta-icon" aria-hidden="true">
                <Icon name="games" size={30} />
              </span>
              <div>
                <h2 id="community-cta-title" className="community-cta-title">
                  Ready to be part of the fun?
                </h2>
                <p className="muted">Create a room, invite your friends, and start playing!</p>
              </div>
            </div>
            <div className="community-cta-actions">
              <CreateRoomButton className="btn btn-gold community-btn" />
              <a className="btn community-btn" {...linkTo("/games")}>
                Explore Games
              </a>
            </div>
          </div>
          <img
            className="community-cta-art"
            src="/art/stats/cta.webp"
            alt=""
            aria-hidden="true"
            width={900}
            height={481}
            loading="lazy"
          />
        </section>
      </div>
    </TopLayout>
  );
}

function Total({
  icon,
  tone,
  label,
  hint,
  value,
}: {
  icon: IconName;
  tone: string;
  label: string;
  /** How the number is counted, in a tooltip beside the label. */
  hint?: string;
  value: number | undefined;
}) {
  return (
    <div className={`total panel tone-${tone}`}>
      <span className="total-icon" aria-hidden="true">
        <Icon name={icon} size={30} />
      </span>
      <div className="total-text">
        <dd>{value === undefined ? "–" : n(value)}</dd>
        <dt>
          {label}
          {hint && (
            <Tooltip content={hint} className="hint-tip">
              <button className="hint-btn" aria-label={`About ${label.toLowerCase()}`}>
                <Icon name="info" size={15} />
              </button>
            </Tooltip>
          )}
        </dt>
      </div>
    </div>
  );
}

/** A panel with a title, an optional "View all" button and a body. */
function Panel({
  id,
  icon,
  title,
  canExpand,
  expanded,
  onToggle,
  children,
  className,
}: {
  id: string;
  icon: IconName;
  title: string;
  canExpand?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`community-panel panel ${className ?? ""}`} aria-labelledby={id}>
      <header className="community-panel-head">
        <h2 id={id} className="community-panel-title">
          <Icon name={icon} size={24} />
          {title}
        </h2>
        {canExpand && (
          <button className="view-all" aria-expanded={expanded} onClick={onToggle}>
            <ActionSwapCascadeText value={expanded ? "less" : "all"}>
              {expanded ? "Show less" : "View all"}
            </ActionSwapCascadeText>
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

interface BarRow {
  key: string;
  name: string;
  art?: string;
  count: number | null;
}

/** Ranked rows with a bar each. A null count is a game that's still being made. */
function BarList({ rows, rank, tone }: { rows: BarRow[]; rank?: boolean; tone: string }) {
  const top = Math.max(1, ...rows.map((r) => r.count ?? 0));
  return (
    <ol className={`bar-list tone-${tone}`}>
      {rows.map((row, i) => (
        <li key={row.key}>
          {rank && <span className="bar-rank">{i + 1}</span>}
          <span className="bar-art" aria-hidden="true">
            {row.art && <img src={row.art} alt="" loading="lazy" />}
          </span>
          <span className="bar-name">{row.name}</span>
          {row.count === null ? (
            <span className="bar-soon">Coming soon</span>
          ) : (
            <>
              <span className="bar-track" aria-hidden="true">
                <span
                  className="bar-fill"
                  style={{ "--share": `${(row.count / top) * 100}%` } as CSSProperties}
                />
              </span>
              <span className="bar-count">{n(row.count)}</span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

function MostPlayedGames({ entries }: { entries: StatsEntry[] | undefined }) {
  const [expanded, setExpanded] = useState(false);
  // Every game in the catalog: played ones by how often, then the ones still being made.
  const rows: BarRow[] = CATALOG.map((game) => ({
    key: game.id,
    name: game.name,
    art: game.art,
    count: entries?.find((e) => e.name === game.id)?.count ?? (game.href ? 0 : null),
  })).sort((a, b) => (b.count ?? -1) - (a.count ?? -1));
  return (
    <Panel
      id="games-title"
      icon="games"
      title="Most Played Games"
      canExpand={rows.length > SHORT_LIST}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
    >
      {entries === undefined ? (
        <PanelLoading />
      ) : (
        <BarList rows={expanded ? rows : rows.slice(0, SHORT_LIST)} rank tone="purple" />
      )}
    </Panel>
  );
}

function PopularTopics({ entries }: { entries: StatsEntry[] | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const rows: BarRow[] = (entries ?? []).map((e) => ({
    key: e.name,
    name: topicName(e.name),
    art: topicArt(e.name),
    count: e.count,
  }));
  return (
    <Panel
      id="topics-title"
      icon="layers"
      title="Most Popular Topics"
      canExpand={rows.length > SHORT_LIST}
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
    >
      {entries === undefined ? (
        <PanelLoading />
      ) : rows.length === 0 ? (
        <p className="muted panel-empty">No quiz games yet. Be the first!</p>
      ) : (
        <BarList rows={expanded ? rows : rows.slice(0, SHORT_LIST)} tone="gold" />
      )}
    </Panel>
  );
}

function AroundTheWorld({ stats }: { stats: CommunityStats | undefined | null }) {
  const shares = stats ? countryShares(stats.countries, stats.countriesTotal) : [];
  const pins = (stats?.countries ?? [])
    .filter((c) => WORLD_PINS[c.name])
    .map((c) => ({
      code: c.name,
      at: WORLD_PINS[c.name]!,
      share: c.count / stats!.countriesTotal,
    }));
  return (
    <Panel id="world-title" icon="globe" title="Whizard Around the World" className="world-panel">
      <div className="world-map" aria-hidden="true">
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
      {!stats ? (
        <PanelLoading />
      ) : shares.length === 0 ? (
        <p className="muted panel-empty">No visitors counted yet.</p>
      ) : (
        <ul className="country-list">
          {shares.map((s) => (
            <li key={s.code}>
              <span className="country-flag" aria-hidden="true">
                {s.code === "other" ? <Icon name="globe" size={18} /> : flag(s.code)}
              </span>
              <span className="country-name">
                {s.code === "other" ? "Other" : (regionNames?.of(s.code) ?? s.code)}
              </span>
              <span className="country-share">{s.percent}%</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function CurrentlyPopular({ entries }: { entries: TrendingEntry[] | undefined }) {
  return (
    <section className="trending panel" aria-labelledby="trending-title">
      <header className="trending-head">
        <h2 id="trending-title" className="community-panel-title trending-title">
          <Icon name="flame" size={26} fill />
          Currently Popular
        </h2>
        <p className="trending-live">
          <span className="live-dot" aria-hidden="true" />
          Live from the Whizard community · last 24 hours
        </p>
      </header>
      {entries === undefined ? (
        <PanelLoading />
      ) : entries.length === 0 ? (
        <p className="muted panel-empty">
          Nothing played in the last 24 hours yet.{" "}
          <a className="btn-link" {...linkTo("/games")}>
            Start the first game
          </a>
        </p>
      ) : (
        <ul className="trending-list">
          {entries.map((entry) => {
            const art = trendingArt(entry);
            return (
              <li key={`${entry.game}:${entry.topic ?? ""}`}>
                <a
                  className="trending-card"
                  {...linkTo(entry.game === "quiz" ? "/games/quiz" : "/games")}
                >
                  <span className="trending-art" aria-hidden="true">
                    {art && <img src={art} alt="" loading="lazy" />}
                  </span>
                  <span className="trending-text">
                    <strong>{trendingName(entry)}</strong>
                    <span className="muted small">
                      {n(entry.games)} {entry.games === 1 ? "game" : "games"}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={20} className="trending-chevron" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TopPlayers({ leaders }: { leaders: LeaderboardEntry[] | undefined }) {
  const [full, setFull] = useState(false);
  const podium = leaders?.slice(0, PODIUM) ?? [];
  const rest = leaders?.slice(PODIUM, full ? undefined : LEADERBOARD_SHORT) ?? [];
  // The podium reads 2, 1, 3 from left to right.
  const podiumOrder = [podium[1], podium[0], podium[2]]
    .map((leader, i) => leader && { leader, place: [2, 1, 3][i]! })
    .filter((p) => p !== undefined);

  return (
    <section className="top-players panel" aria-labelledby="top-players-title">
      <header className="community-panel-head">
        <div className="top-players-heading">
          <h2 id="top-players-title" className="community-panel-title top-players-title">
            <Icon name="crown" size={28} fill />
            Top Players
          </h2>
          <p className="muted small">Most wins in games with friends</p>
        </div>
        {leaders && leaders.length > LEADERBOARD_SHORT && (
          <button className="view-all" aria-expanded={full} onClick={() => setFull(!full)}>
            <ActionSwapCascadeText value={full ? "less" : "all"}>
              {full ? "Show less" : "View full leaderboard"}
            </ActionSwapCascadeText>
          </button>
        )}
      </header>

      {leaders === undefined ? (
        <PanelLoading />
      ) : leaders.length === 0 ? (
        <p className="muted panel-empty">
          No one on the leaderboard yet. Signed-in players can choose to appear here from their{" "}
          <a className="btn-link" {...linkTo("/account#settings")}>
            settings
          </a>
          .
        </p>
      ) : (
        <div className="top-players-body">
          <ol className="top-podium">
            {podiumOrder.map(({ leader, place }) => (
              <li key={leader.username} className={`top-step top-${place}`}>
                <span className="top-avatar">
                  {place === 1 && <Icon name="crown" size={34} fill className="top-crown" />}
                  <Avatar id={leader.avatar} name={leader.username} size={place === 1 ? 76 : 64} />
                  <span className="top-rank">{place}</span>
                </span>
                <strong className="top-name">{leader.displayName}</strong>
                <span className="top-wins">{winsLabel(leader.wins)}</span>
              </li>
            ))}
          </ol>
          {rest.length > 0 && (
            <ol className="leader-list" start={PODIUM + 1}>
              {rest.map((leader, i) => (
                <li key={leader.username}>
                  <span className="leader-rank">{PODIUM + 1 + i}</span>
                  <Avatar id={leader.avatar} name={leader.username} size={34} />
                  <span className="leader-name">{leader.displayName}</span>
                  <span className="leader-wins">{winsLabel(leader.wins)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function winsLabel(wins: number): string {
  return `${n(wins)} ${wins === 1 ? "win" : "wins"}`;
}

function PanelLoading() {
  return <Loading />;
}
