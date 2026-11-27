/**
 * The waiting room in 3D: everyone in the room as a glossy toy block with their initial. Someone
 * joining drops in with a pop of stars; someone leaving shrinks away; the room opening gets a
 * burst of toys.
 *
 * - "ring" (wide screens): the blocks circle the mascot on a tilted ring, passing in front of it
 *   and behind. The mascot sprite sits exactly where the page's own mascot picture is; the
 *   picture stays in the page's layout (just hidden), so the title and code never move.
 * - "floor" (phones): the blocks drop into the lobby's spare space and line up on the floor,
 *   stacking into a little pyramid as the room fills. No mascot: it stays small in the header.
 */
import { Group, MathUtils, PerspectiveCamera, Vector2, type Material, type Mesh } from "three";
import {
  AMBER,
  clamp,
  easeOutBack,
  GOLD,
  loadSprite,
  makeToy,
  PALETTE,
  PINK,
  posterFont,
  reletter,
  Shapes,
  TEAL,
  VIOLET,
  type ToyLook,
} from "./kit";
import { createStage } from "./stage";
import type { ToySceneHandle } from "./useToyCanvas";

export interface LobbyPlayer {
  id: string;
  name: string;
}

export type LobbyLayout = "ring" | "floor";

export interface LobbySceneOptions {
  layout: LobbyLayout;
  /** The ring's mascot, and the page's picture of it, whose place the sprite takes. */
  mascot?: { src: string; anchor: HTMLElement };
  players: LobbyPlayer[];
  /** A burst of toys as the scene appears: the room just opened. */
  opening: boolean;
  reducedMotion: boolean;
  onReady?: () => void;
}

export interface LobbySceneHandle extends ToySceneHandle {
  setPlayers(players: LobbyPlayer[]): void;
}

/** The pop of stars and orbs when someone arrives. */
const SPARKS: ToyLook[] = [
  { kind: "star", color: GOLD },
  { kind: "star", color: PINK },
  { kind: "orb", color: TEAL },
  { kind: "ring", color: AMBER },
  { kind: "star", color: GOLD },
  { kind: "orb", color: VIOLET },
];

/** Where the ring starts: in front, off to the right, so the first block never hides the mascot. */
const FRONT = Math.PI * 0.5 - 1;

/** How wide the ring is, as a share of the mascot's height. */
const RING_X = 0.52;

/** Shown at once; more than this and it would be a crowd. */
const MOST = 16;

const initialOf = (name: string) => ([...name.trim()][0] ?? "?").toUpperCase();

