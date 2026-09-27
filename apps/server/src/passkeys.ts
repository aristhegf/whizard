import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { normalizeNickname, randomToken } from "@whizard/game-core";
import { normalizeUsername, signUpRequestSchema, usernameProblem } from "@whizard/protocol";
import { z } from "zod";
import { claimGuestGames } from "./matches";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { requireUser } from "./account";
import { createSession, toAccountUser, type UserRow } from "./sessions";

const RP_NAME = "Whizard";
const CHALLENGE_TTL_MS = 5 * 60_000;

type ChallengeKind = "signup" | "signin" | "add";

interface SignUpData {
  userId: string;
  username: string;
  displayName: string;
}

interface AddData {
  userId: string;
}

const credentialSchema = z.looseObject({
  id: z.string().min(1).max(1024),
  type: z.literal("public-key"),
  response: z.looseObject({}),
});

const verifySchema = z.object({
  challengeId: z.string().max(64),
  response: credentialSchema,
  guestId: z.string().max(64).optional(),
});

const USERNAME_MESSAGES = {
  length: "Usernames are 3 to 20 characters.",
  characters: "Use lowercase letters, numbers and underscores, starting with a letter.",
  reserved: "That username isn’t available.",
} as const;

async function saveChallenge(
  { env }: RequestContext,
  kind: ChallengeKind,
  challenge: string,
  data: object,
  now: number,
): Promise<string> {
  const id = randomToken(18);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now),
    env.DB.prepare(
      "INSERT INTO auth_challenges (id, kind, challenge, data, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, kind, challenge, JSON.stringify(data), now + CHALLENGE_TTL_MS),
  ]);
  return id;
}

/** Takes a challenge out of the table, so each one can only be answered once. */
async function takeChallenge<T>(
  { env }: RequestContext,
  id: string,
  kind: ChallengeKind,
  now: number,
): Promise<{ challenge: string; data: T }> {
  const row = await env.DB.prepare("DELETE FROM auth_challenges WHERE id = ? RETURNING *")
    .bind(id)
    .first<{ kind: string; challenge: string; data: string; expires_at: number }>();
  if (!row || row.kind !== kind || row.expires_at < now) {
    throw new HttpError(400, "challenge_expired", "That took too long. Please try again.");
  }
  return { challenge: row.challenge, data: JSON.parse(row.data) as T };
}

function relyingParty({ url }: RequestContext) {
  return { rpID: url.hostname, origin: url.origin };
}

async function usernameTaken(context: RequestContext, username: string): Promise<boolean> {
  const row = await context.env.DB.prepare("SELECT 1 FROM users WHERE username = ?")
    .bind(username)
    .first();
  return row !== null;
}

async function passkeysOf(context: RequestContext, userId: string) {
  const { results } = await context.env.DB.prepare(
    "SELECT id, transports FROM passkeys WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ id: string; transports: string | null }>();
  return results.map((r) => ({
    id: r.id,
    transports: r.transports ? (JSON.parse(r.transports) as string[]) : undefined,
  }));
}

async function registrationOptions(
  context: RequestContext,
  user: { id: string; username: string; displayName: string },
  exclude: { id: string; transports?: string[] | undefined }[],
) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: relyingParty(context).rpID,
    userName: user.username,
    userDisplayName: user.displayName,
    userID: new TextEncoder().encode(user.id) as Uint8Array<ArrayBuffer>,
    attestationType: "none",
    excludeCredentials: exclude.map((c) =>
      c.transports ? { id: c.id, transports: c.transports } : { id: c.id },
    ),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
}

async function verifyRegistration(
  context: RequestContext,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
) {
  const { rpID, origin } = relyingParty(context);
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
    if (result.verified) return result.registrationInfo;
  } catch {
    // Falls through to the error below.
  }
  throw new HttpError(400, "passkey_failed", "Couldn’t save that passkey. Please try again.");
}

