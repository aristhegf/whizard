import type { StatsEntry } from "@whizard/protocol";
import { useEffect, type ReactNode } from "react";
import { formatNumber, formatPercent } from "../format";
import { useLoaded } from "../ui/common";
import { Icon, type IconName } from "../ui/Icon";

// Shared pieces of the admin pages.

/** Refetches every `ms` while the page is open. */
export function useRefreshing<T>(load: () => Promise<T>, ms: number) {
  const result = useLoaded(load);
  const { reload } = result;
  useEffect(() => {
    const timer = setInterval(reload, ms);
    return () => clearInterval(timer);
  }, [reload, ms]);
  return result;
}

export type Change = { text: string; up: boolean | null };

export function countChange(value: number, previous: number): Change {
  if (previous === 0) return value > 0 ? { text: "New", up: true } : { text: "–", up: null };
  const pct = (value - previous) / previous;
  return { text: formatPercent(Math.abs(pct)), up: pct >= 0 };
}

export function pointsChange(value: number | null, previous: number | null): Change {
  if (value === null || previous === null) return { text: "–", up: null };
  const diff = (value - previous) * 100;
  return { text: `${Math.abs(diff).toFixed(1)}%`, up: diff >= 0 };
}

export function amountChange(value: number | null, previous: number | null): Change {
  if (value === null || previous === null) return { text: "–", up: null };
  const diff = value - previous;
  return { text: Math.abs(diff).toFixed(1), up: diff >= 0 };
}

export interface KpiTile {
  tone: string;
  icon: IconName;
  label: string;
  value: string;
  change?: Change;
  /** Under the change, e.g. "vs previous 30 days". */
  note: string;
}

/** A row of coloured headline tiles; four or five across on wide screens. */
export function KpiTiles({ tiles }: { tiles: KpiTile[] }) {
  return (
    <dl className={tiles.length === 4 ? "admin-kpis four" : "admin-kpis"}>
      {tiles.map((t) => (
        <div key={t.label} className={`admin-kpi tone-${t.tone}`}>
          <span className="admin-kpi-icon" aria-hidden="true">
            <Icon name={t.icon} size={34} stroke={2.2} />
          </span>
          <div className="admin-kpi-text">
            <dt>{t.label}</dt>
            <dd>{t.value}</dd>
            {t.change && (
              <p className={`admin-change${t.change.up === false ? " down" : ""}`}>
                {t.change.up !== null && <span aria-hidden="true">{t.change.up ? "↑" : "↓"}</span>}{" "}
                {t.change.text}
              </p>
            )}
            <p className="admin-vs">{t.note}</p>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** A panel's title row, with an icon and anything else (a switch, a button) on the right. */
export function PanelHead({
  id,
  icon,
  title,
  subtitle,
  tone,
  children,
}: {
  id?: string;
  icon: IconName;
  title: string;
  subtitle?: string;
  tone?: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-panel-head">
      <span className={tone ? `admin-panel-icon tone-${tone}` : "admin-panel-icon"}>
        <Icon name={icon} size={26} />
      </span>
      {subtitle ? (
        <div>
          <h2 id={id}>{title}</h2>
          <p>{subtitle}</p>
        </div>
      ) : (
        <h2 id={id}>{title}</h2>
      )}
      {children}
    </div>
  );
}

export function RankPanel({
  title,
  icon,
  entries,
  label,
  art,
  empty,
  leaderTone,
  tone,
  className = "span-4",
}: {
  title: string;
  icon: IconName;
  entries: StatsEntry[] | undefined;
  label: (id: string) => string;
  art?: (id: string) => string | undefined;
  empty: string;
  leaderTone?: string;
  tone?: string;
  className?: string;
}) {
  const top = entries?.[0]?.count ?? 0;
  return (
    <section className={`panel admin-panel ${className}`} aria-label={title}>
      <div className="admin-panel-head">
        <span className="admin-panel-icon">
          <Icon name={icon} size={26} />
        </span>
        <h2>{title}</h2>
      </div>
      {entries && entries.length === 0 ? (
        <p className="admin-empty">{empty}</p>
      ) : (
        <ol className={art ? "rank-list" : "rank-list no-art"}>
          {(entries ?? []).map((e, i) => (
            <li key={e.name}>
              <span className="rank">{i + 1}</span>
              {art && (
                <span className="rank-art">
                  {art(e.name) && <img src={art(e.name)} alt="" loading="lazy" />}
                </span>
              )}
              <span className="rank-name">{label(e.name)}</span>
              <Bar
                share={top ? e.count / top : 0}
                tone={i === 0 && leaderTone ? leaderTone : tone}
              />
              <span className="rank-count">{formatNumber(e.count)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Bar({ share, tone }: { share: number; tone?: string | undefined }) {
  return (
    <span className="admin-bar" aria-hidden="true">
      <span
        className={tone ? `tone-${tone}` : undefined}
        style={{ width: `${Math.max(share > 0 ? 3 : 0, share * 100)}%` }}
      />
    </span>
  );
}

export function StatBox({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: Change;
}) {
  return (
    <div className="stat-box">
      <span className="stat-box-label">{label}</span>
      <strong className="stat-box-value">{value}</strong>
      {change && (
        <span className={`admin-change${change.up === false ? " down" : ""}`}>
          {change.up !== null && <span aria-hidden="true">{change.up ? "↑" : "↓"}</span>}{" "}
          {change.text}
        </span>
      )}
    </div>
  );
}
