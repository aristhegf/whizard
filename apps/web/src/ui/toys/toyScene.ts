/**
 * The toy box: glossy 3D letter blocks, dice, stars, rings and orbs floating around the mascot.
 * Plain Three.js, loaded on its own (see ToyScene.tsx) so the rest of the app never waits for it.
 *
 * The toys bob and turn on their own, the whole scene leans toward the pointer, and toys near the
 * pointer get nudged out of its way. The mascot is a flat sprite in the middle of the scene, so
 * toys can pass in front of it and behind it.
 */
import {
  NeutralToneMapping,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Scene,
  Shape,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector2,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type ToyLayout = "hero" | "band";

export interface ToySceneOptions {
  /** A transparent picture drawn as a sprite in the middle of the scene. */
  mascot?: string;
  /** "hero": toys all around a big mascot. "band": a short strip, mascot to the right. */
  layout: ToyLayout;
  /** Draw a still scene: no floating, leaning or pop-in. */
  reducedMotion: boolean;
  /** Called once the first full frame (mascot included) is on screen. */
  onReady?: () => void;
}

export interface ToySceneHandle {
  dispose(): void;
}

type ToyKind = "block" | "die" | "star" | "ring" | "orb";

interface ToySpec {
  kind: ToyKind;
  /** Where it floats: x and y as a share of the half-width and half-height, z in world units. */
  at: [number, number, number];
  /** Size as a share of the view's height. */
  size: number;
  color: string;
  letter?: string;
  /** The die's face toward the viewer, 1 to 6. */
  face?: number;
  /** Hidden on narrow screens, to keep phones clear. */
  wide?: boolean;
}

const VIOLET = "#8b3dff";
const AMBER = "#ffb21e";
const PINK = "#ff4fa3";
const TEAL = "#16c79a";
const BLUE = "#2f7bff";
const GOLD = "#ffd43f";

const LAYOUTS: Record<ToyLayout, { mascot: [number, number, number]; toys: ToySpec[] }> = {
  hero: {
    // x, y and the mascot's height as a share of the view's height.
    mascot: [0.06, -0.06, 0.78],
    toys: [
      { kind: "block", letter: "W", color: VIOLET, at: [-0.62, 0.52, 1.2], size: 0.15 },
      { kind: "star", color: GOLD, at: [0.62, 0.66, 0.4], size: 0.13 },
      { kind: "die", face: 5, color: "#fff4dc", at: [0.74, -0.42, 1.8], size: 0.12 },
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
    toys: [
      { kind: "star", color: GOLD, at: [0.26, 0.46, 1.2], size: 0.2 },
      { kind: "block", letter: "?", color: AMBER, at: [0.8, -0.46, 1.4], size: 0.18 },
      { kind: "die", face: 3, color: "#fff4dc", at: [0.2, -0.46, 0.4], size: 0.16 },
      { kind: "ring", color: PINK, at: [0.86, 0.5, -1.2], size: 0.15 },
      { kind: "block", letter: "W", color: VIOLET, at: [-0.3, -0.12, 0.6], size: 0.15 },
      { kind: "orb", color: TEAL, at: [0.44, -0.66, 2], size: 0.09 },
    ],
  },
};

/** Everything made here, so dispose() can give it all back to the GPU. */
class Bin {
  private items: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }
  dispose() {
    for (const item of this.items) item.dispose();
    this.items = [];
  }
}

const posterFont = (px: number) =>
  `800 ${px}px "Whizard Poster", "Bricolage Grotesque Variable", sans-serif`;

/** A rounded tile of colour with a letter on it, for each face of a letter block. */
function letterTexture(letter: string, color: string): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  // A lighter inset, like a pressed toy block.
  const inset = g.createLinearGradient(0, 0, 0, size);
  inset.addColorStop(0, "rgb(255 255 255 / 28%)");
  inset.addColorStop(1, "rgb(255 255 255 / 4%)");
  g.fillStyle = inset;
  g.beginPath();
  g.roundRect(22, 22, size - 44, size - 44, 36);
  g.fill();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = posterFont(190);
  g.shadowColor = "rgb(20 0 60 / 45%)";
  g.shadowOffsetY = 8;
  g.fillText(letter, size / 2, size / 2 + 12);
  return canvas;
}

/** A die face with `n` pips. */
function pipTexture(n: number, color: string): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  const spots: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [
      [0.28, 0.28],
      [0.72, 0.72],
    ],
    3: [
      [0.26, 0.26],
      [0.5, 0.5],
      [0.74, 0.74],
    ],
    4: [
      [0.28, 0.28],
      [0.72, 0.28],
      [0.28, 0.72],
      [0.72, 0.72],
    ],
    5: [
      [0.26, 0.26],
      [0.74, 0.26],
      [0.5, 0.5],
      [0.26, 0.74],
      [0.74, 0.74],
    ],
    6: [
      [0.28, 0.24],
      [0.72, 0.24],
      [0.28, 0.5],
      [0.72, 0.5],
      [0.28, 0.76],
      [0.72, 0.76],
    ],
  };
  g.fillStyle = n === 1 ? "#ff3d6e" : "#2a1160";
  for (const [x, y] of spots[n] ?? []) {
    g.beginPath();
    g.arc(x * size, y * size, n === 1 ? 34 : 24, 0, Math.PI * 2);
    g.fill();
  }
  return canvas;
}

