import type { PlayerProfile, SharedMatch } from "@whizard/protocol";
import { useCallback, useEffect } from "react";
import { useAccount } from "./account";
import { dayLabel, gameInfo, matchTitle, ordinal } from "./matchInfo";
import { linkTo, navigate, playerPath } from "./router";
import { addFriend, fetchProfile, muteFriend, pingToPlay, removeFriend } from "./social";
import { Avatar } from "./ui/Avatar";
import { TopLayout } from "./ui/Chrome";
import { useLoaded } from "./ui/common";
import { useConfirm } from "./ui/ConfirmDialog";
import { Icon } from "./ui/Icon";
import { Loading } from "./ui/Loading";
import { useToast, useToastAction } from "./ui/toast";

/**
 * Another player's profile. Everyone signed in sees who they are and can add them; friends also
 * see how the two of you do against each other, their numbers and your games together.
 */
export function PlayerScreen({ username }: { username: string }) {
  const account = useAccount();
  return (
    <TopLayout active="friends" className="account-page player-page" column>
      {account.status === "loading" ? (
        <Loading />
      ) : account.user ? (
        <Player
          username={username}
          me={{
            username: account.user.username,
            avatar: account.user.avatar,
          }}
        />
      ) : (
        <div className="screen">
          <h1 className="page-title">@{username}</h1>
          <a
            className="btn btn-primary btn-block"
            {...linkTo(`/account?next=${encodeURIComponent(playerPath(username))}`)}
          >
            Sign in or create an account
          </a>
        </div>
      )}
    </TopLayout>
  );
}

const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

/** Back where you came from, or to your friends if this page was opened first. */
function goBack() {
  if (history.length > 1) history.back();
  else navigate("/friends");
}

