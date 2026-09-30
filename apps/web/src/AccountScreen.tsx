import { NICKNAME_INPUT_MAX_LENGTH, normalizeNickname } from "@whizard/game-core";
import {
  USERNAME_MAX_LENGTH,
  type AccountUser,
  type MatchRecord,
  type PlayerStats,
} from "@whizard/protocol";
import { useState, type FormEvent } from "react";
import {
  fetchMatches,
  fetchStats,
  passkeysSupported,
  signIn,
  signOut,
  signUp,
  useAccount,
} from "./account";
import {
  DISPLAY_NAME_ABOUT,
  DisplayNameHint,
  USERNAME_ABOUT,
  UsernameHint,
  displayNameProblem,
  useUsernameCheck,
} from "./accountFields";
import {
  bestOf,
  dayLabel,
  formatPoints,
  gameInfo,
  matchTitle,
  ordinal,
  solveTime,
  clock,
  withWhom,
} from "./matchInfo";
import { disablePings } from "./pings";
import { linkTo, navigate, playerPath } from "./router";
import { fetchFriends, inviteLink, shareLink } from "./social";
import { loadNickname } from "./storage";
import { Avatar } from "./ui/Avatar";
import { TopLayout } from "./ui/Chrome";
import { useAction, useLoaded } from "./ui/common";
import { useShakeOnError } from "./ui/errorShake";
import { Icon } from "./ui/Icon";
import { Loading } from "./ui/Loading";
import { useToast, useToastAction } from "./ui/toast";

export function AccountScreen() {
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  return (
    <TopLayout
      active="profile"
      className={user ? "account-page profile-page" : "account-page"}
      column
    >
      {account.status === "loading" ? <Loading /> : user ? <Profile user={user} /> : <SignedOut />}
    </TopLayout>
  );
}

// Signed out ------------------------------------------------------------------------------------

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
        <DisplayNameHint id="display-name-hint" error={nameError} about={DISPLAY_NAME_ABOUT} />

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

// Signed in: the profile -----------------------------------------------------------------------

const joined = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

/** How many games a phone lists before "All N games". */
const GAMES_ON_A_PHONE = 4;

/**
 * On a phone, one column: who you are, your numbers, your games, recent games and friends. On a
 * computer, who you are, your numbers and friends are a column on the left, level with the games
 * on the right from the first game to the last recent one.
 */
function Profile({ user }: { user: AccountUser }) {
  const stats = useLoaded(fetchStats);
  return (
    <div className="profile">
      <aside className="profile-side">
        <section className="profile-card" aria-label="You">
          <div className="profile-tools">
            <SignOutButton />
            <a
              className="icon-btn"
              aria-label="Settings"
              title="Settings"
              {...linkTo("/account/settings")}
            >
              <Icon name="settings" size={22} />
            </a>
          </div>
          <span className="profile-avatar">
            <Avatar id={user.avatar} name={user.username} size={120} />
          </span>
          <h1 className="profile-name">{user.displayName}</h1>
          <p className="profile-handle">
            @{user.username} · Joined {joined.format(user.createdAt)}
          </p>
          <div className="profile-actions">
            <a className="soft-pill" {...linkTo("/account/settings#profile")}>
              Edit profile
            </a>
            <ShareProfile username={user.username} />
          </div>
        </section>
        <StatTiles stats={stats.data?.stats ?? null} error={stats.error} />
        <FriendsStrip />
      </aside>
      <YourGames stats={stats.data?.stats ?? null} />
      <History />
    </div>
  );
}

function SignOutButton() {
  const action = useToastAction();
  return (
    <button
      className="icon-btn"
      aria-label="Sign out"
      title="Sign out"
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
      <Icon name="logout" size={22} />
    </button>
  );
}

