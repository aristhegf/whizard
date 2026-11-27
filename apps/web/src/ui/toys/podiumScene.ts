/**
 * The results podium in 3D: glossy plastic steps drawn exactly where the page's own podium blocks
 * are (the names and scores stay as page text on top), and a shower of toys that rains down, lands
 * on the steps, bounces, settles, and pops away.
 *
 * The camera is orthographic and measured in CSS pixels, so a step lines up with its block on the
 * page however the page is laid out.
 */
import { MathUtils, Mesh, OrthographicCamera } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  AMBER,
  BLUE,
  clamp,
  CREAM,
  GOLD,
  makeToy,
  PINK,
  plastic,
  posterFont,
  reletter,
  Shapes,
  TEAL,
  VIOLET,
  type ToyLook,
} from "./kit";
import { createStage } from "./stage";
import type { ToySceneHandle } from "./useToyCanvas";

export interface PodiumSceneOptions {
  /** The page's podium: the steps line up with its `.podium-block`s. */
  root: HTMLElement;
  reducedMotion: boolean;
  onReady?: () => void;
}

/** First, second and third: the colour of each step's top. */
const TOPS: Record<number, string> = { 1: "#ffc53d", 2: "#6aa8ff", 3: "#ff9a4a" };

/** How far each step leans back, so its top shows. */
const TILT = 0.3;

/** The shower's toys: few looks, many copies, so they share their materials. */
const LOOKS: ToyLook[] = [
  { kind: "star", color: GOLD },
  { kind: "star", color: GOLD },
  { kind: "star", color: PINK },
  { kind: "block", letter: "W", color: VIOLET },
  { kind: "block", letter: "1", color: AMBER },
  { kind: "ring", color: PINK },
  { kind: "ring", color: TEAL },
  { kind: "orb", color: BLUE },
  { kind: "orb", color: GOLD },
  { kind: "die", face: 6, color: CREAM },
];

const GRAVITY = 2600;

interface Step {
  place: number;
  mesh: Mesh;
  /** Where the step's front face is, in canvas pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}

interface Drop {
  mesh: Mesh;
  look: ToyLook;
  size: number;
  /** When it starts falling, in seconds. */
  at: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  spin: [number, number, number];
  /** When it came to rest, or null while it's still moving. */
  restedAt: number | null;
  gone: boolean;
}

