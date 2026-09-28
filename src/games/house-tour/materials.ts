import * as THREE from "three";
import { random } from "./kit";

const assetUrls = import.meta.glob<string>("./assets/*.webp", { eager: true, query: "?url", import: "default" });
const assetUrl = (name: string) => {
  const url = assetUrls[`./assets/${name}.webp`];
  if (!url) throw new Error(`Missing asset ${name}`);
  return url;
};

export const skyUrl = () => assetUrl("sky");

/** Scanned surfaces and how many meters one texture tile covers. */
const SCANNED = {
  floor: 1.5,
  tatami: 1.82,
  whiteoak: 0.9,
  oak: 0.9,
  walnut: 0.9,
  hinoki: 1.6,
  cedar: 1.8,
  clay: 1.6,
  granite: 1.2,
  concrete: 2.5,
  gravel: 1.2,
  grass: 2.5,
  asphalt: 4,
  deck: 1.4,
  linen: 0.45,
  boucle: 0.5,
} as const;

type ScannedName = keyof typeof SCANNED;

export type MaterialName =
  | ScannedName
  | "siding"
  | "curtain"
  | "paper"
  | "ceiling"
  | "vinyl"
  | "bathFloor"
  | "bathWall"
  | "fusuma"
  | "shoji"
  | "scroll"
  | "matte"
  | "satin"
  | "gloss"
  | "lacquer"
  | "metal"
  | "chrome"
  | "sash"
  | "glass"
  | "frosted"
  | "screen"
  | "art"
  | "maple"
  | "foliage"
  | "kawara"
  | "lamp"
  | "leaf"
  | "sheer"
  | "mesh"
  | "water";

function canvas(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, height = size) {
  const element = document.createElement("canvas");
  element.width = size;
  element.height = height;
  draw(element.getContext("2d", { willReadFrequently: true })!, size);
  return element;
}

/** Converts a grayscale height canvas into a tangent-space normal map. */
function normalFromHeight(source: HTMLCanvasElement, strength: number) {
  const { width, height } = source;
  const src = source.getContext("2d")!.getImageData(0, 0, width, height).data;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const h = (x: number, y: number) => src[(((y + height) % height) * width + ((x + width) % width)) * 4]! / 255;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      image.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

function noise(ctx: CanvasRenderingContext2D, size: number, seed: number, amount: number, base: number, scale = 1) {
  const rand = random(seed);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = (rand() - 0.5) * amount * 255 * scale;
    image.data[i] = Math.max(0, Math.min(255, image.data[i]! + v + base));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1]! + v + base));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2]! + v + base));
  }
  ctx.putImageData(image, 0, 0);
}

/** Embossed vinyl wallpaper: soft random fibres, almost white. */
function wallpaperHeight(size: number) {
  return canvas(size, (ctx) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);
    const rand = random(7);
    for (let i = 0; i < 9000; i++) {
      const x = rand() * size,
        y = rand() * size,
        a = rand() * Math.PI,
        l = 2 + rand() * 7;
      ctx.strokeStyle = rand() > 0.5 ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
      ctx.lineWidth = 1 + rand();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    ctx.filter = "blur(0.6px)";
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = "none";
  });
}

