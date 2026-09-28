import { Tooltip } from "@/components/motion/tooltip";
import { setMuted, useMuted } from "../sounds";
import { Icon } from "./Icon";

/** Turns game sounds on and off; the choice is remembered on this device. */
export function MuteButton() {
  const muted = useMuted();
  return (
    <Tooltip content={muted ? "Turn sound on" : "Turn sound off"} side="bottom">
      <button
        className="icon-btn mute-btn"
        aria-label="Sound"
        aria-pressed={!muted}
        onClick={() => setMuted(!muted)}
      >
        <Icon name={muted ? "muted" : "sound"} size={22} />
      </button>
    </Tooltip>
  );
}
