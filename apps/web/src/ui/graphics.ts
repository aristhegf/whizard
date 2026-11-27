let hardware: boolean | undefined;

/**
 * Whether WebGL runs on a graphics chip. Without one (acceleration turned off, a remote desktop,
 * a headless browser) it's drawn in software on the processor, where the backdrop's ring field or
 * the 3D toys would slow the whole site to a crawl. Asked once, then remembered.
 */
export function hasGraphicsHardware(): boolean {
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
