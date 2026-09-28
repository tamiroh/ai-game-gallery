import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Kit, random, roundedRect, trs, type ColorLike } from "./kit";
import type { MaterialName } from "./materials";
import { CH, D, FL1, FL2, M, W } from "./plan";
import { basin, bentBoard, duvet, leaf, puffy } from "./soft";

export interface Fixture {
  position: THREE.Vector3;
  floor: 1 | 2;
  intensity: number;
  range: number;
}

const T1 = FL1 + CH;
const T2 = FL2 + CH;

const roundedCache = new Map<string, THREE.BufferGeometry>();
/** Rounded box centered at (x, y, z) in the current frame. */
export function rbox(
  kit: Kit,
  mat: MaterialName,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  r: number,
  color: ColorLike,
  rot?: THREE.Euler,
) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  let geometry = roundedCache.get(key);
  if (!geometry)
    roundedCache.set(key, (geometry = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.999)));
  kit.geometry(
    mat,
    geometry,
    rot ? trs(x, y, z, rot.x, rot.y, rot.z) : new THREE.Matrix4().makeTranslation(x, y, z),
    color,
  );
}

export function cylinder(
  kit: Kit,
  mat: MaterialName,
  x: number,
  y: number,
  z: number,
  r0: number,
  r1: number,
  h: number,
  color: ColorLike,
  segments = 20,
  rot?: THREE.Euler,
) {
  kit.geometry(
    mat,
    new THREE.CylinderGeometry(r1, r0, h, segments),
    rot ? trs(x, y, z, rot.x, rot.y, rot.z) : new THREE.Matrix4().makeTranslation(x, y + h / 2, z),
    color,
    "keep",
  );
}

export function lathe(
  kit: Kit,
  mat: MaterialName,
  profile: [number, number][],
  x: number,
  y: number,
  z: number,
  color: ColorLike,
  segments = 28,
  scale?: THREE.Vector3,
) {
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, h]) => new THREE.Vector2(r, h)),
    segments,
  );
  kit.geometry(
    mat,
    geometry,
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      scale ?? new THREE.Vector3(1, 1, 1),
    ),
    color,
    "keep",
  );
  geometry.dispose();
}

export function tube(kit: Kit, mat: MaterialName, points: THREE.Vector3[], radius: number, color: ColorLike) {
  const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 8, radius, 8);
  kit.geometry(mat, geometry, null, color, "keep");
  geometry.dispose();
}

// ——— Lighting fixtures ———

function ceilingLight(
  kit: Kit,
  fixtures: Fixture[],
  x: number,
  top: number,
  z: number,
  floor: 1 | 2,
  intensity = 3.2,
  radius = 0.28,
) {
  lathe(
    kit,
    "satin",
    [
      [0, 0],
      [radius, 0],
      [radius, -0.03],
      [radius - 0.04, -0.09],
      [0, -0.1],
    ],
    x,
    top,
    z,
    0xf4f3ef,
    40,
  );
  lathe(
    kit,
    "lamp",
    [
      [0, -0.1005],
      [radius - 0.05, -0.1005],
      [radius - 0.04, -0.09],
      [0, -0.09],
    ],
    x,
    top,
    z,
    0xffffff,
    40,
  );
  fixtures.push({ position: new THREE.Vector3(x, top - 0.28, z), floor, intensity, range: 7 });
}

function downlight(kit: Kit, x: number, top: number, z: number) {
  cylinder(kit, "satin", x, top - 0.006, z, 0.06, 0.06, 0.006, 0xf4f3ef, 24);
  cylinder(kit, "lamp", x, top - 0.008, z, 0.045, 0.045, 0.004, 0xffffff, 24);
}

function pendant(kit: Kit, x: number, top: number, z: number, drop: number, color: number) {
  cylinder(kit, "satin", x, top - 0.02, z, 0.05, 0.05, 0.02, 0xf2f0ea, 20);
  cylinder(kit, "matte", x, top - drop, z, 0.003, 0.003, drop, 0x222222, 6);
  lathe(
    kit,
    "satin",
    [
      [0.012, 0.02],
      [0.03, 0.0],
      [0.09, -0.08],
      [0.16, -0.2],
      [0.165, -0.205],
      [0.15, -0.2],
      [0.075, -0.08],
      [0.02, 0.0],
    ],
    x,
    top - drop,
    z,
    color,
    36,
  );
  cylinder(kit, "lamp", x, top - drop - 0.12, z, 0.04, 0.04, 0.06, 0xffffff, 16);
}

function smokeAlarm(kit: Kit, x: number, top: number, z: number) {
  lathe(
    kit,
    "satin",
    [
      [0, 0],
      [0.055, 0],
      [0.05, -0.03],
      [0, -0.035],
    ],
    x,
    top,
    z,
    0xf6f5f1,
    24,
  );
}

function switchPlate(kit: Kit, x: number, y: number, z: number, yaw: number, gangs = 1) {
  kit.at(x, y, z, yaw, () => {
    kit.box("satin", -0.035 * gangs, -0.06, 0, 0.035 * gangs, 0.06, 0.008, 0xf6f5f1);
    for (let g = 0; g < gangs; g++)
      kit.box(
        "satin",
        -0.035 * gangs + 0.012 + g * 0.07,
        -0.04,
        0.008,
        -0.035 * gangs + 0.058 + g * 0.07,
        0.04,
        0.013,
        0xefede6,
      );
  });
}

function outlet(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    kit.box("satin", -0.035, -0.06, 0, 0.035, 0.06, 0.007, 0xf6f5f1);
    for (const oy of [-0.025, 0.025])
      for (const ox of [-0.007, 0.007])
        kit.box("matte", ox - 0.002, oy - 0.006, 0.0071, ox + 0.002, oy + 0.006, 0.0075, 0x333333);
  });
}

function airConditioner(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    rbox(kit, "satin", 0, 0.15, 0.13, 0.8, 0.29, 0.25, 0.05, 0xf6f5f2);
    kit.box("satin", -0.36, 0.035, 0.24, 0.36, 0.06, 0.262, 0xdedcd6);
    kit.box("screen", 0.28, 0.08, 0.2605, 0.32, 0.1, 0.262, 0x222a30);
    kit.box("lamp", 0.3, 0.1, 0.262, 0.305, 0.105, 0.263, 0x9fe3a8);
    for (let i = 0; i < 16; i++)
      kit.box("satin", -0.38 + i * 0.05, 0.24, 0.001, -0.37 + i * 0.05, 0.285, 0.255, 0xe9e7e1);
  });
}

// ——— Seating and tables ———

function diningChair(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    const wood = 0xb88d5f;
    // Tapered front legs; back legs sweep up into the backrest.
    for (const lx of [-0.19, 0.19]) {
      cylinder(kit, "oak", lx, 0, 0.18, 0.012, 0.018, 0.42, wood, 12);
      tube(
        kit,
        "oak",
        [
          new THREE.Vector3(lx, 0, -0.2),
          new THREE.Vector3(lx, 0.25, -0.19),
          new THREE.Vector3(lx, 0.45, -0.19),
          new THREE.Vector3(lx * 0.97, 0.66, -0.23),
          new THREE.Vector3(lx * 0.95, 0.86, -0.27),
        ],
        0.016,
        wood,
      );
    }
    // Stretchers.
    for (const [zz, yy] of [
      [0.18, 0.14],
      [-0.19, 0.14],
    ] as const)
      cylinder(kit, "oak", 0, yy, zz, 0.009, 0.009, 0.38, wood, 8, new THREE.Euler(0, 0, Math.PI / 2));
    for (const lx of [-0.19, 0.19])
      cylinder(kit, "oak", lx, 0.1, -0.005, 0.009, 0.009, 0.38, wood, 8, new THREE.Euler(Math.PI / 2, 0, 0));
    // Seat board, upholstered pad, curved back rails.
    rbox(kit, "oak", 0, 0.415, 0, 0.44, 0.03, 0.42, 0.012, wood);
    puffy(kit, "linen", 0, 0.448, 0.01, 0.4, 0.04, 0.38, 0x8a8074, 0.6);
    bentBoard(kit, "oak", 0, 0.8, -0.26, 0.4, 0.09, 0.02, -0.035, wood, -0.2);
    bentBoard(kit, "oak", 0, 0.63, -0.22, 0.4, 0.05, 0.018, -0.035, wood, -0.2);
    kit.solid(-0.23, -0.23, 0.23, 0.23, 0, 0.9);
  });
}

