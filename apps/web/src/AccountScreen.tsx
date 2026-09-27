import { NICKNAME_MAX_LENGTH, QUIZ_CATEGORIES, normalizeNickname } from "@whizard/game-core";
import {
  USERNAME_MAX_LENGTH,
  normalizeUsername,
  usernameProblem,
  type AccountPasskey,
  type AccountUser,
  type MatchRecord,
  type PlayerStats,
} from "@whizard/protocol";
import { useEffect, useState, type FormEvent } from "react";
import {
  addPasskey,
  deleteAccount,
  fetchMatches,
  fetchPasskeys,
  fetchStats,
  passkeysSupported,
  removePasskey,
  signIn,
  signOut,
  signUp,
  updateAccount,
  useAccount,
} from "./account";
import { linkTo, navigate } from "./router";
import { PageBar, useAction, useLoaded } from "./ui";
import { loadNickname } from "./storage";

export function AccountScreen() {
  const account = useAccount();
  return (
    <>
      <PageBar />
      {account.status === "loading" ? (
        <p className="muted">Loading…</p>
      ) : account.user ? (
        <Profile user={account.user} />
      ) : (
        <SignedOut />
      )}
    </>
  );
}

// Signed out ------------------------------------------------------------------------------------

const USERNAME_HINTS = {
  length: "3 to 20 characters.",
  characters: "Lowercase letters, numbers and _ only, starting with a letter.",
  reserved: "That username isn’t available.",
} as const;

/** Where to go after signing in, from `?next=`. Only paths on this site. */
function afterSignIn() {
  const next = new URLSearchParams(location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) navigate(next);
  else history.replaceState(null, "", "/account");
}

function SignedOut() {
  const signingIn = useAction();
  const creating = useAction();
  const [username, setUsername] = useState("");
  const [name, setName] = useState(loadNickname);
  const [agreed, setAgreed] = useState(false);

  if (!passkeysSupported()) {
    return (
      <div className="screen">
        <h1 className="page-title">Your account</h1>
        <p>
          This browser can’t use passkeys, which Whizard uses instead of passwords. You can still
          play as a guest, or sign up from a recent phone or computer.
        </p>
      </div>
    );
  }

  const normalized = normalizeUsername(username);
  const problem = normalized ? usernameProblem(normalized) : null;
  const canCreate = !!normalized && !problem && !!normalizeNickname(name) && agreed;

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    if (canCreate) {
      void creating.run(async () => {
        await signUp(normalized, name);
        afterSignIn();
      });
    }
  };

  return (
    <div className="screen">
      <header className="stack">
        <h1 className="page-title">Your account</h1>
        <p className="muted">
          Keep your scores, see your best categories and add friends. It’s optional: you can always
          play as a guest.
        </p>
      </header>

      <div className="stack">
        <button
          className="btn btn-primary"
          disabled={signingIn.busy}
          onClick={() =>
            void signingIn.run(async () => {
              await signIn();
              afterSignIn();
            })
          }
        >
          {signingIn.busy ? "Waiting for your passkey…" : "Sign in with a passkey"}
        </button>
        {signingIn.error && (
          <p className="error small" role="alert">
            {signingIn.error}
          </p>
        )}
      </div>

      <div className="or">new here?</div>

      <form className="stack" onSubmit={handleCreate}>
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          value={username}
          maxLength={USERNAME_MAX_LENGTH + 1}
          autoCapitalize="none"
          autoComplete="username webauthn"
          spellCheck={false}
          placeholder="e.g. tolu_a"
          aria-describedby="username-hint"
          onChange={(event) => setUsername(event.target.value)}
        />
        <p id="username-hint" className={`small ${problem ? "error" : "muted"}`}>
          {problem ? USERNAME_HINTS[problem] : "Friends find you by this. It can’t be changed."}
        </p>

        <label className="label" htmlFor="display-name">
          Name
        </label>
        <input
          id="display-name"
          name="display-name"
          value={name}
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          onChange={(event) => setName(event.target.value)}
        />

        <label className="check">
          <input
            type="checkbox"
            name="agreed"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>
            I’m 13 or older and I agree to the{" "}
            <a {...linkTo("/privacy")} target="_blank" rel="noreferrer">
              privacy policy
            </a>
            .
          </span>
        </label>

        <button className="btn" type="submit" disabled={!canCreate || creating.busy}>
          {creating.busy ? "Waiting for your passkey…" : "Create account"}
        </button>
        {creating.error && (
          <p className="error small" role="alert">
            {creating.error}
          </p>
        )}
      </form>

      <p className="muted small">
        No password to remember. A passkey uses your phone or computer’s screen lock (your face,
        fingerprint or PIN), and syncs to your other devices.
      </p>
    </div>
  );
}

