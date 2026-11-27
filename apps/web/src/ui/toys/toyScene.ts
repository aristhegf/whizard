/**
 * The toy box: glossy 3D letter blocks, dice, stars, rings and orbs floating around the mascot.
 * Loaded on its own (see ToyScene.tsx) so the rest of the app never waits for it.
 *
 * The toys bob and turn on their own, the whole scene leans toward the pointer, and toys near the
 * pointer get nudged out of its way. The mascot is a flat sprite in the middle of the scene, so
 * toys can pass in front of it and behind it.
 */
import { Group, PerspectiveCamera, Vector2, type Mesh } from "three";
import {
  AMBER,
  BLUE,
  clamp,
  CREAM,
  easeOutBack,
  GOLD,
  loadSprite,
  makeToy,
  PINK,
  posterFont,
  reletter,
  restingPose,
  Shapes,
  TEAL,
  VIOLET,
  type ToyLook,
} from "./kit";
import { createStage } from "./stage";
import type { ToySceneHandle } from "./useToyCanvas";

/**
 * "hero": toys all around a big mascot. "band": a short strip, mascot to the right. "drift": a few
 * small toys drifting slowly in a corner, no mascot, for a phone screen that should stay calm.
 */
export type ToyLayout = "hero" | "band" | "drift";

export interface ToySceneOptions {
  /** A transparent picture drawn as a sprite in the scene. */
  mascot?: string;
  layout: ToyLayout;
  /** Draw a still scene: no floating, leaning or pop-in. */
  reducedMotion: boolean;
  /** Called once the first full frame (mascot included) is on screen. */
  onReady?: () => void;
}

interface ToySpec extends ToyLook {
  /** Where it floats: x and y as a share of the half-width and half-height, z in world units. */
  at: [number, number, number];
  /** Size as a share of the view's height. */
  size: number;
  /** Hidden on narrow screens, to keep phones clear. */
  wide?: boolean;
}

interface Plan {
  /** x, y and the mascot's height as a share of the view's height. */
  mascot: [number, number, number];
  toys: ToySpec[];
  /** How lively: 1 for the hero; slower bobbing and turning below that. */
  pace: number;
  /** Whether the scene leans toward the pointer and toys get out of its way. */
  follow: boolean;
}

const LAYOUTS: Record<ToyLayout, Plan> = {
  hero: {
    mascot: [0.06, -0.06, 0.78],
    pace: 1,
    follow: true,
    toys: [
      { kind: "block", letter: "W", color: VIOLET, at: [-0.62, 0.52, 1.2], size: 0.15 },
      { kind: "star", color: GOLD, at: [0.62, 0.66, 0.4], size: 0.13 },
      { kind: "die", face: 5, color: CREAM, at: [0.74, -0.42, 1.8], size: 0.12 },
      { kind: "block", letter: "?", color: AMBER, at: [-0.78, -0.4, 0.6], size: 0.14 },
      { kind: "ring", color: PINK, at: [0.86, 0.18, -1.2], size: 0.12 },
      { kind: "orb", color: TEAL, at: [-0.38, -0.84, 2.2], size: 0.07 },
      { kind: "block", letter: "Z", color: BLUE, at: [0.36, 0.84, -1.8], size: 0.1, wide: true },
      { kind: "star", color: PINK, at: [-0.9, 0.08, -1.4], size: 0.09, wide: true },
      { kind: "orb", color: VIOLET, at: [0.52, -0.86, 0.9], size: 0.06 },
      { kind: "ring", color: AMBER, at: [-0.4, 0.88, -0.8], size: 0.08, wide: true },
    ],
  },
  band: {
    mascot: [0.6, -0.02, 0.92],
    pace: 1,
    follow: true,
    toys: [
      { kind: "star", color: GOLD, at: [0.26, 0.46, 1.2], size: 0.2 },
      { kind: "block", letter: "?", color: AMBER, at: [0.8, -0.46, 1.4], size: 0.18 },
      { kind: "die", face: 3, color: CREAM, at: [0.2, -0.46, 0.4], size: 0.16 },
      { kind: "ring", color: PINK, at: [0.86, 0.5, -1.2], size: 0.15 },
      { kind: "block", letter: "W", color: VIOLET, at: [-0.3, -0.12, 0.6], size: 0.15 },
      { kind: "orb", color: TEAL, at: [0.44, -0.66, 2], size: 0.09 },
    ],
  },
  drift: {
    mascot: [0, 0, 0],
    pace: 0.45,
    follow: false,
    toys: [
      { kind: "star", color: GOLD, at: [0.36, 0.5, 0.6], size: 0.3 },
      { kind: "ring", color: PINK, at: [0.86, 0.66, -1], size: 0.2 },
      { kind: "orb", color: TEAL, at: [0.8, 0.12, 1.2], size: 0.12 },
    ],
  },
};

interface Toy {
  mesh: Mesh;
  spec: ToySpec;
  /** A random start, so the toys don't bob in step. */
  phase: number;
  spin: [number, number];
  /** How far the pointer has pushed it, and how fast that's changing. */
  push: Vector2;
  pushVelocity: Vector2;
  /** Extra turn from being pushed, which wears off. */
  kick: number;
  /** When it pops in, in seconds from the start. */
  delay: number;
}

