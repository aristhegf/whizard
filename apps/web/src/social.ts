import type {
  FriendGroup,
  FriendsList,
  GroupStanding,
  PlayerProfile,
  PublicUser,
  Relation,
} from "@whizard/protocol";
import { api } from "./account";
import { createRoom } from "./api";
import { navigate, roomPath } from "./router";

const path = (username: string) => encodeURIComponent(username);

export const fetchFriends = () => api<FriendsList>("/api/friends");

export const fetchUser = (username: string) =>
  api<{ user: PublicUser; relation: Relation | null }>(`/api/users/${path(username)}`);

/** Someone's profile page: who they are to everyone, their games to friends. */
export const fetchProfile = (username: string) =>
  api<PlayerProfile>(`/api/users/${path(username)}/profile`);

/** Opens a new room and pings a friend from it, as Ping on the friends page does. */
export async function pingToPlay(username: string): Promise<void> {
  const code = await createRoom();
  navigate(`${roomPath(code)}?ping=${encodeURIComponent(username)}`);
}

/**
 * Shares a link with the phone's share sheet, or copies it where there isn't one. Says which,
 * or "cancelled" if the sheet was dismissed or the clipboard is blocked.
 */
export async function shareLink(url: string): Promise<"shared" | "copied" | "cancelled"> {
  try {
    if (navigator.share) {
      await navigator.share({ title: "Add me on Whizard", url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "cancelled";
  }
}

/** Sends a request, or accepts theirs. Returns how you're connected now. */
export const addFriend = (username: string) =>
  api<{ relation: Relation }>("/api/friends", { method: "POST", body: { username } });

/** Unfriend, decline or cancel. */
export const removeFriend = (username: string) =>
  api<{ relation: Relation }>(`/api/friends/${path(username)}`, { method: "DELETE", body: {} });

export const muteFriend = (username: string, muted: boolean) =>
  api(`/api/friends/${path(username)}`, { method: "PATCH", body: { muted } });

export const fetchGroups = () => api<{ groups: FriendGroup[] }>("/api/groups");

export const createGroup = (name: string, members: string[]) =>
  api<{ id: string }>("/api/groups", { method: "POST", body: { name, members } });

export const updateGroup = (id: string, name: string, members: string[]) =>
  api(`/api/groups/${encodeURIComponent(id)}`, { method: "PATCH", body: { name, members } });

/** The owner deletes it; anyone else leaves. */
export const leaveGroup = (id: string) =>
  api(`/api/groups/${encodeURIComponent(id)}`, { method: "DELETE", body: {} });

export const fetchLeaderboard = (id: string, category: string | null) =>
  api<{ standings: GroupStanding[] }>(
    `/api/groups/${encodeURIComponent(id)}/leaderboard${
      category ? `?category=${encodeURIComponent(category)}` : ""
    }`,
  );

export const inviteLink = (username: string) => `${location.origin}/add/${path(username)}`;