function table(
  kit: Kit,
  x: number,
  y: number,
  z: number,
  yaw: number,
  w: number,
  d: number,
  h: number,
  mat: MaterialName,
  color: number,
) {
  kit.at(x, y, z, yaw, () => {
    kit.box(mat, -w / 2, h - 0.03, -d / 2, w / 2, h, d / 2, color, { swap: true });
    kit.box(
      mat,
      -w / 2 + 0.06,
      h - 0.1,
      -d / 2 + 0.06,
      w / 2 - 0.06,
      h - 0.03,
      d / 2 - 0.06,
      new THREE.Color(color).multiplyScalar(0.9),
      { skip: "py" },
    );
    for (const [lx, lz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      kit.box(
        mat,
        lx * (w / 2 - 0.09) - 0.025,
        0,
        lz * (d / 2 - 0.09) - 0.025,
        lx * (w / 2 - 0.09) + 0.025,
        h - 0.03,
        lz * (d / 2 - 0.09) + 0.025,
        color,
      );
    kit.solid(-w / 2, -d / 2, w / 2, d / 2, 0, h);
  });
}

function sofa(kit: Kit, x: number, y: number, z: number, yaw: number, w: number, color: number) {
  kit.at(x, y, z, yaw, () => {
    const d = 0.9;
    rbox(kit, "linen", 0, 0.26, 0, w, 0.24, d, 0.04, new THREE.Color(color).multiplyScalar(0.85));
    rbox(kit, "linen", 0, 0.55, -d / 2 + 0.11, w, 0.62, 0.22, 0.06, color);
    for (const s of [-1, 1]) rbox(kit, "linen", s * (w / 2 - 0.1), 0.45, 0.02, 0.2, 0.46, d - 0.04, 0.07, color);
    const seats = 3;
    const sw = (w - 0.4) / seats;
    for (let i = 0; i < seats; i++) {
      const cx = -w / 2 + 0.2 + sw * (i + 0.5);
      puffy(kit, "linen", cx, 0.44, 0.08, sw - 0.01, 0.16, d - 0.26, color, 0.45);
      puffy(
        kit,
        "linen",
        cx,
        0.71,
        -d / 2 + 0.3,
        sw - 0.02,
        0.2,
        0.44,
        color,
        0.7,
        new THREE.Euler(-Math.PI / 2 - 0.14, 0, 0),
      );
    }
    puffy(
      kit,
      "boucle",
      -w / 2 + 0.42,
      0.68,
      -0.1,
      0.42,
      0.15,
      0.42,
      0xd8cdb8,
      1,
      new THREE.Euler(-Math.PI / 2 - 0.3, 0.3, 0.05),
    );
    puffy(
      kit,
      "linen",
      w / 2 - 0.45,
      0.66,
      -0.1,
      0.4,
      0.14,
      0.4,
      0x5d6f78,
      1,
      new THREE.Euler(-Math.PI / 2 - 0.25, -0.2, -0.04),
    );
    // Knitted throw folded over one arm.
    rbox(kit, "boucle", -w / 2 + 0.1, 0.695, 0.08, 0.3, 0.035, 0.62, 0.015, 0x8b5e4a);
    rbox(kit, "boucle", -w / 2 - 0.012, 0.5, 0.08, 0.03, 0.4, 0.62, 0.012, 0x8b5e4a);
    for (const [lx, lz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      cylinder(kit, "walnut", lx * (w / 2 - 0.08), 0, lz * (d / 2 - 0.1), 0.02, 0.016, 0.14, 0x4a3426, 10);
    kit.solid(-w / 2, -d / 2, w / 2, d / 2, 0, 0.8);
  });
}

// ——— Storage, books, electronics ———

function cabinet(
  kit: Kit,
  w: number,
  h: number,
  d: number,
  doors: number,
  color: number,
  handle: number,
  mat: MaterialName = "whiteoak",
  drawers = 0,
) {
  kit.box(mat, -w / 2, 0.06, -d / 2, w / 2, h, d / 2 - 0.02, color, { swap: true });
  kit.box("matte", -w / 2 + 0.02, 0, -d / 2 + 0.02, w / 2 - 0.02, 0.06, d / 2 - 0.06, 0x2d2926);
  const dw = w / doors;
  for (let i = 0; i < doors; i++) {
    const x0 = -w / 2 + i * dw + 0.002,
      x1 = x0 + dw - 0.004;
    if (drawers) {
      const dh = (h - 0.06) / drawers;
      for (let j = 0; j < drawers; j++) {
        const y0 = 0.06 + j * dh + 0.002;
        kit.box(mat, x0, y0, d / 2 - 0.02, x1, y0 + dh - 0.004, d / 2, color, { swap: true, shift: i * 0.3 + j * 0.7 });
        kit.box(
          "metal",
          (x0 + x1) / 2 - 0.08,
          y0 + dh - 0.05,
          d / 2,
          (x0 + x1) / 2 + 0.08,
          y0 + dh - 0.035,
          d / 2 + 0.02,
          handle,
        );
      }
    } else {
      kit.box(mat, x0, 0.062, d / 2 - 0.02, x1, h - 0.002, d / 2, color, { swap: true, shift: i * 0.41 });
      const hx = i % 2 ? x0 + 0.04 : x1 - 0.04;
      kit.box("metal", hx - 0.008, h - 0.2, d / 2, hx + 0.008, h - 0.06, d / 2 + 0.02, handle);
    }
  }
}

export function books(
  kit: Kit,
  x0: number,
  x1: number,
  y: number,
  z: number,
  depth: number,
  maxH: number,
  seed: number,
) {
  kit.withBevel(0, () => bookRow(kit, x0, x1, y, z, depth, maxH, seed));
}

function bookRow(kit: Kit, x0: number, x1: number, y: number, z: number, depth: number, maxH: number, seed: number) {
  const rng = random(seed);
  const palette = [0x7b2d26, 0x2d4a6b, 0xd9d2c1, 0x3c5a3a, 0xc2a36b, 0x1f1f22, 0x8f6b8a, 0xe6e1d4, 0x9a4c2c, 0x5b6770];
  let x = x0 + 0.01;
  while (x < x1 - 0.03) {
    if (rng() < 0.08) {
      x += 0.05 + rng() * 0.08;
      continue;
    }
    const w = 0.015 + rng() * 0.035;
    if (x + w > x1 - 0.01) break;
    const h = maxH * (0.62 + rng() * 0.36);
    const d = depth * (0.7 + rng() * 0.28);
    const color = palette[Math.floor(rng() * palette.length)]!;
    const lean = rng() < 0.05 && x > x0 + 0.1 ? 0.18 : 0;
    if (lean) kit.within(trs(x, y, z, 0, 0, -lean), () => kit.box("satin", 0, 0, -d / 2, w, h, d / 2, color));
    else kit.box("satin", x, y, z - d / 2, x + w, y + h, z + d / 2, color);
    x += w + 0.002 + (lean ? 0.06 : 0);
  }
}

function bookshelf(
  kit: Kit,
  x: number,
  y: number,
  z: number,
  yaw: number,
  w: number,
  h: number,
  d: number,
  seed: number,
  color = 0xd6bf98,
) {
  kit.at(x, y, z, yaw, () => {
    const t = 0.02;
    kit.box("whiteoak", -w / 2, 0, -d / 2, -w / 2 + t, h, d / 2, color, { swap: true });
    kit.box("whiteoak", w / 2 - t, 0, -d / 2, w / 2, h, d / 2, color, { swap: true });
    kit.box("whiteoak", -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.006, color);
    const shelves = Math.max(2, Math.round(h / 0.33));
    for (let i = 0; i <= shelves; i++) {
      const sy = i === 0 ? 0.05 : (i * (h - t)) / shelves;
      kit.box("whiteoak", -w / 2 + t, sy - t, -d / 2, w / 2 - t, sy, d / 2, color, { swap: true, shift: i * 0.3 });
      if (i < shelves) books(kit, -w / 2 + t, w / 2 - t, sy, 0.01, d - 0.04, (h - t) / shelves - 0.05, seed + i);
    }
    kit.box("whiteoak", -w / 2, 0, d / 2 - 0.02, w / 2, 0.05, d / 2, color);
    kit.solid(-w / 2, -d / 2, w / 2, d / 2, 0, h);
  });
}

function television(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    const w = 1.23,
      h = 0.71;
    kit.box("satin", -w / 2, 0.09, -0.025, w / 2, 0.09 + h, 0.012, 0x151515);
    kit.box("screen", -w / 2 + 0.008, 0.098, 0.012, w / 2 - 0.008, 0.09 + h - 0.008, 0.014, 0x05070a);
    kit.box("satin", -0.18, 0, -0.12, 0.18, 0.012, 0.08, 0x232323);
    kit.box("satin", -0.03, 0.012, -0.05, 0.03, 0.12, -0.02, 0x232323);
    kit.box("lamp", 0.5, 0.093, 0.0125, 0.505, 0.096, 0.0135, 0xff5a3c);
  });
}

export function plant(kit: Kit, x: number, y: number, z: number, height: number, seed: number, pot = 0xd9d3c7) {
  const rng = random(seed);
  // Pot with a rolled rim, a saucer, and bark mulch on the soil.
  lathe(
    kit,
    "satin",
    [
      [0, 0.012],
      [0.125, 0.012],
      [0.155, 0.27],
      [0.172, 0.28],
      [0.175, 0.315],
      [0.16, 0.32],
      [0.152, 0.3],
      [0, 0.29],
    ],
    x,
    y,
    z,
    pot,
    36,
  );
  lathe(
    kit,
    "satin",
    [
      [0, 0],
      [0.16, 0],
      [0.165, 0.014],
      [0.155, 0.016],
      [0, 0.006],
    ],
    x,
    y,
    z,
    new THREE.Color(pot).multiplyScalar(0.92),
    36,
  );
  cylinder(kit, "matte", x, y + 0.28, z, 0.15, 0.15, 0.008, 0x3a2c22, 24);
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2,
      r = rng() * 0.12;
    kit.within(trs(x + Math.cos(a) * r, y + 0.29, z + Math.sin(a) * r, 0, rng() * 3, 0), () =>
      kit.box("matte", -0.015, 0, -0.008, 0.015, 0.006, 0.008, 0x6b4a32),
    );
  }
  // Stems curving up from the soil, leaves spiralling up each one on short stalks.
  const green = new THREE.Color(0x3a6a2c);
  const base = new THREE.Vector3(x, y + 0.29, z);
  for (let s = 0; s < 3; s++) {
    const top = new THREE.Vector3(
      x + (rng() - 0.5) * 0.24,
      y + height * (0.72 + rng() * 0.28),
      z + (rng() - 0.5) * 0.24,
    );
    const mid = new THREE.Vector3(
      (x + top.x) / 2 + (rng() - 0.5) * 0.1,
      (base.y + top.y) / 2,
      (z + top.z) / 2 + (rng() - 0.5) * 0.1,
    );
    const curve = new THREE.QuadraticBezierCurve3(base, mid, top);
    tube(kit, "matte", curve.getPoints(6), 0.011 - s * 0.002, 0x5b4636);
    const count = Math.round(height * 26);
    for (let i = 0; i < count; i++) {
      const t = 0.28 + (0.72 * (i + rng() * 0.5)) / count;
      const p = curve.getPoint(Math.min(1, t));
      const heading = i * 2.4 + s * 1.3 + rng() * 0.4;
      const out = new THREE.Vector3(Math.sin(heading), 0.35, Math.cos(heading)).normalize();
      const stalk = p.clone().addScaledVector(out, 0.035);
      tube(kit, "matte", [p, stalk], 0.003, 0x4f6a36);
      const length = (0.13 + rng() * 0.08) * (1.1 - t * 0.35);
      leaf(
        kit,
        stalk,
        heading,
        0.55 - t * 0.35 + rng() * 0.3,
        (rng() - 0.5) * 0.7,
        length,
        length * 0.48,
        green.clone().multiplyScalar(0.75 + rng() * 0.45),
      );
    }
  }
  kit.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, y, y + height);
}

function wallClock(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    cylinder(kit, "walnut", 0, 0, 0.015, 0.16, 0.16, 0.03, 0x5c4332, 40, new THREE.Euler(Math.PI / 2, 0, 0));
    cylinder(kit, "satin", 0, 0, 0.031, 0.145, 0.145, 0.003, 0xf4f1e8, 40, new THREE.Euler(Math.PI / 2, 0, 0));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      kit.within(trs(Math.sin(a) * 0.125, Math.cos(a) * 0.125, 0.033, 0, 0, -a), () =>
        kit.box("matte", -0.003, -0.012, 0, 0.003, 0.012, 0.002, 0x2a2a2a),
      );
    }
    kit.within(trs(0, 0, 0.036, 0, 0, -1.9), () => kit.box("matte", -0.004, 0, 0, 0.004, 0.08, 0.002, 0x1e1e1e));
    kit.within(trs(0, 0, 0.038, 0, 0, 0.5), () => kit.box("matte", -0.003, 0, 0, 0.003, 0.115, 0.002, 0x1e1e1e));
  });
}

function rug(kit: Kit, x0: number, z0: number, x1: number, z1: number, y: number, color: number) {
  rbox(kit, "boucle", (x0 + x1) / 2, y + 0.006, (z0 + z1) / 2, x1 - x0, 0.012, z1 - z0, 0.006, color);
}

// ——— Kitchen ———