function starShape(points = 5, outer = 0.5, inner = 0.23): Shape {
  const shape = new Shape();
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

/** Glossy toy plastic: a soft base coat under a clear lacquer that catches the room's lights. */
function plastic(bin: Bin, color: string, extra: Partial<MeshPhysicalMaterial> = {}) {
  const material = new MeshPhysicalMaterial({
    color: new Color(color),
    roughness: 0.32,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
  Object.assign(material, extra);
  return bin.add(material);
}

function canvasMap(bin: Bin, canvas: HTMLCanvasElement, renderer: WebGLRenderer): Texture {
  const texture = bin.add(new CanvasTexture(canvas));
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeToy(spec: ToySpec, bin: Bin, renderer: WebGLRenderer): Mesh {
  let geometry: BufferGeometry;
  let material: Material | Material[];
  switch (spec.kind) {
    case "block": {
      geometry = bin.add(new RoundedBoxGeometry(1, 1, 1, 5, 0.14));
      // The letter on all four sides, so it shows as the block turns; plain tiles top and bottom.
      const lettered = plastic(bin, "#ffffff", {
        map: canvasMap(bin, letterTexture(spec.letter ?? "W", spec.color), renderer),
      });
      const plain = plastic(bin, "#ffffff", {
        map: canvasMap(bin, letterTexture("", spec.color), renderer),
      });
      material = [lettered, lettered, plain, plain, lettered, lettered];
      break;
    }
    case "die": {
      geometry = bin.add(new RoundedBoxGeometry(1, 1, 1, 5, 0.18));
      // BoxGeometry's faces run +x, -x, +y, -y, +z, -z; opposite faces add up to seven.
      const front = spec.face ?? 5;
      const [side = 1, top = 2] = [1, 2, 3].filter((n) => n !== front && n !== 7 - front);
      const faces = [side, 7 - side, top, 7 - top, front, 7 - front];
      material = faces.map((n) =>
        plastic(bin, "#ffffff", { map: canvasMap(bin, pipTexture(n, spec.color), renderer) }),
      );
      break;
    }
    case "star": {
      geometry = bin.add(
        new ExtrudeGeometry(starShape(), {
          depth: 0.16,
          bevelEnabled: true,
          bevelThickness: 0.08,
          bevelSize: 0.06,
          bevelSegments: 4,
          curveSegments: 4,
        }),
      );
      geometry.center();
      material = plastic(bin, spec.color, { metalness: 0.35, roughness: 0.22 });
      break;
    }
    case "ring":
      geometry = bin.add(new TorusGeometry(0.36, 0.15, 24, 56));
      material = plastic(bin, spec.color);
      break;
    case "orb":
      geometry = bin.add(new IcosahedronGeometry(0.5, 5));
      material = plastic(bin, spec.color, { roughness: 0.18 });
      break;
  }
  return new Mesh(geometry, material);
}

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

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const easeOutBack = (t: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export function createToyScene(
  canvas: HTMLCanvasElement,
  options: ToySceneOptions,
): ToySceneHandle {
  const { layout, reducedMotion, mascot, onReady } = options;
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

  // A warm key light from the top left and a violet rim from behind, as on the game art.
  const key = new DirectionalLight("#fff0d6", 2.2);
  key.position.set(-4, 6, 8);
  scene.add(key);
  const rim = new PointLight("#b061ff", 60, 40, 1.6);
  rim.position.set(5, -2, -4);
  scene.add(rim);
  const fill = new PointLight("#ffb347", 25, 30, 1.6);
  fill.position.set(-6, -4, 4);
  scene.add(fill);

  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  const rig = new Group();
  scene.add(rig);

  const plan = LAYOUTS[layout];
  const toys: Toy[] = plan.toys.map((spec, i) => {
    const mesh = makeToy(spec, bin, renderer);
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
  // Show a die's chosen face, a star face-on, and a little tilt on the rest.
  for (const toy of toys) {
    const r = toy.mesh.rotation;
    if (toy.spec.kind === "star") r.set(0.2, -0.3, 0.15);
    else if (toy.spec.kind === "ring") r.set(0.9, 0.4, 0);
    else r.set(-0.35 + Math.random() * 0.2, 0.5 + Math.random() * 0.3, 0.05);
  }

  let sprite: Mesh | null = null;
  let spriteAspect = 1;
  let disposed = false;
  let readyFired = false;

  // Sizes in world units, worked out from the canvas.
  let halfH = 1;
  let halfW = 1;
  let narrow = false;

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    halfW = halfH * camera.aspect;
    narrow = w < 640;
    if (!running && compiled) renderFrame(performance.now());
  };

  // The pointer, -1 to 1 across the canvas; null when it's away.
  const pointer = new Vector2(0, 0);
  const lean = new Vector2(0, 0);
  let pointerActive = false;
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
    pointerActive =
      Math.abs(pointer.x) < 1.15 && Math.abs(pointer.y) < 1.15 && event.type !== "pointerleave";
  };
  const onLeave = () => {
    pointerActive = false;
  };

  let start = performance.now();
  let last = start;
  // Nothing is drawn until the shaders are built, which happens off the main thread where the
  // browser can (compileAsync), so a slow graphics chip never freezes the page.
  let compiled = false;

  const renderFrame = (now: number) => {
    const t = (now - start) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const still = reducedMotion;

    // Lean the whole scene a little toward the pointer.
    const target = pointerActive && !still ? pointer : new Vector2(0, 0);
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

      const baseX = spec.at[0] * halfW * (narrow ? 0.92 : 1);
      const baseY = spec.at[1] * halfH;
      const size = spec.size * halfH * 2 * (narrow ? 1.25 : 1);

      // Nudged away from the pointer, springing back once it moves on.
      if (pointerActive && !still) {
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

      const bob = still ? 0 : Math.sin(t * 1.1 + toy.phase) * halfH * 0.035;
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
        mesh.rotation.x += (toy.spin[0] * 0.3 + toy.kick * 0.4) * dt;
        mesh.rotation.y += (toy.spin[1] * 0.5 + toy.kick) * dt;
      }

      const grow = still ? 1 : easeOutBack(Math.min(1, Math.max(0, (t - toy.delay) / 0.7)));
      mesh.scale.setScalar(Math.max(0.0001, size * grow));
    }

    if (sprite) {
      const [mx, my, mh] = plan.mascot;
      const height = halfH * 2 * mh;
      sprite.scale.set(height * spriteAspect, height, 1);
      const bob = still ? 0 : Math.sin(t * 1.4) * halfH * 0.018;
      const x = narrow ? 0 : mx * halfW;
      sprite.position.set(x, my * halfH + bob, 0);
      sprite.rotation.y = -lean.x * 0.12;
    }

    renderer.render(scene, camera);

    if (!readyFired && (sprite || !mascot)) {
      readyFired = true;
      onReady?.();
    }
  };

  // Run only while the canvas is on screen and the tab is in front.
  let running = false;
  let onScreen = true;
  let frame = 0;
  const loop = (now: number) => {
    if (!running) return;
    renderFrame(now);
    frame = requestAnimationFrame(loop);
  };
  const update = () => {
    const want = compiled && !reducedMotion && onScreen && !document.hidden && !disposed;
    if (want && !running) {
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    } else if (!want && running) {
      running = false;
      cancelAnimationFrame(frame);
    }
  };

  const visibility = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    update();
  });
  visibility.observe(canvas);
  const sizing = new ResizeObserver(resize);
  sizing.observe(canvas);
  document.addEventListener("visibilitychange", update);
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);

  const onLost = (event: Event) => {
    event.preventDefault();
    running = false;
    cancelAnimationFrame(frame);
  };
  canvas.addEventListener("webglcontextlost", onLost);

  if (mascot) {
    new TextureLoader().load(mascot, (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      bin.add(texture);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const image = texture.image as { width: number; height: number };
      spriteAspect = image.width / image.height;
      const plane = bin.add(new PlaneGeometry(1, 1));
      const material = bin.add(
        new MeshBasicMaterial({
          map: texture,
          transparent: true,
          toneMapped: false,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      sprite = new Mesh(plane, material);
      sprite.renderOrder = 1;
      rig.add(sprite);
      if (!running && compiled) renderFrame(performance.now());
    });
  }

  resize();
  void renderer
    .compileAsync(scene, camera)
    .catch(() => {})
    .then(() => {
      if (disposed) return;
      compiled = true;
      start = last = performance.now();
      update();
      if (!running) renderFrame(performance.now());
    });
  // Redraw the letters once the poster font has arrived, if it wasn't in yet.
  void document.fonts?.load(posterFont(64), "WZ?").then(() => {
    if (disposed) return;
    for (const toy of toys) {
      if (toy.spec.kind !== "block") continue;
      const material = (toy.mesh.material as MeshPhysicalMaterial[])[0];
      const map = material?.map as CanvasTexture | null | undefined;
      if (!map) continue;
      map.image = letterTexture(toy.spec.letter ?? "W", toy.spec.color);
      map.needsUpdate = true;
    }
    if (!running && compiled) renderFrame(performance.now());
  });

  return {
    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(frame);
      visibility.disconnect();
      sizing.disconnect();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      bin.dispose();
      envTarget.dispose();
      pmrem.dispose();
      room.dispose();
      renderer.dispose();
    },
  };
}
