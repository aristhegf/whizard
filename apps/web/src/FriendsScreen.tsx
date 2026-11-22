import {
  GROUP_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  type Friend,
  type FriendGroup,
  type GroupAssignment,
  type PublicUser,
} from "@whizard/protocol";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAccount } from "./account";
import { createRoom } from "./api";
import { fetchBanks } from "./banks";
import { pingFriend } from "./pings";
import { linkTo, navigate, playerPath, roomPath } from "./router";
import {
  addFriend,
  createGroup,
  createGroupAssignment,
  deleteGroupAssignment,
  fetchFriends,
  fetchGroup,
  fetchGroupAssignments,
  fetchGroups,
  fetchLeaderboard,
  fetchUser,
  inviteLink,
  joinGroup,
  leaveGroup,
  muteFriend,
  pingToPlay,
  removeFriend,
  shareLink,
  updateGroup,
} from "./social";
import { useTopics } from "./topics";
import { Avatar } from "./ui/Avatar";
import { TopLayout } from "./ui/Chrome";
import { errorText, useLoaded } from "./ui/common";
import { useConfirm } from "./ui/ConfirmDialog";
import { useErrorShake, useShakeOnError } from "./ui/errorShake";
import { HeadingHint } from "./ui/HeadingHint";
import { Icon } from "./ui/Icon";
import { Loading } from "./ui/Loading";
import { useToast, useToastAction } from "./ui/toast";

/** Wraps a screen that needs an account, offering sign-in first. */
function SignedInOnly({
  title,
  next,
  message,
  children,
}: {
  /** The page's heading, shown to guests too. */
  title: string;
  next: string;
  message: string;
  children: (me: { username: string }) => ReactNode;
}) {
  const account = useAccount();
  return (
    <TopLayout active="friends" className="account-page" column>
      {account.status === "loading" ? (
        <Loading />
      ) : account.user ? (
        children(account.user)
      ) : (
        <div className="screen">
          <header>
            <h1 className="page-title">{title}</h1>
            <p className="page-sub">{message}</p>
          </header>
          <a
            className="btn btn-primary btn-block"
            {...linkTo(`/account?next=${encodeURIComponent(next)}`)}
          >
            Sign in or create an account
          </a>
        </div>
      )}
    </TopLayout>
  );
}

/** Whether an assignment's due time has passed, checked against the clock at render time. */
function isOverdue(dueAt: number | null): boolean {
  return dueAt ? dueAt < Date.now() : false;
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
    if ((await shareLink(url)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    <SignedInOnly
      title="Friends"
      next="/friends"
      message="Sign in to add friends and see how you do against them."
    >
      {(me) => <Friends username={me.username} />}
    </SignedInOnly>
  );
}

function Friends({ username }: { username: string }) {
  const ask = useConfirm();
  const friends = useLoaded(fetchFriends);
  const groups = useLoaded(fetchGroups);
  const action = useToastAction();
  const toast = useToast();
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { ref, isError, message } = useShakeOnError<HTMLInputElement>(addError, attempt);

  const act = (work: () => Promise<unknown>) =>
    void action.run(async () => {
      await work();
      friends.reload();
      groups.reload();
    });

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const name = addName.trim().replace(/^@/, "");
    if (!name || adding) return;
    setAdding(true);
    addFriend(name)
      .then(({ relation }) => {
        setAddName("");
        toast.show(
          relation === "friend"
            ? { title: `You and @${name} are now friends`, status: "success" }
            : {
                title: "Request sent",
                description: `You’ll be friends when @${name} accepts.`,
                status: "success",
              },
        );
        friends.reload();
      })
      .catch((error: unknown) => {
        // Shown under the field, which shakes: nobody by that name, or already friends.
        setAddError(errorText(error));
        setAttempt((n) => n + 1);
      })
      .finally(() => setAdding(false));
  };

  const list = friends.data;

  return (
    <div className="screen">
      <h1 className="page-title">Friends</h1>

      <section className="stack" aria-label="Add a friend">
        <div className={`t-input-wrap stack${isError ? " is-error" : ""}`}>
          <form className="inline-form" onSubmit={handleAdd}>
            <input
              ref={ref}
              className={`t-input${isError ? " is-error" : ""}`}
              name="friend"
              aria-label="Friend’s username"
              aria-invalid={isError}
              aria-describedby="add-friend-error"
              placeholder="Their username"
              value={addName}
              maxLength={USERNAME_MAX_LENGTH + 1}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setAddName(event.target.value);
                setAddError(null);
              }}
            />
            <button className="btn btn-primary" type="submit" disabled={adding || !addName.trim()}>
              Add
            </button>
          </form>
          <p id="add-friend-error" className="t-error-msg error small" role="alert">
            {message}
          </p>
        </div>
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
                      onClick={() => act(() => pingToPlay(f.username))}
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
                          onClick={() =>
                            ask({
                              title: `Remove ${f.displayName} from your friends?`,
                              yes: "Remove",
                              run: () => act(() => removeFriend(f.username)),
                            })
                          }
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