// Signed in -------------------------------------------------------------------------------------

function Profile({ user }: { user: AccountUser }) {
  return (
    <div className="screen">
      <header className="profile-head">
        <div>
          <h1 className="page-title">{user.displayName}</h1>
          <p className="muted">@{user.username}</p>
        </div>
        <a className="btn" {...linkTo("/friends")}>
          Friends
        </a>
      </header>
      <Stats />
      <History />
      <Settings user={user} />
      <Passkeys />
      <Data />
    </div>
  );
}

const categoryName = (id: string | null) =>
  QUIZ_CATEGORIES.find((c) => c.id === id)?.name ?? "Quiz";
const difficultyName = (id: string | null) => (id ? id.charAt(0).toUpperCase() + id.slice(1) : "");

const percent = (share: number) => `${Math.round(share * 100)}%`;

function Stats() {
  const { data, error } = useLoaded(fetchStats);
  if (error) return <p className="error small">{error}</p>;
  if (!data) return <div className="tiles" aria-busy="true" />;
  const stats: PlayerStats = data.stats;
  const best = stats.categories[0];
  return (
    <dl className="tiles">
      <div>
        <dt>Games</dt>
        <dd>{stats.played}</dd>
      </div>
      <div>
        <dt>Wins</dt>
        <dd>
          {stats.wins}
          {stats.groupGames > 0 && <span className="of"> / {stats.groupGames}</span>}
        </dd>
      </div>
      <div>
        <dt>Best</dt>
        <dd className={best ? "best" : undefined}>
          {best ? (
            <>
              {categoryName(best.category)} <span className="of">{percent(best.accuracy)}</span>
            </>
          ) : (
            "–"
          )}
        </dd>
      </div>
    </dl>
  );
}

const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function MatchRow({ match }: { match: MatchRecord }) {
  const me = match.players.find((p) => p.isMe);
  const others = match.players.filter((p) => !p.isMe);
  const details = [
    others.length === 0
      ? "Solo"
      : `with ${others
          .slice(0, 3)
          .map((p) => p.nickname)
          .join(", ")}${others.length > 3 ? ` +${others.length - 3}` : ""}`,
    match.myCorrect === null ? null : `${match.myCorrect}/${match.rounds} correct`,
    shortDate.format(match.finishedAt),
  ].filter(Boolean);

  return (
    <li>
      <div className="match-main">
        <span className="match-title">
          {categoryName(match.category)} · {difficultyName(match.difficulty)}
        </span>
        <span className="muted small">{details.join(" · ")}</span>
      </div>
      <div className="match-result">
        {others.length > 0 && me && (
          <span className={me.placing === 1 ? "placing first" : "placing"}>
            {ordinal(me.placing)}
          </span>
        )}
        <span className="muted small">{me?.score.toLocaleString() ?? 0} pts</span>
      </div>
    </li>
  );
}

