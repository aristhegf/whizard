import { randomToken } from "@whizard/game-core";
import {
  GROUP_MAX_MEMBERS,
  GROUP_NAME_MAX_LENGTH,
  friendRequestSchema,
  friendUpdateSchema,
  groupRequestSchema,
  normalizeUsername,
  type Friend,
  type FriendGroup,
  type FriendsList,
  type GroupStanding,
  type PublicUser,
  type Relation,
} from "@whizard/protocol";
import { requireUser } from "./account";
import type { Env } from "./env";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { asAvatar, currentSession } from "./sessions";

interface PublicRow {
  id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

const toPublic = (row: Omit<PublicRow, "id">): PublicUser => ({
  username: row.username,
  displayName: row.display_name,
  avatar: asAvatar(row.avatar),
});

async function findUser(env: Env, username: string): Promise<PublicRow> {
  const row = await env.DB.prepare(
    "SELECT id, username, display_name, avatar FROM users WHERE username = ? AND suspended_at IS NULL",
  )
    .bind(normalizeUsername(username))
    .first<PublicRow>();
  if (!row) throw new HttpError(404, "user_not_found", "Nobody has that username.");
  return row;
}

async function relationBetween(env: Env, userId: string, otherId: string): Promise<Relation> {
  if (userId === otherId) return "self";
  const row = await env.DB.prepare(
    `SELECT
       EXISTS (SELECT 1 FROM friends WHERE user_id = ?1 AND friend_id = ?2) AS friend,
       EXISTS (SELECT 1 FROM friend_requests WHERE from_id = ?2 AND to_id = ?1) AS incoming,
       EXISTS (SELECT 1 FROM friend_requests WHERE from_id = ?1 AND to_id = ?2) AS outgoing`,
  )
    .bind(userId, otherId)
    .first<{ friend: number; incoming: number; outgoing: number }>();
  if (row?.friend) return "friend";
  if (row?.incoming) return "incoming";
  if (row?.outgoing) return "outgoing";
  return "none";
}

export async function areFriends(env: Env, userId: string, otherId: string): Promise<boolean> {
  return (await relationBetween(env, userId, otherId)) === "friend";
}

/** A public profile, for invite links. Says how you're connected if you're signed in. */
export async function getUser(context: RequestContext): Promise<Response> {
  const other = await findUser(context.env, decodeURIComponent(context.params[0] ?? ""));
  const session = await currentSession(context.request, context.env, Date.now());
  const relation = session ? await relationBetween(context.env, session.user.id, other.id) : null;
  return Response.json({ user: toPublic(other), relation });
}

export async function getFriends(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const db = context.env.DB;
  const [friends, incoming, outgoing] = await db.batch<Record<string, string | number>>([
    db
      .prepare(
        `SELECT u.username, u.display_name, u.avatar, f.created_at, f.muted,
                COUNT(them.match_id) AS games,
                COALESCE(SUM(me.placing < them.placing), 0) AS wins,
                COALESCE(SUM(me.placing > them.placing), 0) AS losses
           FROM friends f
           JOIN users u ON u.id = f.friend_id
           LEFT JOIN match_players me ON me.user_id = f.user_id
           LEFT JOIN match_players them ON them.match_id = me.match_id AND them.user_id = f.friend_id
          WHERE f.user_id = ?
          GROUP BY f.friend_id
          ORDER BY games DESC, u.display_name COLLATE NOCASE`,
      )
      .bind(user.id),
    db
      .prepare(
        `SELECT u.username, u.display_name, u.avatar FROM friend_requests r
           JOIN users u ON u.id = r.from_id WHERE r.to_id = ? ORDER BY r.created_at DESC`,
      )
      .bind(user.id),
    db
      .prepare(
        `SELECT u.username, u.display_name, u.avatar FROM friend_requests r
           JOIN users u ON u.id = r.to_id WHERE r.from_id = ? ORDER BY r.created_at DESC`,
      )
      .bind(user.id),
  ]);

  const publicRow = (r: Record<string, string | number>): PublicUser => ({
    username: String(r["username"]),
    displayName: String(r["display_name"]),
    avatar: asAvatar(r["avatar"] as string | null),
  });
  const list: FriendsList = {
    friends: (friends?.results ?? []).map((r): Friend => ({
      ...publicRow(r),
      since: Number(r["created_at"]),
      muted: Number(r["muted"]) === 1,
      record: { games: Number(r["games"]), wins: Number(r["wins"]), losses: Number(r["losses"]) },
    })),
    incoming: (incoming?.results ?? []).map(publicRow),
    outgoing: (outgoing?.results ?? []).map(publicRow),
  };
  return Response.json(list, { headers: { "Cache-Control": "no-store" } });
}

/** Sends a friend request, or accepts theirs if they already asked. */
export async function addFriend(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const { username } = await readJson(context.request, friendRequestSchema);
  const other = await findUser(context.env, username);
  const relation = await relationBetween(context.env, user.id, other.id);
  const db = context.env.DB;
  const now = Date.now();

  if (relation === "self") throw new HttpError(400, "self", "That’s you!");
  if (relation === "incoming") {
    await db.batch([
      db
        .prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?")
        .bind(other.id, user.id),
      db
        .prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)")
        .bind(user.id, other.id, now),
      db
        .prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)")
        .bind(other.id, user.id, now),
    ]);
    return Response.json({ relation: "friend" satisfies Relation });
  }
  if (relation === "none") {
    await db
      .prepare(
        "INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)",
      )
      .bind(user.id, other.id, now)
      .run();
    return Response.json({ relation: "outgoing" satisfies Relation });
  }
  return Response.json({ relation });
}

