import {
  PRO_DURATIONS,
  USER_SORTS,
  type AdminUser,
  type AdminUsers,
  type UserAction,
  type UserSort,
} from "@whizard/protocol";
import { useEffect, useState } from "react";
import { endPro, fetchAdminUsers, giveProFree, manageUser } from "../api";
import { formatNumber, shortDate } from "../format";
import { Avatar } from "../ui/Avatar";
import { KpiTiles, PanelHead } from "./parts";

const SORT_LABELS: Record<UserSort, string> = {
  newest: "Newest",
  games: "Most games",
  active: "Last played",
};

const joined = (at: number) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const durationName = (months: number) =>
  months === 0 ? "Lifetime (No end)" : months === 1 ? "1 month" : `${months} months`;

const proDate = (at: number | null | undefined) =>
  at
    ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Lifetime";

const proPillText = (isPro?: boolean, proUntil?: number | null) => {
  if (!isPro) return "Free";
  if (!proUntil) return "👑 Lifetime";
  const dateStr = new Date(proUntil).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `👑 Pro · ${dateStr}`;
};

/** `/admin/users`: accounts, with suspend and delete for abusive ones. */
export function Users() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<UserSort>("newest");
  const [pages, setPages] = useState(1);
  const [data, setData] = useState<AdminUsers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Search as you type, once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const first = await fetchAdminUsers(search, sort, 0);
        let all = first;
        for (let page = 1; page < pages && all.more; page++) {
          const next = await fetchAdminUsers(search, sort, all.users.length);
          all = { ...next, users: [...all.users, ...next.users] };
        }
        if (live) {
          setData(all);
          setError(null);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [search, sort, pages, version]);

  const t = data?.totals;
  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      <KpiTiles
        tiles={[
          {
            tone: "purple",
            icon: "users",
            label: "Accounts",
            value: t ? formatNumber(t.accounts) : "–",
            note: "all time",
          },
          {
            tone: "blue",
            icon: "userPlus",
            label: "New This Week",
            value: t ? formatNumber(t.newThisWeek) : "–",
            note: "last 7 days",
          },
          {
            tone: "green",
            icon: "games",
            label: "Active This Week",
            value: t ? formatNumber(t.activeThisWeek) : "–",
            note: "played in the last 7 days",
          },
          {
            tone: "pink",
            icon: "shield",
            label: "Suspended",
            value: t ? formatNumber(t.suspended) : "–",
            note: "can’t sign in",
          },
        ]}
      />

      <section className="panel admin-panel span-12" aria-labelledby="users-title">
        <PanelHead id="users-title" icon="users" title="Accounts">
          <div className="range-switch admin-switch" role="group" aria-label="Sort by">
            {USER_SORTS.map((s) => (
              <button
                key={s}
                aria-pressed={sort === s}
                onClick={() => {
                  setSort(s);
                  setPages(1);
                }}
              >
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
        </PanelHead>
        <label className="admin-search">
          <span className="sr-only">Search accounts</span>
          <input
            type="search"
            placeholder="Search by username or name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPages(1);
            }}
          />
        </label>

        {error && !data && (
          <p className="error" role="alert">
            Couldn’t load the accounts. {error}
          </p>
        )}
        {data && data.users.length === 0 && (
          <p className="admin-empty">
            {search ? `Nobody matches “${search}”.` : "No accounts yet."}
          </p>
        )}

        <ul className="user-list">
          {(data?.users ?? []).map((u) => (
            <UserRow key={u.id} user={u} onChanged={() => setVersion((v) => v + 1)} />
          ))}
        </ul>
        {data?.more && (
          <button className="btn admin-load-more" onClick={() => setPages((p) => p + 1)}>
            Show more
          </button>
        )}
      </section>
    </div>
  );
}

