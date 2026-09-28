import { blockedWordIn, type NameAction, type NameKind, type RecentName } from "@whizard/protocol";
import { useState } from "react";
import { actOnName, addBlockedWord, fetchModeration, removeBlockedWord } from "../api";
import { formatNumber, timeAgo } from "../format";
import { linkTo } from "../router";
import { KpiTiles, PanelHead, useRefreshing } from "./parts";

const REFRESH_MS = 30_000;

const KINDS: Record<NameKind, string> = {
  nickname: "Room nickname",
  account: "Account name",
  group: "Group name",
};

type Show = "flagged" | "all";

/** `/admin/moderation`: blocked words, and the names players chose this week. */
export function Moderation() {
  const { data, error, reload } = useRefreshing(fetchModeration, REFRESH_MS);
  const [show, setShow] = useState<Show>("flagged");
  const t = data?.totals;

  if (error && !data) {
    return (
      <p className="error" role="alert">
        Couldn’t load moderation. {error}
      </p>
    );
  }
  const names = (data?.names ?? []).filter((n) => show === "all" || n.flagged);
  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      <KpiTiles
        tiles={[
          {
            tone: "purple",
            icon: "shield",
            label: "Blocked Words",
            value: t ? formatNumber(t.words) : "–",
            note: "checked in every name",
          },
          {
            tone: "pink",
            icon: "flag",
            label: "Flagged Names",
            value: t ? formatNumber(t.flagged) : "–",
            note: "chosen in the last 7 days",
          },
          {
            tone: "orange",
            icon: "userPlus",
            label: "Names Refused",
            value: t ? formatNumber(t.refused) : "–",
            note: "in the last 7 days",
          },
          {
            tone: "blue",
            icon: "door",
            label: "Players Removed",
            value: t ? formatNumber(t.removed) : "–",
            note: "from rooms, last 7 days",
          },
        ]}
      />

      <section className="panel admin-panel span-8" aria-labelledby="names-title">
        <PanelHead
          id="names-title"
          icon="users"
          title="Recent Names"
          subtitle="Nicknames, account names and group names chosen in the last 7 days."
        >
          <div className="range-switch admin-switch" role="group" aria-label="Show">
            {(
              [
                ["flagged", "Flagged"],
                ["all", "All"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} aria-pressed={show === id} onClick={() => setShow(id)}>
                {label}
              </button>
            ))}
          </div>
        </PanelHead>
        {data && names.length === 0 && (
          <p className="admin-empty">
            {show === "flagged"
              ? "No names this week match a blocked word."
              : "No names chosen in the last 7 days."}
          </p>
        )}
        <ul className="name-list">
          {names.map((n) => (
            <NameRow key={n.id} entry={n} onDone={reload} />
          ))}
        </ul>
      </section>

      <BlockedWords words={data?.words} onChange={reload} />
    </div>
  );
}

function NameRow({ entry, onDone }: { entry: RecentName; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const act = async (action: NameAction) => {
    setBusy(true);
    setMessage(null);
    try {
      await actOnName(entry.id, action);
      setMessage(action === "remove" ? "Removed from the room." : "Name reset.");
      onDone();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn’t do that.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={entry.flagged ? "name-row flagged" : "name-row"}>
      <span className="name-text">
        <strong>{entry.name}</strong>
        <span>
          {KINDS[entry.kind]} · {entry.kind === "nickname" ? `Room ${entry.detail}` : entry.detail}{" "}
          · {timeAgo(entry.at)}
        </span>
      </span>
      <span className="name-flag">
        {entry.flagged ? (
          <span className="status-pill status-out">Matches “{entry.flagged}”</span>
        ) : (
          <span className="status-pill status-retired">OK</span>
        )}
      </span>
      <div className="user-actions">
        {entry.kind === "nickname" ? (
          entry.inRoom ? (
            <button
              className="btn btn-small btn-danger"
              disabled={busy}
              onClick={() => void act("remove")}
            >
              Remove from room
            </button>
          ) : (
            <span className="dim small">Left the room</span>
          )
        ) : (
          <>
            <button className="btn btn-small" disabled={busy} onClick={() => void act("reset")}>
              Reset name
            </button>
            {entry.kind === "account" && (
              <a className="btn btn-small" {...linkTo("/admin/users")}>
                Users
              </a>
            )}
          </>
        )}
      </div>
      {message && (
        <p className="name-message small" role="status">
          {message}
        </p>
      )}
    </li>
  );
}

function BlockedWords({
  words,
  onChange,
}: {
  words: { word: string; anywhere: boolean; addedAt: number }[] | undefined;
  onChange: () => void;
}) {
  const [word, setWord] = useState("");
  const [anywhere, setAnywhere] = useState(false);
  const [trial, setTrial] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await addBlockedWord(word, anywhere);
      setWord("");
      setAnywhere(false);
      onChange();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn’t add that.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (w: string) => {
    try {
      await removeBlockedWord(w);
      onChange();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn’t remove that.");
    }
  };
  const match = trial.trim() ? blockedWordIn(trial, words ?? []) : null;

  return (
    <section className="panel admin-panel span-4" aria-labelledby="words-title">
      <PanelHead id="words-title" icon="shield" title="Blocked Words" />
      <p className="admin-note">
        Names using these are refused in rooms, sign-ups, profiles and groups. Spaced-out letters,
        accents and look-alikes like 0 for o are caught too.
      </p>
      <form
        className="word-form"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="form-field">
          <span className="form-label">Add a word</span>
          <input value={word} maxLength={30} onChange={(e) => setWord(e.target.value)} required />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={anywhere}
            onChange={(e) => setAnywhere(e.target.checked)}
          />
          Also inside other words
        </label>
        <button className="btn btn-small btn-primary" disabled={busy || !word.trim()}>
          Block it
        </button>
      </form>
      {problem && (
        <p className="error small" role="alert">
          {problem}
        </p>
      )}
      {words && words.length === 0 ? (
        <p className="admin-empty">No blocked words yet.</p>
      ) : (
        <ul className="word-list">
          {(words ?? []).map((w) => (
            <li key={w.word}>
              <span className="reason-chip">{w.word}</span>
              <span className="dim small">{w.anywhere ? "anywhere" : "whole word"}</span>
              <button
                className="btn-link small"
                aria-label={`Unblock ${w.word}`}
                onClick={() => void remove(w.word)}
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="form-field">
        <span className="form-label">Try a name</span>
        <input
          value={trial}
          placeholder="e.g. a nickname you saw"
          onChange={(e) => setTrial(e.target.value)}
        />
      </label>
      {trial.trim() && (
        <p className={match ? "error small" : "form-saved small"} role="status">
          {match ? `Refused: it matches “${match}”.` : "Allowed."}
        </p>
      )}
    </section>
  );
}
