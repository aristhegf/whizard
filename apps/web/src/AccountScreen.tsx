import {
  JIGSAW_PICTURES,
  NICKNAME_INPUT_MAX_LENGTH,
  QUIZ_CATEGORIES,
  normalizeNickname,
} from "@whizard/game-core";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isAvatarValue,
  nextUsernameChange,
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
  changeUsername,
  checkUsername,
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
import { Avatar } from "./ui/Avatar";
import { AvatarPicker } from "./ui/AvatarPicker";
import { SideLayout } from "./ui/Chrome";
import { useAction, useLoaded } from "./ui/common";
import { Loading } from "./ui/Loading";
import { useShakeOnError } from "./ui/errorShake";
import { useToast, useToastAction } from "./ui/toast";
import { disablePings, enablePings, localTimeZone, pingSupport, pingsOnThisDevice } from "./pings";
import { loadNickname } from "./storage";

export function AccountScreen() {
  const account = useAccount();
  return (
    <SideLayout active="profile" className="account-page">
      {account.status === "loading" ? (
        <Loading />
      ) : account.user ? (
        <Profile user={account.user} />
      ) : (
        <SignedOut />
      )}
    </SideLayout>
  );
}

// Signed out ------------------------------------------------------------------------------------

const USERNAME_HINTS = {
  length: "3 to 20 characters.",
  characters: "Lowercase letters, numbers and _ only, starting with a letter.",
  reserved: "That username isn’t available.",
} as const;

const USERNAME_ABOUT = "Unique, and how friends find you. You can change it once every 7 days.";
const DISPLAY_NAME_ABOUT = "What everyone sees in games and on leaderboards. Emojis welcome.";

/**
 * Checks a username as it's typed: the rules at once, and whether it's free after a short
 * pause. `current` is the account's own username, which needs no check.
 */