/** Tile grid height map: grout lines are low. */
function tileHeight(size: number, tiles: number, grout: number, seed: number, bumps = 0) {
  return canvas(size, (ctx) => {
    ctx.fillStyle = "#c8c8c8";
    ctx.fillRect(0, 0, size, size);
    const step = size / tiles;
    const rand = random(seed);
    if (bumps) {
      for (let i = 0; i < bumps; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.2})`;
        ctx.beginPath();
        ctx.arc(rand() * size, rand() * size, 1 + rand() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#303030";
    for (let i = 0; i <= tiles; i++) {
      ctx.fillRect(i * step - grout / 2, 0, grout, size);
      ctx.fillRect(0, i * step - grout / 2, size, grout);
    }
    ctx.filter = "blur(1px)";
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = "none";
  });
}

/** Fusuma paper: warm off-white with a faint seigaiha wave print and fibres. */
function fusumaColor(size: number) {
  return canvas(size, (ctx) => {
    ctx.fillStyle = "#e9e1cd";
    ctx.fillRect(0, 0, size, size);
    const r = size / 8;
    ctx.lineWidth = size / 170;
    for (let row = -1; row < 18; row++) {
      for (let col = -1; col < 10; col++) {
        const cx = col * r * 2 + (row % 2 ? r : 0);
        const cy = row * r * 0.5;
        for (let k = 4; k >= 1; k--) {
          ctx.beginPath();
          ctx.arc(cx, cy, (r * k) / 4, Math.PI, 0);
          ctx.fillStyle = "#e9e1cd";
          if (k === 4) ctx.fill();
          ctx.strokeStyle = k % 2 ? "rgba(170,146,98,0.28)" : "rgba(170,146,98,0.16)";
          ctx.stroke();
        }
      }
    }
    noise(ctx, size, 11, 0.05, 0);
  });
}

/** Lap siding: 12 boards over 1.82 m, each shadowed under the board above. */
function sidingHeight(size: number) {
  return canvas(size, (ctx) => {
    const boards = 12;
    const step = size / boards;
    for (let i = 0; i < boards; i++) {
      const gradient = ctx.createLinearGradient(0, i * step, 0, (i + 1) * step);
      gradient.addColorStop(0, "#303030");
      gradient.addColorStop(0.08, "#9a9a9a");
      gradient.addColorStop(1, "#e0e0e0");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, i * step, size, step);
    }
    noise(ctx, size, 17, 0.06, 0);
  });
}

function sidingColor(size: number) {
  return canvas(size, (ctx) => {
    ctx.fillStyle = "#eee8dc";
    ctx.fillRect(0, 0, size, size);
    const boards = 12;
    const step = size / boards;
    const rand = random(29);
    for (let i = 0; i < boards; i++) {
      ctx.fillStyle = "rgba(70,60,45,0.28)";
      ctx.fillRect(0, i * step, size, step * 0.07);
      ctx.fillStyle = `rgba(255,250,240,${0.05 + rand() * 0.06})`;
      ctx.fillRect(0, i * step + step * 0.1, size, step * 0.9);
    }
    noise(ctx, size, 23, 0.035, 0);
  });
}

function shojiColor(size: number) {
  return canvas(size, (ctx) => {
    ctx.fillStyle = "#f4f1ea";
    ctx.fillRect(0, 0, size, size);
    const rand = random(3);
    for (let i = 0; i < 700; i++) {
      ctx.strokeStyle = `rgba(200,190,170,${0.1 + rand() * 0.2})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const x = rand() * size,
        y = rand() * size;
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + rand() * 20 - 10,
        y + rand() * 20 - 10,
        x + rand() * 30 - 15,
        y + rand() * 30 - 15,
        x + rand() * 40 - 20,
        y + rand() * 40 - 20,
      );
      ctx.stroke();
    }
    noise(ctx, size, 5, 0.03, 0);
  });
}