function kitchen(kit: Kit) {
  const y = FL1;
  const top = 0x9c9994;
  const doorColor = 0xefebe3;
  // Back cupboard along the north wall.
  kit.at(1.7, y, 0.1 + 0.225, 0, () => {
    cabinet(kit, 2.8, 0.86, 0.45, 6, doorColor, 0x8d8d8d, "satin", 2);
    kit.box("satin", -1.41, 0.86, -0.225, 1.41, 0.9, 0.235, 0xd9d6cf);
  });
  const cy = y + 0.9;
  // Microwave, rice cooker, kettle, toaster on the counter.
  kit.at(2.75, cy, 0.34, 0, () => {
    rbox(kit, "satin", 0, 0.16, 0, 0.5, 0.32, 0.38, 0.02, 0xf2f2f0);
    kit.box("screen", -0.23, 0.04, 0.19, 0.1, 0.28, 0.192, 0x1a1c1e);
    kit.box("screen", 0.14, 0.2, 0.19, 0.22, 0.28, 0.192, 0x202326);
  });
  kit.at(1.95, cy, 0.34, 0, () => {
    rbox(kit, "satin", 0, 0.11, 0, 0.26, 0.22, 0.32, 0.08, 0xeeeeea);
    kit.box("screen", -0.06, 0.12, 0.155, 0.06, 0.17, 0.162, 0x2a2d30);
  });
  lathe(
    kit,
    "metal",
    [
      [0, 0],
      [0.08, 0],
      [0.09, 0.08],
      [0.07, 0.17],
      [0.03, 0.19],
      [0, 0.19],
    ],
    1.5,
    cy,
    0.3,
    0xcfd1d2,
    24,
  );
  tube(
    kit,
    "matte",
    [
      new THREE.Vector3(1.43, cy + 0.17, 0.3),
      new THREE.Vector3(1.5, cy + 0.26, 0.3),
      new THREE.Vector3(1.57, cy + 0.17, 0.3),
    ],
    0.008,
    0x222222,
  );
  kit.at(0.7, cy, 0.3, 0, () => {
    for (let i = 0; i < 5; i++)
      cylinder(
        kit,
        "gloss",
        -0.18 + i * 0.09,
        0,
        0,
        0.03,
        0.035,
        0.12 + (i % 3) * 0.03,
        [0xf0ede4, 0x6a8a9a, 0xc9a26a, 0xf0ede4, 0x8a3a2a][i]!,
        18,
      );
  });
  // Open shelf with jars and bowls under the window's head height.
  kit.box("whiteoak", 2.75, y + 1.62, 0.1, 3.2, y + 1.645, 0.36, 0xd9c29e);
  kit.box("whiteoak", 2.75, y + 1.92, 0.1, 3.2, y + 1.945, 0.36, 0xd9c29e);
  for (let i = 0; i < 3; i++)
    lathe(
      kit,
      "glass",
      [
        [0, 0],
        [0.05, 0],
        [0.05, 0.14],
        [0.04, 0.15],
        [0, 0.15],
      ],
      2.83 + i * 0.13,
      y + 1.645,
      0.22,
      0xffffff,
      16,
    );
  for (let i = 0; i < 3; i++)
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.04, 0],
        [0.08, 0.06],
        [0.075, 0.062],
        [0, 0.01],
      ],
      2.9 + i * 0.1,
      y + 1.945 + i * 0.012,
      0.22,
      0xe9e2d2,
      20,
    );

  // Refrigerator.
  kit.at(3.64, y, 0.46, 0, () => {
    const face = 0xe3e4e0;
    // Cabinet behind the doors, dark gasket line, kick plate.
    kit.box("satin", -0.34, 0.05, -0.35, 0.34, 1.8, 0.3, 0xd6d7d3);
    kit.box("matte", -0.33, 0.05, 0.3, 0.33, 1.79, 0.312, 0x2a2b2c);
    kit.box("matte", -0.33, 0, -0.3, 0.33, 0.05, 0.28, 0x1e1f20);
    // French doors on top, three drawers below, each a separate bevelled panel.
    for (const [x0, x1] of [
      [-0.34, -0.0015],
      [0.0015, 0.34],
    ] as const)
      kit.box("gloss", x0, 1.125, 0.312, x1, 1.8, 0.35, face);
    for (const [y0, y1] of [
      [0.925, 1.12],
      [0.625, 0.92],
      [0.05, 0.62],
    ] as const)
      kit.box("gloss", -0.34, y0, 0.312, 0.34, y1, 0.35, face);
    // Slim vertical pulls on the doors, recessed top-edge pulls on the drawers.
    for (const s of [-1, 1]) rbox(kit, "chrome", s * 0.03, 1.4, 0.362, 0.014, 0.32, 0.022, 0.006, 0xc4c6c7);
    for (const yy of [1.105, 0.905, 0.605]) kit.box("matte", -0.25, yy - 0.012, 0.345, 0.25, yy, 0.351, 0x55575a);
    // Touch panel on the right door and hinge caps on top.
    kit.box("screen", 0.12, 1.5, 0.35, 0.22, 1.56, 0.352, 0x1b2024);
    for (let i = 0; i < 3; i++)
      kit.box("lamp", 0.135 + i * 0.03, 1.525, 0.352, 0.145 + i * 0.03, 1.53, 0.353, 0x9fd3ff);
    for (const s of [-1, 1]) rbox(kit, "satin", s * 0.3, 1.805, 0.3, 0.06, 0.012, 0.06, 0.004, 0xcfd0cc);
    kit.solid(-0.35, -0.36, 0.35, 0.36, 0, 1.8);
  });

  // Peninsula with sink and induction hob, facing the dining room.
  kit.at(1.5, y, 1.88, 0, () => {
    const w = 2.8,
      d = 0.65;
    cabinet(kit, w, 0.82, d, 1, doorColor, 0x8d8d8d, "satin", 1);
    kit.box("whiteoak", -w / 2, 0.06, -d / 2 + 0.02, w / 2, 0.82, -d / 2 + 0.021, doorColor);
    for (let i = 0; i < 4; i++) {
      const x0 = -w / 2 + i * (w / 4) + 0.002;
      kit.box("satin", x0, 0.065, -d / 2 - 0.001, x0 + w / 4 - 0.004, 0.815, -d / 2 + 0.019, doorColor);
      kit.box("chrome", x0 + 0.1, 0.72, -d / 2 - 0.018, x0 + w / 4 - 0.1, 0.735, -d / 2 - 0.001, 0xb5b7b8);
      if (i === 1 || i === 2)
        kit.box("chrome", x0 + 0.1, 0.42, -d / 2 - 0.018, x0 + w / 4 - 0.1, 0.435, -d / 2 - 0.001, 0xb5b7b8);
    }
    // Counter top with a sink cut-out.
    const sx0 = -0.95,
      sx1 = -0.2,
      sz0 = -0.25,
      sz1 = 0.15,
      ty0 = 0.82,
      ty1 = 0.86;
    kit.box("satin", -w / 2, ty0, -d / 2, sx0, ty1, d / 2 + 0.02, top);
    kit.box("satin", sx1, ty0, -d / 2, w / 2, ty1, d / 2 + 0.02, top);
    kit.box("satin", sx0, ty0, -d / 2, sx1, ty1, sz0, top);
    kit.box("satin", sx0, ty0, sz1, sx1, ty1, d / 2 + 0.02, top);
    kit.box("metal", sx0, ty1 - 0.2, sz0, sx1, ty1 - 0.19, sz1, 0xb9bbbd);
    kit.box("metal", sx0, ty1 - 0.2, sz0, sx0 + 0.005, ty1, sz1, 0xb9bbbd);
    kit.box("metal", sx1 - 0.005, ty1 - 0.2, sz0, sx1, ty1, sz1, 0xb9bbbd);
    kit.box("metal", sx0, ty1 - 0.2, sz0, sx1, ty1, sz0 + 0.005, 0xb9bbbd);
    kit.box("metal", sx0, ty1 - 0.2, sz1 - 0.005, sx1, ty1, sz1, 0xb9bbbd);
    cylinder(kit, "chrome", -0.575, ty1 - 0.195, 0, 0.035, 0.035, 0.004, 0x888888, 16);
    // Swan-neck faucet.
    cylinder(kit, "chrome", -0.575, ty1, -0.29, 0.025, 0.022, 0.1, 0xd6d6d6, 16);
    tube(
      kit,
      "chrome",
      [
        new THREE.Vector3(-0.575, ty1 + 0.09, -0.29),
        new THREE.Vector3(-0.575, ty1 + 0.34, -0.27),
        new THREE.Vector3(-0.575, ty1 + 0.36, -0.14),
        new THREE.Vector3(-0.575, ty1 + 0.28, -0.08),
      ],
      0.012,
      0xd6d6d6,
    );
    kit.box("chrome", -0.59, ty1 + 0.1, -0.33, -0.56, ty1 + 0.12, -0.24, 0xd6d6d6);
    // Induction hob.
    kit.box("screen", 0.25, ty1, -0.25, 0.95, ty1 + 0.006, 0.26, 0x0a0a0c);
    for (const [hx, hz, r] of [
      [0.42, -0.08, 0.1],
      [0.78, -0.08, 0.1],
      [0.6, 0.14, 0.07],
    ] as const) {
      const ring = new THREE.TorusGeometry(r, 0.0025, 4, 40);
      kit.geometry("satin", ring, trs(hx, ty1 + 0.007, hz, Math.PI / 2), 0x6b6b6b, "keep");
    }
    // Raised splash panel toward the dining side.
    kit.box("whiteoak", -w / 2, ty1, d / 2 + 0.02, w / 2, 1.05, d / 2 + 0.1, 0xeae4d8);
    kit.box("oak", -w / 2 - 0.01, 1.05, d / 2, w / 2 + 0.01, 1.08, d / 2 + 0.2, 0xc8a071, { swap: true });
    // Chopping board, bowl, dish rack.
    kit.box("hinoki", 0.02, ty1, -0.2, 0.2, ty1 + 0.018, 0.08, 0xe8cfa6);
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.05, 0],
        [0.11, 0.07],
        [0.105, 0.072],
        [0, 0.01],
      ],
      -1.15,
      ty1,
      0.05,
      0x3e5e72,
      24,
    );
    kit.solid(-w / 2, -d / 2, w / 2, d / 2 + 0.2, 0, 1.08);
  });
  // Range hood over the hob.
  kit.at(1.5 + 0.6, T1, 1.85, 0, () => {
    kit.box("metal", -0.38, -0.55, -0.3, 0.38, -0.44, 0.3, 0xc9cbcc);
    kit.box("metal", -0.16, -0.44, -0.12, 0.16, 0, 0.12, 0xc9cbcc);
    kit.box("lamp", -0.3, -0.552, -0.02, -0.18, -0.55, 0.06, 0xffffff);
    kit.box("lamp", 0.18, -0.552, -0.02, 0.3, -0.55, 0.06, 0xffffff);
  });
  for (const dx of [0.4, 1.0, 1.6, 2.6]) downlight(kit, dx, T1, 1.2);
}

// ——— Living and dining ———