function useUsernameCheck(input: string, current?: string) {
  const username = normalizeUsername(input);
  const problem = username ? usernameProblem(username) : null;
  const [result, setResult] = useState<{ username: string; available: boolean; reason?: string }>();

  useEffect(() => {
    if (!username || problem || username === current) return;
    const timer = setTimeout(() => {
      checkUsername(username).then(
        (check) => setResult({ username, ...check }),
        () => {},
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [username, problem, current]);

  const checked = result?.username === username ? result : undefined;
  // Too short is only "not yet" while it's being typed, so it's a hint rather than an error.
  const tooShort = problem === "length" && username.length < USERNAME_MIN_LENGTH;
  const error =
    problem && !tooShort
      ? USERNAME_HINTS[problem]
      : checked && !checked.available
        ? (checked.reason ?? "That username isn’t available.")
        : null;
  return {
    username,
    /** Why it can't be used, if we know: breaks a rule, or taken. */
    problem: error,
    /** Can't be used as it is, error or not. */
    blocked: !!problem || !!error,
    tooShort,
    available: checked?.available === true,
  };
}

/** The line under a username field: what's wrong, that it's free, or what it's for. */
function UsernameHint({
  id,
  check,
  about,
}: {
  id: string;
  check: ReturnType<typeof useUsernameCheck>;
  about: string;
}) {
  return (
    <p
      id={id}
      className={`small ${check.problem ? "error" : check.available ? "ok-text" : "muted"}`}
      aria-live="polite"
    >
      {check.problem ??
        (check.available
          ? `@${check.username} is available.`
          : check.tooShort
            ? USERNAME_HINTS.length
            : about)}
    </p>
  );
}

/** Where to go after signing in, from `?next=`. Only paths on this site. */
function afterSignIn() {
  const next = new URLSearchParams(location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) navigate(next);
  else history.replaceState(null, "", "/account");
}

function SignedOut() {
  const signingIn = useToastAction();
  const creating = useAction();
  const [username, setUsername] = useState("");
  const [name, setName] = useState(loadNickname);
  const [agreed, setAgreed] = useState(false);
  const check = useUsernameCheck(username);
  const { ref: usernameRef, isError: usernameInvalid } = useShakeOnError<HTMLInputElement>(
    check.problem,
  );
  const nameError = displayNameProblem(name);
  const { ref: nameRef, isError: nameInvalid } = useShakeOnError<HTMLInputElement>(nameError);

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

  const normalized = check.username;
  const canCreate = !!normalized && !check.blocked && !!normalizeNickname(name) && agreed;

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
      </div>

      <div className="or">new here?</div>

      <form className="stack" onSubmit={handleCreate}>
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          ref={usernameRef}
          className={`t-input${usernameInvalid ? " is-error" : ""}`}
          id="username"
          name="username"
          aria-invalid={usernameInvalid}
          value={username}
          maxLength={USERNAME_MAX_LENGTH + 1}
          autoCapitalize="none"
          autoComplete="username webauthn"
          spellCheck={false}
          placeholder="e.g. tolu_a"
          aria-describedby="username-hint"
          onChange={(event) => setUsername(event.target.value)}
        />
        <UsernameHint id="username-hint" check={check} about={USERNAME_ABOUT} />

        <label className="label" htmlFor="display-name">
          Display name
        </label>
        <input
          ref={nameRef}
          className={`t-input${nameInvalid ? " is-error" : ""}`}
          id="display-name"
          name="display-name"
          aria-invalid={nameInvalid}
          value={name}
          maxLength={NICKNAME_INPUT_MAX_LENGTH}
          autoComplete="nickname"
          aria-describedby="display-name-hint"
          onChange={(event) => setName(event.target.value)}
        />
        <DisplayNameHint id="display-name-hint" error={nameError} />

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
        <div className="profile-id">
          <Avatar id={user.avatar} name={user.username} size={84} />
          <div>
            <h1 className="page-title">{user.displayName}</h1>
            <p className="muted">@{user.username}</p>
          </div>
        </div>
        <a className="btn" {...linkTo("/friends")}>
          Friends
        </a>
      </header>
      <Stats />
      <History />
      <Settings user={user} />
      <Pings user={user} />
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

/** A game's name for history: the quiz topic and level, or the jigsaw picture and size. */
function matchTitle(match: MatchRecord): string {
  if (match.game === "connections") return `Connections · ${difficultyName(match.difficulty)}`;
  if (match.game === "logic") return `Logic · ${(match.difficulty ?? "").replace("x", "×")}`;
  if (match.game === "jigsaw") {
    const picture =
      match.category === "photo"
        ? "Your photo"
        : JIGSAW_PICTURES.find((p) => p.id === match.category)?.name;
    return picture ? `Jigsaw · ${picture}` : "Jigsaw";
  }
  return `${categoryName(match.category)} · ${difficultyName(match.difficulty)}`;
}

function MatchRow({ match }: { match: MatchRecord }) {
  const me = match.players.find((p) => p.isMe);
  const others = match.players.filter((p) => !p.isMe);
  const jigsaw = match.game === "jigsaw";
  const details = [
    others.length === 0
      ? "Solo"
      : `with ${others
          .slice(0, 3)
          .map((p) => p.nickname)
          .join(", ")}${others.length > 3 ? ` +${others.length - 3}` : ""}`,
    match.myCorrect === null
      ? null
      : `${match.myCorrect}/${match.rounds} ${
          jigsaw
            ? "pieces"
            : match.game === "connections"
              ? "groups"
              : match.game === "logic"
                ? "cells"
                : "correct"
        }`,
    shortDate.format(match.finishedAt),
  ].filter(Boolean);

  return (
    <li>
      <div className="match-main">
        <span className="match-title">{matchTitle(match)}</span>
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
  const loading = useToastAction();

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

/** What's wrong with a display name as typed, if anything. Empty is only "not yet". */
function displayNameProblem(name: string): string | null {
  return name.trim() !== "" && normalizeNickname(name) === null
    ? "Up to 20 characters. An emoji counts as one."
    : null;
}

/** Under a display name field: what's wrong, or what it's for. */
function DisplayNameHint({
  id,
  error,
  className = "",
}: {
  id: string;
  error: string | null;
  className?: string;
}) {
  return (
    <p id={id} className={`${className} small ${error ? "error" : "muted"}`}>
      {error ?? DISPLAY_NAME_ABOUT}
    </p>
  );
}

const changeDay = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" });

function UsernameSetting({ user }: { user: AccountUser }) {
  const [value, setValue] = useState(user.username);
  const check = useUsernameCheck(value, user.username);
  const { ref, isError, shake } = useShakeOnError<HTMLSpanElement>(check.problem);
  const saving = useToastAction();
  const toast = useToast();
  const [openedAt] = useState(Date.now);
  const lockedUntil = nextUsernameChange(user.usernameChangedAt, openedAt);
  const changed = !!check.username && check.username !== user.username;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const username = check.username;
    if (!changed || check.blocked || lockedUntil !== null) return;
    if (
      !window.confirm(`Change your username to @${username}? You can’t change it again for 7 days.`)
    ) {
      return;
    }
    void saving.run(async () => {
      try {
        await changeUsername(username);
      } catch (error) {
        // Turned down by the server (a blocked word, or taken a moment ago): shake, then say why.
        shake();
        throw error;
      }
      toast.show({
        title: "Username changed",
        description: `Friends can find you as @${username} now.`,
        status: "success",
      });
    });
  };

  return (
    <form className="setting" onSubmit={handleSubmit}>
      <label className="setting-name" htmlFor="profile-username">
        Username
      </label>
      <div className="inline-form">
        <span ref={ref} className={`handle-input t-input${isError ? " is-error" : ""}`}>
          <span aria-hidden="true">@</span>
          <input
            id="profile-username"
            name="username"
            value={value}
            maxLength={USERNAME_MAX_LENGTH + 1}
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            disabled={lockedUntil !== null}
            aria-invalid={isError}
            aria-describedby="profile-username-hint"
            onChange={(event) => setValue(event.target.value)}
          />
        </span>
        <button
          className="btn btn-small"
          type="submit"
          disabled={!changed || check.blocked || lockedUntil !== null || saving.busy}
        >
          Change
        </button>
      </div>
      {lockedUntil !== null ? (
        <p id="profile-username-hint" className="setting-hint muted small">
          You changed it recently. You can change it again on {changeDay.format(lockedUntil)}.
        </p>
      ) : (
        <div className="setting-hint">
          <UsernameHint id="profile-username-hint" check={check} about={USERNAME_ABOUT} />
        </div>
      )}
    </form>
  );
}

function Settings({ user }: { user: AccountUser }) {
  const [name, setName] = useState(user.displayName);
  const saving = useToastAction();
  const changed = normalizeNickname(name) !== null && name.trim() !== user.displayName;
  const nameError = displayNameProblem(name);
  const {
    ref: nameRef,
    isError: nameInvalid,
    shake: shakeName,
  } = useShakeOnError<HTMLInputElement>(nameError);

  const handleName = (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    void saving.run(async () => {
      try {
        await updateAccount({ displayName: name });
      } catch (error) {
        // Turned down by the server, e.g. a blocked word: shake, then say why.
        shakeName();
        throw error;
      }
    });
  };

  return (
    <section className="stack" id="settings" aria-labelledby="settings-title">
      <h2 id="settings-title" className="section-title">
        Settings
      </h2>
      <div className="settings wide">
        <form className="setting" onSubmit={handleName}>
          <label className="setting-name" htmlFor="profile-name">
            Display name
          </label>
          <div className="inline-form">
            <input
              ref={nameRef}
              className={`t-input${nameInvalid ? " is-error" : ""}`}
              id="profile-name"
              name="display-name"
              aria-invalid={nameInvalid}
              value={name}
              maxLength={NICKNAME_INPUT_MAX_LENGTH}
              autoComplete="nickname"
              aria-describedby="profile-name-hint"
              onChange={(event) => setName(event.target.value)}
            />
            <button className="btn btn-small" type="submit" disabled={!changed || saving.busy}>
              Save
            </button>
          </div>
          <DisplayNameHint id="profile-name-hint" error={nameError} className="setting-hint" />
        </form>
        <UsernameSetting user={user} />
        <div className="setting">
          <span className="setting-name" id="avatar-setting">
            Avatar
          </span>
          <AvatarPicker
            value={user.avatar ?? null}
            onPick={(avatar) => {
              if (isAvatarValue(avatar)) void saving.run(() => updateAccount({ avatar }));
            }}
            labelledBy="avatar-setting"
            size={48}
            disabled={saving.busy}
          />
        </div>
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
        <div className="setting">
          <span className="setting-name" id="leaderboard-label">
            Public leaderboard
          </span>
          <div className="segmented" role="group" aria-labelledby="leaderboard-label">
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={user.publicLeaderboard === value}
                disabled={saving.busy}
                onClick={() => void saving.run(() => updateAccount({ publicLeaderboard: value }))}
              >
                {value ? "Show me" : "Hide me"}
              </button>
            ))}
          </div>
          <p className="setting-hint muted small">
            Show your name, avatar and wins on the{" "}
            <a className="btn-link" {...linkTo("/stats")}>
              stats page
            </a>
            . Wins count in games with two or more players.
          </p>
        </div>
      </div>
    </section>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h * 60);
const DEFAULT_QUIET = { start: 22 * 60, end: 8 * 60 };
const hourLabel = (minutes: number) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(
    new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60),
  );

function Pings({ user }: { user: AccountUser }) {
  const support = pingSupport();
  const device = useLoaded(pingsOnThisDevice);
  const action = useToastAction();
  const quiet = user.quietHours;

  const setQuiet = (next: { start: number; end: number } | null) =>
    void action.run(() => updateAccount({ quietHours: next, timeZone: localTimeZone() }));

  return (
    <section className="stack" aria-labelledby="pings-title">
      <h2 id="pings-title" className="section-title">
        Pings
      </h2>
      <p className="muted small">
        Friends can ping you when they’re in a room and want you to join. You get a notification
        with a link straight in.
      </p>

      <div className="settings wide">
        <div className="setting">
          <span className="setting-name" id="pings-label">
            Get pings
          </span>
          <div className="segmented" role="group" aria-labelledby="pings-label">
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={user.pings === value}
                disabled={action.busy}
                onClick={() => void action.run(() => updateAccount({ pings: value }))}
              >
                {value ? "On" : "Off"}
              </button>
            ))}
          </div>
        </div>

        {user.pings && (
          <>
            <div className="setting">
              <span className="setting-name">This device</span>
              {support === "ready" ? (
                device.data === null ? (
                  <span />
                ) : device.data ? (
                  <div className="device-row">
                    <span className="ok-text">On</span>
                    <button
                      className="btn-link"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await disablePings();
                          device.reload();
                        })
                      }
                    >
                      Turn off
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-small"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await enablePings();
                        device.reload();
                      })
                    }
                  >
                    Turn on
                  </button>
                )
              ) : (
                <span className="muted small">
                  {support === "needs-install"
                    ? "Add Whizard to your Home Screen (Share, then Add to Home Screen) and open it from there to turn pings on."
                    : "This browser can’t get notifications."}
                </span>
              )}
            </div>

            <div className="setting">
              <span className="setting-name" id="quiet-label">
                Quiet hours
              </span>
              <div className="segmented" role="group" aria-labelledby="quiet-label">
                {[false, true].map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    aria-pressed={(quiet !== null) === on}
                    disabled={action.busy}
                    onClick={() => setQuiet(on ? (quiet ?? DEFAULT_QUIET) : null)}
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              {quiet && (
                <div className="setting-hint quiet-range">
                  <label className="sr-only" htmlFor="quiet-start">
                    Quiet from
                  </label>
                  <select
                    id="quiet-start"
                    name="quiet-start"
                    value={quiet.start}
                    disabled={action.busy}
                    onChange={(event) => setQuiet({ ...quiet, start: Number(event.target.value) })}
                  >
                    {HOURS.map((m) => (
                      <option key={m} value={m}>
                        {hourLabel(m)}
                      </option>
                    ))}
                  </select>
                  <span className="muted">to</span>
                  <label className="sr-only" htmlFor="quiet-end">
                    Quiet until
                  </label>
                  <select
                    id="quiet-end"
                    name="quiet-end"
                    value={quiet.end}
                    disabled={action.busy}
                    onChange={(event) => setQuiet({ ...quiet, end: Number(event.target.value) })}
                  >
                    {HOURS.map((m) => (
                      <option key={m} value={m}>
                        {hourLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}
      </div>
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
  const action = useToastAction();
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
    </section>
  );
}

function Data() {
  const action = useToastAction();
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
              // Don't leave pings for this account arriving on a signed-out browser.
              await disablePings().catch(() => undefined);
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
    </section>
  );
}
