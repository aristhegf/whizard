import { QUIZ_CATEGORIES } from "@whizard/game-core";
import {
  GROUP_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  type Friend,
  type FriendGroup,
  type PublicUser,
} from "@whizard/protocol";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAccount } from "./account";
import { createRoom } from "./api";
import { pingFriend } from "./pings";
import { linkTo, navigate, roomPath } from "./router";
import {
  addFriend,
  createGroup,
  fetchFriends,
  fetchGroups,
  fetchLeaderboard,
  fetchUser,
  inviteLink,
  leaveGroup,
  muteFriend,
  removeFriend,
  updateGroup,
} from "./social";
import { PageBar, useAction, useLoaded } from "./ui";

/** Wraps a screen that needs an account, offering sign-in first. */
function SignedInOnly({
  next,
  message,
  children,
}: {
  next: string;
  message: string;
  children: (me: { username: string }) => ReactNode;
}) {
  const account = useAccount();
  return (
    <>
      <PageBar>
        {account.status === "ready" && account.user && (
          <a className="account-link" {...linkTo("/account")}>
            {account.user.displayName}
          </a>
        )}
      </PageBar>
      {account.status === "loading" ? (
        <p className="muted">Loading…</p>
      ) : account.user ? (
        children(account.user)
      ) : (
        <div className="screen">
          <p>{message}</p>
          <a
            className="btn btn-primary btn-block"
            {...linkTo(`/account?next=${encodeURIComponent(next)}`)}
          >
            Sign in or create an account
          </a>
        </div>
      )}
    </>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="error small" role="alert">
      {error}
    </p>
  ) : null;
}

function ShareButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Add me on Whizard", url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Dismissed, or the clipboard is blocked.
    }
  };
  return (
    <button className="btn" onClick={() => void share()} aria-live="polite">
      {copied ? "Link copied" : label}
    </button>
  );
}

const record = (friend: Friend) =>
  friend.record.games === 0
    ? "No games together yet"
    : `${friend.record.games} ${friend.record.games === 1 ? "game" : "games"} · won ${friend.record.wins}, lost ${friend.record.losses}`;

// Friends -----------------------------------------------------------------------------------------

export function FriendsScreen() {
  return (
    <SignedInOnly next="/friends" message="Sign in to add friends and see how you do against them.">
      {(me) => <Friends username={me.username} />}
    </SignedInOnly>
  );
}