/** Unfriends, declines their request or cancels yours: whatever connects the two of you. */
export async function removeFriend(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const other = await findUser(context.env, decodeURIComponent(context.params[0] ?? ""));
  const db = context.env.DB;
  await db.batch([
    db
      .prepare(
        `DELETE FROM friends
          WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)`,
      )
      .bind(user.id, other.id),
    db
      .prepare(
        `DELETE FROM friend_requests
          WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)`,
      )
      .bind(user.id, other.id),
  ]);
  return Response.json({ relation: "none" satisfies Relation });
}

export async function updateFriend(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const other = await findUser(context.env, decodeURIComponent(context.params[0] ?? ""));
  const { muted } = await readJson(context.request, friendUpdateSchema);
  const result = await context.env.DB.prepare(
    "UPDATE friends SET muted = ? WHERE user_id = ? AND friend_id = ?",
  )
    .bind(Number(muted), user.id, other.id)
    .run();
  if (result.meta.changes === 0) throw new HttpError(404, "not_friends", "You aren’t friends.");
  return Response.json({ ok: true });
}

// Groups ----------------------------------------------------------------------------------------

function groupName(input: string): string {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > GROUP_NAME_MAX_LENGTH) {
    throw new HttpError(400, "group_name_invalid", "Group names are 1 to 30 characters.");
  }
  return name;
}

/** Resolves usernames to IDs, insisting they're all the owner's friends. */
async function memberIds(env: Env, ownerId: string, usernames: string[]): Promise<string[]> {
  const unique = [...new Set(usernames.map(normalizeUsername))];
  if (unique.length === 0) return [];
  if (unique.length > GROUP_MAX_MEMBERS - 1) {
    throw new HttpError(400, "group_too_big", `Groups can have up to ${GROUP_MAX_MEMBERS} people.`);
  }
  const { results } = await env.DB.prepare(
    `SELECT u.id FROM friends f JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ? AND u.username IN (${unique.map(() => "?").join(", ")})`,
  )
    .bind(ownerId, ...unique)
    .all<{ id: string }>();
  if (results.length !== unique.length) {
    throw new HttpError(400, "not_friends", "Groups can only include your friends.");
  }
  return results.map((r) => r.id);
}

interface GroupRow {
  id: string;
  name: string;
  owner_id: string;
}

/** The group, if this user is in it. */
async function groupFor(env: Env, groupId: string, userId: string): Promise<GroupRow> {
  const row = await env.DB.prepare(
    `SELECT g.id, g.name, g.owner_id FROM friend_groups g
       JOIN friend_group_members m ON m.group_id = g.id
      WHERE g.id = ? AND m.user_id = ?`,
  )
    .bind(groupId, userId)
    .first<GroupRow>();
  if (!row) throw new HttpError(404, "group_not_found", "That group doesn’t exist.");
  return row;
}

