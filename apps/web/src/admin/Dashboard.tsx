import { QUIZ_CATEGORIES } from "@whizard/game-core";
import {
  STATS_RANGES,
  type ActivityItem,
  type AdminOverview,
  type StatsEntry,
  type StatsRange,
} from "@whizard/protocol";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fetchAdminActivity, fetchAdminOverview } from "../api";
import { CATALOG, TOPIC_STYLES } from "../catalog";
import { countryFlag, countryName, formatNumber, formatPercent, timeAgo } from "../format";
import { Icon, type IconName } from "../ui/Icon";
import { GamesChart } from "./GamesChart";
import {
  amountChange,
  countChange,
  KpiTiles,
  pointsChange,
  RankPanel,
  StatBox,
  useRefreshing,
  Bar,
  type KpiTile,
} from "./parts";

const OVERVIEW_REFRESH_MS = 60_000;
const ACTIVITY_REFRESH_MS = 15_000;

const topicName = (id: string | null | undefined) =>
  QUIZ_CATEGORIES.find((c) => c.id === id)?.name ?? "Quiz";
const gameName = (id: string) => CATALOG.find((g) => g.id === id)?.name ?? id;

export function Dashboard({
  range,
  onRange,
  onOpenReports,
}: {
  range: StatsRange;
  onRange: (range: StatsRange) => void;
  onOpenReports: (count: number) => void;
}) {
  const load = useCallback(() => fetchAdminOverview(range), [range]);
  const { data, error } = useRefreshing(load, OVERVIEW_REFRESH_MS);

  useEffect(() => {
    if (data) onOpenReports(data.openReports);
  }, [data, onOpenReports]);

  if (error && !data) {
    return (
      <p className="error" role="alert">
        Couldn’t load the dashboard. {error}
      </p>
    );
  }

  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      <Kpis data={data} range={range} />

      <section className="panel admin-panel span-8 chart-panel" aria-labelledby="chart-title">
        <div className="admin-panel-head">
          <span className="admin-panel-icon">
            <Icon name="games" size={26} />
          </span>
          <div>
            <h2 id="chart-title">Games Played Over Time</h2>
            <p>Total completed games per day</p>
          </div>
          <div className="range-switch admin-switch" role="group" aria-label="Chart range">
            {STATS_RANGES.map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => onRange(r)}>
                {r}d
              </button>
            ))}
          </div>
        </div>
        <GamesChart days={data?.gamesPerDay ?? []} />
      </section>

      <LiveActivity />

      <RankPanel
        title="Most Played Games"
        icon="games"
        entries={data?.games}
        label={gameName}
        art={(id) => CATALOG.find((g) => g.id === id)?.art}
        empty="No games finished yet."
      />
      <RankPanel
        title="Most Popular Topics"
        icon="layers"
        entries={data?.topics}
        label={topicName}
        art={(id) => TOPIC_STYLES[id as keyof typeof TOPIC_STYLES]?.art}
        empty="No quiz games finished yet."
        leaderTone="gold"
        tone="blue"
      />
      <PlayersPerRoom entries={data?.playersPerGame} />

      <Retention data={data} range={range} />
      <Countries entries={data?.countries} />
      <RoomBehaviour data={data} />
    </div>
  );
}

// KPIs ----------------------------------------------------------------------------------------

function Kpis({ data, range }: { data: AdminOverview | null; range: StatsRange }) {
  const k = data?.kpis;
  const tiles: Omit<KpiTile, "note">[] = [
    {
      tone: "purple",
      icon: "games",
      label: "Games Played",
      value: k ? formatNumber(k.gamesPlayed.value) : "–",
      change: k
        ? countChange(k.gamesPlayed.value, k.gamesPlayed.previous)
        : { text: "–", up: null },
    },
    {
      tone: "blue",
      icon: "users",
      label: "Unique Players",
      value: k ? formatNumber(k.uniquePlayers.value) : "–",
      change: k
        ? countChange(k.uniquePlayers.value, k.uniquePlayers.previous)
        : { text: "–", up: null },
    },
    {
      tone: "orange",
      icon: "door",
      label: "Rooms Created",
      value: k ? formatNumber(k.roomsCreated.value) : "–",
      change: k
        ? countChange(k.roomsCreated.value, k.roomsCreated.previous)
        : { text: "–", up: null },
    },
    {
      tone: "pink",
      icon: "checkCircle",
      label: "Completion Rate",
      value: k?.completionRate.value != null ? formatPercent(k.completionRate.value, 1) : "–",
      change: k
        ? pointsChange(k.completionRate.value, k.completionRate.previous)
        : { text: "–", up: null },
    },
    {
      tone: "green",
      icon: "users",
      label: "Avg. Players / Room",
      value: k?.avgPlayersPerRoom.value != null ? k.avgPlayersPerRoom.value.toFixed(1) : "–",
      change: k
        ? amountChange(k.avgPlayersPerRoom.value, k.avgPlayersPerRoom.previous)
        : { text: "–", up: null },
    },
  ];
  return <KpiTiles tiles={tiles.map((t) => ({ ...t, note: `vs previous ${range} days` }))} />;
}