/** Someone in a list, opening their profile when tapped. */
function Person({ user, detail }: { user: PublicUser; detail?: string }) {
  return (
    <a className="person-row" {...linkTo(playerPath(user.username))}>
      <Avatar id={user.avatar} name={user.username} size={44} />
      <div className="person">
        <span className="person-name">{user.displayName}</span>
        <span className="muted small">
          @{user.username}
          {detail && ` · ${detail}`}
        </span>
      </div>
    </a>
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
      <div className="hint-row">
        <h2 id="groups-title" className="section-title">
          Groups
        </h2>
        <HeadingHint id="friends-groups" label="About groups">
          Save a group, like your game night crew, to see who tops each category when you play
          together.
        </HeadingHint>
      </div>
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
        <button className="btn" onClick={() => setCreating(true)}>
          New group
        </button>
      )}
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
  const saving = useToastAction();
  const { ref, shake } = useErrorShake<HTMLInputElement>();

  const toggle = (username: string, on: boolean) =>
    setMembers((current) => {
      const next = new Set(current);
      if (on) next.add(username);
      else next.delete(username);
      return next;
    });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void saving.run(async () => {
      try {
        await onSubmit(name, [...members]);
      } catch (error) {
        // Turned down, e.g. a blocked word in the name: shake, then say why.
        shake();
        throw error;
      }
    });
  };

  return (
    <form className="stack group-form" onSubmit={handleSubmit}>
      <label className="label" htmlFor="group-name">
        Group name
      </label>
      <input
        ref={ref}
        className="t-input"
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
        {friends.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            No friends yet. You can invite members directly with the group link after creating.
          </p>
        ) : (
          friends.map((f) => (
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
          ))
        )}
      </fieldset>
      <div className="link-row">
        <button className="btn btn-primary" type="submit" disabled={saving.busy || !name.trim()}>
          {submitLabel}
        </button>
        <button className="btn-link" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function GroupScreen({ id }: { id: string }) {
  return (
    <SignedInOnly
      title="Study Group"
      next={`/groups/${encodeURIComponent(id)}`}
      message="Sign in to see this group and its assignments."
    >
      {(me) => <Group id={id} me={me.username} />}
    </SignedInOnly>
  );
}