function living(kit: Kit, fixtures: Fixture[]) {
  const y = FL1;
  // Dining set under two pendants.
  table(kit, 2.0, y, 3.55, 0, 1.5, 0.85, 0.72, "oak", 0xc39a6a);
  for (const dx of [-0.38, 0.38]) {
    diningChair(kit, 2.0 + dx, y, 3.02, 0);
    diningChair(kit, 2.0 + dx, y, 4.08, Math.PI);
  }
  kit.at(2.0, y + 0.72, 3.55, 0, () => {
    kit.box("linen", -0.7, 0, -0.1, 0.7, 0.003, 0.1, 0x6e7b6a);
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.06, 0],
        [0.14, 0.09],
        [0.135, 0.092],
        [0, 0.012],
      ],
      -0.2,
      0.003,
      0,
      0xe9e2d2,
      24,
    );
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      lathe(
        kit,
        "gloss",
        [
          [0, 0],
          [0.025, 0],
          [0.028, 0.035],
          [0.042, 0.08],
          [0.03, 0.083],
          [0, 0.07],
        ],
        -0.2 + Math.cos(a) * 0.06,
        0.02,
        Math.sin(a) * 0.06,
        0xd96d4a,
        12,
      );
    }
    for (const [px, pz] of [
      [-0.38, -0.25],
      [0.38, -0.25],
      [-0.38, 0.25],
      [0.38, 0.25],
    ] as const) {
      cylinder(kit, "gloss", px, 0.001, pz, 0.11, 0.11, 0.012, 0xf4f1ea, 32);
      lathe(
        kit,
        "glass",
        [
          [0, 0],
          [0.03, 0],
          [0.035, 0.11],
          [0.03, 0.11],
          [0.026, 0.004],
          [0, 0.004],
        ],
        px + 0.16,
        0.0,
        pz * 0.6,
        0xffffff,
        16,
      );
    }
    plantSmall(kit, 0.35, 0.003, 0);
  });
  for (const dx of [-0.32, 0.32]) pendant(kit, 2.0 + dx, T1, 3.55, 0.75, 0x2e3b3a);

  // Living corner.
  rug(kit, 0.9, 4.45, 3.3, 6.85, y, 0xcbbfa9);
  sofa(kit, 3.05, y, 5.65, -Math.PI / 2, 2.1, 0x9a9488);
  table(kit, 1.75, y, 5.65, Math.PI / 2, 0.9, 0.5, 0.36, "walnut", 0x7a5a42);
  kit.at(1.75, y + 0.36, 5.65, 0, () => {
    kit.box("satin", -0.12, 0, -0.18, 0.1, 0.03, 0.12, 0x2d4a6b);
    kit.box("satin", -0.1, 0.03, -0.16, 0.09, 0.045, 0.1, 0xd9d2c1);
    kit.box("matte", 0.1, 0, 0.18, 0.13, 0.015, 0.33, 0x1b1b1b);
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.04, 0],
        [0.045, 0.09],
        [0.04, 0.09],
        [0.036, 0.005],
        [0, 0.005],
      ],
      0.0,
      0,
      -0.35,
      0xf2efe6,
      18,
    );
  });
  kit.at(0.1 + 0.22, y, 5.55, Math.PI / 2, () => {
    kit.box("walnut", -0.9, 0.1, -0.21, 0.9, 0.42, 0.21, 0x6a4c38, { swap: true });
    kit.box("matte", -0.86, 0, -0.17, 0.86, 0.1, 0.15, 0x221c18);
    for (let i = 0; i < 3; i++) {
      const x0 = -0.9 + i * 0.6 + 0.003;
      kit.box("walnut", x0, 0.103, 0.21, x0 + 0.594, 0.417, 0.215, 0x6f503b, { swap: true, shift: i * 0.37 });
      kit.box("satin", x0 + 0.24, 0.39, 0.215, x0 + 0.354, 0.4, 0.228, 0x2b2b2b);
    }
    kit.solid(-0.9, -0.22, 0.9, 0.22, 0, 0.45);
  });
  television(kit, 0.32, y + 0.42, 5.55, Math.PI / 2);
  // Soundbar, speakers, books on the board.
  kit.box("satin", 0.38, y + 0.42, 5.1, 0.46, y + 0.49, 6.0, 0x1d1d1d);
  kit.at(0.3, y + 0.42, 4.85, Math.PI / 2, () => {
    for (let i = 0; i < 4; i++)
      kit.box(
        "satin",
        -0.1 + i * 0.03,
        0,
        -0.1,
        -0.075 + i * 0.03,
        0.22 - i * 0.015,
        0.1,
        [0x7b2d26, 0xd9d2c1, 0x2d4a6b, 0x3c5a3a][i]!,
      );
  });
  lathe(
    kit,
    "gloss",
    [
      [0, 0],
      [0.05, 0],
      [0.07, 0.1],
      [0.04, 0.2],
      [0.02, 0.24],
      [0.025, 0.25],
      [0, 0.25],
    ],
    0.3,
    y + 0.42,
    6.3,
    0xb85c3b,
    24,
  );
  plant(kit, 0.45, y, 6.85, 1.6, 31);
  // Floor lamp by the sofa.
  kit.at(3.25, y, 6.85, 0, () => {
    cylinder(kit, "metal", 0, 0, 0, 0.16, 0.16, 0.02, 0x2a2a2a, 28);
    cylinder(kit, "metal", 0, 0.02, 0, 0.012, 0.012, 1.35, 0x2a2a2a, 10);
    lathe(
      kit,
      "lamp",
      [
        [0.13, 0],
        [0.19, -0.3],
        [0.185, -0.3],
        [0.125, 0],
      ],
      0,
      1.62,
      0,
      0xfff1dc,
      32,
    );
    kit.solid(-0.18, -0.18, 0.18, 0.18, 0, 1.6);
  });
  wallClock(kit, 0.1, y + 1.95, 5.55, Math.PI / 2);
  airConditioner(kit, 4.49, y + 2.05, 3.35, -Math.PI / 2);
  ceilingLight(kit, fixtures, 2.2, T1, 5.6, 1, 3.4, 0.3);
  fixtures.push({ position: new THREE.Vector3(1.6, T1 - 0.3, 1.1), floor: 1, intensity: 2.2, range: 6 });
  smokeAlarm(kit, 3.2, T1, 2.8);
  // Intercom monitor and switches beside the hall door.
  kit.at(4.49, y + 1.45, 3.05, -Math.PI / 2, () => {
    rbox(kit, "satin", 0, 0, 0.012, 0.2, 0.14, 0.024, 0.01, 0xf2f1ec);
    kit.box("screen", -0.085, -0.04, 0.024, 0.03, 0.05, 0.026, 0x14181b);
    for (let i = 0; i < 3; i++) kit.box("satin", 0.05, 0.035 - i * 0.03, 0.024, 0.085, 0.05 - i * 0.03, 0.03, 0xdcdad3);
  });
  switchPlate(kit, 4.49, y + 1.2, 1.78, -Math.PI / 2, 2);
  outlet(kit, 0.1, y + 0.25, 4.7, Math.PI / 2);
  outlet(kit, 4.49, y + 0.25, 4.3, -Math.PI / 2);
  outlet(kit, 2.9, y + 1.05, 0.1, 0);
}

export function plantSmall(kit: Kit, x: number, y: number, z: number) {
  lathe(
    kit,
    "gloss",
    [
      [0, 0],
      [0.035, 0],
      [0.045, 0.08],
      [0.047, 0.09],
      [0.042, 0.092],
      [0.04, 0.084],
      [0, 0.08],
    ],
    x,
    y,
    z,
    0xefece4,
    24,
  );
  cylinder(kit, "matte", x, y + 0.078, z, 0.04, 0.04, 0.004, 0x3a2c22, 16);
  // A rosette of small arching leaves, the inner ones more upright.
  const rng = random(Math.round(x * 97 + z * 31));
  for (let i = 0; i < 22; i++) {
    const inner = i / 22;
    const heading = i * 2.4 + rng() * 0.3;
    const p = new THREE.Vector3(x + Math.sin(heading) * 0.01, y + 0.085 + inner * 0.02, z + Math.cos(heading) * 0.01);
    const length = 0.06 + (1 - inner) * 0.05 + rng() * 0.02;
    leaf(
      kit,
      p,
      heading,
      0.5 + inner * 0.7,
      (rng() - 0.5) * 0.4,
      length,
      length * 0.42,
      new THREE.Color(0x4f7a3a).multiplyScalar(0.75 + inner * 0.35 + rng() * 0.15),
    );
  }
}

// ——— Wet rooms ———

function toilet(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    const white = 0xf7f7f4;
    // Pedestal and bowl.
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.13, 0],
        [0.12, 0.08],
        [0.11, 0.25],
        [0.15, 0.36],
        [0.18, 0.39],
        [0, 0.39],
      ],
      0,
      0,
      0.28,
      white,
      36,
      new THREE.Vector3(1, 1, 1.3),
    );
    // Seat and lid.
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.19, 0],
        [0.19, 0.03],
        [0, 0.03],
      ],
      0,
      0.39,
      0.29,
      0xf2f1ec,
      36,
      new THREE.Vector3(1, 1, 1.28),
    );
    rbox(kit, "satin", 0, 0.47, 0.03, 0.4, 0.16, 0.22, 0.05, 0xf2f1ec);
    // Tank with a hand-wash basin on top.
    rbox(kit, "gloss", 0, 0.62, -0.02, 0.44, 0.44, 0.2, 0.05, white);
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.16, 0.0],
        [0.17, 0.03],
        [0.15, 0.03],
        [0.11, 0.0],
        [0, -0.02],
      ],
      0,
      0.84,
      -0.02,
      white,
      32,
      new THREE.Vector3(1, 1, 0.55),
    );
    tube(
      kit,
      "chrome",
      [new THREE.Vector3(0, 0.84, -0.1), new THREE.Vector3(0, 0.93, -0.08), new THREE.Vector3(0, 0.92, 0.0)],
      0.01,
      0xd6d6d6,
    );
    kit.solid(-0.22, -0.12, 0.22, 0.6, 0, 0.8);
  });
}

function toiletRoom(kit: Kit, x0: number, x1: number, y: number, top: number, fixtures: Fixture[], floor: 1 | 2) {
  const cx = (x0 + x1) / 2;
  toilet(kit, cx, y, 0.12, 0);
  // Paper holder and remote on the west wall, towel ring on the east.
  kit.at(x0 + 0.06, y + 0.72, 0.75, Math.PI / 2, () => {
    kit.box("chrome", -0.07, 0, 0, 0.07, 0.015, 0.1, 0xd6d6d6);
    cylinder(kit, "matte", 0, -0.06, 0.055, 0.055, 0.055, 0.11, 0xfbfbf8, 20, new THREE.Euler(0, 0, Math.PI / 2));
    kit.box("chrome", -0.07, 0.015, 0, 0.07, 0.02, 0.1, 0xd6d6d6);
  });
  kit.at(x0 + 0.06, y + 0.95, 0.72, Math.PI / 2, () => {
    rbox(kit, "satin", 0, 0, 0.01, 0.1, 0.16, 0.02, 0.008, 0xf2f1ec);
    for (let i = 0; i < 4; i++)
      cylinder(
        kit,
        "satin",
        -0.02 + (i % 2) * 0.04,
        -0.03 + Math.floor(i / 2) * 0.05,
        0.02,
        0.012,
        0.012,
        0.006,
        [0x3d8bd6, 0xd64b3d, 0x9aa0a6, 0x9aa0a6][i]!,
        12,
        new THREE.Euler(Math.PI / 2, 0, 0),
      );
  });
  const ring = new THREE.TorusGeometry(0.08, 0.008, 8, 28);
  kit.geometry("chrome", ring, trs(x1 - 0.07, y + 1.05, 0.6, 0, Math.PI / 2, 0), 0xd6d6d6, "keep");
  kit.box("linen", x1 - 0.075, y + 0.8, 0.53, x1 - 0.065, y + 1.0, 0.67, 0xa9c2c9);
  // Corner shelf with a spare roll and a small plant.
  kit.box("whiteoak", x0 + 0.06, y + 1.45, 0.1, x1 - 0.06, y + 1.47, 0.3, 0xd9c29e);
  cylinder(kit, "matte", x0 + 0.2, y + 1.47, 0.2, 0.055, 0.055, 0.11, 0xfbfbf8, 20);
  plantSmall(kit, x1 - 0.2, y + 1.47, 0.2);
  rug(kit, x0 + 0.12, 0.72, x1 - 0.12, 1.2, y, 0xb7c9c3);
  ceilingLight(kit, fixtures, cx, top, 1.1, floor, 1.1, 0.13);
  switchPlate(kit, x1 + 0.06 + 0.05, y + 1.2, 1.9, Math.PI, 1);
}

