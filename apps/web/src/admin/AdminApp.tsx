import type { AccountUser, StatsRange } from "@whizard/protocol";
import { STATS_RANGES } from "@whizard/protocol";
import { useState } from "react";
import { useAccount } from "../account";
import { Notice } from "../Notice";
import { linkTo } from "../router";
import { Avatar } from "../ui/Avatar";
import { Brand } from "../ui/Chrome";
import { Icon, type IconName } from "../ui/Icon";
import { LogoMark } from "../ui/Logo";
import { Dashboard } from "./Dashboard";
import { Reports } from "./Reports";

interface Section {
  id: string;
  label: string;
  icon: IconName;
  /** What the section will hold, shown until it's built. */
  soon?: string;
}

const SECTIONS: Section[] = [
  { id: "dashboard", label: "Dashboard", icon: "chart" },
  {
    id: "games",
    label: "Games",
    icon: "games",
    soon: "Each game's settings, and turning games on and off.",
  },
  {
    id: "questions",
    label: "Questions",
    icon: "help",
    soon: "The question bank by topic and level, and the questions players get wrong most.",
  },
  {
    id: "rooms",
    label: "Rooms",
    icon: "door",
    soon: "Rooms open right now and what they're playing.",
  },
  {
    id: "users",
    label: "Users",
    icon: "users",
    soon: "Accounts, sign-ups and removing abusive ones.",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "repeat",
    soon: "Longer trends, pages and where visitors come from.",
  },
  { id: "reports", label: "Reports", icon: "flag" },
  { id: "content", label: "Content", icon: "layers", soon: "Adding and editing questions." },
  {
    id: "moderation",
    label: "Moderation",
    icon: "shield",
    soon: "Nicknames and anything players type, once games let them.",
  },
  {
    id: "payments",
    label: "Payments",
    icon: "wallet",
    soon: "Pro subscriptions, once they exist.",
  },
  { id: "settings", label: "Settings", icon: "settings", soon: "Admins and site settings." },
];

/** `/admin`: only accounts marked as admin get in; the server checks every request too. */
export function AdminApp({ section }: { section: string }) {
  const account = useAccount();
  if (account.status === "loading") {
    return <p className="admin-loading">Loading…</p>;
  }
  if (!account.user)
    return <Notice message="Sign in with an admin account to open the dashboard." />;
  if (!account.user.admin) return <Notice message="This page is for Whizard admins." />;
  return <AdminShell section={section} user={account.user} />;
}

function AdminShell({ section, user }: { section: string; user: AccountUser }) {
  const [range, setRange] = useState<StatsRange>(30);
  const [openReports, setOpenReports] = useState(0);
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;

  return (
    <div className="admin">
      <aside className="admin-side">
        <Brand />
        <nav className="admin-nav" aria-label="Admin">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              className="admin-nav-link"
              aria-current={s.id === current.id ? "page" : undefined}
              {...linkTo(s.id === "dashboard" ? "/admin" : `/admin/${s.id}`)}
            >
              <Icon name={s.icon} size={22} />
              {s.label}
            </a>
          ))}
        </nav>
        <div className="admin-cheer">
          <img src="/art/mascot/wave.webp" alt="" width={451} height={520} />
          <div className="panel admin-cheer-card">
            <strong>Keep Whizard amazing! 🚀</strong>
            <span>Monitor, manage and grow the community.</span>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-head">
          <LogoMark className="admin-head-mark" />
          <div className="admin-head-text">
            <h1>{current.id === "dashboard" ? "Admin Dashboard" : current.label}</h1>
            <p>
              {current.id === "dashboard"
                ? "Overview of your platform’s activity, growth and performance."
                : current.id === "reports"
                  ? "Questions players reported, and what’s been decided."
                  : "Coming in a later update."}
            </p>
          </div>
          <div className="admin-head-end">
            {current.id === "dashboard" && (
              <label className="admin-range">
                <Icon name="calendar" size={20} />
                <span className="sr-only">Time range</span>
                <select
                  value={range}
                  onChange={(e) => setRange(Number(e.target.value) as StatsRange)}
                >
                  {STATS_RANGES.map((r) => (
                    <option key={r} value={r}>
                      Last {r} days
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size={18} />
              </label>
            )}
            <a
              className="icon-btn admin-bell"
              aria-label={
                openReports > 0
                  ? `${openReports} reported questions to check`
                  : "Reported questions"
              }
              {...linkTo("/admin/reports")}
            >
              <Icon name="bell" size={24} />
              {openReports > 0 && <span className="admin-bell-dot" aria-hidden="true" />}
            </a>
            <a className="admin-me" {...linkTo("/account")}>
              <Avatar id={user.avatar} name={user.username} size={44} />
              <span className="admin-me-text">
                <strong>Admin</strong>
                <span className="admin-online">
                  <span className="live-dot" aria-hidden="true" />
                  Online
                </span>
              </span>
              <Icon name="chevronDown" size={18} className="admin-me-chevron" />
            </a>
          </div>
        </header>

        {current.id === "dashboard" ? (
          <Dashboard range={range} onRange={setRange} onOpenReports={setOpenReports} />
        ) : current.id === "reports" ? (
          <Reports onOpenReports={setOpenReports} />
        ) : (
          <section className="panel admin-soon">
            <Icon name={current.icon} size={40} />
            <h2>{current.label} is coming soon</h2>
            <p>{current.soon}</p>
            <a className="btn" {...linkTo("/admin")}>
              Back to the dashboard
            </a>
          </section>
        )}
      </div>
    </div>
  );
}
