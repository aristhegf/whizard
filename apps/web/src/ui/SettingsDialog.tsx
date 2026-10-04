import type { AccountUser } from "@whizard/protocol";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "../account";
import { setReduceMotion, useReduceMotionSetting } from "../display";
import { linkTo } from "../router";
import { setMuted, useMuted } from "../sounds";
import { Icon, type IconName } from "./Icon";
import {
  AFTER_ANSWER_CHOICES,
  EXPLANATION_CHOICES,
  Segmented,
  Switch,
  useAccountSetting,
} from "./SettingControls";

/**
 * Sound and display for everyone, remembered on this device. Signed-in players also choose how
 * quiz answers are shown, saved to their account.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const muted = useMuted();
  const reduceMotion = useReduceMotionSetting();
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  const signIn = linkTo("/account");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="app-dialog settings-dialog"
      aria-labelledby="settings-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the dimmed backdrop closes it.
        if (event.target === dialog.current) onClose();
      }}
    >
      <header className="settings-head">
        <span className="settings-badge" aria-hidden="true">
          <Icon name="settings" size={22} />
        </span>
        <div>
          <h2 id="settings-dialog-title" className="section-title">
            Settings
          </h2>
          <p className="dim small">
            Sound and motion stay on this device. Your quiz choices follow your account.
          </p>
        </div>
      </header>
      <section className="settings-card" aria-labelledby="sound-display-title">
        <h3 id="sound-display-title" className="settings-group">
          Sound &amp; display
        </h3>
        <div className="settings-rows">
          <Toggle
            id="setting-sound"
            icon={muted ? "muted" : "sound"}
            label="Sound"
            hint="Game sounds and effects"
            checked={!muted}
            onChange={(on) => setMuted(!on)}
          />
          <Toggle
            id="setting-reduce-motion"
            icon="bolt"
            label="Reduce animations"
            hint="Keep movement on screen to a minimum"
            checked={reduceMotion}
            onChange={setReduceMotion}
          />
        </div>
      </section>
      <section className="settings-card" aria-labelledby="game-settings-title">
        <h3 id="game-settings-title" className="settings-group">
          Quiz
        </h3>
        {user ? (
          <div className="settings-rows">
            <GameSettings user={user} />
          </div>
        ) : (
          <p className="muted small settings-note">
            <a
              {...signIn}
              onClick={(event) => {
                onClose();
                signIn.onClick(event);
              }}
            >
              Sign in
            </a>{" "}
            to choose when you see the explanations, and how quickly the next question comes after
            you answer.
          </p>
        )}
      </section>
      <div className="dialog-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}

/** Saved to the account, so they follow the player to every device. */
function GameSettings({ user }: { user: AccountUser }) {
  const { busy, save } = useAccountSetting();
  return (
    <>
      <Choice
        id="setting-explanations"
        label="Explanations"
        hint="After each question is for solo games. With friends, they wait for the results."
        options={EXPLANATION_CHOICES}
        value={user.showExplanations}
        disabled={busy}
        onPick={(value) => save({ showExplanations: value })}
      />
      <Choice
        id="setting-pause"
        label="After you answer"
        hint={
          user.pauseAfterAnswer
            ? "The result waits 3 seconds, with Skip — long enough to read an explanation."
            : "The next question comes the moment you answer. Explanations wait for the review at the end."
        }
        options={AFTER_ANSWER_CHOICES}
        value={user.pauseAfterAnswer}
        disabled={busy}
        onPick={(value) => save({ pauseAfterAnswer: value })}
      />
    </>
  );
}

function Choice({
  id,
  label,
  hint,
  options,
  value,
  disabled,
  onPick,
}: {
  id: string;
  label: string;
  hint: string;
  options: readonly (readonly [string, boolean])[];
  value: boolean;
  disabled: boolean;
  onPick: (value: boolean) => void;
}) {
  return (
    <div className="settings-choice">
      <span className="toggle-text" id={`${id}-label`}>
        {label}
      </span>
      <Segmented
        labelledBy={`${id}-label`}
        options={options}
        value={value}
        disabled={disabled}
        onPick={onPick}
      />
      <span className="dim small">{hint}</span>
    </div>
  );
}

function Toggle({
  id,
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  icon: IconName;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="setting-row toggle-row">
      <Icon name={icon} size={20} />
      <span className="toggle-text">
        <span id={`${id}-label`}>{label}</span>
        <span className="dim small">{hint}</span>
      </span>
      <Switch checked={checked} onChange={onChange} labelledBy={`${id}-label`} />
    </div>
  );
}

/** Opens the settings from the room's bar. `iconOnly` is the bare gear, for the game screens. */
export function SettingsButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {iconOnly ? (
        <button className="icon-btn" aria-label="Settings" onClick={() => setOpen(true)}>
          <Icon name="settings" size={22} />
        </button>
      ) : (
        <button className="bar-btn" onClick={() => setOpen(true)}>
          <Icon name="settings" size={20} />
          <span>Settings</span>
        </button>
      )}
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
