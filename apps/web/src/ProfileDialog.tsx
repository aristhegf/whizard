import { NICKNAME_INPUT_MAX_LENGTH } from "@whizard/game-core";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { saveNickname } from "./storage";
import { AvatarPicker, openAvatarCreator } from "./ui/AvatarPicker";

/** The lobby's "change your name or avatar", opened by tapping your own name. */
export function ProfileDialog({
  nickname: current,
  avatar: currentAvatar,
  onSave,
  onClose,
}: {
  nickname: string;
  avatar: string;
  onSave: (nickname: string, avatar: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [nickname, setNickname] = useState(current);
  const [avatar, setAvatar] = useState(currentAvatar);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!nickname.trim()) return;
    if (nickname.trim() !== current || avatar !== currentAvatar) onSave(nickname, avatar);
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="app-dialog"
      aria-labelledby="profile-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the dimmed backdrop closes it.
        if (event.target === dialog.current) onClose();
      }}
    >
      <form className="stack" onSubmit={handleSubmit}>
        <h2 id="profile-dialog-title" className="section-title">
          Your name and avatar
        </h2>
        <label className="label" htmlFor="profile-nickname">
          Nickname
        </label>
        <input
          className="t-input"
          id="profile-nickname"
          name="nickname"
          value={nickname}
          maxLength={NICKNAME_INPUT_MAX_LENGTH}
          autoComplete="nickname"
          onChange={(event) => setNickname(event.target.value)}
        />
        <span className="label" id="profile-avatar-label">
          Avatar
        </span>
        <AvatarPicker
          value={avatar}
          onPick={setAvatar}
          onMake={() => {
            if (nickname.trim()) saveNickname(nickname);
            openAvatarCreator();
          }}
          labelledBy="profile-avatar-label"
          size={48}
        />
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={!nickname.trim()}>
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