// Live activity -------------------------------------------------------------------------------

const ACTIVITY: Record<
  ActivityItem["kind"],
  { title: string; icon: IconName; tone: string; detail: (d: ActivityItem["detail"]) => string }
> = {
  room_created: {
    title: "New room created",
    icon: "games",
    tone: "purple",
    detail: (d) => (d.topic ? `${topicName(String(d.topic))} Quiz` : gameName(String(d.game))),
  },
  player_joined: {
    title: "Player joined",
    icon: "user",
    tone: "blue",
    detail: (d) => `Room ${String(d.room ?? "")}`,
  },
  game_finished: {
    title: "Game completed",
    icon: "trophy",
    tone: "gold",
    detail: (d) => {
      const players = Number(d.players ?? 0);
      const what = d.topic ? topicName(d.topic as string) : gameName(String(d.game ?? "quiz"));
      return `${what} • ${players} ${players === 1 ? "player" : "players"}`;
    },
  },
  account_created: {
    title: "New user signed up",
    icon: "userPlus",
    tone: "green",
    detail: (d) => (d.country ? `from ${countryName(String(d.country))}` : "New account"),
  },
};

function LiveActivity() {
  const { data } = useRefreshing(fetchAdminActivity, ACTIVITY_REFRESH_MS);
  const [all, setAll] = useState(false);
  const items = data ?? [];
  const shown = all ? items : items.slice(0, 5);
  return (
    <section className="panel admin-panel span-4 activity-panel" aria-labelledby="activity-title">
      <div className="admin-panel-head">
        <span className="live-dot" aria-hidden="true" />
        <h2 id="activity-title">Live Activity</h2>
        {items.length > 5 && (
          <button className="admin-more" onClick={() => setAll(!all)}>
            {all ? "Show less" : "View all"}
            <Icon name="arrowRight" size={16} />
          </button>
        )}
      </div>
      {data && items.length === 0 ? (
        <p className="admin-empty">Nothing yet. New rooms, games and sign-ups show up here.</p>
      ) : (
        <ul className="activity-list">
          {shown.map((item, i) => {
            const look = ACTIVITY[item.kind];
            return (
              <li key={`${item.at}-${i}`}>
                <span className={`activity-icon tone-${look.tone}`} aria-hidden="true">
                  <Icon name={look.icon} size={22} />
                </span>
                <span className="activity-text">
                  <strong>{look.title}</strong>
                  <span>{look.detail(item.detail)}</span>
                </span>
                <time dateTime={new Date(item.at).toISOString()}>{timeAgo(item.at)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Ranked lists --------------------------------------------------------------------------------

const SIZE_LABELS: Record<string, string> = {
  "2": "2 players",
  "3-5": "3–5 players",
  "6-10": "6–10 players",
  "11+": "11+ players",
};

function PlayersPerRoom({ entries }: { entries: StatsEntry[] | undefined }) {
  const total = (entries ?? []).reduce((sum, e) => sum + e.count, 0);
  return (
    <section className="panel admin-panel span-4" aria-labelledby="size-title">
      <div className="admin-panel-head">
        <span className="admin-panel-icon">
          <Icon name="users" size={26} />
        </span>
        <h2 id="size-title">Players per Room</h2>
      </div>
      {entries && total === 0 ? (
        <p className="admin-empty">No games with friends yet.</p>
      ) : (
        <ul className="share-list">
          {(entries ?? []).map((e) => (
            <li key={e.name}>
              <Icon name="users" size={22} />
              <span className="share-name">{SIZE_LABELS[e.name] ?? e.name}</span>
              <Bar share={total ? e.count / total : 0} />
              <span className="share-value">{total ? formatPercent(e.count / total) : "–"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Retention -----------------------------------------------------------------------------------

function Retention({ data, range }: { data: AdminOverview | null; range: StatsRange }) {
  const r = data?.retention;
  const rows: [string, number | null | undefined][] = [
    ["Day 1", r?.day1],
    ["Day 7", r?.day7],
    ["Day 30", r?.day30],
  ];
  return (
    <section className="panel admin-panel span-4" aria-labelledby="retention-title">
      <div className="admin-panel-head">
        <span className="admin-panel-icon">
          <Icon name="repeat" size={26} />
        </span>
        <h2 id="retention-title">Player Retention</h2>
        <span
          className="admin-info"
          title={`New players first played in the last ${range} days; returning players had played on an earlier day. Day 1, 7 and 30: of the new players, how many came back within that many days.`}
        >
          <Icon name="info" size={18} />
        </span>
      </div>
      <div className="retention">
        <StatBox
          label="New Players"
          value={r ? formatNumber(r.newPlayers.value) : "–"}
          change={r ? countChange(r.newPlayers.value, r.newPlayers.previous) : undefined}
        />
        <StatBox
          label="Returning Players"
          value={r ? formatNumber(r.returningPlayers.value) : "–"}
          change={
            r ? countChange(r.returningPlayers.value, r.returningPlayers.previous) : undefined
          }
        />
        <ul className="share-list retention-days">
          {rows.map(([label, value]) => (
            <li key={label}>
              <span className="share-name">{label}</span>
              <Bar share={value ?? 0} />
              <span className="share-value">{value == null ? "–" : formatPercent(value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// Countries and rooms -------------------------------------------------------------------------

function Countries({ entries }: { entries: StatsEntry[] | undefined }) {
  const total = (entries ?? []).reduce((sum, e) => sum + e.count, 0);
  return (
    <section className="panel admin-panel span-4" aria-labelledby="countries-title">
      <div className="admin-panel-head">
        <span className="admin-panel-icon">
          <Icon name="globe" size={26} />
        </span>
        <h2 id="countries-title">Where Players Came From</h2>
      </div>
      {entries && total === 0 ? (
        <p className="admin-empty">No new visitors in this period.</p>
      ) : (
        <ul className="share-list">
          {(entries ?? []).map((e) => (
            <li key={e.name}>
              <span className="flag" aria-hidden="true">
                {countryFlag(e.name) || "🌍"}
              </span>
              <span className="share-name">{countryName(e.name)}</span>
              <Bar share={total ? e.count / total : 0} />
              <span className="share-value">{formatPercent(e.count / total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoomBehaviour({ data }: { data: AdminOverview | null }) {
  const r = data?.rooms;
  const pct = (v: number | null | undefined, digits = 0): ReactNode =>
    v == null ? "–" : formatPercent(v, digits);
  return (
    <section className="panel admin-panel span-4" aria-labelledby="rooms-title">
      <div className="admin-panel-head">
        <span className="admin-panel-icon tone-gold">
          <Icon name="users" size={26} />
        </span>
        <h2 id="rooms-title">Room Behaviour</h2>
      </div>
      <div className="room-stats">
        <StatBox
          label="Avg. Invites per Room"
          value={r?.invitesPerRoom == null ? "–" : r.invitesPerRoom.toFixed(1)}
        />
        <StatBox label="Join Rate" value={String(pct(r?.joinRate))} />
        <StatBox label="Rematch Rate" value={String(pct(r?.rematchRate, 1))} />
      </div>
      <div className="solo-rooms">
        <span className="activity-icon tone-blue" aria-hidden="true">
          <Icon name="link2" size={22} />
        </span>
        <span className="activity-text">
          <strong>Rooms with no other players</strong>
          <span>These rooms were not joined by anyone else.</span>
        </span>
        <span className="solo-value">{pct(r?.soloRate)}</span>
      </div>
    </section>
  );
}