/** Sends your invite link: the share sheet on a phone, or copied to paste. */
function ShareProfile({ username }: { username: string }) {
  const toast = useToast();
  return (
    <button
      className="round-btn"
      aria-label="Share my profile"
      title="Share my profile"
      onClick={() =>
        void shareLink(inviteLink(username)).then((result) => {
          if (result === "copied") toast.show({ title: "Link copied", status: "success" });
        })
      }
    >
      <Icon name="shareOut" size={20} />
    </button>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function StatTiles({ stats, error }: { stats: PlayerStats | null; error: string | null }) {
  if (error) return <p className="error small">{error}</p>;
  if (!stats) return <div className="stat-tiles" aria-busy="true" />;
  const { played, wins, groupGames, streak } = stats;
  return (
    <dl className="stat-tiles">
      <div>
        <dt>Games</dt>
        <dd>{played}</dd>
      </div>
      <div>
        <dt>Wins</dt>
        <dd>
          {wins}
          {groupGames > 0 && <small>of {groupGames}</small>}
        </dd>
      </div>
      <div>
        <dt>Win rate</dt>
        <dd>{groupGames > 0 ? `${Math.round((wins / groupGames) * 100)}%` : "–"}</dd>
      </div>
      <div>
        <dt>Streak</dt>
        <dd>
          <span className="streak">
            {streak.current}
            {streak.current > 0 && <Icon name="flame" size={22} fill className="flame" />}
          </span>
          <small>
            {streak.current === 1 ? "day" : "days"} · best {streak.best}
          </small>
        </dd>
      </div>
    </dl>
  );
}

/** Faces of a few friends, each opening their profile, and the count, opening the friends page. */
function FriendsStrip() {
  const { data } = useLoaded(fetchFriends);
  const friends = data?.friends ?? [];
  return (
    <section className="profile-friends" aria-labelledby="friends-title">
      <h2 id="friends-title" className="profile-heading">
        Friends
      </h2>
      <div className="friends-strip" aria-busy={!data}>
        {friends.length > 0 && (
          <span className="face-stack">
            {friends.slice(0, 4).map((f) => (
              <a key={f.username} aria-label={f.displayName} {...linkTo(playerPath(f.username))}>
                <Avatar id={f.avatar} name={f.username} size={40} />
              </a>
            ))}
          </span>
        )}
        {data && (
          <a className="friends-strip-link" {...linkTo("/friends")}>
            {friends.length === 0 ? "Add friends" : plural(friends.length, "friend")}
            <Icon name="chevronRight" size={18} stroke={2.4} />
          </a>
        )}
      </div>
    </section>
  );
}

function YourGames({ stats }: { stats: PlayerStats | null }) {
  const [all, setAll] = useState(false);
  const games = stats?.games ?? [];
  return (
    <section className={all ? "profile-games all" : "profile-games"} aria-labelledby="games-title">
      <h2 id="games-title" className="profile-heading">
        Your games
      </h2>
      {!stats ? (
        <div aria-busy="true" />
      ) : games.length === 0 ? (
        <p className="muted">
          Nothing yet. <a {...linkTo("/")}>Play a game</a>
        </p>
      ) : (
        <ul className="game-stats">
          {games.map((g, i) => {
            const info = gameInfo(g.game);
            const best = g.best && bestOf(g.game, g.best);
            return (
              <li key={g.game} className={i >= GAMES_ON_A_PHONE ? "extra" : undefined}>
                <img src={info.art} alt="" width={56} height={56} loading="lazy" />
                <span className="game-stat-text">
                  <span className="game-stat-name">{info.name}</span>
                  <span className="game-stat-count">
                    {plural(g.played, "game")} · {plural(g.wins, "win")}
                  </span>
                </span>
                {best && (
                  <span className="game-best">
                    <span className="game-best-label">{best.label}</span> <b>{best.value}</b>
                    {best.on && <span className="game-best-on"> on {best.on}</span>}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {games.length > GAMES_ON_A_PHONE && !all && (
        <button className="more-link" onClick={() => setAll(true)}>
          All {games.length} games
          <Icon name="chevronRight" size={16} stroke={2.4} />
        </button>
      )}
    </section>
  );
}

/** One finished game: what and when, then where you placed and your points or time. */
function MatchRow({ match }: { match: MatchRecord }) {
  const me = match.players.find((p) => p.isMe);
  const solo = match.players.length === 1;
  const time = solveTime(match);
  const result =
    time !== null
      ? clock(time)
      : match.game === "connections" && match.myCorrect !== null
        ? `${match.myCorrect}/${match.rounds}`
        : formatPoints(me?.score ?? 0);
  return (
    <li>
      <img src={gameInfo(match.game).art} alt="" width={44} height={44} loading="lazy" />
      <span className="match-text">
        <span className="match-title">{matchTitle(match)}</span>
        <span className="match-detail">
          {withWhom(match)} · {dayLabel(match.finishedAt)}
        </span>
      </span>
      <span className="match-result">
        <span className="match-place">
          {!solo && me ? (
            <span className={me.placing === 1 ? "place first" : "place"}>
              {ordinal(me.placing)}
            </span>
          ) : time !== null ? (
            "Solved"
          ) : null}
        </span>
        <span className="match-score">{result}</span>
      </span>
    </li>
  );
}

function History() {
  const { data, error } = useLoaded(fetchMatches);
  const [older, setOlder] = useState<MatchRecord[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const loading = useToastAction();

  if (!data && !error) return null;
  const matches = [...(data?.matches ?? []), ...older];
  const hasMore = more ?? data?.more ?? false;

  const loadMore = () =>
    loading.run(async () => {
      const last = matches[matches.length - 1];
      const page = await fetchMatches(last?.finishedAt);
      setOlder((current) => [...current, ...page.matches]);
      setMore(page.more);
    });

  return (
    <section className="profile-history" aria-labelledby="history-title">
      <h2 id="history-title" className="profile-heading">
        Recent games
      </h2>
      {error ? (
        <p className="error small">{error}</p>
      ) : matches.length === 0 ? (
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
        <button className="more-link" disabled={loading.busy} onClick={() => void loadMore()}>
          {loading.busy ? "Loading…" : "Show older games"}
        </button>
      )}
    </section>
  );
}