function insertPasskey(
  context: RequestContext,
  userId: string,
  credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] },
  now: number,
) {
  return context.env.DB.prepare(
    `INSERT INTO passkeys (id, user_id, public_key, counter, transports, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    credential.id,
    userId,
    isoBase64URL.fromBuffer(credential.publicKey as Uint8Array<ArrayBuffer>),
    credential.counter,
    credential.transports ? JSON.stringify(credential.transports) : null,
    now,
  );
}

function signedInResponse(user: UserRow, cookie: string): Response {
  return Response.json({ user: toAccountUser(user) }, { headers: { "Set-Cookie": cookie } });
}

// Sign up -------------------------------------------------------------------------------------

export async function signUpOptions(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const body = await readJson(context.request, signUpRequestSchema);
  const username = normalizeUsername(body.username);
  const problem = usernameProblem(username);
  if (problem) throw new HttpError(400, "username_invalid", USERNAME_MESSAGES[problem]);
  const displayName = normalizeNickname(body.displayName);
  if (!displayName) {
    throw new HttpError(400, "display_name_invalid", "Pick a name between 1 and 20 characters.");
  }
  if (await usernameTaken(context, username)) {
    throw new HttpError(409, "username_taken", "That username is taken.");
  }

  const now = Date.now();
  const data: SignUpData = { userId: randomToken(12), username, displayName };
  const options = await registrationOptions(
    context,
    { id: data.userId, username, displayName },
    [],
  );
  const challengeId = await saveChallenge(context, "signup", options.challenge, data, now);
  return Response.json({ challengeId, options });
}

export async function signUpVerify(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const body = await readJson(context.request, verifySchema);
  const now = Date.now();
  const { challenge, data } = await takeChallenge<SignUpData>(
    context,
    body.challengeId,
    "signup",
    now,
  );
  const info = await verifyRegistration(
    context,
    body.response as unknown as RegistrationResponseJSON,
    challenge,
  );

  const user: UserRow = {
    id: data.userId,
    username: data.username,
    display_name: data.displayName,
    show_explanations: 0,
    pings: 1,
    quiet_start: null,
    quiet_end: null,
    time_zone: null,
    created_at: now,
  };
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO users (id, username, display_name, created_at) VALUES (?, ?, ?, ?)",
      ).bind(user.id, user.username, user.display_name, now),
      insertPasskey(context, user.id, info.credential, now),
    ]);
  } catch {
    // The username was free a moment ago; someone else just took it.
    throw new HttpError(409, "username_taken", "That username was just taken. Try another.");
  }

  if (body.guestId) await claimGuestGames(context.env, body.guestId, user.id);
  return signedInResponse(user, await createSession(context.env, user.id, now));
}

// Sign in -------------------------------------------------------------------------------------

export async function signInOptions(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const options = await generateAuthenticationOptions({
    rpID: relyingParty(context).rpID,
    userVerification: "preferred",
  });
  const challengeId = await saveChallenge(context, "signin", options.challenge, {}, Date.now());
  return Response.json({ challengeId, options });
}

export async function signInVerify(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const body = await readJson(context.request, verifySchema);
  const now = Date.now();
  const { challenge } = await takeChallenge(context, body.challengeId, "signin", now);
  const response = body.response as unknown as AuthenticationResponseJSON;

  const passkey = await context.env.DB.prepare(
    `SELECT p.id, p.public_key, p.counter, p.transports, p.user_id
       FROM passkeys p WHERE p.id = ?`,
  )
    .bind(response.id)
    .first<{
      id: string;
      public_key: string;
      counter: number;
      transports: string | null;
      user_id: string;
    }>();
  if (!passkey) {
    throw new HttpError(
      400,
      "passkey_unknown",
      "That passkey isn’t linked to an account here. It may have been removed.",
    );
  }

  const { rpID, origin } = relyingParty(context);
  let newCounter: number;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkey.id,
        publicKey: isoBase64URL.toBuffer(passkey.public_key),
        counter: passkey.counter,
        ...(passkey.transports ? { transports: JSON.parse(passkey.transports) as string[] } : {}),
      },
    });
    if (!result.verified) throw new Error("not verified");
    newCounter = result.authenticationInfo.newCounter;
  } catch {
    throw new HttpError(400, "passkey_failed", "Couldn’t sign in with that passkey.");
  }

  const [, userResult] = await context.env.DB.batch<UserRow>([
    context.env.DB.prepare("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?").bind(
      newCounter,
      now,
      passkey.id,
    ),
    context.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(passkey.user_id),
  ]);
  const user = userResult?.results[0];
  if (!user) throw new HttpError(400, "passkey_unknown", "That account no longer exists.");

  if (body.guestId) await claimGuestGames(context.env, body.guestId, user.id);
  return signedInResponse(user, await createSession(context.env, user.id, now));
}

// Another passkey on an existing account -------------------------------------------------------

export async function addPasskeyOptions(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const options = await registrationOptions(
    context,
    { id: user.id, username: user.username, displayName: user.display_name },
    await passkeysOf(context, user.id),
  );
  const data: AddData = { userId: user.id };
  const challengeId = await saveChallenge(context, "add", options.challenge, data, Date.now());
  return Response.json({ challengeId, options });
}

export async function addPasskeyVerify(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const body = await readJson(context.request, verifySchema);
  const now = Date.now();
  const { challenge, data } = await takeChallenge<AddData>(context, body.challengeId, "add", now);
  if (data.userId !== user.id) throw new HttpError(400, "challenge_expired", "Please try again.");
  const info = await verifyRegistration(
    context,
    body.response as unknown as RegistrationResponseJSON,
    challenge,
  );
  try {
    await insertPasskey(context, user.id, info.credential, now).run();
  } catch {
    throw new HttpError(409, "passkey_exists", "That passkey is already on your account.");
  }
  return Response.json({ ok: true });
}
