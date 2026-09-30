import type { AccountUser } from "@whizard/protocol";
import { useEffect, useRef, useState } from "react";
import { updateAccount, useAccount } from "../account";
import { setReduceMotion, useReduceMotionSetting } from "../display";
import { linkTo } from "../router";
import { setMuted, useMuted } from "../sounds";
import { Icon, type IconName } from "./Icon";
import { useToastAction } from "./toast";

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
      <h2 id="settings-dialog-title" className="section-title">
        Settings
      </h2>
      <section className="settings-list" aria-labelledby="sound-display-title">
        <h3 id="sound-display-title" className="settings-group">
          Sound &amp; display
        </h3>
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
      </section>
      <section className="settings-list" aria-labelledby="game-settings-title">
        <h3 id="game-settings-title" className="settings-group">
          Quiz
        </h3>
        {user ? (
          <GameSettings user={user} />
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
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}

/** Saved to the account, so they follow the player to every device. */
function GameSettings({ user }: { user: AccountUser }) {
  const saving = useToastAction();
  return (
    <>
      <Choice
        id="setting-explanations"
        label="Explanations"
        hint="After each question is for solo games. With friends, they wait for the results."
        options={[
          ["After each question", true],
          ["At the end", false],
        ]}
        value={user.showExplanations}
        disabled={saving.busy}
        onPick={(value) => void saving.run(() => updateAccount({ showExplanations: value }))}
      />
      <Choice
        id="setting-pause"
        label="After you answer"
        hint="Go straight on shows your result for a second. With an explanation, you always get 3 seconds, and can skip."
        options={[
          ["Pause 3 seconds", true],
          ["Go straight on", false],
        ]}
        value={user.pauseAfterAnswer}
        disabled={saving.busy}
        onPick={(value) => void saving.run(() => updateAccount({ pauseAfterAnswer: value }))}
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
  options: [string, boolean][];
  value: boolean;
  disabled: boolean;
  onPick: (value: boolean) => void;
}) {
  return (
    <div className="settings-choice">
      <span className="toggle-text" id={`${id}-label`}>
        {label}
      </span>
      <div className="segmented" role="group" aria-labelledby={`${id}-label`}>
        {options.map(([name, option]) => (
          <button
            key={name}
            type="button"
            aria-pressed={value === option}
            disabled={disabled}
            onClick={() => value !== option && onPick(option)}
          >
            {name}
          </button>
        ))}
      </div>
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
      <button
        className="switch"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
      />
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