export function createPodiumScene(
  canvas: HTMLCanvasElement,
  options: PodiumSceneOptions,
): ToySceneHandle {
  const { root, reducedMotion: still } = options;
  const camera = new OrthographicCamera(0, 1, 0, -1, 1, 4000);
  camera.position.set(0, 0, 1500);

  let steps: Step[] = [];
  const drops: Drop[] = [];
  // The stage sizes itself while it's being made, before the steps can be measured.
  let built = false;

  /** Where the page's blocks are, in the canvas's own pixels (the lobby and results may zoom). */
  const measure = () => {
    const frame = canvas.getBoundingClientRect();
    const zoom = frame.width / (stage.width || 1) || 1;
    const blocks = [...root.querySelectorAll<HTMLElement>(".podium-block")];
    const next: Step[] = [];
    for (const block of blocks) {
      const place = Number(/place-(\d)/.exec(block.parentElement?.className ?? "")?.[1] ?? 0);
      const r = block.getBoundingClientRect();
      const x = (r.left - frame.left) / zoom;
      const y = (r.top - frame.top) / zoom;
      const w = r.width / zoom;
      const h = r.height / zoom;
      const depth = Math.min(w * 0.55, 160);
      const old = steps.find((s) => s.place === place);
      const sameSize = old && Math.abs(old.w - w) < 0.5 && Math.abs(old.h - h) < 0.5;
      let mesh = old?.mesh;
      if (!mesh || !sameSize) {
        if (mesh) {
          stage.scene.remove(mesh);
          mesh.geometry.dispose();
        }
        // Tall enough that, leaning back, its front still covers the block exactly.
        const geometry = new RoundedBoxGeometry(w, h / Math.cos(TILT), depth, 4, 14);
        const side = plastic(stage.bin, "#3a26b4", { roughness: 0.38 });
        const front = plastic(stage.bin, "#2c1d92", { roughness: 0.42 });
        const top = plastic(stage.bin, TOPS[place] ?? VIOLET, { roughness: 0.25 });
        // BoxGeometry's faces run +x, -x, +y, -y, +z, -z.
        mesh = new Mesh(geometry, [side, side, top, side, front, side]);
        mesh.rotation.x = TILT;
        stage.scene.add(mesh);
      }
      // Leaning back drops the front face by half the depth's lean: lift it by as much.
      mesh.position.set(x + w / 2, -(y + h / 2) + (depth / 2) * Math.sin(TILT), -depth);
      next.push({ place, mesh, x, y, w, h, depth });
    }
    for (const gone of steps.filter((s) => !next.some((n) => n.mesh === s.mesh))) {
      stage.scene.remove(gone.mesh);
    }
    steps = next;
  };

  /** Where a toy at `x` comes to rest: on a step's top, or else on the floor. */
  const restAt = (x: number, size: number): { y: number; z: number } => {
    for (const step of steps) {
      if (x < step.x + size * 0.2 || x > step.x + step.w - size * 0.2) continue;
      const topY = step.mesh.position.y + (step.h / Math.cos(TILT) / 2) * Math.cos(TILT);
      const topZ = step.mesh.position.z + (step.h / Math.cos(TILT) / 2) * Math.sin(TILT);
      return { y: topY + size * 0.45, z: topZ + size };
    }
    return { y: -stage.height + size * 0.6, z: 0 };
  };

  const stage = createStage(canvas, {
    camera,
    reducedMotion: still,
    unit: 70,
    onReady: options.onReady,
    resize(w, h) {
      camera.right = w;
      camera.bottom = -h;
      camera.updateProjectionMatrix();
      if (built) measure();
    },
    frame(t, dt) {
      let moving = false;
      for (const drop of drops) {
        if (drop.gone) continue;
        const { mesh } = drop;
        if (t < drop.at) {
          mesh.visible = false;
          moving = true;
          continue;
        }
        mesh.visible = true;
        if (drop.restedAt === null) {
          moving = true;
          drop.vy -= GRAVITY * dt;
          drop.x += drop.vx * dt;
          drop.y += drop.vy * dt;
          mesh.rotation.x += drop.spin[0] * dt;
          mesh.rotation.y += drop.spin[1] * dt;
          mesh.rotation.z += drop.spin[2] * dt;
          const rest = restAt(drop.x, drop.size);
          if (drop.y <= rest.y && drop.vy < 0) {
            drop.y = rest.y;
            drop.z = rest.z;
            // Bounce, losing most of it each time; settle once the bounce is small.
            drop.vy = -drop.vy * 0.38;
            drop.vx *= 0.6;
            drop.spin = drop.spin.map((s) => s * 0.5) as Drop["spin"];
            if (drop.vy < 140) {
              drop.vy = 0;
              drop.restedAt = t;
            }
          }
          mesh.scale.setScalar(drop.size);
        } else {
          // A while on the podium, then it pops away.
          const age = t - drop.restedAt;
          const linger = 3.4 + (drop.size % 7) * 0.15;
          if (age > linger) {
            const k = clamp(1 - (age - linger) / 0.35, 0, 1);
            mesh.scale.setScalar(Math.max(0.0001, drop.size * k));
            if (k === 0) {
              drop.gone = true;
              mesh.visible = false;
            }
          }
          moving = true;
        }
        mesh.position.set(drop.x, drop.y, drop.z);
      }
      // Once the shower is over, nothing moves: let the loop sleep.
      return moving;
    },
  });

  built = true;
  measure();

  // The shower: more over first place, a few over the others, all within a couple of seconds.
  if (!still) {
    const shapes = new Shapes(stage.bin);
    const models = LOOKS.map((look) => makeToy(look, shapes, stage.bin, stage.renderer));
    const width = stage.width;
    const count = Math.round(clamp(width / 15, 20, 42));
    const first = steps.find((s) => s.place === 1);
    for (let i = 0; i < count; i++) {
      const pick = i % LOOKS.length;
      const look = LOOKS[pick]!;
      const mesh = models[pick]!.clone();
      const size = clamp(width * 0.07, 22, 44) * MathUtils.randFloat(0.8, 1.2);
      // Always over a step, so nothing falls through the gaps in front of the steps' faces.
      const step =
        first && Math.random() < 0.5
          ? first
          : (steps[Math.floor(Math.random() * steps.length)] ?? first);
      const x = step
        ? MathUtils.randFloat(step.x + size * 0.6, step.x + step.w - size * 0.6)
        : MathUtils.randFloat(size, width - size);
      mesh.visible = false;
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      stage.scene.add(mesh);
      drops.push({
        mesh,
        look,
        size,
        at: 0.15 + i * 0.055 + Math.random() * 0.25,
        x,
        y: size * 1.2,
        z: 0,
        vx: MathUtils.randFloatSpread(90),
        vy: MathUtils.randFloat(-120, 0),
        spin: [
          MathUtils.randFloatSpread(7),
          MathUtils.randFloatSpread(7),
          MathUtils.randFloatSpread(4),
        ],
        restedAt: null,
        gone: false,
      });
    }
    // Redraw the letters once the poster font has arrived, if it wasn't in yet.
    void document.fonts?.load(posterFont(64), "W1").then(() => {
      if (stage.disposed) return;
      LOOKS.forEach((look, i) => reletter(models[i]!, look));
    });
  }

  // Fonts and pictures settling can move the page's blocks: follow them.
  const relayout = new ResizeObserver(() => {
    measure();
    stage.redraw();
  });
  relayout.observe(root);
  stage.start();

  return {
    dispose() {
      relayout.disconnect();
      stage.dispose();
    },
  };
}
