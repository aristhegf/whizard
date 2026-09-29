import { Tooltip } from "@/components/motion/tooltip";
import { useEffect, useRef, useState } from "react";
import { setReduceMotion, useReduceMotionSetting } from "../display";
import { setMuted, useMuted } from "../sounds";
import { Icon, type IconName } from "./Icon";

/**
 * Settings anyone can change, signed in or not: sound and display. They're remembered on this
 * device.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const muted = useMuted();
  const reduceMotion = useReduceMotionSetting();

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
      <div className="dialog-actions">
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
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

/** Opens the settings: a gear in the top bar, or a labelled button in the room's bar. */
export function SettingsButton({ labelled = false }: { labelled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {labelled ? (
        <button className="bar-btn" onClick={() => setOpen(true)}>
          <Icon name="settings" size={20} />
          <span>Settings</span>
        </button>
      ) : (
        <Tooltip content="Settings" side="bottom">
          <button className="icon-btn" aria-label="Settings" onClick={() => setOpen(true)}>
            <Icon name="settings" size={24} />
          </button>
        </Tooltip>
      )}
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
