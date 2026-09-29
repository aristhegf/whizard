import CursorRingField from "../components/originkit/cursor-ring-field";
import { usePrefersStill } from "../display";

let hardware: boolean | undefined;

/**
 * Whether WebGL runs on a graphics chip. Without one (acceleration turned off, a remote desktop,
 * a headless browser) it's drawn in software on the processor, and the field's tens of thousands
 * of moving points would slow the whole site to a crawl.
 */
function hasGraphicsHardware(): boolean {
  if (hardware !== undefined) return hardware;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return (hardware = false);
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    hardware = !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  } catch {
    hardware = false;
  }
  return hardware;
}

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