export async function getGroups(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const { results } = await context.env.DB.prepare(
    `SELECT g.id, g.name, owner.username AS owner, u.username, u.display_name, u.avatar
       FROM friend_group_members mine
       JOIN friend_groups g ON g.id = mine.group_id
       JOIN users owner ON owner.id = g.owner_id
       JOIN friend_group_members m ON m.group_id = g.id
       JOIN users u ON u.id = m.user_id
      WHERE mine.user_id = ?
      ORDER BY g.created_at, u.display_name COLLATE NOCASE`,
  )
    .bind(user.id)
    .all<{
      id: string;
      name: string;
      owner: string;
      username: string;
      display_name: string;
      avatar: string | null;
    }>();

  const groups = new Map<string, FriendGroup>();
  for (const row of results) {
    const group = groups.get(row.id) ?? {
      id: row.id,
      name: row.name,
      owner: row.owner,
      members: [],
    };
    group.members.push(toPublic(row));
    groups.set(row.id, group);
  }
  return Response.json(
    { groups: [...groups.values()] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function createGroup(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const body = await readJson(context.request, groupRequestSchema);
  const name = groupName(body.name);
  const members = await memberIds(context.env, user.id, body.members);
  const id = randomToken(12);
  const db = context.env.DB;
  await db.batch([
    db
      .prepare("INSERT INTO friend_groups (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, user.id, name, Date.now()),
    ...[user.id, ...members].map((memberId) =>
      db
        .prepare("INSERT INTO friend_group_members (group_id, user_id) VALUES (?, ?)")
        .bind(id, memberId),
    ),
  ]);
  return Response.json({ id }, { status: 201 });
}

export async function updateGroup(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const group = await groupFor(context.env, context.params[0] ?? "", user.id);
  if (group.owner_id !== user.id) {
    throw new HttpError(403, "not_owner", "Only the person who made the group can change it.");
  }
  const body = await readJson(context.request, groupRequestSchema);
  const name = groupName(body.name);
  const members = await memberIds(context.env, user.id, body.members);
  const db = context.env.DB;
  await db.batch([
    db.prepare("UPDATE friend_groups SET name = ? WHERE id = ?").bind(name, group.id),
    db.prepare("DELETE FROM friend_group_members WHERE group_id = ?").bind(group.id),
    ...[user.id, ...members].map((memberId) =>
      db
        .prepare("INSERT INTO friend_group_members (group_id, user_id) VALUES (?, ?)")
        .bind(group.id, memberId),
    ),
  ]);
  return Response.json({ ok: true });
}

/** The owner deletes the group; anyone else leaves it. */
export async function deleteGroup(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const group = await groupFor(context.env, context.params[0] ?? "", user.id);
  const statement =
    group.owner_id === user.id
      ? context.env.DB.prepare("DELETE FROM friend_groups WHERE id = ?").bind(group.id)
      : context.env.DB.prepare(
          "DELETE FROM friend_group_members WHERE group_id = ? AND user_id = ?",
        ).bind(group.id, user.id);
  await statement.run();
  return Response.json({ ok: true });
}

/**
 * Who tops the group: over games at least two members finished together, the member who
 * placed highest among them wins that game. Optionally just one category.
 */
export async function getGroupLeaderboard(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const group = await groupFor(context.env, context.params[0] ?? "", user.id);
  const category = context.url.searchParams.get("category") || null;
  const { results } = await context.env.DB.prepare(
    `WITH members AS (SELECT user_id FROM friend_group_members WHERE group_id = ?1),
          played AS (
            SELECT mp.match_id, mp.user_id, mp.placing
              FROM match_players mp JOIN matches m ON m.id = mp.match_id
             WHERE mp.user_id IN (SELECT user_id FROM members)
               AND (?2 IS NULL OR m.category = ?2)
          ),
          shared AS (
            SELECT match_id, MIN(placing) AS best FROM played
             GROUP BY match_id HAVING COUNT(*) >= 2
          )
     SELECT u.username, u.display_name, u.avatar,
            COUNT(s.match_id) AS games,
            COALESCE(SUM(p.placing = s.best), 0) AS wins
       FROM members
       JOIN users u ON u.id = members.user_id
       LEFT JOIN played p ON p.user_id = members.user_id
       LEFT JOIN shared s ON s.match_id = p.match_id
      GROUP BY u.id
      ORDER BY wins DESC, games DESC, u.display_name COLLATE NOCASE`,
  )
    .bind(group.id, category)
    .all<{
      username: string;
      display_name: string;
      avatar: string | null;
      games: number;
      wins: number;
    }>();

  const standings: GroupStanding[] = results.map((r) => ({
    ...toPublic(r),
    games: r.games,
    wins: r.wins,
  }));
  return Response.json({ standings }, { headers: { "Cache-Control": "no-store" } });
}

/** Friends, requests and groups, for the account's data export. */
export async function exportSocial(env: Env, userId: string) {
  const db = env.DB;
  const [friends, sent, received, groups] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT u.username, f.muted, f.created_at FROM friends f
           JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT u.username, r.created_at FROM friend_requests r
           JOIN users u ON u.id = r.to_id WHERE r.from_id = ?`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT u.username, r.created_at FROM friend_requests r
           JOIN users u ON u.id = r.from_id WHERE r.to_id = ?`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT g.name, g.owner_id = ?1 AS owner FROM friend_group_members m
           JOIN friend_groups g ON g.id = m.group_id WHERE m.user_id = ?1`,
      )
      .bind(userId),
  ]);
  return {
    friends: friends?.results ?? [],
    friendRequestsSent: sent?.results ?? [],
    friendRequestsReceived: received?.results ?? [],
    groups: groups?.results ?? [],
  };
}