function History() {
  const { data, error } = useLoaded(fetchMatches);
  const [older, setOlder] = useState<MatchRecord[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const loading = useAction();

  if (error) return <p className="error small">{error}</p>;
  if (!data) return null;
  const matches = [...data.matches, ...older];
  const hasMore = more ?? data.more;

  const loadMore = () =>
    loading.run(async () => {
      const last = matches[matches.length - 1];
      const page = await fetchMatches(last?.finishedAt);
      setOlder((current) => [...current, ...page.matches]);
      setMore(page.more);
    });

  return (
    <section className="stack" aria-labelledby="history-title">
      <h2 id="history-title" className="section-title">
        Recent games
      </h2>
      {matches.length === 0 ? (
        <p className="muted">
          Nothing yet. Games you finish while signed in show up here.{" "}
          <a {...linkTo("/")}>Play one</a>
        </p>
      ) : (
        <ul className="matches">
          {matches.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </ul>
      )}
      {hasMore && (
        <button className="btn-link" disabled={loading.busy} onClick={() => void loadMore()}>
          {loading.busy ? "Loading…" : "Show older games"}
        </button>
      )}
    </section>
  );
}

function Settings({ user }: { user: AccountUser }) {
  const [name, setName] = useState(user.displayName);
  const saving = useAction();
  const changed = normalizeNickname(name) !== null && name.trim() !== user.displayName;

  const handleName = (event: FormEvent) => {
    event.preventDefault();
    if (changed) void saving.run(() => updateAccount({ displayName: name }));
  };

  return (
    <section className="stack" aria-labelledby="settings-title">
      <h2 id="settings-title" className="section-title">
        Settings
      </h2>
      <div className="settings wide">
        <form className="setting" onSubmit={handleName}>
          <label className="setting-name" htmlFor="profile-name">
            Name
          </label>
          <div className="inline-form">
            <input
              id="profile-name"
              name="display-name"
              value={name}
              maxLength={NICKNAME_MAX_LENGTH}
              autoComplete="nickname"
              onChange={(event) => setName(event.target.value)}
            />
            <button className="btn btn-small" type="submit" disabled={!changed || saving.busy}>
              Save
            </button>
          </div>
        </form>
        <div className="setting">
          <span className="setting-name" id="explain-label">
            Explanations
          </span>
          <div className="segmented" role="group" aria-labelledby="explain-label">
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={user.showExplanations === value}
                disabled={saving.busy}
                onClick={() => void saving.run(() => updateAccount({ showExplanations: value }))}
              >
                {value ? "Each answer" : "At the end"}
              </button>
            ))}
          </div>
          <p className="setting-hint muted small">
            In games with friends. Solo games always explain each answer.
          </p>
        </div>
      </div>
      {saving.error && (
        <p className="error small" role="alert">
          {saving.error}
        </p>
      )}
    </section>
  );
}

const longDate = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function Passkeys() {
  const [passkeys, setPasskeys] = useState<AccountPasskey[] | null>(null);
  const action = useAction();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    fetchPasskeys().then(
      ({ passkeys }) => live && setPasskeys(passkeys),
      () => live && setPasskeys([]),
    );
    return () => {
      live = false;
    };
  }, [version]);

  const reload = () => setVersion((v) => v + 1);

  return (
    <section className="stack" aria-labelledby="passkeys-title">
      <h2 id="passkeys-title" className="section-title">
        Passkeys
      </h2>
      <p className="muted small">
        Add one on each device that doesn’t sync with this one, so you can always sign in.
      </p>
      {passkeys && passkeys.length > 0 && (
        <ul className="passkeys">
          {passkeys.map((p, i) => (
            <li key={p.id}>
              <span>
                {p.name ?? `Passkey ${i + 1}`}
                <span className="muted small"> · added {longDate.format(p.createdAt)}</span>
              </span>
              {passkeys.length > 1 && (
                <button
                  className="btn-link"
                  disabled={action.busy}
                  onClick={() => {
                    if (!window.confirm("Remove this passkey? It won’t sign you in any more.")) {
                      return;
                    }
                    void action.run(async () => {
                      await removePasskey(p.id);
                      reload();
                    });
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        className="btn"
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            await addPasskey();
            reload();
          })
        }
      >
        Add a passkey
      </button>
      {action.error && (
        <p className="error small" role="alert">
          {action.error}
        </p>
      )}
    </section>
  );
}

function Data() {
  const action = useAction();
  return (
    <section className="stack" aria-labelledby="data-title">
      <h2 id="data-title" className="section-title">
        Your data
      </h2>
      <div className="link-row">
        <a className="btn-link" href="/api/me/export" download>
          Download my data
        </a>
        <a className="btn-link" {...linkTo("/privacy")}>
          Privacy
        </a>
      </div>
      <div className="link-row">
        <button
          className="btn"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await signOut();
              navigate("/");
            })
          }
        >
          Sign out
        </button>
        <button
          className="btn-link danger"
          disabled={action.busy}
          onClick={() => {
            const sure = window.confirm(
              "Delete your account? Your stats, history and friends are removed for good.",
            );
            if (!sure) return;
            void action.run(async () => {
              await deleteAccount();
              navigate("/");
            });
          }}
        >
          Delete account
        </button>
      </div>
      {action.error && (
        <p className="error small" role="alert">
          {action.error}
        </p>
      )}
    </section>
  );
}
