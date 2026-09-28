import * as THREE from "three";
import { Builder } from "./builder";
import { FACADES, facadeMaterial, surfaceMaterial, type FacadeName, type Surfaces } from "./materials";
import {
  BLOCK,
  BLOCK_RANGE,
  CURB_HEIGHT,
  PITCH,
  ROAD,
  ROAD_COUNT,
  SIDEWALK,
  blockCenter,
  isPark,
  pick,
  range,
  rng,
  roadCenter,
  type Random,
} from "./layout";

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface City {
  group: THREE.Group;
  /** Solid footprints the walker collides with. */
  solids: Rect[];
  parks: Rect[];
  /** Fountain basins and similar round obstacles. */
  circles: { x: number; z: number; r: number }[];
}

const color = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const WHITE = color(1, 1, 1);
const SHOP_HEIGHT = FACADES.shop.floor;

const TINTS: Record<FacadeName, THREE.Color[]> = {
  brick: [color(1, 1, 1), color(0.92, 0.86, 0.82), color(0.82, 0.7, 0.66), color(1.05, 0.98, 0.92)],
  sandstone: [color(1, 1, 1), color(0.95, 0.92, 0.86), color(0.88, 0.86, 0.84), color(1.04, 1, 0.92)],
  plaster: [
    color(1.08, 1.03, 0.92),
    color(1.05, 0.9, 0.66),
    color(0.98, 0.72, 0.6),
    color(0.94, 0.94, 0.92),
    color(0.86, 0.92, 0.84),
    color(1.1, 1.1, 1.08),
  ],
  ribbon: [color(1.05, 1.05, 1.03), color(0.9, 0.9, 0.9), color(1.1, 1.05, 0.98)],
  curtain: [
    color(0.75, 1, 1.05),
    color(0.7, 0.86, 1.15),
    color(1.1, 0.92, 0.72),
    color(0.95, 0.98, 1),
    color(0.6, 0.8, 0.85),
  ],
  shop: [
    color(1, 1, 1),
    color(0.36, 0.34, 0.33),
    color(0.2, 0.2, 0.21),
    color(0.28, 0.38, 0.32),
    color(0.9, 0.86, 0.8),
    color(0.45, 0.2, 0.18),
  ],
};
const AWNINGS = [
  color(0.12, 0.25, 0.17),
  color(0.4, 0.07, 0.08),
  color(0.08, 0.12, 0.22),
  color(0.06, 0.06, 0.06),
  color(0.62, 0.52, 0.38),
  color(0.75, 0.73, 0.68),
];
const SHOP_NAMES = [
  "CAFÉ LUMEN",
  "BAKERY",
  "NORTHWIND BOOKS",
  "PHARMACY",
  "DELI & GROCERY",
  "HARDWARE",
  "OPTICIAN",
  "FLOWERS",
  "RAMEN",
  "WINE & SPIRITS",
  "TAILOR",
  "ESPRESSO BAR",
  "BARBER",
  "STATIONERY",
  "PIZZA",
  "LAUNDROMAT",
  "GALLERY 9",
  "SHOES",
  "BANK",
  "TEA HOUSE",
  "RECORDS",
  "NOODLE BAR",
  "CAMERAS",
  "BISTRO",
];

function signAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d")!;
  const palettes = [
    ["#161a1d", "#f2ede1"],
    ["#f3efe6", "#1d1f22"],
    ["#23392d", "#e9dfc4"],
    ["#5b1d1c", "#f6e7cf"],
    ["#1c2940", "#f2f2ee"],
    ["#c9a45a", "#1a1a1a"],
  ];
  SHOP_NAMES.forEach((name, i) => {
    const x = (i % 4) * 256;
    const y = Math.floor(i / 4) * 64 + (i >= 16 ? 0 : 0);
    const [bg, fg] = palettes[i % palettes.length]!;
    context.fillStyle = bg!;
    context.fillRect(x, y, 256, 64);
    context.fillStyle = fg!;
    context.font = `${i % 3 === 0 ? "italic 600" : "600"} 30px ${i % 2 ? "Georgia, serif" : "Helvetica, Arial, sans-serif"}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const scale = Math.min(1, 228 / context.measureText(name).width);
    context.save();
    context.translate(x + 128, y + 33);
    context.scale(scale, 1);
    context.fillText(name, 0, 0);
    context.restore();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function splitLots(random: Random, rect: Rect, maxSize: number, out: Rect[]) {
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  if (Math.max(w, d) <= maxSize || Math.max(w, d) < 22) {
    out.push(rect);
    return;
  }
  const t = Math.round(range(random, 0.36, 0.64) * 2 * (w >= d ? w : d)) / 2;
  if (w >= d) {
    splitLots(random, { ...rect, x1: rect.x0 + t }, maxSize, out);
    splitLots(random, { ...rect, x0: rect.x0 + t }, maxSize, out);
  } else {
    splitLots(random, { ...rect, z1: rect.z0 + t }, maxSize, out);
    splitLots(random, { ...rect, z0: rect.z0 + t }, maxSize, out);
  }
}

interface Builders {
  facades: Record<FacadeName, Builder>;
  roof: Builder;
  stone: Builder;
  metal: Builder;
  awning: Builder;
  sign: Builder;
}

function addBuilding(b: Builders, random: Random, lot: Rect, frontage: boolean[], downtown: number, simple: boolean) {
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  const tower = !simple && downtown > 0.35 && random() < 0.35 + downtown * 0.5 && Math.min(w, d) > 16;
  const style: FacadeName = tower
    ? random() < 0.62
      ? "curtain"
      : "ribbon"
    : pick(
        random,
        downtown > 0.5
          ? (["sandstone", "ribbon", "brick", "sandstone"] as const)
          : (["brick", "brick", "plaster", "plaster", "sandstone", "ribbon"] as const),
      );
  const facade = FACADES[style];
  const floors = tower
    ? Math.round(range(random, 14, 26 + downtown * 26))
    : Math.round(range(random, 3, 6 + downtown * 7) + (simple ? 2 : 0));
  const seed = random() * 97;
  const tint = pick(random, TINTS[style]);
  const top = SHOP_HEIGHT + floors * facade.floor;
  const gap = 0.02;
  const x0 = lot.x0 + gap,
    z0 = lot.z0 + gap,
    x1 = lot.x1 - gap,
    z1 = lot.z1 - gap;

  // Ground-floor shops with a sign band.
  b.facades.shop.walls(x0, z0, x1, z1, 0, SHOP_HEIGHT, pick(random, TINTS.shop), {
    uSnap: FACADES.shop.bay,
    vScale: SHOP_HEIGHT,
    vBase: 0,
    seed,
  });
  const bodyOpts = { uSnap: facade.bay, vScale: facade.floor, vBase: SHOP_HEIGHT, seed };
  const setback = tower && floors > 18 && Math.min(w, d) > 24;
  if (setback) {
    const podium = SHOP_HEIGHT + Math.round(range(random, 4, 8)) * facade.floor;
    b.facades[style === "curtain" ? "ribbon" : style].walls(
      x0,
      z0,
      x1,
      z1,
      SHOP_HEIGHT,
      podium,
      pick(random, TINTS.ribbon),
      bodyOpts,
    );
    b.roof.cap(x0, z0, x1, z1, podium, color(0.36, 0.36, 0.35));
    const inset = Math.min(range(random, 3, 6), (Math.min(w, d) - 14) / 2);
    b.facades[style].walls(x0 + inset, z0 + inset, x1 - inset, z1 - inset, podium, top, tint, bodyOpts);
    addRoof(b, random, { x0: x0 + inset, z0: z0 + inset, x1: x1 - inset, z1: z1 - inset }, top, style, tint);
  } else {
    b.facades[style].walls(x0, z0, x1, z1, SHOP_HEIGHT, top, tint, bodyOpts);
    addRoof(b, random, { x0, z0, x1, z1 }, top, style, tint);
  }

  // Street-facing extras: a cornice over the shops, awnings and signs.
  b.stone.walls(
    x0 - 0.18,
    z0 - 0.18,
    x1 + 0.18,
    z1 + 0.18,
    SHOP_HEIGHT - 0.12,
    SHOP_HEIGHT + 0.18,
    color(0.86, 0.83, 0.78),
    { uScale: 1, vScale: 1, vBase: 0 },
  );
  b.stone.cap(x0 - 0.18, z0 - 0.18, x1 + 0.18, z1 + 0.18, SHOP_HEIGHT + 0.18, color(0.86, 0.83, 0.78));
  if (simple) return;
  const sides: { from: [number, number]; to: [number, number]; normal: [number, number]; front: boolean }[] = [
    { from: [x0, z1], to: [x1, z1], normal: [0, 1], front: frontage[0]! },
    { from: [x1, z1], to: [x1, z0], normal: [1, 0], front: frontage[1]! },
    { from: [x1, z0], to: [x0, z0], normal: [0, -1], front: frontage[2]! },
    { from: [x0, z0], to: [x0, z1], normal: [-1, 0], front: frontage[3]! },
  ];
  const awningColor = pick(random, AWNINGS);
  const hasAwnings = random() < 0.55;
  for (const side of sides) {
    if (!side.front) continue;
    const length = Math.hypot(side.to[0] - side.from[0], side.to[1] - side.from[1]);
    const bays = Math.max(1, Math.round(length / FACADES.shop.bay));
    const bay = length / bays;
    const dir = [(side.to[0] - side.from[0]) / length, (side.to[1] - side.from[1]) / length] as const;
    const [nx, nz] = side.normal;
    for (let i = 0; i < bays; i++) {
      const a = i * bay + 0.25;
      const c = (i + 1) * bay - 0.25;
      const p = (t: number, out: number): [number, number] => [
        side.from[0] + dir[0] * t + nx * out,
        side.from[1] + dir[1] * t + nz * out,
      ];
      if (hasAwnings && random() < 0.8) {
        const [ax, az] = p(a, 0.02);
        const [cx, cz] = p(c, 0.02);
        const [ax2, az2] = p(a, 1.45);
        const [cx2, cz2] = p(c, 1.45);
        const n: [number, number, number] = [nx * 0.45, 0.89, nz * 0.45];
        b.awning.quad(
          [
            [ax2, 3.1, az2],
            [cx2, 3.1, cz2],
            [cx, 3.7, cz],
            [ax, 3.7, az],
          ],
          n,
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
          awningColor,
        );
        b.awning.quad(
          [
            [ax2, 2.85, az2],
            [cx2, 2.85, cz2],
            [cx2, 3.1, cz2],
            [ax2, 3.1, az2],
          ],
          [nx, 0, nz],
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
          awningColor,
        );
      }
    }
    // One fascia sign per frontage.
    if (random() < 0.85) {
      const name = Math.floor(random() * SHOP_NAMES.length);
      const signWidth = Math.min(length - 1.5, range(random, 2.6, 3.6));
      const start = range(random, 0.6, Math.max(0.7, length - signWidth - 0.6));
      const [sx0, sz0] = [side.from[0] + dir[0] * start + nx * 0.2, side.from[1] + dir[1] * start + nz * 0.2];
      const [sx1, sz1] = [sx0 + dir[0] * signWidth, sz0 + dir[1] * signWidth];
      const u0 = (name % 4) / 4;
      const v1 = 1 - (Math.floor(name / 4) * 64) / 1024;
      const v0 = v1 - 62 / 1024;
      const y0 = 3.76,
        y1 = y0 + signWidth / 4;
      if (signWidth > 1.5) {
        b.sign.quad(
          [
            [sx0, y0, sz0],
            [sx1, y0, sz1],
            [sx1, y1, sz1],
            [sx0, y1, sz0],
          ],
          [nx, 0, nz],
          [
            [u0, v0],
            [u0 + 0.25, v0],
            [u0 + 0.25, v1],
            [u0, v1],
          ],
          WHITE,
        );
      }
    }
  }
}

function addRoof(b: Builders, random: Random, r: Rect, top: number, style: FacadeName, tint: THREE.Color) {
  const glass = style === "curtain";
  const trimColor = glass
    ? color(0.55, 0.58, 0.6)
    : style === "brick"
      ? color(0.8, 0.76, 0.68)
      : color(0.85, 0.83, 0.79).multiply(tint);
  const out = glass ? 0.05 : 0.3;
  const parapet = glass ? 1.4 : 0.9;
  const trim = glass ? b.metal : b.stone;
  trim.walls(r.x0 - out, r.z0 - out, r.x1 + out, r.z1 + out, top - (glass ? 0 : 0.5), top + parapet, trimColor, {
    uScale: 1,
    vScale: 1,
    vBase: 0,
  });
  trim.cap(r.x0 - out, r.z0 - out, r.x1 + out, r.z1 + out, top + parapet, trimColor);
  b.roof.cap(r.x0, r.z0, r.x1, r.z1, top + 0.3, color(0.42, 0.41, 0.4));
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const units = Math.floor(range(random, 1, 4 + (w * d) / 300));
  for (let i = 0; i < units; i++) {
    const sx = range(random, 1.2, 4),
      sz = range(random, 1.2, 3.5),
      sy = range(random, 1, 2.6);
    const x = range(random, r.x0 + 1, r.x1 - 1 - sx);
    const z = range(random, r.z0 + 1, r.z1 - 1 - sz);
    b.metal.box(x, top + 0.3, z, x + sx, top + 0.3 + sy, z + sz, color(0.72, 0.73, 0.72));
  }
  if (!glass && style !== "ribbon" && random() < 0.45 && w > 10 && d > 10) {
    // Classic timber water tank on steel legs.
    const cx = range(random, r.x0 + 4, r.x1 - 4);
    const cz = range(random, r.z0 + 4, r.z1 - 4);
    const base = top + 0.3;
    const legs = new THREE.CylinderGeometry(0.08, 0.08, 3, 5);
    for (const [ox, oz] of [
      [-1.2, -1.2],
      [1.2, -1.2],
      [1.2, 1.2],
      [-1.2, 1.2],
    ] as const) {
      b.metal.geometry(
        legs,
        new THREE.Matrix4().makeTranslation(cx + ox, base + 1.5, cz + oz),
        color(0.25, 0.25, 0.25),
      );
    }
    b.roof.geometry(
      new THREE.CylinderGeometry(1.9, 1.9, 4, 18, 1, true),
      new THREE.Matrix4().makeTranslation(cx, base + 5, cz),
      color(0.55, 0.42, 0.3),
    );
    b.roof.geometry(
      new THREE.ConeGeometry(2.05, 1.3, 18),
      new THREE.Matrix4().makeTranslation(cx, base + 7.65, cz),
      color(0.3, 0.29, 0.28),
    );
    b.metal.box(cx - 1.6, base + 2.9, cz - 1.6, cx + 1.6, base + 3.05, cz + 1.6, color(0.3, 0.3, 0.3));
  }
}

function addMarkings(white: Builder, yellow: Builder, iron: Builder) {
  const y = 0.012;
  const W = color(0.9, 0.9, 0.88);
  const Y = color(0.88, 0.66, 0.18);
  const quad = (b: Builder, x0: number, z0: number, x1: number, z1: number, c: THREE.Color) =>
    b.cap(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y, c);
  // `along` maps (road-axis coordinate t, lateral offset s) to world x/z.
  for (const axis of ["x", "z"] as const) {
    for (let k = 0; k < ROAD_COUNT; k++) {
      const c = roadCenter(k);
      const rect = (t0: number, t1: number, s0: number, s1: number, b: Builder, col: THREE.Color) =>
        axis === "z" ? quad(b, c + s0, t0, c + s1, t1, col) : quad(b, t0, c + s0, t1, c + s1, col);
      for (let j = 0; j < ROAD_COUNT - 1; j++) {
        const t0 = roadCenter(j) + ROAD / 2;
        const t1 = roadCenter(j + 1) - ROAD / 2;
        const a = t0 + 4.6,
          e = t1 - 4.6;
        rect(a, e, -0.26, -0.12, yellow, Y);
        rect(a, e, 0.12, 0.26, yellow, Y);
        for (let t = a + 1; t + 3 < e; t += 9) {
          rect(t, t + 3, -3.58, -3.42, white, W);
          rect(t, t + 3, 3.42, 3.58, white, W);
        }
        // Crosswalk stripes and stop lines at both ends.
        for (const [start, sign] of [
          [t0, 1],
          [t1, -1],
        ] as const) {
          for (let s = -7.4; s < 7.4; s += 1.2) rect(start + sign * 0.6, start + sign * 3.6, s, s + 0.55, white, W);
          const lateral = sign * (axis === "z" ? 1 : -1);
          rect(start + sign * 4.1, start + sign * 4.5, lateral > 0 ? 0.3 : -7.6, lateral > 0 ? 7.6 : -0.3, white, W);
        }
        // Manhole covers.
        const disc = new THREE.CircleGeometry(0.4, 20).rotateX(-Math.PI / 2);
        const t = (t0 + t1) / 2 + (k % 3) * 7;
        const s = ((k + j) % 2 ? 1 : -1) * 2.8;
        iron.geometry(
          disc,
          new THREE.Matrix4().makeTranslation(axis === "z" ? c + s : t, 0.008, axis === "z" ? t : c + s),
          color(0.5, 0.5, 0.5),
        );
      }
    }
  }
}

function addPark(
  b: Builders & { grass: Builder; curb: Builder; water: Builder },
  random: Random,
  cx: number,
  cz: number,
  circles: City["circles"],
) {
  const inner = BLOCK / 2 - SIDEWALK;
  const path = 2.5;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const x0 = sx < 0 ? cx - inner : cx + path;
    const x1 = sx < 0 ? cx - path : cx + inner;
    const z0 = sz < 0 ? cz - inner : cz + path;
    const z1 = sz < 0 ? cz - path : cz + inner;
    b.grass.cap(x0, z0, x1, z1, CURB_HEIGHT + 0.08, WHITE);
    b.curb.walls(x0, z0, x1, z1, CURB_HEIGHT, CURB_HEIGHT + 0.12, color(0.8, 0.8, 0.78), {
      uScale: 1,
      vScale: 1,
      vBase: 0,
    });
    b.curb.walls(x0 - 0.12, z0 - 0.12, x1 + 0.12, z1 + 0.12, CURB_HEIGHT, CURB_HEIGHT + 0.12, color(0.8, 0.8, 0.78), {
      uScale: 1,
      vScale: 1,
      vBase: 0,
    });
    b.curb.cap(x0 - 0.12, z0 - 0.12, x1 + 0.12, z0, CURB_HEIGHT + 0.12, color(0.8, 0.8, 0.78));
    b.curb.cap(x0 - 0.12, z1, x1 + 0.12, z1 + 0.12, CURB_HEIGHT + 0.12, color(0.8, 0.8, 0.78));
    b.curb.cap(x0 - 0.12, z0, x0, z1, CURB_HEIGHT + 0.12, color(0.8, 0.8, 0.78));
    b.curb.cap(x1, z0, x1 + 0.12, z1, CURB_HEIGHT + 0.12, color(0.8, 0.8, 0.78));
  }
  // Fountain in the middle.
  const basin = new THREE.CylinderGeometry(4.2, 4.3, 0.6, 48, 1, true);
  const matrix = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
  b.stone.geometry(basin, matrix(cx, CURB_HEIGHT + 0.3, cz), color(0.85, 0.82, 0.76));
  b.stone.geometry(
    new THREE.CylinderGeometry(3.9, 3.9, 0.6, 48, 1, true).scale(-1, 1, 1),
    matrix(cx, CURB_HEIGHT + 0.3, cz),
    color(0.75, 0.72, 0.66),
  );
  b.stone.geometry(
    new THREE.RingGeometry(3.9, 4.3, 48).rotateX(-Math.PI / 2),
    matrix(cx, CURB_HEIGHT + 0.6, cz),
    color(0.85, 0.82, 0.76),
  );
  b.stone.geometry(
    new THREE.CylinderGeometry(0.45, 0.7, 1.6, 20),
    matrix(cx, CURB_HEIGHT + 0.8, cz),
    color(0.85, 0.82, 0.76),
  );
  b.stone.geometry(
    new THREE.CylinderGeometry(1.3, 0.3, 0.35, 28),
    matrix(cx, CURB_HEIGHT + 1.7, cz),
    color(0.85, 0.82, 0.76),
  );
  b.water.geometry(new THREE.CircleGeometry(3.9, 48).rotateX(-Math.PI / 2), matrix(cx, CURB_HEIGHT + 0.45, cz), WHITE);
  circles.push({ x: cx, z: cz, r: 4.5 });
  void random;
}

export function createCity(surfaces: Surfaces, seed = 7) {
  const random = rng(seed);
  const group = new THREE.Group();
  const solids: Rect[] = [];
  const parks: Rect[] = [];
  const circles: City["circles"] = [];

  const facadeNames = Object.keys(FACADES) as FacadeName[];
  const b = {
    facades: Object.fromEntries(facadeNames.map((name) => [name, new Builder()])) as Record<FacadeName, Builder>,
    roof: new Builder(),
    stone: new Builder(),
    metal: new Builder(),
    awning: new Builder(),
    sign: new Builder(),
    ground: new Builder(),
    sidewalk: new Builder(),
    curb: new Builder(),
    grass: new Builder(),
    white: new Builder(),
    yellow: new Builder(),
    iron: new Builder(),
    water: new Builder(),
  };

  b.ground.cap(-2200, -2200, 2200, 2200, 0, WHITE);

  const ring = BLOCK_RANGE + 1;
  for (let bx = -ring; bx <= ring; bx++) {
    for (let bz = -ring; bz <= ring; bz++) {
      const cx = blockCenter(bx);
      const cz = blockCenter(bz);
      const outer = Math.abs(bx) === ring || Math.abs(bz) === ring;
      const half = BLOCK / 2;
      b.sidewalk.cap(cx - half, cz - half, cx + half, cz + half, CURB_HEIGHT, WHITE);
      b.curb.walls(cx - half, cz - half, cx + half, cz + half, 0, CURB_HEIGHT, color(0.86, 0.85, 0.82), {
        uScale: 1,
        vScale: 1,
        vBase: 0,
      });
      const inner = half - SIDEWALK;
      if (isPark(bx, bz)) {
        parks.push({ x0: cx - inner, z0: cz - inner, x1: cx + inner, z1: cz + inner });
        addPark(b, random, cx, cz, circles);
        continue;
      }
      const downtown = Math.exp(-((cx * cx + cz * cz) / (240 * 240)));
      const lots: Rect[] = [];
      const block: Rect = { x0: cx - inner, z0: cz - inner, x1: cx + inner, z1: cz + inner };
      splitLots(random, block, range(random, 20, 32) + downtown * 26, lots);
      for (const lot of lots) {
        const frontage = [
          lot.z1 >= block.z1 - 0.01,
          lot.x1 >= block.x1 - 0.01,
          lot.z0 <= block.z0 + 0.01,
          lot.x0 <= block.x0 + 0.01,
        ];
        addBuilding(b, random, lot, frontage, outer ? 0.2 : downtown, outer);
        solids.push(lot);
      }
    }
  }

  // Distant skyline beyond the walkable city, softened by haze.
  for (let i = 0; i < 260; i++) {
    const angle = random() * Math.PI * 2;
    const dist = range(random, (ring + 0.8) * PITCH, 1700);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const w = range(random, 18, 45);
    const d = range(random, 18, 45);
    const cluster = Math.exp(-((angle - 2.2) ** 2) * 1.5) + Math.exp(-((angle - 5.3) ** 2) * 2);
    const style = pick(
      random,
      cluster > 0.4
        ? (["curtain", "curtain", "ribbon"] as const)
        : (["ribbon", "brick", "plaster", "curtain"] as const),
    );
    const facade = FACADES[style];
    const floors = Math.round(range(random, 6, 18 + cluster * 30));
    b.facades[style].walls(
      x - w / 2,
      z - d / 2,
      x + w / 2,
      z + d / 2,
      0,
      floors * facade.floor,
      pick(random, TINTS[style]),
      { uSnap: facade.bay, vScale: facade.floor, vBase: 0, seed: random() * 97 },
    );
    b.roof.cap(x - w / 2, z - d / 2, x + w / 2, z + d / 2, floors * facade.floor, color(0.4, 0.4, 0.4));
  }

  addMarkings(b.white, b.yellow, b.iron);

  const add = (builder: Builder, material: THREE.Material, shadows = true) => {
    if (builder.empty) return;
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  };

  for (const name of facadeNames) add(b.facades[name], facadeMaterial(name, surfaces));
  add(b.roof, surfaceMaterial(surfaces.concrete, 4, { roughness: 1 }));
  add(b.stone, surfaceMaterial(surfaces.sandstone, 3));
  add(b.metal, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.75 }));
  add(b.awning, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  const signs = signAtlas();
  add(
    b.sign,
    new THREE.MeshStandardMaterial({
      map: signs,
      emissiveMap: signs,
      emissive: 0x303030,
      roughness: 0.5,
      vertexColors: true,
    }),
    false,
  );
  add(b.ground, surfaceMaterial(surfaces.asphalt, 5.5, { color: 0xc8c8c8 }), false);
  add(b.sidewalk, surfaceMaterial(surfaces.pavers, 3.2), false);
  add(b.curb, surfaceMaterial(surfaces.concrete, 2), false);
  add(b.grass, surfaceMaterial(surfaces.grass, 3, { color: 0xc4d0a8 }), false);
  const paint = (hex: number) =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: hex,
      roughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  add(b.white, paint(0xffffff), false);
  add(b.yellow, paint(0xffffff), false);
  add(b.water, new THREE.MeshStandardMaterial({ color: 0x1d2a2c, roughness: 0.04, metalness: 0.1 }), false);
  add(
    b.iron,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: 0x2a2a28,
      roughness: 0.55,
      metalness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
    false,
  );

  return { group, solids, parks, circles } satisfies City;
}