/** The same colour for the same player on every screen and every visit. */
function colorOf(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

/** A ball dropped on a floor: falls, then two smaller hops. */
function bounce(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

interface Block {
  id: string;
  look: ToyLook;
  mesh: Mesh;
  materials: Material[];
  /** Its order among those here: its place on the ring or the floor. */
  slot: number;
  /** Its ring angle, eased toward its slot's as others come and go. */
  angle: number;
  /** Its floor spot, eased the same way. */
  spot: Vector2;
  /** When it arrived and, once it's leaving, when it started to go. */
  bornAt: number;
  leftAt: number | null;
  spin: number;
}

interface Spark {
  mesh: Mesh;
  bornAt: number;
  from: Vector2;
  velocity: Vector2;
  z: number;
  size: number;
}

export function createLobbyScene(
  canvas: HTMLCanvasElement,
  options: LobbySceneOptions,
): LobbySceneHandle {
  const { layout, mascot, reducedMotion: still } = options;
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  let halfH = 1;
  let halfW = 1;
  let now = 0;
  /** The mascot's middle and height, in world units, from the page's picture. */
  const center = new Vector2();
  let mascotH = 1;
  let sprite: { mesh: Mesh; aspect: number } | null = null;
  const rig = new Group();
  const blocks: Block[] = [];
  const sparks: Spark[] = [];
  const pointer = new Vector2();
  const lean = new Vector2();
  let pointerActive = false;
  let pendingBurst = options.opening && !still;

  /** Puts the sprite where the page's picture is (as shares of the canvas, so zoom can't skew it). */
  const measure = () => {
    if (!mascot) return;
    const frame = canvas.getBoundingClientRect();
    const r = mascot.anchor.getBoundingClientRect();
    if (!frame.width || !frame.height || !r.width) return;
    const cx = (r.left + r.width / 2 - frame.left) / frame.width;
    const cy = (r.top + r.height / 2 - frame.top) / frame.height;
    center.set((cx * 2 - 1) * halfW, -(cy * 2 - 1) * halfH);
    mascotH = (r.height / frame.height) * halfH * 2;
  };

  /** A block's size: around the mascot, or so that seven fit across the floor. */
  const blockSize = () => {
    const count = Math.max(blocks.filter((b) => b.leftAt === null).length, 1);
    if (layout === "ring") return mascotH * 0.2 * clamp(9 / count, 0.62, 1);
    return Math.min(halfH * 2 * 0.34, (halfW * 2) / 8.5);
  };

  /** Where a floor slot is: rows from the bottom, each a block shorter, like a pyramid. */
  const floorSpot = (slot: number, live: number, size: number): Vector2 => {
    const gap = size * 1.3;
    const fit = Math.max(1, Math.floor((halfW * 2 * 0.94) / gap));
    let row = 0;
    let first = 0;
    for (;;) {
      const cap = Math.max(1, fit - row);
      const inRow = Math.min(cap, live - first);
      if (slot < first + inRow) {
        const j = slot - first;
        return new Vector2((j - (inRow - 1) / 2) * gap, -halfH + size * 0.62 + row * size * 1.02);
      }
      first += inRow;
      row++;
    }
  };

  const stage = createStage(canvas, {
    camera,
    reducedMotion: still,
    onReady: options.onReady,
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      halfW = halfH * camera.aspect;
      measure();
    },
    frame(t, dt) {
      now = t;
      const ease = 1 - Math.pow(0.02, dt || 1);
      // A beat after the scene fades in, so the burst isn't spent before it shows.
      if (pendingBurst && t > 0.35) {
        pendingBurst = false;
        if (layout === "ring") burst(center.x, center.y + mascotH * 0.1, 22, 1.5);
        else burst(0, -halfH * 0.2, 18, 1.2);
      }
      const target = pointerActive && !still ? pointer : new Vector2();
      lean.lerp(target, still ? 1 : 1 - Math.pow(0.04, dt));
      rig.rotation.y = lean.x * 0.12;
      rig.rotation.x = -lean.y * 0.08;

      if (sprite) {
        sprite.mesh.scale.set(mascotH * sprite.aspect, mascotH, 1);
        const bob = still ? 0 : Math.sin(t * 1.4) * mascotH * 0.012;
        sprite.mesh.position.set(center.x, center.y + bob, 0);
      }

      const live = blocks.filter((b) => b.leftAt === null).length;
      const size = blockSize();
      const turn = still ? 0 : t * 0.22;
      for (const block of [...blocks]) {
        const age = t - block.bornAt;
        let x: number;
        let y: number;
        let z: number;
        if (layout === "ring") {
          // Wide and flat, tilted toward the viewer, turning slowly. Arrivals drop from above.
          const goal = FRONT + (block.slot / Math.max(live, 1)) * Math.PI * 2;
          block.angle += (goal - block.angle) * ease;
          const a = block.angle + turn;
          x = center.x + Math.cos(a) * mascotH * RING_X;
          const ringY = center.y - mascotH * 0.08 + Math.sin(a) * mascotH * 0.16;
          z = Math.sin(a) * 2.2;
          const fall = still ? 0 : clamp(1 - age / 0.55, 0, 1);
          y = ringY + fall * fall * halfH * 1.4;
        } else {
          // Dropped from the top onto its spot, landing with a bounce or two.
          const goal = floorSpot(block.slot, live, size);
          block.spot.lerp(goal, block.bornAt < 0 || still ? 1 : ease);
          x = block.spot.x;
          const k = still ? 1 : bounce(clamp(age / 0.8, 0, 1));
          const top = halfH + size;
          y = top + (block.spot.y - top) * k;
          z = -block.slot * 0.02;
        }

        let scale = size * (still || layout === "floor" ? 1 : easeOutBack(clamp(age / 0.5, 0, 1)));
        if (block.leftAt !== null) {
          const k = clamp(1 - (t - block.leftAt) / 0.35, 0, 1);
          scale *= k;
          if (k === 0 || still) {
            rig.remove(block.mesh);
            for (const m of block.materials) m.dispose();
            blocks.splice(blocks.indexOf(block), 1);
            continue;
          }
        }
        block.mesh.position.set(x, y, z);
        block.mesh.scale.setScalar(Math.max(0.0001, scale));
        if (!still) {
          // A gentle rock, always facing front, so the initial reads. Side by side on the floor,
          // less, so a block's side never shows next to its neighbour's front.
          const rock = layout === "floor" ? 0.14 : 0.32;
          block.mesh.rotation.y = Math.sin(t * 0.8 + block.spin) * rock;
          block.mesh.rotation.x = Math.sin(t * 0.6 + block.spin) * 0.12 - 0.1;
        }
      }

      for (const spark of [...sparks]) {
        const age = t - spark.bornAt;
        const life = 1.4;
        if (age > life || still) {
          rig.remove(spark.mesh);
          sparks.splice(sparks.indexOf(spark), 1);
          continue;
        }
        const x = spark.from.x + spark.velocity.x * age;
        const y = spark.from.y + spark.velocity.y * age - 4.5 * age * age;
        spark.mesh.position.set(x, y, spark.z);
        spark.mesh.rotation.x += dt * 5;
        spark.mesh.rotation.y += dt * 4;
        const k = age < 0.15 ? age / 0.15 : 1 - Math.pow((age - 0.15) / (life - 0.15), 2);
        spark.mesh.scale.setScalar(Math.max(0.0001, spark.size * k));
      }
    },
  });
  stage.scene.add(rig);

  const shapes = new Shapes(stage.bin);
  const sparkModels = SPARKS.map((look) => makeToy(look, shapes, stage.bin, stage.renderer));

  /** A pop of stars and orbs from a point. */
  function burst(x: number, y: number, count: number, strength: number) {
    const unit = layout === "ring" ? mascotH : halfH * 2;
    for (let i = 0; i < count; i++) {
      const mesh = sparkModels[i % sparkModels.length]!.clone();
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = MathUtils.randFloat(2.2, 4.2) * strength * (layout === "ring" ? 1 : 0.7);
      rig.add(mesh);
      sparks.push({
        mesh,
        bornAt: now,
        from: new Vector2(x, y),
        velocity: new Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed + 1.6),
        z: MathUtils.randFloat(-1, 2.5),
        size: unit * MathUtils.randFloat(0.07, 0.12),
      });
    }
    stage.wake();
  }

  const setPlayers = (players: LobbyPlayer[], arriving: boolean) => {
    const shown = players.slice(0, MOST);
    for (const block of blocks) {
      if (block.leftAt === null && !shown.some((p) => p.id === block.id)) block.leftAt = now;
    }
    const newcomers: Block[] = [];
    for (const player of shown) {
      if (blocks.some((b) => b.id === player.id && b.leftAt === null)) continue;
      const look: ToyLook = {
        kind: "block",
        letter: initialOf(player.name),
        color: colorOf(player.id),
      };
      const mesh = makeToy(look, shapes, stage.bin, stage.renderer);
      const block: Block = {
        id: player.id,
        look,
        mesh,
        materials: [...new Set(mesh.material as Material[])],
        slot: 0,
        angle: FRONT,
        spot: new Vector2(),
        // Those already here when the scene starts are simply here; later ones arrive.
        bornAt: arriving ? now : -10,
        leftAt: null,
        spin: Math.random() * 6,
      };
      blocks.push(block);
      newcomers.push(block);
      rig.add(mesh);
    }
    // In the order they arrived: the ring starts at the front, the floor fills from the left.
    blocks.filter((b) => b.leftAt === null).forEach((block, i) => (block.slot = i));
    const live = blocks.filter((b) => b.leftAt === null).length;
    for (const block of newcomers) {
      block.angle = FRONT + (block.slot / live) * Math.PI * 2;
      block.spot = floorSpot(block.slot, live, blockSize());
    }
    if (arriving && !still) {
      for (const block of newcomers) {
        if (layout === "ring") {
          const a = block.angle + now * 0.22;
          burst(
            center.x + Math.cos(a) * mascotH * RING_X,
            center.y + Math.sin(a) * mascotH * 0.16,
            14,
            0.9,
          );
        } else {
          burst(block.spot.x, block.spot.y, 12, 0.8);
        }
      }
    }
    stage.wake();
    stage.redraw();
  };

  setPlayers(options.players, false);

  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
    pointerActive = Math.abs(pointer.x) < 1.2 && Math.abs(pointer.y) < 1.2;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  // The page's layout can shift the mascot without the canvas changing size: follow it.
  const relayout = new ResizeObserver(() => {
    measure();
    stage.redraw();
  });
  if (mascot) relayout.observe(mascot.anchor);

  if (mascot) {
    loadSprite(mascot.src, stage.bin, stage.renderer)
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

  // Redraw the initials once the poster font has arrived, if it wasn't in yet.
  void document.fonts?.load(posterFont(64), "AZ").then(() => {
    if (stage.disposed) return;
    for (const block of blocks) reletter(block.mesh, block.look);
    stage.redraw();
  });

  return {
    setPlayers: (players) => setPlayers(players, true),
    dispose() {
      window.removeEventListener("pointermove", onPointer);
      relayout.disconnect();
      stage.dispose();
    },
  };
}
