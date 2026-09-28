import { QUIZ_CATEGORIES, QUIZ_VARIANTS } from "@whizard/game-core";
import { STATS_RANGES, type AdminAnalytics, type StatsRange } from "@whizard/protocol";
import { useCallback } from "react";
import { fetchAdminAnalytics } from "../api";
import { TOPIC_STYLES } from "../catalog";
import { countryFlag, countryName, formatNumber, formatPercent } from "../format";
import { GamesChart } from "./GamesChart";
import {
  Bar,
  countChange,
  KpiTiles,
  PanelHead,
  RankPanel,
  StatBox,
  useRefreshing,
  type Change,
} from "./parts";

const REFRESH_MS = 60_000;

const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  games: "Games",
  topics: "Quiz topics",
  jigsaw: "Jigsaw",
  room: "In a room",
  account: "Account",
  friends: "Friends",
  groups: "Groups",
  privacy: "Privacy",
  stats: "Stats",
  pricing: "Pricing",
  about: "About",
  admin: "Admin",
};

const DEVICE_LABELS: Record<string, string> = {
  phone: "Phone",
  tablet: "Tablet",
  desktop: "Computer",
};

/** Five a list, as on the dashboard, so panels side by side stay the same height. */
const TOP = 5;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sourceLabel = (s: string) => (s === "direct" ? "Direct or unknown" : s);

function duration(seconds: number | null): string {
  if (seconds === null) return "–";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function secondsChange(value: number | null, previous: number | null): Change {
  if (value === null || previous === null || previous === 0) return { text: "–", up: null };
  return countChange(value, previous);
}

/** `/admin/analytics`: who visits, from where, and what they look at. */
export function Analytics({
  range,
  onRange,
}: {
  range: StatsRange;
  onRange: (range: StatsRange) => void;
}) {
  const load = useCallback(() => fetchAdminAnalytics(range), [range]);
  const { data, error } = useRefreshing(load, REFRESH_MS);

  if (error && !data) {
    return (
      <p className="error" role="alert">
        Couldn’t load the analytics. {error}
      </p>
    );
  }
  const s = data?.stats;
  const note = `vs previous ${range} days`;

  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      <KpiTiles
        tiles={[
          {
            tone: "purple",
            icon: "users",
            label: "Visitors",
            value: s ? formatNumber(s.totals.visitors) : "–",
            note: "different people",
          },
          {
            tone: "blue",
            icon: "userPlus",
            label: "New Visitors",
            value: data ? formatNumber(data.newVisitors.value) : "–",
            ...(data && { change: countChange(data.newVisitors.value, data.newVisitors.previous) }),
            note,
          },
          {
            tone: "orange",
            icon: "door",
            label: "Visits",
            value: data ? formatNumber(data.visits.value) : "–",
            ...(data && { change: countChange(data.visits.value, data.visits.previous) }),
            note,
          },
          {
            tone: "pink",
            icon: "layers",
            label: "Page Views",
            value: data ? formatNumber(data.pageViews.value) : "–",
            ...(data && { change: countChange(data.pageViews.value, data.pageViews.previous) }),
            note,
          },
          {
            tone: "green",
            icon: "clock",
            label: "Avg. Visit",
            value: data ? duration(data.averageVisitSeconds.value) : "–",
            ...(data && {
              change: secondsChange(
                data.averageVisitSeconds.value,
                data.averageVisitSeconds.previous,
              ),
            }),
            note,
          },
        ]}
      />

      <section className="panel admin-panel span-8 chart-panel" aria-labelledby="visitors-title">
        <PanelHead
          id="visitors-title"
          icon="users"
          title="Visitors Over Time"
          subtitle="Different people who visited each day"
        >
          <div className="range-switch admin-switch" role="group" aria-label="Chart range">
            {STATS_RANGES.map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => onRange(r)}>
                {r}d
              </button>
            ))}
          </div>
        </PanelHead>
        <GamesChart
          days={(s?.days ?? []).map((d) => ({ day: d.day, count: d.visitors }))}
          unit={["visitor", "visitors"]}
          what="visitor days"
        />
      </section>

      <NewAndReturning data={data} range={range} />

      <RankPanel
        title="Top Pages"
        icon="layers"
        entries={s?.pages.slice(0, TOP)}
        label={(id) => PAGE_LABELS[id] ?? capitalise(id)}
        empty="No page views yet."
      />
      <RankPanel
        title="Where New Visitors Came From"
        icon="link2"
        entries={s?.sources.slice(0, TOP)}
        label={sourceLabel}
        empty="No new visitors yet."
        tone="blue"
      />
      <Shares
        title="New Visitors by Country"
        icon="globe"
        entries={s?.countries}
        label={(code) => `${countryFlag(code) || "🌍"} ${countryName(code)}`}
        empty="No new visitors yet."
      />

      <Shares
        title="New Visitors’ Devices"
        icon="phone"
        entries={s?.devices}
        label={(id) => DEVICE_LABELS[id] ?? capitalise(id)}
        empty="No new visitors yet."
      />
      <RankPanel
        title="Topics Started"
        icon="help"
        entries={s?.topics.slice(0, TOP)}
        label={(id) => QUIZ_CATEGORIES.find((c) => c.id === id)?.name ?? id}
        art={(id) => TOPIC_STYLES[id as keyof typeof TOPIC_STYLES]?.art}
        empty="No quiz games yet."
        tone="blue"
        leaderTone="gold"
      />
      <Shares
        title="Game Modes"
        icon="games"
        entries={s?.modes}
        label={(id) => QUIZ_VARIANTS.find((v) => v.id === id)?.name ?? capitalise(id)}
        empty="No quiz games yet."
      />
    </div>
  );
}

