import { JIGSAW_PHOTO_ID, normalizeRoomCode } from "@whizard/game-core";
import { isSameOrigin, jsonError, withinLimit, type RequestContext } from "./http";

/** A cropped 800×800 photo is well under this; anything bigger isn't one of ours. */
export const PHOTO_MAX_BYTES = 600 * 1024;

/** The picture types a browser's canvas makes, told apart by their first bytes. */
function photoType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * `POST /api/rooms/:code/photo`: the host's own photo for a jigsaw, already cropped square in
 * their browser. The body is the picture; the host's room session token is the bearer token.
 */
export async function uploadPhoto({ request, env, url, params }: RequestContext) {
  const code = normalizeRoomCode(decodeURIComponent(params[0] ?? ""));
  if (!code) return jsonError(400, "invalid_room_code", "That isn't a valid room code");
  if (!isSameOrigin(request, url)) return jsonError(403, "forbidden", "Not allowed");
  if (!(await withinLimit(env.ROOM_LIMIT, request))) {
    return jsonError(429, "too_many_requests", "Too many photos. Try again in a minute.");
  }
  const token = /^Bearer (\S{8,100})$/.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return jsonError(401, "not_joined", "Join the room first.");
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > PHOTO_MAX_BYTES) return jsonError(413, "too_large", "That photo is too big.");
  const data = await request.arrayBuffer();
  if (data.byteLength === 0 || data.byteLength > PHOTO_MAX_BYTES) {
    return jsonError(413, "too_large", "That photo is too big.");
  }
  const type = photoType(new Uint8Array(data, 0, Math.min(12, data.byteLength)));
  if (!type) return jsonError(415, "bad_photo", "That isn't a photo we can use.");

  const result = await env.ROOMS.getByName(code).setPhoto(token, type, data);
  if (!result.ok) return jsonError(result.status, result.error, result.message);
  return Response.json({ id: result.id });
}

/** `GET /api/rooms/:code/photo/:id`: a room's photo, for as long as the room is open. */
export async function getPhoto({ env, params }: RequestContext) {
  const code = normalizeRoomCode(decodeURIComponent(params[0] ?? ""));
  const id = params[1] ?? "";
  if (!code || !JIGSAW_PHOTO_ID.test(id)) return jsonError(404, "not_found", "No such photo.");
  const photo = await env.ROOMS.getByName(code).photo(id);
  if (!photo) return jsonError(404, "not_found", "No such photo.");
  return new Response(photo.data, {
    headers: {
      "Content-Type": photo.type,
      // A photo never changes under its ID; a new one gets a new ID.
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
