import { QUIZ_CATEGORIES, QUIZ_VARIANTS } from "@whizard/game-core";
import { STATS_RANGES, type StatsDay, type StatsEntry, type StatsRange } from "@whizard/protocol";
import { useCallback, useState, type CSSProperties } from "react";
import { fetchSiteStats } from "../api";
import { usePresence } from "../presence";
import { TopLayout } from "../ui/Chrome";
import { useLoaded } from "../ui/common";

const n = (value: number) => value.toLocaleString("en-US");

const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  games: "Games",
  topics: "Quiz topics",
  room: "Game rooms",
  account: "Profile",
  friends: "Friends",
  add: "Add a friend",
  group: "Groups",
  privacy: "Privacy",
  stats: "Stats",
  pricing: "Pricing",
  other: "Other",
};

const DEVICE_LABELS: Record<string, string> = {
  phone: "Phones",
  tablet: "Tablets",
  desktop: "Computers",
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

function countryLabel(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "Unknown";
  const flag = String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
  return `${flag} ${regionNames?.of(code) ?? code}`;
}

function sourceLabel(source: string): string {
  return source === "direct" ? "Direct or unknown" : source;
}

function topicLabel(id: string): string {
  return QUIZ_CATEGORIES.find((c) => c.id === id)?.name ?? id;
}

function modeLabel(id: string): string {
  return QUIZ_VARIANTS.find((v) => v.id === id)?.name ?? id;
}

function duration(seconds: number | null): string {
  if (seconds === null) return "–";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Public, site-wide numbers: who's been by, and what they played. */
export function StatsPage() {
  const [range, setRange] = useState<StatsRange>(30);
  const load = useCallback(() => fetchSiteStats(range), [range]);
  const { data: stats, error, reload } = useLoaded(load);
  const presence = usePresence();

  return (
    <TopLayout variant="site" active={null}>
      <section className="stats" aria-labelledby="stats-title">
        <header className="stats-head">
          <div>
            <p className="eyebrow">Stats</p>
            <h1 id="stats-title" className="page-title">
              Who’s been <span className="gradient-text">playing</span>
            </h1>
          </div>
          <div className="stats-controls">
            {presence && (
              <span className="here-now">
                <span className="live-dot" aria-hidden="true" />
                {n(presence.online)} here now
              </span>
            )}
            <div className="range-switch" role="group" aria-label="Time range">
              {STATS_RANGES.map((r) => (
                <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
                  {r}d
                </button>
              ))}
            </div>
          </div>
        </header>

        {error && !stats && (
          <p className="error" role="alert">
            Couldn’t load the stats. {error}{" "}
            <button className="btn-link" onClick={reload}>
              Try again
            </button>
          </p>
        )}

        <dl className={stats ? "stat-tiles" : "stat-tiles loading"}>
          <Tile label="Visitors" value={stats && n(stats.totals.visitors)} />
          <Tile label="Visits" value={stats && n(stats.totals.visits)} />
          <Tile label="Page views" value={stats && n(stats.totals.pageViews)} />
          <Tile label="Rooms created" value={stats && n(stats.totals.roomsCreated)} />
          <Tile label="Games played" value={stats && n(stats.totals.gamesPlayed)} />
          <Tile label="Avg. visit" value={stats && duration(stats.totals.averageVisitSeconds)} />
        </dl>

        <DayChart
          title={`Visitors per day · last ${range} days`}
          unit="visitors"
          days={stats?.days ?? null}
          value={(d) => d.visitors}
        />
        <DayChart
          title={`Games played per day · last ${range} days`}
          unit="games"
          days={stats?.days ?? null}
          value={(d) => d.games}
        />

        <div className="stat-panels">
          <Breakdown title="Top pages" entries={stats?.pages} label={(p) => PAGE_LABELS[p] ?? p} />
          <Breakdown
            title="Where visitors came from"
            entries={stats?.sources}
            label={sourceLabel}
          />
          <Breakdown title="Countries" entries={stats?.countries} label={countryLabel} />
          <Breakdown title="Quiz topics played" entries={stats?.topics} label={topicLabel} />
          <Breakdown
            title="Devices"
            entries={stats?.devices}
            label={(d) => DEVICE_LABELS[d] ?? d}
          />
          <Breakdown title="Game modes" entries={stats?.modes} label={modeLabel} />
        </div>

        <p className="muted stats-note">
          Days are in UTC. Visitors are counted once however often they come back. Where people came
          from, their country and their device are counted on their first visit. Nothing here
          identifies anyone.
        </p>
      </section>
    </TopLayout>
  );
}

function Tile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="stat-tile">
      <dt>{label}</dt>
      <dd>{value ?? "–"}</dd>
    </div>
  );
}

function DayChart({
  title,
  unit,
  days,
  value,
}: {
  title: string;
  unit: string;
  days: StatsDay[] | null;
  value: (day: StatsDay) => number;
}) {
  const values = days?.map(value) ?? [];
  const peak = Math.max(0, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const first = days?.[0];
  const last = days?.[days.length - 1];

  return (
    <figure className="panel day-chart">
      <figcaption className="chart-title">{title}</figcaption>
      <div
        className="bars"
        role="img"
        aria-label={days ? `${n(total)} ${unit} in total, at most ${n(peak)} in a day` : "Loading"}
      >
        {days?.map((day, i) => {
          const v = values[i] ?? 0;
          return (
            <span
              key={day.day}
              className={v > 0 ? "bar" : "bar empty"}
              style={{ height: peak > 0 && v > 0 ? `max(3px, ${(v / peak) * 100}%)` : undefined }}
              title={`${shortDate(day.day)}: ${n(v)} ${unit}`}
            />
          );
        })}
      </div>
      <div className="chart-axis" aria-hidden="true">
        <span>{first ? shortDate(first.day) : ""}</span>
        <span>peak {n(peak)} / day</span>
        <span>{last ? shortDate(last.day) : ""}</span>
      </div>
    </figure>
  );
}

function Breakdown({
  title,
  entries,
  label,
}: {
  title: string;
  entries: StatsEntry[] | undefined;
  label: (name: string) => string;
}) {
  const top = entries?.[0]?.count ?? 0;
  return (
    <section className="panel breakdown">
      <h2 className="chart-title">{title}</h2>
      {entries === undefined ? null : entries.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ol>
          {entries.map((e) => (
            <li key={e.name} style={{ "--share": `${(e.count / top) * 100}%` } as CSSProperties}>
              <span className="breakdown-name">{label(e.name)}</span>
              <span className="breakdown-count">{n(e.count)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
