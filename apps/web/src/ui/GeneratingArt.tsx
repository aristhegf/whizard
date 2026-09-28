import type { ImageGenerationHandle } from "img-fx";
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useMediaQuery } from "./common";

let fastWebGL: boolean | undefined;

/**
 * Whether the device draws WebGL on a GPU. Without one the browser falls back to drawing in
 * software, where building the effect's shader freezes the page for most of a minute.
 */
export function canGenerateArt(): boolean {
  if (fastWebGL !== undefined) return fastWebGL;
  try {
    const canvas = document.createElement("canvas");
    const options = { failIfMajorPerformanceCaveat: true };
    const gl = (canvas.getContext("webgl2", options) ??
      canvas.getContext("webgl", options)) as WebGLRenderingContext | null;
    let fast = !!gl;
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      if (/swiftshader|llvmpipe|software/i.test(renderer)) fast = false;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    fastWebGL = fast;
  } catch {
    fastWebGL = false;
  }
  return fastWebGL;
}

// img-fx brings three.js, so it only loads for a game. The lobby starts fetching it early.
export const preloadGeneratingArt = () => import("img-fx");
const ImageGeneration = lazy(() =>
  preloadGeneratingArt().then((m) => ({ default: m.ImageGeneration })),
);

/** Shows the plain picture if WebGL isn't available or the effect fails to load. */
class Fallback extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * A card that looks like it's generating a picture (img-fx): a pixel mosaic in the given
 * colours, until `reveal` turns true and the picture dissolves in over it.
 */
export function GeneratingArt({
  src,
  colors,
  background,
  reveal,
  className = "",
}: {
  src: string;
  /** Tints for the mosaic. */
  colors: string[];
  /** The card behind the picture. */
  background: string;
  reveal: boolean;
  className?: string;
}) {
  const handle = useRef<ImageGenerationHandle | null>(null);
  const revealed = useRef(reveal);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // img-fx redraws whenever these change, so they keep the same identity across renders (the
  // countdown re-renders many times a second).
  const colorKey = colors.join(" ");
  const palette = useMemo(() => colorKey.split(" "), [colorKey]);
  const images = useMemo(() => [src], [src]);

  useEffect(() => {
    revealed.current = reveal;
    if (reveal) handle.current?.triggerReveal({ hold: "manual" });
  }, [reveal]);

  // If the effect finishes loading after it should have revealed, reveal straight away.
  const attach = useCallback((next: ImageGenerationHandle | null) => {
    handle.current = next;
    if (next && revealed.current) next.triggerReveal({ hold: "manual" });
  }, []);

  const still = (
    <div className={`generating-art ${className}`} style={{ background }}>
      <img src={src} alt="" />
    </div>
  );
  if (reducedMotion || !canGenerateArt()) return still;

  return (
    <Fallback fallback={still}>
      <Suspense fallback={<div className={`generating-art ${className}`} style={{ background }} />}>
        <ImageGeneration
          ref={attach}
          preset="pixels-organic"
          theme="dark"
          images={images}
          colors={palette}
          cardBg={background}
          revealHoldMs={60_000}
        >
          <div className={`generating-art ${className}`} />
        </ImageGeneration>
      </Suspense>
    </Fallback>
  );
}
