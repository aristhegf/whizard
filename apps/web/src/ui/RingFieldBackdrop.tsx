import CursorRingField from "../components/originkit/cursor-ring-field";
import { usePrefersStill } from "../display";
import { useMediaQuery } from "./common";
import { hasGraphicsHardware } from "./graphics";

/**
 * The Originkit ring field filling the window behind every screen, over the site's usual glow.
 * It lives once at the top of the app, so it keeps running from page to page. Anyone asking for
 * less motion, in Settings or on their device, or without graphics hardware to draw it, gets the
 * plain glow. So do phones and tablets: the field follows a mouse they don't have, and on a small
 * touch screen its moving specks only crowd the page.
 */
export function RingFieldBackdrop() {
  const still = usePrefersStill();
  const mouse = useMediaQuery("(hover: hover) and (pointer: fine)");
  if (still || !mouse || !hasGraphicsHardware()) return null;
  return (
    <div className="ring-backdrop" aria-hidden="true">
      <CursorRingField />
    </div>
  );
}