function washroom(kit: Kit, fixtures: Fixture[]) {
  const y = FL1;
  // Vanity against the west wall.
  kit.at(5 * M + 0.06 + 0.27, y, 0.62, Math.PI / 2, () => {
    cabinet(kit, 0.75, 0.78, 0.5, 2, 0xf1efe9, 0xb5b7b8, "satin");
    rbox(kit, "gloss", 0, 0.8, 0.02, 0.77, 0.05, 0.54, 0.02, 0xf8f8f6);
    lathe(
      kit,
      "gloss",
      [
        [0, -0.14],
        [0.2, -0.12],
        [0.25, -0.02],
        [0.26, 0.0],
        [0.24, 0.0],
        [0.19, -0.1],
        [0, -0.12],
      ],
      0,
      0.826,
      0.04,
      0xf1f1ee,
      36,
      new THREE.Vector3(1, 1, 0.75),
    );
    cylinder(kit, "chrome", 0, 0.825, -0.19, 0.022, 0.02, 0.14, 0xd6d6d6, 16);
    kit.box("chrome", -0.012, 0.95, -0.2, 0.012, 0.965, -0.08, 0xd6d6d6);
    kit.box("chrome", -0.02, 0.97, -0.21, 0.02, 0.985, -0.14, 0xd6d6d6);
    // Three-panel mirror cabinet with a light bar.
    kit.box("satin", -0.38, 1.1, -0.25, 0.38, 1.95, -0.1, 0xf1efe9);
    kit.box("chrome", -0.37, 1.13, -0.1, 0.37, 1.84, -0.095, 0xeef2f3);
    for (const mx of [-0.125, 0.125]) kit.box("satin", mx - 0.002, 1.13, -0.095, mx + 0.002, 1.84, -0.093, 0x9ea3a5);
    kit.box("lamp", -0.34, 1.87, -0.12, 0.34, 1.93, -0.095, 0xffffff);
    // Cup, toothbrushes, soap.
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.03, 0],
        [0.034, 0.09],
        [0.031, 0.09],
        [0, 0.005],
      ],
      0.25,
      0.825,
      -0.16,
      0x9fc3c8,
      16,
    );
    for (let i = 0; i < 2; i++)
      kit.within(trs(0.25 + i * 0.012, 0.9, -0.16, 0.15 - i * 0.3, 0, 0.1), () =>
        kit.box("satin", -0.004, 0, -0.004, 0.004, 0.17, 0.004, i ? 0x3d8bd6 : 0xf0a63a),
      );
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.035, 0],
        [0.035, 0.14],
        [0.012, 0.16],
        [0.012, 0.19],
        [0, 0.19],
      ],
      -0.26,
      0.825,
      -0.15,
      0xf5efe3,
      16,
    );
    kit.solid(-0.4, -0.27, 0.4, 0.27, 0, 0.9);
  });
  // Front-loading washing machine on its drain pan.
  kit.at(5.66, y, 0.43, 0, () => {
    kit.box("satin", -0.33, 0, -0.33, 0.33, 0.06, 0.33, 0xf4f4f1);
    rbox(kit, "satin", 0, 0.62, 0, 0.6, 1.02, 0.62, 0.03, 0xf5f5f2);
    kit.box("screen", -0.28, 0.93, 0.31, 0.28, 1.08, 0.312, 0x2a2f33);
    const door = new THREE.TorusGeometry(0.19, 0.03, 12, 40);
    kit.geometry("satin", door, trs(0, 0.58, 0.31), 0xcfd2d4, "keep");
    cylinder(kit, "glass", 0, 0.58, 0.31, 0.17, 0.17, 0.02, 0xffffff, 32, new THREE.Euler(Math.PI / 2, 0, 0));
    cylinder(kit, "screen", 0, 0.58, 0.29, 0.17, 0.17, 0.01, 0x1a1d20, 32, new THREE.Euler(Math.PI / 2, 0, 0));
    kit.solid(-0.33, -0.33, 0.33, 0.33, 0, 1.15);
  });
  // Towel bar, laundry basket, bath mat.
  kit.box("chrome", 6.3, y + 1.3, 1.35, 6.31, y + 1.32, 1.7, 0xd6d6d6);
  kit.box("linen", 6.28, y + 0.9, 1.4, 6.3, y + 1.32, 1.65, 0xe7ddc9);
  lathe(
    kit,
    "linen",
    [
      [0, 0],
      [0.18, 0],
      [0.21, 0.42],
      [0.2, 0.42],
      [0.17, 0.02],
      [0, 0.02],
    ],
    5.0,
    y,
    1.45,
    0xb49a78,
    20,
  );
  rug(kit, 5.75, 0.62, 6.28, 1.15, y, 0xc6d8df);
  ceilingLight(kit, fixtures, 5.46, T1, 0.95, 1, 1.4, 0.15);
  switchPlate(kit, 4.62, y + 1.2, 1.72, Math.PI / 2, 2);
}

function bathroom(kit: Kit, fixtures: Fixture[]) {
  const y = FL1 + 0.02;
  const x0 = 7 * M + 0.06,
    x1 = 9 * M - 0.06,
    z0 = 0.1;
  const white = 0xf3f1ec;
  // Tub along the north wall: rim, apron, deep basin, water.
  const tz1 = 0.85,
    rimY = y + 0.55;
  kit.box("gloss", x0, y, tz1 - 0.02, x1, rimY, tz1, 0xe9e5dc);
  kit.box("gloss", x0, rimY - 0.02, z0, x1, rimY, z0 + 0.06, white);
  kit.box("gloss", x0, rimY - 0.02, tz1 - 0.08, x1, rimY, tz1, white);
  kit.box("gloss", x0, rimY - 0.02, z0, x0 + 0.08, rimY, tz1, white);
  kit.box("gloss", x1 - 0.08, rimY - 0.02, z0, x1, rimY, tz1, white);
  // Basin: inward-facing walls and floor.
  const bx0 = x0 + 0.08,
    bx1 = x1 - 0.08,
    bz0 = z0 + 0.06,
    bz1 = tz1 - 0.08,
    by0 = rimY - 0.5,
    by1 = rimY - 0.02;
  basin(
    kit,
    "gloss",
    (bx0 + bx1) / 2,
    (bz0 + bz1) / 2,
    bx1 - bx0,
    bz1 - bz0,
    by1 + 0.019,
    by1 + 0.019 - by0,
    0.1,
    0xe8eef0,
  );
  // Water surface follows the basin's rounded outline, a little in from the walls.
  const water = new THREE.ShapeGeometry(roundedRect(bx1 - bx0 - 0.03, bz1 - bz0 - 0.03, 0.09), 6);
  kit.geometry(
    "water",
    water,
    trs((bx0 + bx1) / 2, rimY - 0.12, (bz0 + bz1) / 2, -Math.PI / 2, 0, 0),
    0xffffff,
    "keep",
  );
  water.dispose();
  // Panel seams on the unit-bath walls.
  for (const sx of [6.98, 7.58]) kit.box("matte", sx - 0.002, rimY, 0.1, sx + 0.002, FL1 + 2.2, 0.102, 0xc9c3b8);
  kit.box("matte", 8.128, y, 0.95 - 0.002, 8.13, FL1 + 2.2, 0.95 + 0.002, 0xc9c3b8);
  kit.box("matte", x0, FL1 + 1.4, 1.758, x1, FL1 + 1.404, 1.76, 0xc9c3b8);
  kit.solid(x0, z0, x1, tz1, y, rimY);
  // Wall controller, mixer, slide bar, shower head and hose.
  kit.at(x1, y, 1.3, -Math.PI / 2, () => {
    kit.box("chrome", -0.14, 0.95, 0, 0.14, 1.03, 0.06, 0xd6d6d6);
    cylinder(kit, "chrome", -0.1, 0.99, 0.08, 0.03, 0.03, 0.05, 0xd6d6d6, 16, new THREE.Euler(Math.PI / 2, 0, 0));
    cylinder(kit, "chrome", 0.1, 0.99, 0.08, 0.03, 0.03, 0.05, 0xd6d6d6, 16, new THREE.Euler(Math.PI / 2, 0, 0));
    kit.box("chrome", -0.012, 1.1, 0, 0.012, 2.0, 0.03, 0xd6d6d6);
    kit.within(trs(0, 1.75, 0.07, 0.35, 0, 0), () => {
      cylinder(kit, "chrome", 0, -0.12, 0, 0.014, 0.018, 0.16, 0xd6d6d6, 12);
      cylinder(
        kit,
        "chrome",
        0,
        0.06,
        0.01,
        0.045,
        0.045,
        0.03,
        0xd6d6d6,
        24,
        new THREE.Euler(Math.PI / 2 - 0.2, 0, 0),
      );
    });
    tube(
      kit,
      "chrome",
      [
        new THREE.Vector3(0, 0.99, 0.06),
        new THREE.Vector3(0.05, 0.75, 0.12),
        new THREE.Vector3(0.02, 1.2, 0.14),
        new THREE.Vector3(0, 1.62, 0.1),
      ],
      0.008,
      0xbfc2c4,
    );
    // Mirror and a shelf with bottles.
    kit.box("chrome", 0.25, 1.05, 0, 0.6, 1.75, 0.005, 0xeef2f3);
    kit.box("satin", 0.22, 0.8, 0, 0.62, 0.815, 0.12, 0xf6f5f2);
    for (let i = 0; i < 3; i++)
      lathe(
        kit,
        "gloss",
        [
          [0, 0],
          [0.03, 0],
          [0.03, 0.17],
          [0.012, 0.19],
          [0.012, 0.21],
          [0, 0.21],
        ],
        0.3 + i * 0.1,
        0.815,
        0.06,
        [0xe9e0cf, 0x9fc3c8, 0x2d2d2d][i]!,
        14,
      );
    rbox(kit, "satin", -0.45, 1.25, 0.012, 0.14, 0.12, 0.024, 0.01, 0xf2f1ec);
    kit.box("screen", -0.5, 1.23, 0.024, -0.41, 1.28, 0.026, 0x14181b);
  });
  // Bath stool and bucket.
  kit.at(7.55, y, 1.25, 0.3, () => {
    rbox(kit, "satin", 0, 0.36, 0, 0.36, 0.06, 0.28, 0.03, 0xe6e2da);
    for (const s of [-1, 1]) kit.box("satin", s * 0.15 - 0.02, 0, -0.12, s * 0.15 + 0.02, 0.34, 0.12, 0xe6e2da);
    kit.solid(-0.2, -0.16, 0.2, 0.16, 0, 0.4);
  });
  lathe(
    kit,
    "hinoki",
    [
      [0, 0],
      [0.11, 0],
      [0.12, 0.1],
      [0.115, 0.1],
      [0.105, 0.01],
      [0, 0.01],
    ],
    7.9,
    y,
    1.5,
    0xe0c49a,
    24,
  );
  ceilingLight(kit, fixtures, 7.28, FL1 + 2.2, 0.95, 1, 1.4, 0.14);
}

