import type { ToyLayout } from "./toyScene";
import { useToyCanvas, type MakeScene, type ToySceneHandle } from "./useToyCanvas";

/**
 * Glossy 3D toys, floating around the mascot when there is one. The mascot shows as a plain
 * picture straight away (and stays that way where 3D can't run); once the Three.js scene has
 * drawn its first frame, the picture hands over to the scene's own copy of it. Purely
 * decorative, so hidden from screen readers and never in the way of a click.
 */
export function ToyScene({
  mascot,
  layout,
  className,
  width,
  height,
}: {
  mascot?: string;
  layout: ToyLayout;
  className?: string;
  /** The mascot picture's own size, so the fallback keeps its shape while it loads. */
  width?: number;
  height?: number;
}) {
  const make: MakeScene<ToySceneHandle> = (canvas, still, onReady) =>
    import("./toyScene").then(({ createToyScene }) =>
      createToyScene(canvas, { mascot, layout, reducedMotion: still, onReady }),
    );
  const { ref, live } = useToyCanvas(make, `${layout}:${mascot ?? ""}`);

  return (
    <div
      className={`toy-scene toy-scene-${layout}${live ? " is-live" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      {mascot && (
        <img className="toy-scene-still" src={mascot} alt="" width={width} height={height} />
      )}
      <canvas ref={ref} className="toy-scene-canvas" />
    </div>
  );
}
