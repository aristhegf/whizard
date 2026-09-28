import { AVATAR_IDS, isCustomAvatar } from "@whizard/protocol";
import { useEffect } from "react";
import { useAccount } from "../account";
import { CREATOR_OPEN } from "../avatar/parts";
import { navigate } from "../router";
import { loadMyAvatar, saveMyAvatar } from "../storage";
import { Avatar, avatarUrl } from "./Avatar";
import { Icon } from "./Icon";

/** Opens the avatar creator, coming back here after Save or Cancel. */
export function openAvatarCreator(): void {
  navigate(`/avatar?back=${encodeURIComponent(location.pathname)}`);
}

/**
 * The built-in avatars, plus the player's own from the avatar creator (if they've made one) and a
 * tile to make or edit it.
 */
export function AvatarPicker({
  value,
  onPick,
  onMake = openAvatarCreator,
  labelledBy,
  size,
  disabled = false,
}: {
  value: string | null;
  onPick: (avatar: string) => void;
  onMake?: () => void;
  labelledBy: string;
  size: number;
  disabled?: boolean;
}) {
  // Remember an account's own avatar here too, so it's still offered after picking another.
  useEffect(() => {
    if (isCustomAvatar(value)) saveMyAvatar(value);
  }, [value]);
  const account = useAccount();
  const canMake = CREATOR_OPEN || (account.status === "ready" && account.user?.admin === true);
  const saved = loadMyAvatar();
  const mine = isCustomAvatar(value) ? value : isCustomAvatar(saved) ? saved : null;
  return (
    <div className="avatar-picker" role="radiogroup" aria-labelledby={labelledBy}>
      {canMake && (
        <button
          type="button"
          className="avatar-make"
          aria-label={mine ? "Edit your avatar" : "Make your own avatar"}
          title={mine ? "Edit your avatar" : "Make your own avatar"}
          disabled={disabled}
          onClick={onMake}
        >
          <Icon name={mine ? "pencil" : "plus"} size={Math.round(size * 0.45)} />
        </button>
      )}
      {mine && (
        <button
          type="button"
          role="radio"
          aria-checked={value === mine}
          aria-label="Your avatar"
          disabled={disabled}
          onClick={() => onPick(mine)}
        >
          <Avatar id={mine} name="" size={size} />
        </button>
      )}
      {AVATAR_IDS.map((id, i) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          aria-label={`Avatar ${i + 1}`}
          disabled={disabled}
          onClick={() => onPick(id)}
        >
          <img src={avatarUrl(id)} alt="" width={size} height={size} />
        </button>
      ))}
    </div>
  );
}