function Friends({ username }: { username: string }) {
  const friends = useLoaded(fetchFriends);
  const groups = useLoaded(fetchGroups);
  const action = useAction();
  const [addName, setAddName] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  const act = (work: () => Promise<unknown>) =>
    void action.run(async () => {
      await work();
      friends.reload();
      groups.reload();
    });

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const name = addName.trim().replace(/^@/, "");
    if (!name) return;
    setAdded(null);
    act(async () => {
      const { relation } = await addFriend(name);
      setAddName("");
      setAdded(
        relation === "friend"
          ? `You and @${name} are now friends.`
          : `Request sent. You’ll be friends when @${name} accepts.`,
      );
    });
  };

  const list = friends.data;

  return (
    <div className="screen">
      <h1 className="page-title">Friends</h1>

      <section className="stack" aria-label="Add a friend">
        <form className="inline-form" onSubmit={handleAdd}>
          <input
            name="friend"
            aria-label="Friend’s username"
            placeholder="Their username"
            value={addName}
            maxLength={USERNAME_MAX_LENGTH + 1}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setAddName(event.target.value)}
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={action.busy || !addName.trim()}
          >
            Add
          </button>
        </form>
        {added && (
          <p className="small" role="status">
            {added}
          </p>
        )}
        <ErrorLine error={action.error} />
        <div className="link-row">
          <span className="muted small">Or send them your link.</span>
          <ShareButton url={inviteLink(username)} label="Share my link" />
        </div>
      </section>

      <ErrorLine error={friends.error} />

      {list && list.incoming.length > 0 && (
        <section className="stack" aria-labelledby="incoming-title">
          <h2 id="incoming-title" className="section-title">
            Friend requests
          </h2>
          <ul className="people">
            {list.incoming.map((p) => (
              <li key={p.username}>
                <Person user={p} />
                <div className="row-actions">
                  <button
                    className="btn btn-small btn-primary"
                    disabled={action.busy}
                    onClick={() => act(() => addFriend(p.username))}
                  >
                    Accept
                  </button>
                  <button
                    className="btn-link"
                    disabled={action.busy}
                    onClick={() => act(() => removeFriend(p.username))}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list && (
        <section className="stack" aria-labelledby="friends-title">
          <h2 id="friends-title" className="section-title">
            Your friends
          </h2>
          {list.friends.length === 0 ? (
            <p className="muted">
              No friends yet. Add someone by their username, or share your link.
            </p>
          ) : (
            <ul className="people">
              {list.friends.map((f) => (
                <li key={f.username}>
                  <Person user={f} detail={f.muted ? `${record(f)} · Muted` : record(f)} />
                  <div className="row-actions">
                    <button
                      className="btn btn-small"
                      disabled={action.busy}
                      onClick={() =>
                        act(async () => {
                          const code = await createRoom();
                          navigate(`${roomPath(code)}?ping=${encodeURIComponent(f.username)}`);
                        })
                      }
                    >
                      Ping
                    </button>
                    <details className="more">
                      <summary aria-label={`More for ${f.displayName}`}>⋯</summary>
                      <div className="menu">
                        <button
                          className="btn-link"
                          disabled={action.busy}
                          onClick={() => act(() => muteFriend(f.username, !f.muted))}
                        >
                          {f.muted ? "Unmute pings" : "Mute pings"}
                        </button>
                        <button
                          className="btn-link danger"
                          disabled={action.busy}
                          onClick={() => {
                            if (window.confirm(`Remove ${f.displayName} from your friends?`)) {
                              act(() => removeFriend(f.username));
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {list.outgoing.length > 0 && (
            <ul className="people">
              {list.outgoing.map((p) => (
                <li key={p.username}>
                  <Person user={p} detail="Request sent" />
                  <button
                    className="btn-link"
                    disabled={action.busy}
                    onClick={() => act(() => removeFriend(p.username))}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {list && groups.data && (
        <Groups
          groups={groups.data.groups}
          friends={list.friends}
          onCreated={(id) => navigate(`/groups/${encodeURIComponent(id)}`)}
        />
      )}
    </div>
  );
}

function Person({ user, detail }: { user: PublicUser; detail?: string }) {
  return (
    <div className="person">
      <span className="person-name">{user.displayName}</span>
      <span className="muted small">
        @{user.username}
        {detail && ` · ${detail}`}
      </span>
    </div>
  );
}

// Groups ----------------------------------------------------------------------------------------

function Groups({
  groups,
  friends,
  onCreated,
}: {
  groups: FriendGroup[];
  friends: Friend[];
  onCreated: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section className="stack" aria-labelledby="groups-title">
      <h2 id="groups-title" className="section-title">
        Groups
      </h2>
      <p className="muted small">
        Save a group, like your game night crew, to see who tops each category when you play
        together.
      </p>
      {groups.length > 0 && (
        <ul className="people">
          {groups.map((g) => (
            <li key={g.id}>
              <a className="person group-link" {...linkTo(`/groups/${encodeURIComponent(g.id)}`)}>
                <span className="person-name">{g.name}</span>
                <span className="muted small">
                  {g.members.map((m) => m.displayName).join(", ")}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <GroupForm
          friends={friends}
          submitLabel="Create group"
          onCancel={() => setCreating(false)}
          onSubmit={async (name, members) => onCreated((await createGroup(name, members)).id)}
        />
      ) : (
        <button className="btn" disabled={friends.length === 0} onClick={() => setCreating(true)}>
          New group
        </button>
      )}
      {friends.length === 0 && <p className="muted small">Add a friend first.</p>}
    </section>
  );
}

function GroupForm({
  friends,
  initialName = "",
  initialMembers = [],
  submitLabel,
  onSubmit,
  onCancel,
}: {
  friends: PublicUser[];
  initialName?: string;
  initialMembers?: string[];
  submitLabel: string;
  onSubmit: (name: string, members: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [members, setMembers] = useState<Set<string>>(() => new Set(initialMembers));
  const saving = useAction();

  const toggle = (username: string, on: boolean) =>
    setMembers((current) => {
      const next = new Set(current);
      if (on) next.add(username);
      else next.delete(username);
      return next;
    });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) void saving.run(() => onSubmit(name, [...members]));
  };

  return (
    <form className="stack group-form" onSubmit={handleSubmit}>
      <label className="label" htmlFor="group-name">
        Group name
      </label>
      <input
        id="group-name"
        name="group-name"
        value={name}
        maxLength={GROUP_NAME_MAX_LENGTH}
        placeholder="e.g. Game night crew"
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
      />
      <fieldset className="stack">
        <legend className="label">Who’s in it</legend>
        {friends.map((f) => (
          <label key={f.username} className="check">
            <input
              type="checkbox"
              name="member"
              checked={members.has(f.username)}
              onChange={(event) => toggle(f.username, event.target.checked)}
            />
            <span>
              {f.displayName} <span className="muted small">@{f.username}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="link-row">
        <button className="btn btn-primary" type="submit" disabled={saving.busy || !name.trim()}>
          {submitLabel}
        </button>
        <button className="btn-link" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ErrorLine error={saving.error} />
    </form>
  );
}

export function GroupScreen({ id }: { id: string }) {
  return (
    <SignedInOnly next={`/groups/${encodeURIComponent(id)}`} message="Sign in to see this group.">
      {(me) => <Group id={id} me={me.username} />}
    </SignedInOnly>
  );
}

function Group({ id, me }: { id: string; me: string }) {
  const groups = useLoaded(fetchGroups);
  const friends = useLoaded(fetchFriends);
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const leaving = useAction();
  const loadBoard = useCallback(() => fetchLeaderboard(id, category), [id, category]);
  const board = useLoaded(loadBoard);

  if (groups.error) return <ErrorLine error={groups.error} />;
  if (!groups.data) return <p className="muted">Loading…</p>;
  const group = groups.data.groups.find((g) => g.id === id);
  if (!group) {
    return (
      <div className="screen">
        <p>This group doesn’t exist, or you’re not in it.</p>
        <a className="btn-link" {...linkTo("/friends")}>
          Back to friends
        </a>
      </div>
    );
  }
  const owner = group.owner === me;

  return (
    <div className="screen">
      <header className="stack">
        <a className="btn-link back" {...linkTo("/friends")}>
          ← Friends
        </a>
        <h1 className="page-title">{group.name}</h1>
        <p className="muted small">{group.members.map((m) => m.displayName).join(", ")}</p>
      </header>

      <div className="setting">
        <label className="setting-name" htmlFor="board-category">
          Category
        </label>
        <select
          id="board-category"
          name="category"
          value={category ?? ""}
          onChange={(event) => setCategory(event.target.value || null)}
        >
          <option value="">All categories</option>
          {QUIZ_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <ErrorLine error={board.error} />
      {board.data && board.data.standings.every((s) => s.games === 0) ? (
        <p className="muted">
          No games together yet{category ? " in this category" : ""}. Play in the same room and the
          leaderboard fills in.
        </p>
      ) : (
        board.data && (
          <ol className="board" aria-label="Leaderboard">
            {board.data.standings.map((s, i) => (
              <li
                key={s.username}
                className={[i === 0 && s.wins > 0 ? "first" : "", s.username === me ? "me" : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="rank">{i + 1}</span>
                <span className="name">{s.displayName}</span>
                <span className="pts">
                  {s.wins} <span className="muted small">/ {s.games}</span>
                </span>
              </li>
            ))}
          </ol>
        )
      )}
      <p className="muted small">
        Wins out of games played together. Counts games where at least two of you finished.
      </p>

      {editing && friends.data ? (
        <GroupForm
          friends={friends.data.friends}
          initialName={group.name}
          initialMembers={group.members.map((m) => m.username).filter((u) => u !== me)}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (name, members) => {
            await updateGroup(group.id, name, members);
            setEditing(false);
            groups.reload();
            board.reload();
          }}
        />
      ) : (
        <div className="link-row">
          {owner && (
            <button className="btn" onClick={() => setEditing(true)}>
              Edit group
            </button>
          )}
          <button
            className="btn-link danger"
            disabled={leaving.busy}
            onClick={() => {
              const question = owner
                ? `Delete ${group.name}? This can’t be undone.`
                : `Leave ${group.name}?`;
              if (!window.confirm(question)) return;
              void leaving.run(async () => {
                await leaveGroup(group.id);
                navigate("/friends");
              });
            }}
          >
            {owner ? "Delete group" : "Leave group"}
          </button>
        </div>
      )}
      <ErrorLine error={leaving.error} />
    </div>
  );
}

// Invite links ------------------------------------------------------------------------------------

export function AddFriendScreen({ username }: { username: string }) {
  const account = useAccount();
  const load = useCallback(() => fetchUser(username), [username]);
  const profile = useLoaded(load);
  const action = useAction();
  const signedIn = account.status === "ready" && !!account.user;

  return (
    <>
      <PageBar />
      <div className="screen">
        <ErrorLine error={profile.error} />
        {profile.data && (
          <>
            <header>
              <h1 className="page-title">{profile.data.user.displayName}</h1>
              <p className="muted">@{profile.data.user.username}</p>
            </header>
            {!signedIn ? (
              <div className="stack">
                <p>
                  {profile.data.user.displayName} wants to be friends on Whizard. Sign in or create
                  an account to add them.
                </p>
                <a
                  className="btn btn-primary btn-block"
                  {...linkTo(`/account?next=${encodeURIComponent(`/add/${username}`)}`)}
                >
                  Sign in or create an account
                </a>
              </div>
            ) : profile.data.relation === "self" ? (
              <p>This is your invite link. Send it to friends so they can add you.</p>
            ) : profile.data.relation === "friend" ? (
              <div className="stack">
                <p>You’re friends.</p>
                <a className="btn" {...linkTo("/friends")}>
                  See your friends
                </a>
              </div>
            ) : profile.data.relation === "outgoing" ? (
              <p>Request sent. You’ll be friends when they accept.</p>
            ) : (
              <div className="stack">
                <p>
                  {profile.data.relation === "incoming"
                    ? `${profile.data.user.displayName} sent you a friend request.`
                    : `Add ${profile.data.user.displayName} to see your record against each other and play together.`}
                </p>
                <button
                  className="btn btn-primary"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await addFriend(username);
                      profile.reload();
                    })
                  }
                >
                  {profile.data.relation === "incoming" ? "Accept friend request" : "Add friend"}
                </button>
              </div>
            )}
            <ErrorLine error={action.error} />
          </>
        )}
      </div>
    </>
  );
}

// From a game -----------------------------------------------------------------------------------

/** Signed-in players you played with who aren't your friends yet, with a button to add each. */
export function AddFromGame({ usernames }: { usernames: string[] }) {
  const account = useAccount();
  const me = account.status === "ready" ? account.user?.username : undefined;
  if (!me) return null;
  const others = usernames.filter((u) => u !== me);
  if (others.length === 0) return null;
  return <AddFromGameList usernames={others} />;
}

function AddFromGameList({ usernames }: { usernames: string[] }) {
  const friends = useLoaded(fetchFriends);
  /** What happened to each request made here: "Friends" or "Request sent". */
  const [sent, setSent] = useState<Map<string, string>>(new Map());
  const action = useAction();
  if (!friends.data) return null;
  const known = new Set([
    ...friends.data.friends.map((f) => f.username),
    ...friends.data.outgoing.map((f) => f.username),
  ]);
  const candidates = usernames.filter((u) => !known.has(u) || sent.has(u));
  if (candidates.length === 0) return null;

  return (
    <section className="stack" aria-labelledby="add-from-game">
      <h2 className="label" id="add-from-game">
        Add as a friend
      </h2>
      <ul className="people">
        {candidates.map((u) => (
          <li key={u}>
            <span className="person-name">@{u}</span>
            {sent.has(u) ? (
              <span className="muted small">{sent.get(u)}</span>
            ) : (
              <button
                className="btn btn-small"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const { relation } = await addFriend(u);
                    const label = relation === "friend" ? "Friends" : "Request sent";
                    setSent((s) => new Map(s).set(u, label));
                  })
                }
              >
                Add
              </button>
            )}
          </li>
        ))}
      </ul>
      <ErrorLine error={action.error} />
    </section>
  );
}

// Pings from the lobby ---------------------------------------------------------------------------

type PingStatus = "sending" | "sent" | "held" | string;

/** In a room's lobby: ping friends to join. `?ping=username` in the URL pings them straight away. */
export function PingFriends({ code }: { code: string }) {
  const account = useAccount();
  if (account.status !== "ready" || !account.user) return null;
  return <PingFriendsList code={code} />;
}

function PingFriendsList({ code }: { code: string }) {
  const [autoPing] = useState(() => new URLSearchParams(location.search).get("ping"));
  const [open, setOpen] = useState(autoPing !== null);
  const [status, setStatus] = useState<Map<string, PingStatus>>(new Map());
  const friends = useLoaded(fetchFriends);

  const ping = useCallback(
    async (username: string) => {
      const set = (value: PingStatus) => setStatus((s) => new Map(s).set(username, value));
      set("sending");
      try {
        const { sent } = await pingFriend(username, code);
        set(sent ? "sent" : "held");
      } catch (error) {
        set(error instanceof Error ? error.message : "Couldn’t ping them.");
      }
    },
    [code],
  );

  // A ref, so a remount (React's strict mode does one in development) can't ping twice.
  const autoPinged = useRef(false);
  useEffect(() => {
    if (!autoPing || autoPinged.current) return;
    autoPinged.current = true;
    history.replaceState(null, "", location.pathname);
    void ping(autoPing);
  }, [autoPing, ping]);

  if (!open) {
    return (
      <button className="btn-link ping-toggle" onClick={() => setOpen(true)}>
        Ping a friend to join
      </button>
    );
  }

  const list = friends.data?.friends ?? [];
  return (
    <section className="stack" aria-labelledby="ping-title">
      <h2 className="label" id="ping-title">
        Ping a friend
      </h2>
      {friends.data && list.length === 0 && (
        <p className="muted small">
          Add friends first on your <a {...linkTo("/friends")}>friends page</a>.
        </p>
      )}
      <ul className="people compact">
        {list.map((f) => {
          const state = status.get(f.username);
          return (
            <li key={f.username}>
              <span className="person-name">{f.displayName}</span>
              {state === undefined ? (
                <button className="btn btn-small" onClick={() => void ping(f.username)}>
                  Ping
                </button>
              ) : (
                <span className={`small ${state === "sent" ? "ok-text" : "muted"}`} role="status">
                  {state === "sending"
                    ? "Pinging…"
                    : state === "sent"
                      ? "Pinged"
                      : state === "held"
                        ? "Can’t get pings now"
                        : state}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
