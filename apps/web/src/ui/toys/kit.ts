/**
 * The toy kit: the glossy plastic toys every 3D scene is made from (letter blocks, dice, stars,
 * rings and orbs), their textures, and the mascot sprite. Shared by the hero, the podium and the
 * lobby, so they all look like they came out of the same box.
 */
import {
  CanvasTexture,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Shape,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Texture,
  type WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export const VIOLET = "#8b3dff";
export const AMBER = "#ffb21e";
export const PINK = "#ff4fa3";
export const TEAL = "#16c79a";
export const BLUE = "#2f7bff";
export const GOLD = "#ffd43f";
export const CREAM = "#fff4dc";

/** The toys' colours, for anything picked at random. */
export const PALETTE = [VIOLET, AMBER, PINK, TEAL, BLUE, GOLD];

export type ToyKind = "block" | "die" | "star" | "ring" | "orb";

export interface ToyLook {
  kind: ToyKind;
  color: string;
  /** What's printed on a block. */
  letter?: string;
  /** The die's face toward the viewer, 1 to 6. */
  face?: number;
}

/** Everything a scene makes, so dispose() can give it all back to the GPU. */
export class Bin {
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

export const posterFont = (px: number) =>
  `800 ${px}px "Whizard Poster", "Bricolage Grotesque Variable", sans-serif`;

/** A rounded tile of colour with a letter on it, for each face of a letter block. */
export function letterTexture(letter: string, color: string): HTMLCanvasElement {
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
  if (letter) {
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = posterFont(letter.length > 1 ? 130 : 190);
    g.shadowColor = "rgb(20 0 60 / 45%)";
    g.shadowOffsetY = 8;
    g.fillText(letter, size / 2, size / 2 + 12);
  }
  return canvas;
}

const PIPS: Record<number, [number, number][]> = {
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

/** A die face with `n` pips. */
function pipTexture(n: number, color: string): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  g.fillStyle = n === 1 ? "#ff3d6e" : "#2a1160";
  for (const [x, y] of PIPS[n] ?? []) {
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
export function plastic(bin: Bin, color: string, extra: Partial<MeshPhysicalMaterial> = {}) {
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

export function canvasMap(bin: Bin, canvas: HTMLCanvasElement, renderer: WebGLRenderer): Texture {
  const texture = bin.add(new CanvasTexture(canvas));
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

/**
 * The shapes, made once per scene and shared by every toy of that kind: a scene with forty
 * falling stars still has one star geometry.
 */
export class Shapes {
  private made = new Map<string, BufferGeometry>();
  constructor(private bin: Bin) {}

  get(kind: ToyKind): BufferGeometry {
    let geometry = this.made.get(kind);
    if (geometry) return geometry;
    switch (kind) {
      case "block":
        geometry = new RoundedBoxGeometry(1, 1, 1, 5, 0.14);
        break;
      case "die":
        geometry = new RoundedBoxGeometry(1, 1, 1, 5, 0.18);
        break;
      case "star":
        geometry = new ExtrudeGeometry(starShape(), {
          depth: 0.16,
          bevelEnabled: true,
          bevelThickness: 0.08,
          bevelSize: 0.06,
          bevelSegments: 4,
          curveSegments: 4,
        });
        geometry.center();
        break;
      case "ring":
        geometry = new TorusGeometry(0.36, 0.15, 24, 56);
        break;
      case "orb":
        geometry = new IcosahedronGeometry(0.5, 5);
        break;
    }
    this.made.set(kind, this.bin.add(geometry));
    return geometry;
  }
}

/** One toy, one unit across. Scale it to size. */
export function makeToy(look: ToyLook, shapes: Shapes, bin: Bin, renderer: WebGLRenderer): Mesh {
  let material: Material | Material[];
  switch (look.kind) {
    case "block": {
      // The letter on all four sides, so it shows as the block turns; plain tiles top and bottom.
      const lettered = plastic(bin, "#ffffff", {
        map: canvasMap(bin, letterTexture(look.letter ?? "W", look.color), renderer),
      });
      const plain = plastic(bin, "#ffffff", {
        map: canvasMap(bin, letterTexture("", look.color), renderer),
      });
      material = [lettered, lettered, plain, plain, lettered, lettered];
      break;
    }
    case "die": {
      // BoxGeometry's faces run +x, -x, +y, -y, +z, -z; opposite faces add up to seven.
      const front = look.face ?? 5;
      const [side = 1, top = 2] = [1, 2, 3].filter((n) => n !== front && n !== 7 - front);
      const faces = [side, 7 - side, top, 7 - top, front, 7 - front];
      material = faces.map((n) =>
        plastic(bin, "#ffffff", { map: canvasMap(bin, pipTexture(n, look.color), renderer) }),
      );
      break;
    }
    case "star":
      material = plastic(bin, look.color, { metalness: 0.35, roughness: 0.22 });
      break;
    case "ring":
      material = plastic(bin, look.color);
      break;
    case "orb":
      material = plastic(bin, look.color, { roughness: 0.18 });
      break;
  }
  return new Mesh(shapes.get(look.kind), material);
}

/** Redraws a block's letter, once the poster font has arrived. */
export function reletter(mesh: Mesh, look: ToyLook) {
  if (look.kind !== "block") return;
  const material = (mesh.material as MeshPhysicalMaterial[])[0];
  const map = material?.map as CanvasTexture | null | undefined;
  if (!map) return;
  map.image = letterTexture(look.letter ?? "W", look.color);
  map.needsUpdate = true;
}

/** A toy's resting pose: a die's chosen face, a star face-on, and a little tilt on the rest. */
export function restingPose(mesh: Mesh, kind: ToyKind) {
  const r = mesh.rotation;
  if (kind === "star") r.set(0.2, -0.3, 0.15);
  else if (kind === "ring") r.set(0.9, 0.4, 0);
  else r.set(-0.35 + Math.random() * 0.2, 0.5 + Math.random() * 0.3, 0.05);
}

/** A transparent picture as a flat sprite: one unit tall, `aspect` wide. */
export function loadSprite(
  url: string,
  bin: Bin,
  renderer: WebGLRenderer,
): Promise<{ mesh: Mesh; aspect: number }> {
  return new Promise((resolve, reject) => {
    new TextureLoader().load(
      url,
      (texture) => {
        bin.add(texture);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const image = texture.image as { width: number; height: number };
        const material = bin.add(
          new MeshBasicMaterial({
            map: texture,
            transparent: true,
            toneMapped: false,
            depthWrite: false,
            side: DoubleSide,
          }),
        );
        const mesh = new Mesh(bin.add(new PlaneGeometry(1, 1)), material);
        mesh.renderOrder = 1;
        resolve({ mesh, aspect: image.width / image.height });
      },
      undefined,
      reject,
    );
  });
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const easeOutBack = (t: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
