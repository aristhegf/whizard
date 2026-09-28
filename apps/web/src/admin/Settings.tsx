import { ANNOUNCEMENT_MAX, type AdminLogEntry, type SiteSettings } from "@whizard/protocol";
import { useState } from "react";
import { fetchAdminSettings, grantAdmin, revokeAdmin, updateSettings } from "../api";
import { timeAgo } from "../format";
import { Avatar } from "../ui/Avatar";
import { useLoaded } from "../ui/common";
import { PanelHead } from "./parts";

/** What an admin-log action means, in words. */
const ACTIONS: Record<string, string> = {
  "report:keep": "kept a reported question",
  "report:retire": "retired a question",
  "report:reopen": "reopened a question",
  "user:suspend": "suspended",
  "user:unsuspend": "let back in",
  "user:delete": "deleted an account",
  "room:close": "closed room",
  "question:edit": "edited",
  "question:add": "added",
  "question:revert": "undid edits to",
  "question:delete": "deleted",
  "word:add": "blocked the word",
  "word:remove": "unblocked the word",
  "name:remove": "removed a player from",
  "name:reset": "reset the name of",
  "setting:announcement": "set the announcement",
  "setting:rooms_paused": "set new rooms paused to",
  "setting:signups_paused": "set sign-ups paused to",
  "setting:quiz_defaults": "changed new room defaults",
  "setting:topics_off": "changed which topics are off:",
  "setting:games_off": "changed which games are off:",
  "pro:payment": "recorded a payment from",
  "pro:give": "gave Pro to",
  "pro:end": "ended Pro for",
  "admin:grant": "made an admin:",
  "admin:revoke": "took admin away from",
};

/** A list setting such as the topics turned off, in words. */
function listTarget(target: string): string {
  try {
    const list = JSON.parse(target) as string[];
    return list.length > 0 ? list.join(", ") : "none";
  } catch {
    return target;
  }
}

function describe(entry: AdminLogEntry): string {
  const what = ACTIONS[entry.action] ?? entry.action;
  if (entry.action === "setting:quiz_defaults") return what;
  if (entry.target.startsWith("[")) return `${what} ${listTarget(entry.target)}`;
  const target = entry.targetName
    ? `@${entry.targetName}`
    : entry.action.startsWith("setting:")
      ? entry.target === "1"
        ? "on"
        : entry.target === "0"
          ? "off"
          : entry.target
            ? `“${entry.target}”`
            : "(cleared)"
      : entry.action === "name:remove"
        ? `room ${entry.target.split(":")[0]}`
        : entry.target;
  return `${what} ${target}`;
}

/** `/admin/settings`: site switches, admins and a record of what admins did. */
export function Settings({ me }: { me: string }) {
  const { data, error, reload } = useLoaded(fetchAdminSettings);
  if (error && !data) {
    return (
      <p className="error" role="alert">
        Couldn’t load settings. {error}
      </p>
    );
  }
  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      {data && <Site settings={data.settings} onSaved={reload} />}
      {data && <Admins admins={data.admins} me={me} onChange={reload} />}
      <section className="panel admin-panel span-12" aria-labelledby="log-title">
        <PanelHead
          id="log-title"
          icon="clock"
          title="Admin Activity"
          subtitle="The latest 50 things admins did."
        />
        {data && data.log.length === 0 && <p className="admin-empty">Nothing yet.</p>}
        <ul className="log-list">
          {(data?.log ?? []).map((entry, i) => (
            <li key={`${entry.at}-${i}`}>
              <strong>@{entry.admin ?? "former admin"}</strong> {describe(entry)}
              <time dateTime={new Date(entry.at).toISOString()}>{timeAgo(entry.at)}</time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Site({ settings, onSaved }: { settings: SiteSettings; onSaved: () => void }) {
  const [announcement, setAnnouncement] = useState(settings.announcement ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async (update: Partial<SiteSettings>, done: string) => {
    setProblem(null);
    setMessage(null);
    try {
      await updateSettings(update);
      setMessage(done);
      onSaved();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn’t save that.");
    }
  };

  return (
    <section className="panel admin-panel span-6" aria-labelledby="site-title">
      <PanelHead
        id="site-title"
        icon="settings"
        title="Site"
        subtitle="Changes show within a minute."
      />
      <form
        className="question-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(
            { announcement: announcement.trim() || null },
            announcement.trim() ? "Announcement is up." : "Announcement taken down.",
          );
        }}
      >
        <label className="form-field">
          <span className="form-label">
            Announcement
            <span className="form-count">
              {announcement.length}/{ANNOUNCEMENT_MAX}
            </span>
          </span>
          <textarea
            rows={2}
            maxLength={ANNOUNCEMENT_MAX}
            value={announcement}
            placeholder="e.g. New Nigerian culture questions are in!"
            onChange={(e) => setAnnouncement(e.target.value)}
          />
          <span className="form-hint">
            Shown across the top of every page. Leave empty for none.
          </span>
        </label>
        <div className="form-actions">
          <button className="btn btn-small btn-primary">Save announcement</button>
        </div>
      </form>
      <ul className="switch-list">
        <Switch
          label="Pause new rooms"
          hint="Rooms already open keep going. Handy before a deploy or while fixing something."
          on={settings.roomsPaused}
          onChange={(on) =>
            void save({ roomsPaused: on }, on ? "New rooms are paused." : "New rooms are open.")
          }
        />
        <Switch
          label="Pause sign-ups"
          hint="Nobody can create an account; signing in and playing as a guest still work."
          on={settings.signupsPaused}
          onChange={(on) =>
            void save({ signupsPaused: on }, on ? "Sign-ups are paused." : "Sign-ups are open.")
          }
        />
      </ul>
      {problem && (
        <p className="error small" role="alert">
          {problem}
        </p>
      )}
      {message && (
        <p className="form-saved small" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function Switch({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <li className="switch-row">
      <span className="name-text">
        <strong>{label}</strong>
        <span>{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={on ? "toggle on" : "toggle"}
        onClick={() => onChange(!on)}
      >
        <span />
      </button>
    </li>
  );
}

function Admins({
  admins,
  me,
  onChange,
}: {
  admins: { id: string; username: string; displayName: string; avatar: string | null }[];
  me: string;
  onChange: () => void;
}) {
  const [username, setUsername] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await task();
      onChange();
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn’t do that.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel admin-panel span-6" aria-labelledby="admins-title">
      <PanelHead
        id="admins-title"
        icon="shield"
        title="Admins"
        subtitle="Admins can see and change everything on these pages."
      />
      <ul className="user-list admins-list">
        {admins.map((a) => (
          <li key={a.id} className="admin-row">
            <Avatar id={a.avatar} name={a.username} size={40} />
            <span className="user-name">
              <strong>{a.displayName}</strong>
              <span>@{a.username}</span>
            </span>
            {a.id === me ? (
              <span className="status-pill status-admin">You</span>
            ) : (
              <button
                className="btn btn-small btn-danger"
                disabled={busy}
                onClick={() => void run(() => revokeAdmin(a.id))}
              >
                Remove admin
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="word-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => grantAdmin(username)).then((ok) => ok && setUsername(""));
        }}
      >
        <label className="form-field">
          <span className="form-label">Make someone an admin</span>
          <input
            value={username}
            placeholder="their username"
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <button className="btn btn-small btn-primary" disabled={busy || !username.trim()}>
          Add admin
        </button>
      </form>
      {problem && (
        <p className="error small" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