function UserRow({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [proMode, setProMode] = useState<"idle" | "grant" | "end">("idle");
  const [proMonths, setProMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const act = async (action: UserAction) => {
    setBusy(true);
    setFailed(null);
    try {
      await manageUser(user.id, action);
      onChanged();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Couldn’t save that.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const submitPro = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await giveProFree(user.username, proMonths);
      setProMode("idle");
      onChanged();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Couldn’t grant Pro.");
    } finally {
      setBusy(false);
    }
  };

  const submitEndPro = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await endPro(user.id);
      setProMode("idle");
      onChanged();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Couldn’t end Pro.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={user.suspended ? "user-row suspended" : "user-row"}>
      <Avatar id={user.avatar} name={user.username} size={44} />
      <span className="user-name">
        <strong>{user.displayName}</strong>
        <span>@{user.username}</span>
      </span>
      <dl className="user-facts">
        <div>
          <dt>Joined</dt>
          <dd>{joined(user.createdAt)}</dd>
        </div>
        <div>
          <dt>Games</dt>
          <dd>{formatNumber(user.games)}</dd>
        </div>
        <div>
          <dt>Wins</dt>
          <dd>{formatNumber(user.wins)}</dd>
        </div>
        <div>
          <dt>Last played</dt>
          <dd>{user.lastPlayed ? shortDate(user.lastPlayed) : "–"}</dd>
        </div>
      </dl>
      <div className="user-status-badges">
        <span
          className={`status-pill ${
            user.admin ? "status-admin" : user.suspended ? "status-out" : "status-kept"
          }`}
        >
          {user.admin ? "Admin" : user.suspended ? "Suspended" : "Active"}
        </span>
        <span
          className={`status-pill ${user.isPro ? "status-pro" : "status-free"}`}
          title={
            user.isPro
              ? user.proUntil
                ? `Pro active until ${proDate(user.proUntil)}`
                : "Lifetime Pro membership"
              : "Free membership (manual question entry only)"
          }
        >
          {proPillText(user.isPro, user.proUntil)}
        </span>
      </div>
      <div className="user-actions">
        {proMode === "grant" ? (
          <div className="pro-action-inline">
            <select
              className="pro-duration-select"
              value={proMonths}
              disabled={busy}
              onChange={(e) => setProMonths(Number(e.target.value))}
              aria-label="Pro duration"
            >
              {PRO_DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {user.isPro
                    ? m === 0
                      ? "Lifetime (No end)"
                      : `+${durationName(m)}`
                    : durationName(m)}
                </option>
              ))}
            </select>
            <button
              className="btn btn-small btn-primary"
              disabled={busy}
              onClick={() => void submitPro()}
            >
              {user.isPro ? "Extend" : "Grant Pro"}
            </button>
            {user.isPro && (
              <button
                className="btn btn-small btn-danger"
                disabled={busy}
                onClick={() => setProMode("end")}
              >
                End Pro
              </button>
            )}
            <button className="btn btn-small" disabled={busy} onClick={() => setProMode("idle")}>
              Cancel
            </button>
          </div>
        ) : proMode === "end" ? (
          <div className="pro-action-inline">
            <span className="pro-confirm-hint">End Pro for @{user.username}?</span>
            <button
              className="btn btn-small btn-danger"
              disabled={busy}
              onClick={() => void submitEndPro()}
            >
              Confirm End
            </button>
            <button className="btn btn-small" disabled={busy} onClick={() => setProMode("idle")}>
              Cancel
            </button>
          </div>
        ) : confirming ? (
          <>
            <button
              className="btn btn-small btn-danger"
              disabled={busy}
              onClick={() => void act("delete")}
            >
              Delete @{user.username}
            </button>
            <button className="btn btn-small" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              className={`btn btn-small ${user.isPro ? "btn-pro-manage" : "btn-pro-grant"}`}
              disabled={busy}
              onClick={() => {
                setProMonths(1);
                setProMode("grant");
              }}
            >
              {user.isPro ? "👑 Manage Pro" : "👑 Give Pro"}
            </button>
            {user.admin ? null : (
              <>
                <button
                  className="btn btn-small"
                  disabled={busy}
                  onClick={() => void act(user.suspended ? "unsuspend" : "suspend")}
                >
                  {user.suspended ? "Unsuspend" : "Suspend"}
                </button>
                <button
                  className="btn btn-small btn-danger"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                >
                  Delete
                </button>
              </>
            )}
          </>
        )}
      </div>
      {failed && (
        <p className="error small user-error" role="alert">
          {failed}
        </p>
      )}
    </li>
  );
}
