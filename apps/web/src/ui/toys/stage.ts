/**
 * The stage every 3D scene plays on: the renderer, the room the plastic reflects, the lights, and
 * a loop that only runs while it's worth it. A scene builds its toys onto `stage.scene`, gives a
 * camera and a per-frame callback, and calls start().
 *
 * - Nothing is drawn until the shaders are built, off the main thread where the browser can
 *   (compileAsync), so even a slow graphics chip never freezes the page.
 * - The loop runs only while the canvas is on screen and the tab is in front, and never with
 *   reduced motion: then each change is drawn once, still.
 * - dispose() gives everything back to the GPU.
 */
import {
  DirectionalLight,
  NeutralToneMapping,
  PMREMGenerator,
  PointLight,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
  type OrthographicCamera,
  type PerspectiveCamera,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Bin } from "./kit";

export interface StageOptions {
  camera: PerspectiveCamera | OrthographicCamera;
  /** Draw stills only: no loop. */
  reducedMotion: boolean;
  /**
   * The size of one "toy unit" in the scene's own units, for placing the lights: 1 for scenes
   * measured in world units, about 60 for scenes measured in CSS pixels.
   */
  unit?: number;
  /** The canvas changed size, in CSS pixels: update the camera. */
  resize(width: number, height: number): void;
  /**
   * Move things before each frame. `t` is seconds since start, `dt` since the last frame. Return
   * false once nothing is moving, and the loop sleeps until wake().
   */
  frame(t: number, dt: number): boolean | void;
  /** The first frame is on screen. */
  onReady?: () => void;
}

export interface Stage {
  scene: Scene;
  renderer: WebGLRenderer;
  bin: Bin;
  /** The canvas's size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Builds the shaders, then starts the loop (or draws the one still). */
  start(): void;
  /** Draws a frame now, if the loop isn't already drawing them. */
  redraw(): void;
  /** Something's moving again: run the loop, if it's allowed to run. */
  wake(): void;
  readonly disposed: boolean;
  dispose(): void;
}

export function createStage(canvas: HTMLCanvasElement, options: StageOptions): Stage {
  const { camera, reducedMotion } = options;
  const unit = options.unit ?? 1;
  const bin = new Bin();
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTarget = pmrem.fromScene(room, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.7;

  // A warm key light from the top left and a violet rim from behind, as on the game art. Point
  // lights fade with distance, so in a scene measured in pixels they sit further out and shine
  // brighter by the same measure.
  const key = new DirectionalLight("#fff0d6", 2.2);
  key.position.set(-4, 6, 8);
  scene.add(key);
  const boost = Math.pow(unit, 1.6);
  const rim = new PointLight("#b061ff", 60 * boost, 40 * unit, 1.6);
  rim.position.set(5 * unit, -2 * unit, -4 * unit);
  scene.add(rim);
  const fill = new PointLight("#ffb347", 25 * boost, 30 * unit, 1.6);
  fill.position.set(-6 * unit, -4 * unit, 4 * unit);
  scene.add(fill);

  let width = 1;
  let height = 1;
  let disposed = false;
  let compiled = false;
  let readyFired = false;
  let start = performance.now();
  let last = start;
  let sleeping = false;

  const draw = (now: number) => {
    const t = (now - start) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (options.frame(reducedMotion ? 10 : t, reducedMotion ? 0 : dt) === false) sleeping = true;
    renderer.render(scene, camera);
    if (!readyFired) {
      readyFired = true;
      options.onReady?.();
    }
  };

  let running = false;
  let onScreen = true;
  let frame = 0;
  const loop = (now: number) => {
    if (!running) return;
    draw(now);
    if (sleeping) {
      running = false;
      return;
    }
    frame = requestAnimationFrame(loop);
  };
  const update = () => {
    const want =
      compiled && !reducedMotion && !sleeping && onScreen && !document.hidden && !disposed;
    if (want && !running) {
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    } else if (!want && running) {
      running = false;
      cancelAnimationFrame(frame);
    }
  };

  const resize = () => {
    width = canvas.clientWidth || 1;
    height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    options.resize(width, height);
    if (!running && compiled) draw(performance.now());
  };

  const visibility = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    update();
  });
  visibility.observe(canvas);
  const sizing = new ResizeObserver(resize);
  sizing.observe(canvas);
  document.addEventListener("visibilitychange", update);
  const onLost = (event: Event) => {
    event.preventDefault();
    running = false;
    cancelAnimationFrame(frame);
  };
  canvas.addEventListener("webglcontextlost", onLost);
  resize();

  return {
    scene,
    renderer,
    bin,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get disposed() {
      return disposed;
    },
    start() {
      void renderer
        .compileAsync(scene, camera)
        .catch(() => {})
        .then(() => {
          if (disposed) return;
          compiled = true;
          start = last = performance.now();
          update();
          if (!running) draw(performance.now());
        });
    },
    redraw() {
      if (!running && compiled && !disposed) draw(performance.now());
    },
    wake() {
      sleeping = false;
      update();
    },
    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(frame);
      visibility.disconnect();
      sizing.disconnect();
      document.removeEventListener("visibilitychange", update);
      canvas.removeEventListener("webglcontextlost", onLost);
      bin.dispose();
      envTarget.dispose();
      pmrem.dispose();
      room.dispose();
      renderer.dispose();
    },
  };
}