function NewAndReturning({ data, range }: { data: AdminAnalytics | null; range: StatsRange }) {
  const visitors = data?.stats.totals.visitors ?? 0;
  const returning = data?.returningVisitors ?? 0;
  const newOnes = Math.max(0, visitors - returning);
  const perVisitor = data && visitors > 0 ? data.visits.value / visitors : null;
  return (
    <section className="panel admin-panel span-4" aria-labelledby="returning-title">
      <PanelHead id="returning-title" icon="repeat" title="New and Returning" />
      <div className="room-stats two">
        <StatBox label="First Visit" value={data ? formatNumber(newOnes) : "–"} />
        <StatBox label="Came Back" value={data ? formatNumber(returning) : "–"} />
      </div>
      <ul className="share-list plain">
        <li>
          <span className="share-name">Returning</span>
          <Bar share={visitors ? returning / visitors : 0} />
          <span className="share-value">
            {visitors ? formatPercent(returning / visitors) : "–"}
          </span>
        </li>
      </ul>
      <div className="room-stats two">
        <StatBox
          label="Visits per Visitor"
          value={perVisitor === null ? "–" : perVisitor.toFixed(1)}
        />
        <StatBox
          label="Sign-ups"
          value={data ? formatNumber(data.accountsCreated.value) : "–"}
          {...(data && {
            change: countChange(data.accountsCreated.value, data.accountsCreated.previous),
          })}
        />
      </div>
      <p className="admin-note">
        Returning visitors first came before the last {range} days. People are recognised by browser
        and network, so the numbers lean low rather than high.
      </p>
    </section>
  );
}

/** A breakdown as shares of its whole total, e.g. phones 70%, computers 30%; the top five. */
function Shares({
  title,
  icon,
  entries,
  label,
  empty,
}: {
  title: string;
  icon: Parameters<typeof PanelHead>[0]["icon"];
  entries: { name: string; count: number }[] | undefined;
  label: (name: string) => string;
  empty: string;
}) {
  const total = (entries ?? []).reduce((sum, e) => sum + e.count, 0);
  return (
    <section className="panel admin-panel span-4" aria-label={title}>
      <PanelHead icon={icon} title={title} />
      {entries && total === 0 ? (
        <p className="admin-empty">{empty}</p>
      ) : (
        <ul className="share-list plain">
          {(entries ?? []).slice(0, TOP).map((e) => (
            <li key={e.name}>
              <span className="share-name">{label(e.name)}</span>
              <Bar share={total ? e.count / total : 0} />
              <span className="share-value">{formatPercent(e.count / total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
