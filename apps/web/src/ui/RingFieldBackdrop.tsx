import CursorRingField from "../components/originkit/cursor-ring-field";
import { usePrefersStill } from "../display";
import { hasGraphicsHardware } from "./graphics";

/**
 * The Originkit ring field filling the window behind every screen, over the site's usual glow.
 * It lives once at the top of the app, so it keeps running from page to page. Anyone asking for
 * less motion, in Settings or on their device, or without graphics hardware to draw it, gets the
 * plain glow.
 */
export function RingFieldBackdrop() {
  const still = usePrefersStill();
  if (still || !hasGraphicsHardware()) return null;
  return (
    <div className="ring-backdrop" aria-hidden="true">
      <CursorRingField />
    </div>
  );
}
