import { setMuted, useMuted } from "../sounds";
import { Icon } from "./Icon";

/** Turns game sounds on and off; the choice is remembered on this device. */
export function MuteButton() {
  const muted = useMuted();
  return (
    <button
      className="icon-btn mute-btn"
      aria-label="Sound"
      aria-pressed={!muted}
      title={muted ? "Turn sound on" : "Turn sound off"}
      onClick={() => setMuted(!muted)}
    >
      <Icon name={muted ? "muted" : "sound"} size={22} />
    </button>
  );
}