function Player({
  username,
  me,
}: {
  username: string;
  me: { username: string; avatar: string | null };
}) {
  const load = useCallback(() => fetchProfile(username), [username]);
  const profile = useLoaded(load);
  const relation = profile.data?.relation;

  // Your own page is your profile.
  useEffect(() => {
    if (relation === "self") {
      history.replaceState(null, "", "/account");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [relation]);

  if (profile.error) {
    return (
      <div className="screen">
        <p className="error" role="alert">
          {profile.error}
        </p>
      </div>
    );
  }
  if (!profile.data || relation === "self") return <Loading />;
  const { user, friend } = profile.data;

  const status =
    relation === "friend" && friend
      ? `Friends since ${monthYear.format(friend.since)}`
      : relation === "incoming"
        ? "Wants to be friends"
        : relation === "outgoing"
          ? "Request sent"
          : null;

  return (
    <div className="player">
      <header className="sub-head">
        <button className="icon-btn" aria-label="Back" title="Back" onClick={goBack}>
          <Icon name="chevronLeft" size={26} stroke={2.2} />
        </button>
        <span className="sub-head-title">{friend ? "Friend" : "Player"}</span>
        {friend && <FriendMenu profile={profile.data} onChange={profile.reload} />}
      </header>

      <section className="player-card" aria-label={user.displayName}>
        <span className="player-avatar">
          <Avatar id={user.avatar} name={user.username} size={96} />
        </span>
        <h1 className="profile-name">{user.displayName}</h1>
        <p className="profile-handle">
          @{user.username}
          {status && ` · ${status}`}
        </p>
        <FriendAction profile={profile.data} onChange={profile.reload} />
      </section>

      {friend && (
        <>
          <section className="head-to-head" aria-label={`You and ${user.displayName}`}>
            <span className="h2h-side">
              <Avatar id={me.avatar} name={me.username} size={48} />
              <span>You</span>
            </span>
            <span className="h2h-score">
              <span className="h2h-numbers">
                {friend.record.wins} <span className="h2h-dash">–</span> {friend.record.losses}
              </span>
              <span className="h2h-games">
                {friend.record.games === 0
                  ? "No games together yet"
                  : `${friend.record.games} ${friend.record.games === 1 ? "game" : "games"} together`}
              </span>
            </span>
            <span className="h2h-side">
              <Avatar id={user.avatar} name={user.username} size={48} />
              <span>{user.displayName}</span>
            </span>
          </section>

          <dl className="stat-tiles three">
            <div>
              <dt>Games</dt>
              <dd>{friend.stats.played}</dd>
            </div>
            <div>
              <dt>Wins</dt>
              <dd>{friend.stats.wins}</dd>
            </div>
            <div>
              <dt>Plays most</dt>
              <dd className="tile-word">
                {friend.stats.topGame ? gameInfo(friend.stats.topGame).name : "–"}
              </dd>
            </div>
          </dl>

          {friend.together.length > 0 && (
            <section className="profile-history" aria-labelledby="together-title">
              <h2 id="together-title" className="profile-heading">
                Played together
              </h2>
              <ul className="matches together">
                {friend.together.map((m) => (
                  <SharedRow key={m.id} match={m} name={user.displayName} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Who did better: "You won", "Tolu won", or both places when someone else won. */
function SharedRow({ match, name }: { match: SharedMatch; name: string }) {
  const ahead = match.myPlacing < match.theirPlacing;
  const result =
    match.myPlacing === 1
      ? "You won"
      : match.theirPlacing === 1
        ? `${name} won`
        : `You ${ordinal(match.myPlacing)}, ${name} ${ordinal(match.theirPlacing)}`;
  return (
    <li>
      <img src={gameInfo(match.game).art} alt="" width={40} height={40} loading="lazy" />
      <span className="match-text">
        <span className="match-title">{matchTitle(match)}</span>
        <span className="match-detail">{dayLabel(match.finishedAt)}</span>
      </span>
      <span className={ahead ? "match-outcome won" : "match-outcome lost"}>{result}</span>
    </li>
  );
}

/** Ping a friend to play; add, accept or wait on anyone else. */
function FriendAction({ profile, onChange }: { profile: PlayerProfile; onChange: () => void }) {
  const action = useToastAction();
  const toast = useToast();
  const { user, relation } = profile;

  if (relation === "friend") {
    return (
      <button
        className="primary-pill"
        disabled={action.busy}
        onClick={() => void action.run(() => pingToPlay(user.username))}
      >
        <Icon name="bell" size={20} />
        Ping to play
      </button>
    );
  }
  if (relation === "outgoing") {
    return (
      <button className="primary-pill quiet" disabled>
        Requested
      </button>
    );
  }
  return (
    <button
      className="primary-pill"
      disabled={action.busy}
      onClick={() =>
        void action.run(async () => {
          const result = await addFriend(user.username);
          toast.show({
            title: result.relation === "friend" ? "You’re friends now" : "Request sent",
            status: "success",
          });
          onChange();
        })
      }
    >
      <Icon name="userPlus" size={20} />
      {relation === "incoming" ? "Accept" : "Add friend"}
    </button>
  );
}

/** The ⋯ menu on a friend's page: mute their pings, or remove them. */
function FriendMenu({ profile, onChange }: { profile: PlayerProfile; onChange: () => void }) {
  const ask = useConfirm();
  const action = useToastAction();
  const { user, friend } = profile;
  if (!friend) return null;
  return (
    <details className="more">
      <summary aria-label={`More for ${user.displayName}`}>
        <Icon name="more" size={22} />
      </summary>
      <div className="menu">
        <button
          className="btn-link"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await muteFriend(user.username, !friend.muted);
              onChange();
            })
          }
        >
          {friend.muted ? "Unmute pings" : "Mute pings"}
        </button>
        <button
          className="btn-link danger"
          disabled={action.busy}
          onClick={() =>
            ask({
              title: `Remove ${user.displayName} from your friends?`,
              yes: "Remove",
              run: () =>
                void action.run(async () => {
                  await removeFriend(user.username);
                  onChange();
                }),
            })
          }
        >
          Remove
        </button>
      </div>
    </details>
  );
}