function Group({ id, me }: { id: string; me: string }) {
  const toast = useToast();
  const [joining, setJoining] = useState(false);

  const loadGroup = useCallback(() => fetchGroup(id), [id]);
  const groupQuery = useLoaded(loadGroup);

  if (groupQuery.error) return <ErrorLine error={groupQuery.error} />;
  if (!groupQuery.data) return <Loading />;

  const { group, isMember } = groupQuery.data;

  if (!isMember) {
    return (
      <div className="screen">
        <header className="stack">
          <a className="btn-link back" {...linkTo("/friends")}>
            ← Friends
          </a>
          <h1 className="page-title">{group.name}</h1>
          <p className="muted small">
            Created by @{group.owner} • {group.members.length} members
          </p>
        </header>

        <section className="group-invite-banner" aria-label="Group Invitation">
          <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Join this Study Group</h2>
          <p className="muted small" style={{ margin: 0, maxWidth: 440 }}>
            You’ve been invited to join <strong>{group.name}</strong>. Members get access to shared
            question banks, tutor assignment links, solo practice sessions, and group study
            leaderboards.
          </p>
          <div className="people" style={{ justifyContent: "center" }}>
            {group.members.map((m) => (
              <span key={m.username} className="avatar-chip">
                <Avatar id={m.avatar} name={m.displayName} size={28} />
                <span className="small">{m.displayName}</span>
              </span>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minWidth: 180 }}
            disabled={joining}
            onClick={async () => {
              setJoining(true);
              try {
                await joinGroup(id);
                toast.show({ title: `Joined ${group.name}!`, status: "success" });
                groupQuery.reload();
              } catch (e) {
                setJoining(false);
                toast.show({ title: errorText(e), status: "error" });
              }
            }}
          >
            <Icon name="users" /> {joining ? "Joining…" : "Join Study Group"}
          </button>
        </section>
      </div>
    );
  }

  return <GroupDetail id={id} me={me} group={group} onReloadGroup={() => groupQuery.reload()} />;
}

function GroupDetail({
  id,
  me,
  group,
  onReloadGroup,
}: {
  id: string;
  me: string;
  group: FriendGroup;
  onReloadGroup: () => void;
}) {
  const ask = useConfirm();
  const toast = useToast();

  const friends = useLoaded(fetchFriends);
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const leaving = useToastAction();
  const loadBoard = useCallback(() => fetchLeaderboard(id, category), [id, category]);
  const board = useLoaded(loadBoard);
  const { topics } = useTopics();

  // Study assignments
  const loadAssignments = useCallback(() => fetchGroupAssignments(id), [id]);
  const assignments = useLoaded(loadAssignments);
  const userBanks = useLoaded(fetchBanks);

  const [assigning, setAssigning] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [targetScore, setTargetScore] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(new Set());
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const targetAssignmentId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("assignment")
      : null;

  useEffect(() => {
    if (targetAssignmentId) {
      const el = document.getElementById(`assignment-${targetAssignmentId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [targetAssignmentId, assignments.data]);

  const owner = group.owner === me;

  const handleCreateAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBankId) {
      toast.show({ title: "Please select a question bank.", status: "error" });
      return;
    }
    try {
      const parsedTarget = targetScore ? parseInt(targetScore, 10) : null;
      const parsedDue = dueDate ? new Date(`${dueDate}T23:59:59`).getTime() : null;
      await createGroupAssignment(id, {
        bankId: selectedBankId,
        targetScore: parsedTarget && !isNaN(parsedTarget) ? parsedTarget : null,
        dueAt: parsedDue && !isNaN(parsedDue) ? parsedDue : null,
        notes: notes.trim() || null,
      });
      toast.show({ title: "Assigned question bank to group!", status: "success" });
      setAssigning(false);
      setSelectedBankId("");
      setTargetScore("");
      setDueDate("");
      setNotes("");
      assignments.reload();
    } catch (e) {
      toast.show({ title: errorText(e), status: "error" });
    }
  };

  const handlePractice = async (assignment: GroupAssignment) => {
    if (launchingId) return;
    setLaunchingId(assignment.id);
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(
          "whizard_active_assignment",
          JSON.stringify({ groupId: id, assignmentId: assignment.id }),
        );
      }
      const count =
        assignment.questionCount >= 20
          ? 20
          : assignment.questionCount >= 15
            ? 15
            : assignment.questionCount >= 10
              ? 10
              : 5;
      const code = await createRoom(
        {
          bankId: assignment.bankId,
          bankName: assignment.bankName,
          category: "general-knowledge",
          difficulty: "easy",
          count,
        },
        "quiz",
      );
      navigate(roomPath(code));
    } catch (e) {
      setLaunchingId(null);
      toast.show({ title: errorText(e), status: "error" });
    }
  };

  const toggleBoard = (assignmentId: string) => {
    setExpandedBoards((prev) => {
      const next = new Set(prev);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  };

  const copyAssignmentLink = async (assignmentId: string) => {
    const url = `${window.location.origin}/groups/${encodeURIComponent(id)}?assignment=${encodeURIComponent(assignmentId)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ title: "Tutor assignment link copied to clipboard!", status: "success" });
    } catch {
      toast.show({ title: "Could not copy link", status: "error" });
    }
  };

  const copyGroupLink = async () => {
    const url = `${window.location.origin}/groups/${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ title: "Group invite link copied to clipboard!", status: "success" });
    } catch {
      toast.show({ title: "Could not copy link", status: "error" });
    }
  };

  return (
    <div className="screen">
      <header className="stack">
        <a className="btn-link back" {...linkTo("/friends")}>
          ← Friends
        </a>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>
              {group.name}
            </h1>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {owner ? "Hosted by you (Tutor)" : `Tutor: @${group.owner}`} • {group.members.length}{" "}
              members
            </p>
          </div>
          <button type="button" className="btn small" onClick={() => void copyGroupLink()}>
            <Icon name="link" size={16} /> Copy group link
          </button>
        </div>
        <p className="muted small">{group.members.map((m) => m.displayName).join(", ")}</p>
      </header>

      {/* Study Assignments Section */}
      <section className="study-assignments stack" aria-label="Study Assignments">
        <div className="study-assignments-header">
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>
              Study Assignments
              {assignments.data && assignments.data.assignments.length > 0 && (
                <span className="bank-badge ready" style={{ marginLeft: 8 }}>
                  {assignments.data.assignments.length}
                </span>
              )}
            </h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Question banks assigned for study, practice, and mastery tracking.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setAssigning((v) => !v)}>
            <Icon name="plus" size={16} /> Assign question bank
          </button>
        </div>

        {assigning && (
          <form className="question-form" onSubmit={handleCreateAssignment}>
            <h3 style={{ margin: "0 0 10px", fontSize: "1.05rem" }}>Assign Question Bank</h3>
            <div className="setting">
              <label className="setting-name" htmlFor="assign-bank">
                Bank
              </label>
              <select
                id="assign-bank"
                required
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
              >
                <option value="">Select a question bank…</option>
                {userBanks.data &&
                  userBanks.data.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.questionCount} {b.questionCount === 1 ? "question" : "questions"}
                      {b.exam ? ` · ${b.exam}` : ""})
                    </option>
                  ))}
              </select>
            </div>

            <div className="setting">
              <label className="setting-name" htmlFor="assign-target">
                Target score (%)
              </label>
              <input
                id="assign-target"
                type="number"
                min="1"
                max="100"
                placeholder="e.g. 80"
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
              />
            </div>

            <div className="setting">
              <label className="setting-name" htmlFor="assign-due">
                Due date
              </label>
              <input
                id="assign-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="setting">
              <label className="setting-name" htmlFor="assign-notes">
                Tutor notes
              </label>
              <textarea
                id="assign-notes"
                maxLength={300}
                rows={2}
                placeholder="Instructions for students (e.g. Complete before Thursday class)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="link-row" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn-primary">
                Assign to group
              </button>
              <button type="button" className="btn-link" onClick={() => setAssigning(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <ErrorLine error={assignments.error} />
        {assignments.data && assignments.data.assignments.length === 0 && !assigning && (
          <p className="muted" style={{ padding: "12px 0" }}>
            No study assignments yet. Click &quot;Assign question bank&quot; to assign a bank for
            members to practice.
          </p>
        )}

        {assignments.data &&
          assignments.data.assignments.map((assignment) => {
            const isHighlighted = assignment.id === targetAssignmentId;
            const isBoardOpen = expandedBoards.has(assignment.id);
            const isDueOverdue = isOverdue(assignment.dueAt);
            const canDelete = owner || assignment.assignedBy.username === me;

            return (
              <div
                key={assignment.id}
                id={`assignment-${assignment.id}`}
                className={`assignment-card${isHighlighted ? " highlighted" : ""}`}
              >
                <div className="assignment-head">
                  <div className="assignment-title-area">
                    <h3 className="assignment-title">
                      <a {...linkTo(`/banks/${encodeURIComponent(assignment.bankId)}`)}>
                        {assignment.bankName}
                      </a>
                    </h3>
                    <div className="assignment-badges">
                      {assignment.exam && <span className="bank-badge">{assignment.exam}</span>}
                      {assignment.subject && (
                        <span className="bank-badge">{assignment.subject}</span>
                      )}
                      <span className="bank-badge ready">{assignment.questionCount} questions</span>
                      {assignment.targetScore && (
                        <span className="bank-badge warning">
                          🎯 Target: {assignment.targetScore}%
                        </span>
                      )}
                      {assignment.dueAt && (
                        <span
                          className={`bank-badge ${isDueOverdue ? "warning" : ""}`}
                          style={
                            isDueOverdue ? { color: "#ff9aaa", borderColor: "#ff9aaa" } : undefined
                          }
                        >
                          ⏰{" "}
                          {isDueOverdue
                            ? "Overdue"
                            : `Due ${new Date(assignment.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="assignment-meta">
                    <span className="assignment-assigner">
                      <Avatar
                        id={assignment.assignedBy.avatar}
                        name={assignment.assignedBy.displayName}
                        size={20}
                      />
                      <span className="small muted">by @{assignment.assignedBy.username}</span>
                    </span>
                  </div>
                </div>

                {assignment.notes && (
                  <div className="assignment-notes">
                    <strong>💬 Tutor note:</strong> {assignment.notes}
                  </div>
                )}

                <div
                  className={`assignment-status-banner ${assignment.myCompletion ? "completed" : "pending"}`}
                >
                  {assignment.myCompletion ? (
                    <span>
                      ✅ <strong>Completed</strong> · Score: {assignment.myCompletion.score}/
                      {assignment.myCompletion.totalQuestions} (
                      {assignment.myCompletion.accuracyPercent}%)
                      {assignment.myCompletion.attemptsCount > 1
                        ? ` · ${assignment.myCompletion.attemptsCount} attempts`
                        : ""}
                    </span>
                  ) : (
                    <span>⏳ Not completed yet</span>
                  )}
                  <span className="small muted">
                    {assignment.completions.length} of {group.members.length} members completed
                  </span>
                </div>

                <div className="assignment-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={launchingId === assignment.id || assignment.questionCount === 0}
                    onClick={() => void handlePractice(assignment)}
                  >
                    <Icon name="play" size={16} />{" "}
                    {launchingId === assignment.id ? "Launching…" : "Practice Assignment"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-cbt"
                    disabled={assignment.questionCount === 0}
                    onClick={() => {
                      sessionStorage.setItem(
                        "whizard_active_assignment",
                        JSON.stringify({ groupId: id, assignmentId: assignment.id }),
                      );
                      navigate(
                        `/banks/${encodeURIComponent(assignment.bankId)}/exam?group=${encodeURIComponent(id)}&assignment=${encodeURIComponent(assignment.id)}`,
                      );
                    }}
                  >
                    <Icon name="clock" size={16} /> Timed CBT Exam
                  </button>

                  <button
                    type="button"
                    className="btn"
                    onClick={() => void copyAssignmentLink(assignment.id)}
                  >
                    <Icon name="copy" size={16} /> Copy assignment link
                  </button>

                  <button type="button" className="btn" onClick={() => toggleBoard(assignment.id)}>
                    <Icon name="trophy" size={16} /> Leaderboard ({assignment.completions.length})
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      className="btn-link danger"
                      onClick={() =>
                        ask({
                          title: `Remove assignment "${assignment.bankName}"?`,
                          text: "This removes the assignment from this group. The question bank itself is unaffected.",
                          yes: "Remove",
                          run: async () => {
                            await deleteGroupAssignment(id, assignment.id);
                            assignments.reload();
                          },
                        })
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>

                {isBoardOpen && (
                  <div className="assignment-board">
                    <span className="assignment-board-title">
                      Assignment Completion Leaderboard
                    </span>
                    {assignment.completions.length === 0 ? (
                      <p className="muted small" style={{ margin: "4px 0 0" }}>
                        No members have completed this practice assignment yet.
                      </p>
                    ) : (
                      <ul className="assignment-board-list">
                        {assignment.completions.map((comp, idx) => (
                          <li
                            key={comp.user.username}
                            className={`assignment-board-item ${comp.user.username === me ? "me" : ""}`}
                          >
                            <div className="assignment-board-user">
                              <span className="assignment-board-rank">#{idx + 1}</span>
                              <Avatar
                                id={comp.user.avatar}
                                name={comp.user.displayName}
                                size={24}
                              />
                              <span style={{ fontWeight: 600 }}>{comp.user.displayName}</span>
                            </div>
                            <div className="assignment-board-score">
                              <span
                                style={{
                                  color:
                                    comp.accuracyPercent >= (assignment.targetScore ?? 70)
                                      ? "#6ee7b7"
                                      : "inherit",
                                }}
                              >
                                {comp.score}/{comp.totalQuestions} ({comp.accuracyPercent}%)
                              </span>
                              <span className="muted small" style={{ marginLeft: 8 }}>
                                {comp.attemptsCount}{" "}
                                {comp.attemptsCount === 1 ? "attempt" : "attempts"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </section>

      {/* Shared Multiplayer Games Leaderboard */}
      <section className="stack" aria-label="Group Games Leaderboard">
        <h2 className="section-title" style={{ margin: 0 }}>
          Group Games Leaderboard
        </h2>
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
            {topics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <ErrorLine error={board.error} />
        {board.data && board.data.standings.every((s) => s.games === 0) ? (
          <p className="muted">
            No games together yet{category ? " in this category" : ""}. Play in the same room and
            the leaderboard fills in.
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
      </section>

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
            onReloadGroup();
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
            onClick={() =>
              ask({
                title: owner ? `Delete ${group.name}?` : `Leave ${group.name}?`,
                text: owner ? "This can’t be undone." : undefined,
                yes: owner ? "Delete" : "Leave",
                run: () =>
                  void leaving.run(async () => {
                    await leaveGroup(group.id);
                    navigate("/friends");
                  }),
              })
            }
          >
            {owner ? "Delete group" : "Leave group"}
          </button>
        </div>
      )}
    </div>
  );
}

// Invite links ------------------------------------------------------------------------------------

export function AddFriendScreen({ username }: { username: string }) {
  const account = useAccount();
  const load = useCallback(() => fetchUser(username), [username]);
  const profile = useLoaded(load);
  const action = useToastAction();
  const toast = useToast();
  const signedIn = account.status === "ready" && !!account.user;

  return (
    <TopLayout active="friends" className="account-page" column>
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
                <a className="btn" {...linkTo(playerPath(profile.data.user.username))}>
                  See their profile
                </a>
                <a className="btn-link" {...linkTo("/friends")}>
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
                      const { relation } = await addFriend(username);
                      toast.show({
                        title: relation === "friend" ? "You’re friends now" : "Request sent",
                        status: "success",
                      });
                      profile.reload();
                    })
                  }
                >
                  {profile.data.relation === "incoming" ? "Accept friend request" : "Add friend"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </TopLayout>
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
  const action = useToastAction();
  const toast = useToast();
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
                    toast.show({
                      title:
                        relation === "friend" ? `You and @${u} are now friends` : "Request sent",
                      status: "success",
                    });
                  })
                }
              >
                Add
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Pings from the lobby ---------------------------------------------------------------------------

type PingStatus = "sending" | "sent" | "held" | string;

/**
 * In a room's lobby: the friends to ping, in a dialog that opens over the invites.
 * `?ping=username` in the URL pings them straight away.
 */
export function PingFriendsDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const account = useAccount();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="app-dialog ping-dialog"
      aria-labelledby="ping-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the dimmed backdrop closes it.
        if (event.target === dialog.current) onClose();
      }}
    >
      <h2 className="section-title" id="ping-title">
        Ping Friend
      </h2>
      {account.status !== "ready" ? (
        <Loading />
      ) : account.user ? (
        <PingFriendsList code={code} />
      ) : (
        <p className="muted">
          Sign in to add friends and ping them to join.{" "}
          <a {...linkTo(`/account?next=${encodeURIComponent(roomPath(code))}`)}>Sign in</a>
        </p>
      )}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}

function PingFriendsList({ code }: { code: string }) {
  const [autoPing] = useState(() => new URLSearchParams(location.search).get("ping"));
  const [status, setStatus] = useState<Map<string, PingStatus>>(new Map());
  const friends = useLoaded(fetchFriends);
  const toast = useToast();

  const ping = useCallback(
    async (username: string) => {
      const set = (value: PingStatus) => setStatus((s) => new Map(s).set(username, value));
      set("sending");
      try {
        const { sent, notified } = await pingFriend(username, code);
        set(sent ? "sent" : "held");
        toast.show(
          sent
            ? {
                title: `Pinged @${username}`,
                description: notified
                  ? "They’ve got a notification, and it’s waiting for them on Whizard."
                  : "They’ll see it as soon as they’re on Whizard.",
                status: "success",
              }
            : {
                title: `@${username} can’t get pings now`,
                description: "They may have pings off or be in quiet hours.",
                status: "info",
              },
        );
      } catch (error) {
        const message = errorText(error);
        set(message);
        toast.show({ title: "Couldn’t ping them", description: message, status: "error" });
      }
    },
    [code, toast],
  );

  // A ref, so a remount (React's strict mode does one in development) can't ping twice.
  const autoPinged = useRef(false);
  useEffect(() => {
    if (!autoPing || autoPinged.current) return;
    autoPinged.current = true;
    history.replaceState(null, "", location.pathname);
    void ping(autoPing);
  }, [autoPing, ping]);

  const list = friends.data?.friends ?? [];
  return (
    <>
      <p className="muted small">
        They’ll see it on Whizard, and get a notification if they’ve turned pings on.
      </p>
      {friends.error && (
        <p className="muted small" role="alert">
          {friends.error}
        </p>
      )}
      {!friends.data && !friends.error && <Loading />}
      {friends.data && list.length === 0 && (
        <p className="muted small">
          Add friends first on your <a {...linkTo("/friends")}>friends page</a>.
        </p>
      )}
      <ul className="people compact ping-list">
        {list.map((f) => {
          const state = status.get(f.username);
          return (
            <li key={f.username}>
              <Avatar id={f.avatar} name={f.displayName} size={36} />
              <span className="person-name">
                {f.displayName}
                <span className="muted small"> @{f.username}</span>
              </span>
              {state === undefined ? (
                <button
                  className="btn btn-small"
                  aria-label={`Ping ${f.displayName}`}
                  onClick={() => void ping(f.username)}
                >
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
    </>
  );
}