// ——— Tatami room, genkan, halls ———

function washitsuFurniture(kit: Kit, fixtures: Fixture[]) {
  const y = FL1;
  // Low table with zabuton cushions and a tea set.
  kit.at(6.37, y, 5.95, 0, () => {
    kit.box("walnut", -0.6, 0.3, -0.38, 0.6, 0.34, 0.38, 0x5a3e2c, { swap: true });
    for (const [lx, lz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      kit.box("walnut", lx * 0.52 - 0.04, 0, lz * 0.3 - 0.04, lx * 0.52 + 0.04, 0.3, lz * 0.3 + 0.04, 0x4e3526);
    kit.box("walnut", -0.55, 0.25, -0.33, 0.55, 0.3, 0.33, 0x4e3526, { skip: "py" });
    kit.solid(-0.6, -0.38, 0.6, 0.38, 0, 0.34);
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.05, 0],
        [0.075, 0.05],
        [0.07, 0.09],
        [0.04, 0.11],
        [0.045, 0.12],
        [0, 0.12],
      ],
      -0.1,
      0.34,
      0,
      0x3c4a3a,
      24,
    );
    tube(
      kit,
      "gloss",
      [new THREE.Vector3(-0.03, 0.39, 0), new THREE.Vector3(0.02, 0.42, 0), new THREE.Vector3(0.04, 0.44, 0)],
      0.008,
      0x3c4a3a,
    );
    for (const [cx, cz] of [
      [0.18, -0.12],
      [0.25, 0.08],
    ] as const)
      lathe(
        kit,
        "gloss",
        [
          [0, 0],
          [0.025, 0],
          [0.032, 0.06],
          [0.029, 0.06],
          [0, 0.006],
        ],
        cx,
        0.34,
        cz,
        0xe9e1cf,
        16,
      );
    kit.box("lacquer", -0.4, 0.34, 0.12, -0.2, 0.345, 0.26, 0x2a1b12);
    for (const [zx, zz, yaw] of [
      [0, -0.68, 0],
      [0, 0.68, 0],
      [-0.9, 0, Math.PI / 2],
      [0.9, 0, Math.PI / 2],
    ] as const) {
      puffy(kit, "linen", zx, 0.04, zz, 0.55, 0.08, 0.59, 0x6d3a3a, 0.9, new THREE.Euler(0, yaw, 0));
      kit.box("linen", zx - 0.01, 0.07, zz - 0.01, zx + 0.01, 0.075, zz + 0.01, 0xd9c29e);
    }
  });
  // Chest of drawers (tansu) beside the genkan wall.
  kit.at(9 * M - 0.06 - 0.22, y, 6.55, -Math.PI / 2, () => {
    const w = 0.9,
      h = 0.95,
      d = 0.42;
    kit.box("cedar", -w / 2, 0, -d / 2, w / 2, h, d / 2, 0x8a5a36, { swap: true });
    const rows = [
      [0.05, 0.3, 1],
      [0.3, 0.55, 1],
      [0.55, 0.75, 2],
      [0.75, 0.92, 3],
    ] as const;
    for (const [y0, y1, n] of rows) {
      const dw = (w - 0.06) / n;
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + 0.03 + i * dw;
        kit.box("cedar", x0 + 0.003, y0 + 0.003, d / 2, x0 + dw - 0.003, y1 - 0.003, d / 2 + 0.012, 0x9a6640, {
          swap: true,
          shift: i + y0,
        });
        for (const s of [-1, 1]) {
          const hx = x0 + dw / 2 + (n === 1 ? s * 0.18 : 0);
          if (n > 1 && s > 0) continue;
          kit.box(
            "metal",
            hx - 0.05,
            (y0 + y1) / 2 - 0.004,
            d / 2 + 0.012,
            hx + 0.05,
            (y0 + y1) / 2 + 0.004,
            d / 2 + 0.03,
            0x2b2622,
          );
          kit.box(
            "metal",
            hx - 0.045,
            (y0 + y1) / 2 - 0.02,
            d / 2 + 0.012,
            hx - 0.035,
            (y0 + y1) / 2 + 0.02,
            d / 2 + 0.03,
            0x2b2622,
          );
          kit.box(
            "metal",
            hx + 0.035,
            (y0 + y1) / 2 - 0.02,
            d / 2 + 0.012,
            hx + 0.045,
            (y0 + y1) / 2 + 0.02,
            d / 2 + 0.03,
            0x2b2622,
          );
        }
      }
    }
    for (const [cx, cy] of [
      [-w / 2, 0],
      [w / 2, 0],
      [-w / 2, h],
      [w / 2, h],
    ] as const)
      kit.box(
        "metal",
        cx - 0.03,
        cy - (cy ? 0.06 : 0),
        d / 2,
        cx + 0.03,
        cy + (cy ? 0 : 0.06),
        d / 2 + 0.014,
        0x2b2622,
      );
    kit.solid(-w / 2, -d / 2, w / 2, d / 2, 0, h);
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.05, 0],
        [0.06, 0.05],
        [0.05, 0.12],
        [0.035, 0.16],
        [0, 0.16],
      ],
      -0.2,
      h,
      0,
      0xc9b99a,
      20,
    );
  });
  // Square washi pendant with a wooden frame.
  kit.at(6.37, T1, 5.95, 0, () => {
    cylinder(kit, "satin", 0, -0.02, 0, 0.05, 0.05, 0.02, 0xefe9dc, 16);
    cylinder(kit, "matte", 0, -0.3, 0, 0.004, 0.004, 0.28, 0x333333, 6);
    kit.box("lamp", -0.24, -0.59, -0.24, 0.24, -0.31, 0.24, 0xfff3de);
    for (const [fx, fz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      kit.box(
        "whiteoak",
        fx * 0.245 - 0.012,
        -0.61,
        fz * 0.245 - 0.012,
        fx * 0.245 + 0.012,
        -0.3,
        fz * 0.245 + 0.012,
        0x8a5a36,
      );
    for (const yy of [-0.61, -0.315]) {
      kit.box("whiteoak", -0.257, yy, -0.257, 0.257, yy + 0.015, -0.233, 0x8a5a36);
      kit.box("whiteoak", -0.257, yy, 0.233, 0.257, yy + 0.015, 0.257, 0x8a5a36);
      kit.box("whiteoak", -0.257, yy, -0.257, -0.233, yy + 0.015, 0.257, 0x8a5a36);
      kit.box("whiteoak", 0.233, yy, -0.257, 0.257, yy + 0.015, 0.257, 0x8a5a36);
    }
  });
  fixtures.push({ position: new THREE.Vector3(6.37, T1 - 0.45, 5.95), floor: 1, intensity: 2.6, range: 6 });
  airConditioner(kit, 9 * M - 0.06, y + 1.98, 4.95, -Math.PI / 2);
}

function genkan(kit: Kit, fixtures: Fixture[]) {
  const x1 = W - 0.1;
  // Shoe cabinet (getabako) with a display top and a mirror.
  kit.at(x1 - 0.19, 0.2, 6.35, -Math.PI / 2, () => {
    cabinet(kit, 1.3, 0.92, 0.38, 3, 0xe7d8bd, 0x8d8d8d, "whiteoak");
    kit.box("oak", -0.67, 0.92, -0.19, 0.67, 0.95, 0.21, 0xb88d5f, { swap: true });
    kit.box("chrome", -0.3, 1.2, -0.19, 0.3, 1.9, -0.18, 0xeef2f3);
    kit.box("walnut", -0.32, 1.18, -0.19, 0.32, 1.2, -0.17, 0x5a3e2c);
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.04, 0],
        [0.06, 0.08],
        [0.03, 0.2],
        [0.035, 0.22],
        [0, 0.22],
      ],
      0.4,
      0.95,
      0,
      0x7e8e6a,
      20,
    );
    kit.box("satin", -0.5, 0.95, -0.05, -0.3, 0.955, 0.1, 0x2a2a2a);
    kit.solid(-0.66, -0.2, 0.66, 0.2, 0, 0.95);
  });
  // Umbrella stand, a pair of shoes, entrance mat, slippers.
  lathe(
    kit,
    "metal",
    [
      [0, 0],
      [0.1, 0],
      [0.1, 0.5],
      [0.095, 0.5],
      [0.095, 0.01],
      [0, 0.01],
    ],
    8.45,
    0.2,
    7.0,
    0x3a3a3a,
    24,
  );
  for (let i = 0; i < 2; i++)
    kit.within(trs(8.5 + i * 0.08, 0.28, 6.99 + i * 0.02, 0.12, 0, 0.05 - i * 0.12), () => {
      kit.box("linen", -0.02, 0, -0.02, 0.02, 0.65, 0.02, [0x1d2a3a, 0x7a2d2d][i]!);
      kit.box("walnut", -0.015, 0.65, -0.1, 0.015, 0.68, 0.02, 0x3a2a1e);
    });
  for (const s of [-1, 1]) {
    rbox(kit, "satin", 9.15 + s * 0.06, 0.24, 6.3, 0.09, 0.07, 0.27, 0.03, 0x3b2a20);
  }
  rug(kit, 8.45, 4.95, 9.75, 5.38, FL1, 0x6b5e52);
  for (let i = 0; i < 2; i++) {
    const sx = 9.0 + i * 0.35;
    for (const s of [-1, 1])
      rbox(kit, "boucle", sx + s * 0.055, FL1 + 0.02, 4.7, 0.1, 0.03, 0.26, 0.012, [0x9aa7a0, 0xd6c3a5][i]!);
  }
  downlight(kit, 9.1, T1, 6.4);
  downlight(kit, 9.1, T1, 3.8);
  fixtures.push({ position: new THREE.Vector3(9.1, T1 - 0.4, 6.3), floor: 1, intensity: 1.4, range: 5 });
  fixtures.push({ position: new THREE.Vector3(9.1, T1 - 0.4, 3.6), floor: 1, intensity: 1.4, range: 5 });
  // Hall console under the east window.
  kit.at(x1 - 0.18, FL1, 3.0, -Math.PI / 2, () => {
    kit.box("oak", -0.45, 0.75, -0.16, 0.45, 0.78, 0.16, 0xc39a6a, { swap: true });
    for (const s of [-1, 1]) kit.box("oak", s * 0.42 - 0.02, 0, -0.14, s * 0.42 + 0.02, 0.75, 0.14, 0xc39a6a);
    lathe(
      kit,
      "gloss",
      [
        [0, 0],
        [0.05, 0],
        [0.07, 0.1],
        [0.04, 0.22],
        [0.045, 0.24],
        [0, 0.24],
      ],
      -0.2,
      0.78,
      0,
      0x2f4a5c,
      20,
    );
    plantSmall(kit, 0.22, 0.78, 0.02);
    kit.solid(-0.45, -0.16, 0.45, 0.16, 0, 0.8);
  });
  switchPlate(kit, 9 * M + 0.06, FL1 + 1.2, 5.2, Math.PI / 2, 3);
  smokeAlarm(kit, 9.1, T1, 2.3);
  // Stair light at the top of the flight.
  kit.at(5.1, FL2 + 1.9, 3 * M + 0.06, 0, () => {
    rbox(kit, "lamp", 0, 0, 0.06, 0.26, 0.12, 0.1, 0.04, 0xffffff);
    kit.box("satin", -0.14, -0.07, 0, 0.14, 0.07, 0.01, 0xf1efe9);
  });
  fixtures.push({ position: new THREE.Vector3(6.3, FL2 + 1.6, 3.2), floor: 2, intensity: 1.6, range: 7 });
  fixtures.push({ position: new THREE.Vector3(7.5, FL1 + 1.8, 3.2), floor: 1, intensity: 1.2, range: 5 });
  smokeAlarm(kit, 6.4, T2, 3.2);
}