/** Hanging scroll: an ink landscape of layered ridges, a moon, and a red seal. */
function scrollColor() {
  return canvas(
    256,
    (ctx) => {
      const w = 256,
        h = 768;
      ctx.fillStyle = "#ece4d0";
      ctx.fillRect(0, 0, w, h);
      const rand = random(21);
      ctx.fillStyle = "rgba(80,70,60,0.08)";
      ctx.beginPath();
      ctx.arc(170, 170, 34, 0, Math.PI * 2);
      ctx.fill();
      const ridge = (base: number, amp: number, alpha: number, seed: number) => {
        const r = random(seed);
        ctx.beginPath();
        ctx.moveTo(0, h);
        let y = base;
        for (let x = 0; x <= w; x += 4) {
          y += (r() - 0.5) * amp + (base - y) * 0.08;
          ctx.lineTo(x, y - Math.sin((x / w) * Math.PI) * amp * 3);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, base - amp * 4, 0, base + 200);
        gradient.addColorStop(0, `rgba(30,28,26,${alpha})`);
        gradient.addColorStop(1, `rgba(30,28,26,0)`);
        ctx.fillStyle = gradient;
        ctx.fill();
      };
      ridge(330, 22, 0.35, 4);
      ridge(420, 18, 0.5, 9);
      ridge(520, 14, 0.75, 13);
      // Pine silhouette on the nearest ridge.
      ctx.strokeStyle = "rgba(25,22,20,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(60, 560);
      ctx.bezierCurveTo(70, 520, 52, 500, 74, 468);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `rgba(25,22,20,${0.5 + rand() * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(66 + (rand() - 0.5) * 30, 470 + i * 14, 22 - i * 2, 5, (rand() - 0.5) * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Brush calligraphy column (abstract strokes) and seal.
      ctx.strokeStyle = "rgba(20,18,16,0.85)";
      for (let i = 0; i < 5; i++) {
        ctx.lineWidth = 3 + rand() * 3;
        ctx.beginPath();
        const y = 80 + i * 34;
        ctx.moveTo(214 + rand() * 6, y);
        ctx.quadraticCurveTo(230, y + 8 + rand() * 6, 216 + rand() * 10, y + 22);
        ctx.stroke();
      }
      ctx.fillStyle = "#b3342a";
      ctx.fillRect(212, 262, 18, 18);
      ctx.fillStyle = "#ece4d0";
      ctx.fillRect(216, 266, 4, 10);
      ctx.fillRect(222, 270, 4, 6);
      noise(ctx, w, 2, 0.04, 0);
    },
    768,
  );
}

/**
 * Four framed prints in a 2 × 2 atlas: a layered-hill landscape, a botanical study,
 * a wave pattern, and a wall calendar page.
 */
function artAtlas() {
  return canvas(1024, (ctx) => {
    const cell = (i: number, draw: () => void) => {
      ctx.save();
      ctx.translate((i % 2) * 512, Math.floor(i / 2) * 512);
      ctx.beginPath();
      ctx.rect(0, 0, 512, 512);
      ctx.clip();
      draw();
      ctx.restore();
    };
    cell(0, () => {
      ctx.fillStyle = "#efe3cc";
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "#d9784a";
      ctx.beginPath();
      ctx.arc(330, 170, 70, 0, Math.PI * 2);
      ctx.fill();
      const hills = ["#b9a27a", "#8d9a7b", "#5f7466", "#394a45"];
      hills.forEach((color, k) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, 512);
        for (let x = 0; x <= 512; x += 8)
          ctx.lineTo(x, 250 + k * 60 - Math.sin(x / (90 + k * 30) + k * 1.7) * (50 - k * 8));
        ctx.lineTo(512, 512);
        ctx.fill();
      });
    });
    cell(1, () => {
      ctx.fillStyle = "#f3efe6";
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = "#4f6b4a";
      ctx.lineWidth = 3;
      const rand = random(12);
      for (let s = 0; s < 3; s++) {
        const x0 = 170 + s * 90;
        ctx.beginPath();
        ctx.moveTo(x0, 470);
        ctx.quadraticCurveTo(x0 - 40 + s * 30, 260, x0 - 10 + s * 20, 60 + s * 40);
        ctx.stroke();
        for (let i = 0; i < 9; i++) {
          const t = 0.15 + i * 0.09;
          const y = 470 - t * (410 - s * 40);
          const side = i % 2 ? 1 : -1;
          ctx.fillStyle = `rgba(${70 + rand() * 30},${100 + rand() * 30},${70 + rand() * 20},0.85)`;
          ctx.beginPath();
          ctx.ellipse(x0 + side * 34 - s * 8, y, 34, 12, side * -0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    cell(2, () => {
      ctx.fillStyle = "#e9e1cf";
      ctx.fillRect(0, 0, 512, 512);
      for (let row = 0; row < 9; row++) {
        for (let col = -1; col < 6; col++) {
          const cx = col * 100 + (row % 2) * 50,
            cy = row * 60 + 40;
          for (let k = 5; k >= 1; k--) {
            ctx.beginPath();
            ctx.arc(cx, cy, k * 10, Math.PI, 0);
            ctx.fillStyle = k % 2 ? "#2f4f6f" : "#e9e1cf";
            ctx.fill();
          }
        }
      }
    });
    cell(3, () => {
      ctx.fillStyle = "#fbfaf6";
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "#7d9a8c";
      ctx.fillRect(0, 0, 512, 200);
      ctx.fillStyle = "#e8c9a0";
      ctx.beginPath();
      ctx.arc(380, 110, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(40, 225, 60, 22);
      ctx.fillStyle = "#9a9a9a";
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 7; c++) {
          ctx.fillStyle = c === 0 ? "#c0392b" : c === 6 ? "#2d6aa0" : "#555555";
          ctx.fillRect(40 + c * 66, 275 + r * 46, 16, 20);
        }
    });
  });
}

function leafAlpha() {
  return canvas(128, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(size / 2, 2);
    ctx.bezierCurveTo(size * 0.95, size * 0.3, size * 0.8, size * 0.8, size / 2, size - 2);
    ctx.bezierCurveTo(size * 0.2, size * 0.8, size * 0.05, size * 0.3, size / 2, 2);
    ctx.fill();
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, 6);
    ctx.lineTo(size / 2, size - 4);
    ctx.stroke();
  });
}

/** Palmate maple leaf: five pointed lobes on a short stem. */
function mapleAlpha() {
  return canvas(128, (ctx, size) => {
    const c = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    const lobes = [-2.35, -1.2, 0, 1.2, 2.35];
    const lengths = [0.3, 0.42, 0.47, 0.42, 0.3];
    const cy = c + size * 0.08;
    ctx.moveTo(c, cy);
    lobes.forEach((a, i) => {
      const l = lengths[i]! * size;
      const tip = [c + Math.sin(a) * l, cy - Math.cos(a) * l];
      const left = [c + Math.sin(a - 0.28) * l * 0.45, cy - Math.cos(a - 0.28) * l * 0.45];
      const right = [c + Math.sin(a + 0.28) * l * 0.45, cy - Math.cos(a + 0.28) * l * 0.45];
      ctx.lineTo(left[0]!, left[1]!);
      ctx.lineTo(tip[0]!, tip[1]!);
      ctx.lineTo(right[0]!, right[1]!);
      ctx.lineTo(c + Math.sin(a + 0.6) * l * 0.18, cy - Math.cos(a + 0.6) * l * 0.18);
    });
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(c - 1.5, cy, 3, size * 0.4);
  });
}

function toTexture(source: HTMLCanvasElement, color: boolean, anisotropy: number) {
  const texture = new THREE.CanvasTexture(source);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function repeat(texture: THREE.Texture, meters: number) {
  const clone = texture.clone();
  clone.repeat.set(1 / meters, 1 / meters);
  return clone;
}

export function createMaterials(
  manager: THREE.LoadingManager,
  anisotropy: number,
): Record<MaterialName, THREE.Material> {
  const loader = new THREE.TextureLoader(manager);
  const load = (name: string, color: boolean) => {
    const texture = loader.load(assetUrl(name));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const scanned = (name: ScannedName, params: THREE.MeshStandardMaterialParameters = {}, normalScale = 1) => {
    const meters = SCANNED[name];
    return new THREE.MeshStandardMaterial({
      map: repeat(load(`${name}-color`, true), meters),
      normalMap: repeat(load(`${name}-normal`, false), meters),
      normalScale: new THREE.Vector2(normalScale, normalScale),
      roughnessMap: repeat(load(`${name}-rough`, false), meters),
      vertexColors: true,
      ...params,
    });
  };

  const wallHeight = wallpaperHeight(512);
  const wallNormal = toTexture(normalFromHeight(wallHeight, 2.2), false, anisotropy);
  const vinylNormal = toTexture(normalFromHeight(tileHeight(512, 2, 3, 1), 3), false, anisotropy);
  const bathFloorNormal = toTexture(normalFromHeight(tileHeight(512, 8, 5, 2, 2400), 5), false, anisotropy);
  const bathWallNormal = toTexture(normalFromHeight(tileHeight(512, 1, 3, 4), 2), false, anisotropy);
  const leaf = toTexture(leafAlpha(), false, anisotropy);
  const mapleLeaf = toTexture(mapleAlpha(), false, anisotropy);
  const sidingNormal = toTexture(normalFromHeight(sidingHeight(512), 6), false, anisotropy);

  const plain = (params: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ vertexColors: true, ...params });

  return {
    floor: scanned("floor", { roughness: 0.75 }),
    tatami: scanned("tatami", { roughness: 1 }, 0.8),
    whiteoak: scanned("whiteoak", { roughness: 0.8 }),
    oak: scanned("oak", { roughness: 0.75 }),
    walnut: scanned("walnut", { roughness: 0.7 }),
    hinoki: scanned("hinoki", { roughness: 0.9 }),
    cedar: scanned("cedar", { roughness: 0.9 }),
    clay: scanned("clay", { roughness: 1 }, 0.7),
    granite: scanned("granite", { roughness: 0.8 }),
    siding: plain({
      map: repeat(toTexture(sidingColor(512), true, anisotropy), 1.82),
      normalMap: repeat(sidingNormal, 1.82),
      roughness: 0.85,
    }),
    concrete: scanned("concrete", { roughness: 1 }),
    gravel: scanned("gravel", { roughness: 1 }),
    grass: scanned("grass", { roughness: 1 }),
    asphalt: scanned("asphalt", { roughness: 1 }),
    deck: scanned("deck", { roughness: 0.9 }),
    linen: scanned("linen", { roughness: 1 }),
    boucle: scanned("boucle", { roughness: 1 }),
    curtain: new THREE.MeshStandardMaterial({
      map: repeat(load("linen-color", true), 0.45),
      normalMap: repeat(load("linen-normal", false), 0.45),
      roughness: 1,
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    paper: plain({ normalMap: repeat(wallNormal, 0.55), normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.92 }),
    ceiling: plain({ normalMap: repeat(wallNormal, 0.8), normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.95 }),
    vinyl: plain({ normalMap: repeat(vinylNormal, 0.9), roughness: 0.45 }),
    bathFloor: plain({ normalMap: repeat(bathFloorNormal, 0.8), roughness: 0.5 }),
    bathWall: plain({ normalMap: repeat(bathWallNormal, 0.9), roughness: 0.3 }),
    fusuma: plain({ map: repeat(toTexture(fusumaColor(512), true, anisotropy), 0.9), roughness: 0.9 }),
    shoji: plain({
      map: repeat(toTexture(shojiColor(256), true, anisotropy), 0.6),
      roughness: 1,
      transparent: true,
      opacity: 0.97,
      emissive: 0xfff6e8,
      emissiveIntensity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    scroll: new THREE.MeshStandardMaterial({ map: toTexture(scrollColor(), true, anisotropy), roughness: 0.95 }),
    art: new THREE.MeshStandardMaterial({ map: toTexture(artAtlas(), true, anisotropy), roughness: 0.8 }),
    matte: plain({ roughness: 0.85 }),
    satin: plain({ roughness: 0.45 }),
    gloss: plain({ roughness: 0.12 }),
    lacquer: plain({ roughness: 0.2, metalness: 0.05 }),
    metal: plain({ roughness: 0.35, metalness: 1 }),
    chrome: plain({ roughness: 0.08, metalness: 1 }),
    sash: plain({ roughness: 0.4, metalness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xdfe8ea,
      roughness: 0.02,
      metalness: 0.1,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    frosted: new THREE.MeshStandardMaterial({
      color: 0xeef2f2,
      roughness: 0.6,
      transparent: true,
      opacity: 0.8,
      emissive: 0xffffff,
      emissiveIntensity: 0.18,
      side: THREE.DoubleSide,
    }),
    screen: plain({ roughness: 0.06, metalness: 0.2 }),
    kawara: plain({ roughness: 0.42, metalness: 0.35 }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff1dc,
      emissiveIntensity: 2.2,
      roughness: 0.6,
      vertexColors: true,
    }),
    leaf: plain({ alphaMap: leaf, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide }),
    maple: plain({ alphaMap: mapleLeaf, alphaTest: 0.5, roughness: 0.75, side: THREE.DoubleSide }),
    foliage: plain({ roughness: 0.5, side: THREE.DoubleSide }),
    sheer: new THREE.MeshStandardMaterial({
      color: 0xf6f4ef,
      roughness: 1,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    mesh: new THREE.MeshStandardMaterial({
      color: 0x222426,
      roughness: 0.8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    water: new THREE.MeshStandardMaterial({
      color: 0x9fc4c8,
      roughness: 0.03,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  };
}

/** Which merged meshes cast and receive the sun's shadow. */
export function shadowFlags(name: MaterialName) {
  const clear =
    name === "glass" ||
    name === "frosted" ||
    name === "sheer" ||
    name === "mesh" ||
    name === "water" ||
    name === "lamp" ||
    name === "shoji";
  return { cast: !clear, receive: name !== "lamp" };
}