export function createToyScene(
  canvas: HTMLCanvasElement,
  options: ToySceneOptions,
): ToySceneHandle {
  const { layout, reducedMotion: still, mascot } = options;
  const plan = LAYOUTS[layout];
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  // Sizes in world units, worked out from the canvas.
  let halfH = 1;
  let halfW = 1;
  let narrow = false;

  const rig = new Group();
  let sprite: { mesh: Mesh; aspect: number } | null = null;
  const pointer = new Vector2(0, 0);
  const lean = new Vector2(0, 0);
  let pointerActive = false;
  let toys: Toy[] = [];

  const stage = createStage(canvas, {
    camera,
    reducedMotion: still,
    onReady: options.onReady,
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      halfW = halfH * camera.aspect;
      narrow = w < 640;
    },
    frame(t, dt) {
      const pace = plan.pace;
      // Lean the whole scene a little toward the pointer.
      const target = pointerActive && plan.follow && !still ? pointer : new Vector2(0, 0);
      lean.lerp(target, still ? 1 : 1 - Math.pow(0.04, dt));
      rig.rotation.y = lean.x * 0.16;
      rig.rotation.x = -lean.y * 0.1;

      const pointerWorld = new Vector2(pointer.x * halfW, pointer.y * halfH);
      const reach = halfH * 0.42;

      for (const toy of toys) {
        const { mesh, spec } = toy;
        const hidden = narrow && spec.wide;
        mesh.visible = !hidden;
        if (hidden) continue;

        const baseX = spec.at[0] * halfW * (narrow && layout !== "drift" ? 0.92 : 1);
        const baseY = spec.at[1] * halfH;
        const size = spec.size * halfH * 2 * (narrow && layout !== "drift" ? 1.25 : 1);

        // Nudged away from the pointer, springing back once it moves on.
        if (pointerActive && plan.follow && !still) {
          const dx = baseX + toy.push.x - pointerWorld.x;
          const dy = baseY + toy.push.y - pointerWorld.y;
          const dist = Math.hypot(dx, dy);
          if (dist < reach && dist > 0.001) {
            const force = ((reach - dist) / reach) * 38;
            toy.pushVelocity.x += (dx / dist) * force * dt;
            toy.pushVelocity.y += (dy / dist) * force * dt;
            toy.kick = Math.min(6, toy.kick + force * dt * 0.6);
          }
        }
        // A damped spring back home.
        toy.pushVelocity.x += -toy.push.x * 18 * dt;
        toy.pushVelocity.y += -toy.push.y * 18 * dt;
        toy.pushVelocity.multiplyScalar(Math.pow(0.02, dt));
        toy.push.x += toy.pushVelocity.x * dt;
        toy.push.y += toy.pushVelocity.y * dt;
        toy.kick *= Math.pow(0.15, dt);

        const bob = still ? 0 : Math.sin(t * 1.1 * pace + toy.phase) * halfH * 0.035;
        // Keep every toy whole inside the canvas: nearer toys see a smaller slice of the world.
        const depth = (camera.position.z - spec.at[2]) / camera.position.z;
        const room = size * 0.8;
        const maxX = Math.max(0, halfW * depth - room);
        const maxY = Math.max(0, halfH * depth - room);
        mesh.position.set(
          clamp(baseX + toy.push.x, -maxX, maxX),
          clamp(baseY + bob + toy.push.y, -maxY, maxY),
          spec.at[2],
        );

        if (!still) {
          mesh.rotation.x += (toy.spin[0] * 0.3 + toy.kick * 0.4) * dt * pace;
          mesh.rotation.y += (toy.spin[1] * 0.5 + toy.kick) * dt * pace;
        }

        const grow = still ? 1 : easeOutBack(clamp((t - toy.delay) / (0.7 / pace), 0, 1));
        mesh.scale.setScalar(Math.max(0.0001, size * grow));
      }

      if (sprite) {
        const [mx, my, mh] = plan.mascot;
        const height = halfH * 2 * mh;
        sprite.mesh.scale.set(height * sprite.aspect, height, 1);
        const bob = still ? 0 : Math.sin(t * 1.4) * halfH * 0.018;
        sprite.mesh.position.set(narrow ? 0 : mx * halfW, my * halfH + bob, 0);
        sprite.mesh.rotation.y = -lean.x * 0.12;
      }
    },
  });
  stage.scene.add(rig);

  const shapes = new Shapes(stage.bin);
  toys = plan.toys.map((spec, i) => {
    const mesh = makeToy(spec, shapes, stage.bin, stage.renderer);
    restingPose(mesh, spec.kind);
    rig.add(mesh);
    return {
      mesh,
      spec,
      phase: Math.random() * Math.PI * 2,
      spin: [(Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.35],
      push: new Vector2(),
      pushVelocity: new Vector2(),
      kick: 0,
      delay: 0.15 + i * 0.07,
    };
  });

  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
    pointerActive = Math.abs(pointer.x) < 1.15 && Math.abs(pointer.y) < 1.15;
  };
  const onLeave = () => {
    pointerActive = false;
  };
  if (plan.follow) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
  }

  // The scene shows once the mascot is in it too, so the still picture hands over cleanly.
  if (mascot) {
    loadSprite(mascot, stage.bin, stage.renderer)
      .then((made) => {
        if (stage.disposed) return;
        sprite = made;
        rig.add(made.mesh);
        stage.start();
      })
      .catch(() => {});
  } else {
    stage.start();
  }

  // Redraw the letters once the poster font has arrived, if it wasn't in yet.
  void document.fonts?.load(posterFont(64), "WZ?").then(() => {
    if (stage.disposed) return;
    for (const toy of toys) reletter(toy.mesh, toy.spec);
    stage.redraw();
  });

  return {
    dispose() {
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      stage.dispose();
    },
  };
}