// ——— Upstairs ———

function bed(kit: Kit, x: number, y: number, z: number, yaw: number, w: number, cover: number, seed: number) {
  const rng = random(seed);
  kit.at(x, y, z, yaw, () => {
    const l = 2.0;
    // Frame and headboard; the bed's head is at local -z.
    kit.box("walnut", -w / 2 - 0.03, 0.1, -l / 2, w / 2 + 0.03, 0.3, l / 2 + 0.03, 0x6a4c38, { swap: true });
    kit.box("walnut", -w / 2 - 0.03, 0, -l / 2 - 0.05, w / 2 + 0.03, 0.9, -l / 2, 0x6a4c38, { swap: true });
    for (const [lx, lz] of [
      [-1, 1],
      [1, 1],
    ] as const)
      kit.box(
        "walnut",
        lx * (w / 2) - 0.02,
        0,
        (lz * l) / 2 - 0.02,
        lx * (w / 2) + 0.02,
        0.1,
        (lz * l) / 2 + 0.02,
        0x5a3e2c,
      );
    rbox(kit, "linen", 0, 0.39, 0.0, w, 0.2, l - 0.02, 0.05, 0xf2f0ea);
    // Draped duvet with its turned-down top edge, and a runner across the foot.
    duvet(kit, w, l / 2 - 0.01, -l / 2 + 0.55, 0.49, 0.3, cover, seed);
    puffy(
      kit,
      "linen",
      0,
      0.56,
      -l / 2 + 0.6,
      w + 0.1,
      0.06,
      0.2,
      new THREE.Color(cover).lerp(new THREE.Color(0xffffff), 0.55),
      0.8,
    );
    rbox(kit, "linen", 0, 0.585, l / 2 - 0.35, w + 0.12, 0.016, 0.42, 0.008, 0x55483e);
    const pillows = w > 1.2 ? 2 : 1;
    for (let i = 0; i < pillows; i++) {
      const px = pillows === 1 ? 0 : (i - 0.5) * (w / 2);
      puffy(
        kit,
        "linen",
        px,
        0.56,
        -l / 2 + 0.27,
        Math.min(0.62, w - 0.12),
        0.15,
        0.42,
        0xfbfaf6,
        1,
        new THREE.Euler(-0.18 + rng() * 0.06, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.04),
      );
    }
    kit.solid(-w / 2 - 0.05, -l / 2 - 0.05, w / 2 + 0.05, l / 2 + 0.05, 0, 0.6);
  });
}

function nightstand(kit: Kit, x: number, y: number, z: number, yaw: number, lamp: boolean) {
  kit.at(x, y, z, yaw, () => {
    cabinet(kit, 0.42, 0.5, 0.38, 1, 0x6f503b, 0x2b2b2b, "walnut", 2);
    kit.box("walnut", -0.22, 0.5, -0.2, 0.22, 0.52, 0.2, 0x6a4c38);
    if (lamp) {
      lathe(
        kit,
        "gloss",
        [
          [0, 0],
          [0.07, 0],
          [0.08, 0.12],
          [0.03, 0.2],
          [0.012, 0.22],
          [0, 0.22],
        ],
        0,
        0.52,
        -0.02,
        0xd9cdb8,
        24,
      );
      lathe(
        kit,
        "lamp",
        [
          [0.1, 0],
          [0.13, -0.17],
          [0.125, -0.17],
          [0.095, 0],
        ],
        0,
        0.9,
        -0.02,
        0xfff0d8,
        28,
      );
    }
    kit.box("satin", 0.05, 0.52, 0.02, 0.13, 0.528, 0.16, 0x1b1b1b);
    if (lamp) {
      kit.box("satin", -0.17, 0.52, 0.03, 0.0, 0.545, 0.17, 0x2d4a6b);
      kit.box("satin", -0.16, 0.545, 0.04, -0.01, 0.56, 0.16, 0xd9d2c1);
      rbox(kit, "satin", 0.12, 0.56, 0.1, 0.09, 0.07, 0.05, 0.015, 0xe9e5dc, new THREE.Euler(0, -0.4, 0));
      kit.within(trs(0.12, 0.56, 0.1, 0, -0.4, 0), () =>
        kit.box("screen", -0.03, -0.02, 0.025, 0.03, 0.02, 0.027, 0x1b2226),
      );
    }
    kit.solid(-0.22, -0.2, 0.22, 0.2, 0, 0.55);
  });
}

function desk(
  kit: Kit,
  x: number,
  y: number,
  z: number,
  yaw: number,
  w: number,
  color: number,
  seed: number,
  monitor = true,
) {
  kit.at(x, y, z, yaw, () => {
    const d = 0.6;
    kit.box("oak", -w / 2, 0.7, -d / 2, w / 2, 0.73, d / 2, color, { swap: true });
    for (const s of [-1, 1])
      kit.box(
        "metal",
        s * (w / 2 - 0.05) - 0.02,
        0,
        -d / 2 + 0.04,
        s * (w / 2 - 0.05) + 0.02,
        0.7,
        d / 2 - 0.04,
        0x2b2b2b,
      );
    kit.box("metal", -w / 2 + 0.05, 0.62, -d / 2 + 0.05, w / 2 - 0.05, 0.66, -d / 2 + 0.08, 0x2b2b2b);
    kit.solid(-w / 2, -d / 2, w / 2, d / 2, 0, 0.75);
    if (monitor) {
      kit.box("satin", -0.3, 0.9, -0.2, 0.3, 1.26, -0.18, 0x1a1a1a);
      kit.box("screen", -0.29, 0.91, -0.18, 0.29, 1.25, -0.178, 0x0b0e12);
      kit.box("satin", -0.03, 0.73, -0.24, 0.03, 0.95, -0.21, 0x2a2a2a);
      kit.box("satin", -0.12, 0.73, -0.28, 0.12, 0.74, -0.14, 0x2a2a2a);
      kit.box("satin", -0.22, 0.73, 0.02, 0.22, 0.745, 0.16, 0xe9e7e1);
      rbox(kit, "satin", 0.32, 0.745, 0.1, 0.06, 0.03, 0.1, 0.015, 0xe9e7e1);
    } else {
      kit.box("satin", -0.18, 0.73, -0.05, 0.14, 0.745, 0.18, 0xd9d2c1);
      kit.box("satin", -0.16, 0.745, -0.03, 0.12, 0.75, 0.16, 0xf5f2ea);
    }
    // Desk lamp and a short row of books.
    kit.box("metal", w / 2 - 0.25, 0.73, -0.25, w / 2 - 0.15, 0.745, -0.15, 0x2b2b2b);
    tube(
      kit,
      "metal",
      [
        new THREE.Vector3(w / 2 - 0.2, 0.745, -0.2),
        new THREE.Vector3(w / 2 - 0.22, 1.05, -0.18),
        new THREE.Vector3(w / 2 - 0.3, 1.12, -0.05),
      ],
      0.008,
      0x2b2b2b,
    );
    lathe(
      kit,
      "lamp",
      [
        [0.01, 0],
        [0.06, -0.07],
        [0.055, -0.07],
        [0.005, 0],
      ],
      w / 2 - 0.3,
      1.12,
      -0.05,
      0xfff0d8,
      20,
    );
    books(kit, -w / 2 + 0.02, -w / 2 + 0.35, 0.73, -0.18, 0.2, 0.25, seed);
  });
}

function officeChair(kit: Kit, x: number, y: number, z: number, yaw: number, color: number) {
  kit.at(x, y, z, yaw, () => {
    const plastic = 0x262626;
    // Five-star base on twin-wheel casters.
    cylinder(kit, "satin", 0, 0.075, 0, 0.045, 0.04, 0.05, plastic, 20);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const tip = new THREE.Vector3(Math.sin(a) * 0.3, 0.075, Math.cos(a) * 0.3);
      tube(
        kit,
        "satin",
        [
          new THREE.Vector3(Math.sin(a) * 0.03, 0.1, Math.cos(a) * 0.03),
          new THREE.Vector3(Math.sin(a) * 0.16, 0.095, Math.cos(a) * 0.16),
          tip,
        ],
        0.017,
        plastic,
      );
      rbox(kit, "satin", tip.x, 0.07, tip.z, 0.04, 0.035, 0.04, 0.012, plastic);
      kit.at(tip.x, 0, tip.z, a + 0.8, () => {
        kit.box("satin", -0.006, 0.028, -0.02, 0.006, 0.055, 0.012, plastic);
        for (const s of [-1, 1])
          cylinder(
            kit,
            "matte",
            s * 0.014,
            0.026,
            -0.012,
            0.026,
            0.026,
            0.014,
            0x151515,
            16,
            new THREE.Euler(0, 0, Math.PI / 2),
          );
      });
    }
    // Gas lift in its telescoping cover, the tilt mechanism and its lever.
    cylinder(kit, "chrome", 0, 0.1, 0, 0.014, 0.014, 0.3, 0xa0a3a6, 14);
    cylinder(kit, "satin", 0, 0.1, 0, 0.027, 0.024, 0.16, plastic, 18);
    rbox(kit, "satin", 0, 0.41, 0.02, 0.2, 0.05, 0.24, 0.015, plastic);
    tube(
      kit,
      "satin",
      [new THREE.Vector3(0.09, 0.4, -0.02), new THREE.Vector3(0.2, 0.39, -0.04), new THREE.Vector3(0.22, 0.385, -0.1)],
      0.006,
      plastic,
    );
    // Seat: moulded shell with a waterfall-edged cushion.
    rbox(kit, "satin", 0, 0.445, 0, 0.48, 0.03, 0.46, 0.012, plastic);
    puffy(kit, "linen", 0, 0.49, -0.005, 0.47, 0.08, 0.45, color, 0.55);
    // Armrests.
    for (const s of [-1, 1]) {
      tube(
        kit,
        "satin",
        [
          new THREE.Vector3(s * 0.2, 0.44, 0.08),
          new THREE.Vector3(s * 0.26, 0.47, 0.07),
          new THREE.Vector3(s * 0.265, 0.64, 0.05),
        ],
        0.014,
        plastic,
      );
      rbox(kit, "satin", s * 0.265, 0.655, 0.02, 0.07, 0.028, 0.24, 0.012, 0x303030);
    }
    // Curved back on a spine that rises from behind the seat.
    tube(
      kit,
      "satin",
      [new THREE.Vector3(0, 0.42, 0.13), new THREE.Vector3(0, 0.46, 0.28), new THREE.Vector3(0, 0.62, 0.3)],
      0.022,
      plastic,
    );
    bentBoard(kit, "satin", 0, 0.86, 0.31, 0.45, 0.52, 0.022, -0.045, plastic, 0.12);
    bentBoard(kit, "linen", 0, 0.86, 0.285, 0.42, 0.48, 0.035, -0.045, color, 0.12);
    kit.solid(-0.3, -0.3, 0.3, 0.3, 0, 1.1);
  });
}

