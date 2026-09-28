import { AVATAR_IDS, isCustomAvatar, type AvatarId } from "@whizard/protocol";
import { decodeAvatar } from "../avatar/code";
import { swatchOf } from "../avatar/parts";
import { useAvatarPicture } from "../avatar/render";
import type { CSSProperties } from "react";

export const avatarUrl = (id: AvatarId) => `/art/avatars/${id}.webp`;

export function isAvatar(value: string | null | undefined): value is AvatarId {
  return (AVATAR_IDS as readonly string[]).includes(value ?? "");
}

/** A stable pick for someone who hasn't chosen, so they look the same on every screen. */
export function fallbackAvatar(seed: string): AvatarId {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_IDS[hash % AVATAR_IDS.length]!;
}

const RINGS = ["#ffb14a", "#4aa8ff", "#ff5fa2", "#35d39a", "#b57bff"];

export function Avatar({
  id,
  name,
  size = 44,
  ring,
}: {
  id: string | null | undefined;
  /** Used for the fallback picture and the ring colour. */
  name: string;
  size?: number;
  ring?: string;
}) {
  const custom = isCustomAvatar(id) ? id : null;
  const picture = useAvatarPicture(custom, size);
  const avatar = isAvatar(id) ? id : fallbackAvatar(name);
  const colour =
    ring ??
    (custom
      ? swatchOf("background", decodeAvatar(custom).background).colour
      : RINGS[AVATAR_IDS.indexOf(avatar) % RINGS.length]);
  return (
    <img
      className="avatar"
      // A made-up avatar shows the plain circle for the moment it takes to draw.
      src={custom ? (picture ?? BLANK) : avatarUrl(avatar)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={{ "--size": `${size}px`, "--ring": colour } as CSSProperties}
    />
  );
}

const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
