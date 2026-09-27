import type {
  FriendGroup,
  FriendsList,
  GroupStanding,
  PublicUser,
  Relation,
} from "@whizard/protocol";
import { api } from "./account";

const path = (username: string) => encodeURIComponent(username);

export const fetchFriends = () => api<FriendsList>("/api/friends");

export const fetchUser = (username: string) =>
  api<{ user: PublicUser; relation: Relation | null }>(`/api/users/${path(username)}`);

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