function builtInCloset(kit: Kit, x0: number, x1: number, z: number, y: number, doors: number) {
  // Floor-to-ceiling doors flush with a wall line along x, facing +z.
  const h = CH - 0.05;
  kit.box("whiteoak", x0, y, z - 0.6, x1, y + CH, z - 0.02, 0xe7d8bd, { skip: "pz" });
  const dw = (x1 - x0) / doors;
  for (let i = 0; i < doors; i++) {
    const a = x0 + i * dw;
    kit.box("whiteoak", a + 0.002, y + 0.02, z - 0.02, a + dw - 0.002, y + h, z, 0xefe4cd, {
      swap: true,
      shift: i * 0.5,
    });
    kit.box(
      "metal",
      a + (i % 2 ? 0.04 : dw - 0.06),
      y + 0.9,
      z,
      a + (i % 2 ? 0.06 : dw - 0.04),
      y + 1.2,
      z + 0.02,
      0xa9a9a9,
    );
  }
  kit.box("whiteoak", x0, y + h, z - 0.02, x1, y + CH, z + 0.01, 0xe7d8bd);
  kit.solid(x0, z - 0.6, x1, z, y, y + CH);
}

function upstairs(kit: Kit, fixtures: Fixture[]) {
  const y = FL2;
  // Main bedroom.
  builtInCloset(kit, 0.1, 2.8, 2 * M + 0.06 + 0.6, y, 4);
  bed(kit, 2.6, y, 4.75, -Math.PI / 2, 1.4, 0xc9c1b3, 5);
  nightstand(kit, 3.35, y, 3.75, -Math.PI / 2, true);
  nightstand(kit, 3.35, y, 5.75, -Math.PI / 2, true);
  rug(kit, 1.1, 3.6, 1.55, 5.9, y, 0x8a8f85);
  kit.at(0.1 + 0.24, y, 6.35, Math.PI / 2, () => {
    cabinet(kit, 1.1, 0.8, 0.45, 2, 0xe7d8bd, 0x2b2b2b, "whiteoak", 3);
    kit.box("whiteoak", -0.56, 0.8, -0.23, 0.56, 0.83, 0.23, 0xd9c29e);
    kit.box("chrome", -0.35, 1.0, -0.23, 0.35, 1.6, -0.22, 0xeef2f3);
    plantSmall(kit, 0.35, 0.83, 0);
    kit.solid(-0.56, -0.23, 0.56, 0.23, 0, 0.85);
  });
  airConditioner(kit, 3.58, y + 1.98, 4.75, -Math.PI / 2);
  ceilingLight(kit, fixtures, 1.8, T2, 4.6, 2, 2.8);
  switchPlate(kit, 3.58, y + 1.2, 2.8, -Math.PI / 2, 2);
  smokeAlarm(kit, 1.0, T2, 4.0);
  outlet(kit, 3.58, y + 0.25, 3.5, -Math.PI / 2);

  // Study.
  desk(kit, 2.05, y, 0.1 + 0.3, 0, 1.4, 0xc39a6a, 11);
  officeChair(kit, 2.05, y, 0.95, 0, 0x3d4650);
  bookshelf(kit, 0.1 + 0.16, y, 0.95, Math.PI / 2, 1.5, 2.0, 0.3, 17);
  bookshelf(kit, 4.1, y, 0.1 + 0.16, 0, 0.7, 1.8, 0.3, 23);
  kit.at(3.3, y, 1.2, -0.6, () => {
    rbox(kit, "boucle", 0, 0.3, 0, 0.72, 0.2, 0.7, 0.08, 0xcbbfa9);
    rbox(kit, "boucle", 0, 0.55, -0.28, 0.72, 0.55, 0.16, 0.08, 0xcbbfa9);
    for (const s of [-1, 1]) rbox(kit, "boucle", s * 0.32, 0.45, 0, 0.12, 0.35, 0.66, 0.06, 0xcbbfa9);
    kit.solid(-0.36, -0.36, 0.36, 0.36, 0, 0.8);
  });
  ceilingLight(kit, fixtures, 2.2, T2, 0.95, 2, 2.2, 0.24);

  // Storeroom: steel shelving with boxes, a suitcase and a fan.
  kit.at(5.9, y, 0.1 + 0.23, 0, () => {
    const w = 1.8,
      d = 0.45;
    for (const [lx, lz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      kit.box(
        "metal",
        lx * (w / 2) - 0.015,
        0,
        lz * (d / 2) - 0.015,
        lx * (w / 2) + 0.015,
        1.8,
        lz * (d / 2) + 0.015,
        0xb8bbbd,
      );
    const rng = random(91);
    for (const sy of [0.1, 0.55, 1.0, 1.45, 1.78]) {
      kit.box("metal", -w / 2, sy, -d / 2, w / 2, sy + 0.02, d / 2, 0xc9cbcc);
      if (sy > 1.7) continue;
      let bx = -w / 2 + 0.03;
      while (bx < w / 2 - 0.3) {
        const bw = 0.25 + rng() * 0.25,
          bh = 0.18 + rng() * 0.2;
        if (bx + bw > w / 2 - 0.02) break;
        const clear = rng() < 0.35;
        kit.box(
          clear ? "satin" : "matte",
          bx,
          sy + 0.02,
          -d / 2 + 0.03,
          bx + bw,
          sy + 0.02 + bh,
          d / 2 - 0.03,
          clear ? 0xd9dcdc : [0xb99a6e, 0xa88a60, 0xc4a77c][Math.floor(rng() * 3)]!,
        );
        if (!clear)
          kit.box(
            "matte",
            bx + 0.02,
            sy + 0.02 + bh * 0.5,
            d / 2 - 0.03,
            bx + bw - 0.02,
            sy + 0.02 + bh * 0.5 + 0.03,
            d / 2 - 0.028,
            0xf2efe6,
          );
        bx += bw + 0.02 + rng() * 0.05;
      }
    }
    kit.solid(-w / 2, -d / 2, w / 2, d / 2, 0, 1.8);
  });
  kit.at(7.4, y, 0.4, 0.1, () => {
    rbox(kit, "gloss", 0, 0.35, 0, 0.45, 0.66, 0.26, 0.04, 0x2d4a6b);
    kit.box("satin", -0.1, 0.68, -0.02, 0.1, 0.72, 0.02, 0x222222);
    for (const s of [-1, 1]) cylinder(kit, "matte", s * 0.17, 0, 0.09, 0.02, 0.02, 0.03, 0x1b1b1b, 10);
    kit.solid(-0.25, -0.15, 0.25, 0.15, 0, 0.7);
  });
  ceilingLight(kit, fixtures, 6.4, T2, 0.95, 2, 1.6, 0.18);

  // Bedroom 2: a child's room.
  bed(kit, 6.75, y, 4.75, Math.PI, 0.97, 0x9fb7c9, 9);
  bookshelf(kit, 5.2, y, 3.7 + 0.16, 0, 1.2, 1.2, 0.3, 41, 0xefe4cd);
  desk(kit, 3.7 + 0.3, y, 5.9, Math.PI / 2, 1.1, 0xd9c29e, 47, false);
  officeChair(kit, 4.55, y, 5.9, Math.PI / 2, 0xc26a4a);
  rug(kit, 4.6, 4.5, 6.1, 6.2, y, 0xd8c7a0);
  kit.at(5.1, y, 4.6, 0.3, () => {
    rbox(kit, "boucle", 0, 0.2, 0, 0.7, 0.4, 0.7, 0.2, 0xc98b6b);
    kit.solid(-0.35, -0.35, 0.35, 0.35, 0, 0.4);
  });
  kit.at(6.9, y, 6.75, 0, () => {
    kit.box("whiteoak", -0.3, 0, -0.2, 0.3, 0.4, 0.2, 0xf1e6cf);
    for (const [bx, bz, c] of [
      [-0.15, 0.05, 0xd64b3d],
      [0.05, -0.05, 0x3d8bd6],
      [0.18, 0.08, 0xf0c53a],
    ] as const)
      kit.box("satin", bx - 0.05, 0.4, bz - 0.05, bx + 0.05, 0.5, bz + 0.05, c);
    kit.solid(-0.3, -0.2, 0.3, 0.2, 0, 0.5);
  });
  airConditioner(kit, 7.22, y + 1.98, 5.4, -Math.PI / 2);
  ceilingLight(kit, fixtures, 5.46, T2, 5.46, 2, 2.6);
  switchPlate(kit, 4.62, y + 1.2, 3.7, 0, 2);
  smokeAlarm(kit, 4.6, T2, 4.6);

  // Bedroom 3: a quiet guest room.
  bed(kit, 9.47, y, 5.6, Math.PI, 0.97, 0xd6c3a5, 13);
  desk(kit, 7.34 + 0.3, y, 5.4, Math.PI / 2, 1.0, 0x9a7658, 53, true);
  officeChair(kit, 8.2, y, 5.4, Math.PI / 2, 0x55615a);
  plant(kit, 7.6, y, 6.85, 1.2, 57, 0x3a3a3a);
  rug(kit, 8.1, 4.4, 9.0, 6.9, y, 0xa99f91);
  ceilingLight(kit, fixtures, 8.65, T2, 5.46, 2, 2.4);
  switchPlate(kit, 8.2, y + 1.2, 3.7, 0, 1);

  // Upstairs toilet and hall.
  toiletRoom(kit, 9 * M + 0.06, 10 * M - 0.06, y, T2, fixtures, 2);
  kit.at(W - 0.1 - 0.2, y, 2.8, -Math.PI / 2, () => bookshelf(kit, 0, 0, 0, 0, 0.9, 0.9, 0.3, 61));
  downlight(kit, 9.1, T2, 2.7);
  downlight(kit, 6.4, T2, 2.27);
  downlight(kit, 4.1, T2, 2.7);
  fixtures.push({ position: new THREE.Vector3(4.1, T2 - 0.3, 2.7), floor: 2, intensity: 1.2, range: 5 });
  fixtures.push({ position: new THREE.Vector3(9.1, T2 - 0.3, 2.7), floor: 2, intensity: 1.2, range: 5 });
  plant(kit, 9.75, y, 2.1, 0.9, 71);

  // Balcony: a condenser and a pot of herbs.
  kit.at(9.4, FL2 - 0.1, D + 0.55, Math.PI, () => {
    kit.box("satin", -0.4, 0.02, -0.15, 0.4, 0.62, 0.15, 0xe6e4de);
    kit.box("screen", -0.33, 0.08, 0.15, 0.08, 0.55, 0.152, 0x2f3335);
    kit.solid(-0.4, -0.15, 0.4, 0.15, 0, 0.62);
  });
  plant(kit, 4.1, FL2 - 0.1, D + 0.7, 0.6, 83, 0xb86a45);
}

export function buildFurniture(kit: Kit): Fixture[] {
  const fixtures: Fixture[] = [];
  kitchen(kit);
  living(kit, fixtures);
  washroom(kit, fixtures);
  bathroom(kit, fixtures);
  toiletRoom(kit, 9 * M + 0.06, 10 * M - 0.06, FL1, T1, fixtures, 1);
  washitsuFurniture(kit, fixtures);
  genkan(kit, fixtures);
  upstairs(kit, fixtures);
  return fixtures;
}

/** Frees the shared rounded-box geometries once every builder has run. */
export function releaseShapes() {
  for (const geometry of roundedCache.values()) geometry.dispose();
  roundedCache.clear();
}
