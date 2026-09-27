import {
  WebAuthnError,
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type {
  AccountPasskey,
  AccountUpdate,
  AccountUser,
  ApiErrorBody,
  MatchRecord,
  PlayerStats,
} from "@whizard/protocol";
import { useSyncExternalStore } from "react";
import { guestId } from "./storage";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** JSON request to our API. Errors come back as ApiError with a message fit to show. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? {} : { "Content-Type": "application/json" },
      body: init.body === undefined ? null : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "offline", "Couldn’t reach Whizard. Check your connection.");
  }
  const body = (await response.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? "Something went wrong. Please try again.",
    );
  }
  return body as T;
}

// The signed-in account, shared by every screen ------------------------------------------------

export type AccountState = { status: "loading" } | { status: "ready"; user: AccountUser | null };

let state: AccountState = { status: "loading" };
const listeners = new Set<() => void>();

function setUser(user: AccountUser | null) {
  state = { status: "ready", user };
  for (const listener of listeners) listener();
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export async function loadAccount(): Promise<void> {
  try {
    const { user } = await api<{ user: AccountUser | null }>("/api/me");
    setUser(user);
  } catch {
    // Offline or the API is down: carry on as a guest.
    setUser(null);
  }
}

// Passkeys ------------------------------------------------------------------------------------

export const passkeysSupported = (): boolean => browserSupportsWebAuthn();

/** Turns a browser passkey failure into something to show. */
function passkeyError(error: unknown): Error {
  if (error instanceof ApiError) return error;
  if (
    error instanceof WebAuthnError &&
    error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"
  ) {
    return new Error("This device already has a passkey for your account.");
  }
  if (error instanceof Error && error.name === "NotAllowedError") {
    return new Error("That was cancelled or timed out. Try again when you’re ready.");
  }
  return new Error("Your browser couldn’t use a passkey. Try again, or use another device.");
}

interface ChallengeResponse<T> {
  challengeId: string;
  options: T;
}

export async function signUp(username: string, displayName: string): Promise<AccountUser> {
  try {
    const { challengeId, options } = await api<
      ChallengeResponse<PublicKeyCredentialCreationOptionsJSON>
    >("/api/auth/signup/options", {
      method: "POST",
      body: { username, displayName, agreed: true },
    });
    const response = await startRegistration({ optionsJSON: options });
    const { user } = await api<{ user: AccountUser }>("/api/auth/signup/verify", {
      method: "POST",
      body: { challengeId, response, guestId: guestId() },
    });
    setUser(user);
    return user;
  } catch (error) {
    throw passkeyError(error);
  }
}

export async function signIn(): Promise<AccountUser> {
  try {
    const { challengeId, options } = await api<
      ChallengeResponse<PublicKeyCredentialRequestOptionsJSON>
    >("/api/auth/signin/options", { method: "POST", body: {} });
    const response = await startAuthentication({ optionsJSON: options });
    const { user } = await api<{ user: AccountUser }>("/api/auth/signin/verify", {
      method: "POST",
      body: { challengeId, response, guestId: guestId() },
    });
    setUser(user);
    return user;
  } catch (error) {
    throw passkeyError(error);
  }
}

export async function addPasskey(): Promise<void> {
  try {
    const { challengeId, options } = await api<
      ChallengeResponse<PublicKeyCredentialCreationOptionsJSON>
    >("/api/me/passkeys/options", { method: "POST", body: {} });
    const response = await startRegistration({ optionsJSON: options });
    await api("/api/me/passkeys/verify", { method: "POST", body: { challengeId, response } });
  } catch (error) {
    throw passkeyError(error);
  }
}

// Account ---------------------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  await api("/api/auth/signout", { method: "POST", body: {} });
  setUser(null);
}

export async function updateAccount(update: AccountUpdate): Promise<void> {
  const { user } = await api<{ user: AccountUser }>("/api/me", { method: "PATCH", body: update });
  setUser(user);
}

export async function deleteAccount(): Promise<void> {
  await api("/api/me", { method: "DELETE", body: {} });
  setUser(null);
}

export const fetchStats = () => api<{ stats: PlayerStats }>("/api/me/stats");

export const fetchMatches = (before?: number) =>
  api<{ matches: MatchRecord[]; more: boolean }>(
    before === undefined ? "/api/me/matches" : `/api/me/matches?before=${before}`,
  );

export const fetchPasskeys = () => api<{ passkeys: AccountPasskey[] }>("/api/me/passkeys");

export const removePasskey = (id: string) =>
  api(`/api/me/passkeys/${encodeURIComponent(id)}`, { method: "DELETE", body: {} });
