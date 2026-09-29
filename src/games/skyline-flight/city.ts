import * as THREE from "three";
import { CROWN_TOWER, SLALOM_TOWERS, type Course } from "./course";
import { Style, facadeMaterial } from "./facade";
import { BLOCK_HALF, CITY, PARK, PITCH, PLAZA, SETBACK, WATERFRONT, inRect, mulberry32, overRiver } from "./layout";

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Round and octagonal shells collide as vertical cylinders of this radius. */
  radius?: number;
}

const enum Shape {
  Box = 0,
  Octagon = 1,
  Round = 2,
}

type Massing = "box" | "cross" | "octagon" | "round";

interface Look {
  style: Style;
  tint: THREE.Color;
  seed: number;
  lit: number;
  glass: number;
}

interface Part extends Box, Look {
  shape: Shape;
}

interface Tank {
  x: number;
  z: number;
  r: number;
  y: number;
  h: number;
}

export interface Beacon {
  x: number;
  y: number;
  z: number;
  phase: number;
}

const PALETTES: Record<Style, string[]> = {
  [Style.Glass]: ["#9aa3ab", "#6d747c", "#c9c2b5", "#3d4248", "#b5b9bc"],
  [Style.Grid]: ["#b8b0a2", "#d2cbbd", "#8f8a82", "#a89c8a", "#c4bfb6"],
  [Style.Stone]: ["#b98f6e", "#8e5a45", "#c8b89a", "#9c8f84", "#a4735a"],
  [Style.Ribbon]: ["#dcd8d0", "#e8e4dc", "#7b8288", "#b0a89a"],
  [Style.Balcony]: ["#e6e1d8", "#d4c7b4", "#c9ccc8", "#b7a58e"],
  [Style.Trim]: ["#d8d2c6", "#c9c1b2", "#8e9296"],
};

const overlaps = (a: Box, b: Box, pad = 0) =>
  a.minX < b.maxX + pad &&
  a.maxX > b.minX - pad &&
  a.minZ < b.maxZ + pad &&
  a.maxZ > b.minZ - pad &&
  a.minY < b.maxY &&
  a.maxY > b.minY;

/** Everything the flight model and scene need from the generated city. */
export interface City {
  group: THREE.Group;
  solids: Box[];
  beacons: Beacon[];
  windowGlow: { value: number };
  dispose(): void;
}

export function createCity(course: Course): City {
  const rand = mulberry32(20260928);
  const parts: Part[] = [];
  const specials: Part[] = [];
  const units: Box[] = [];
  const tanks: Tank[] = [];
  const pyramids: Box[] = [];
  const beacons: Beacon[] = [];

  // Course samples every few meters, used to keep buildings out of the flight line.
  const samples = course.points.filter((_, i) => i % 3 === 0);
  const HORIZONTAL_CLEARANCE = 12;
  const VERTICAL_CLEARANCE = 12;
  const heightLimit = (box: { minX: number; maxX: number; minZ: number; maxZ: number }) => {
    let limit = Infinity;
    for (const p of samples) {
      const dx = Math.max(box.minX - p.x, 0, p.x - box.maxX);
      const dz = Math.max(box.minZ - p.z, 0, p.z - box.maxZ);
      if (dx * dx + dz * dz < HORIZONTAL_CLEARANCE ** 2) limit = Math.min(limit, p.y - VERTICAL_CLEARANCE);
    }
    return limit;
  };
  const courseDistance = (x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i < samples.length; i += 4) {
      const p = samples[i]!;
      best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
    }
    return Math.sqrt(best);
  };

  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const look = (style: Style, options: Partial<Look> = {}): Look => ({
    style,
    tint: new THREE.Color(pick(PALETTES[style])),
    seed: rand(),
    lit: 0.12 + rand() * 0.3,
    glass: rand(),
    ...options,
  });
  const trimLook = (of: Look): Look => ({
    ...of,
    style: Style.Trim,
    tint: of.style === Style.Glass ? of.tint.clone().multiplyScalar(0.9) : new THREE.Color(pick(PALETTES[Style.Trim])),
  });
  const chooseStyle = (height: number): Style => {
    const r = rand();
    if (height > 120) return r < 0.55 ? Style.Glass : r < 0.8 ? Style.Ribbon : r < 0.92 ? Style.Grid : Style.Balcony;
    if (height > 50) {
      if (r < 0.2) return Style.Glass;
      if (r < 0.48) return Style.Grid;
      if (r < 0.64) return Style.Ribbon;
      return r < 0.84 ? Style.Balcony : Style.Stone;
    }
    return r < 0.55 ? Style.Stone : r < 0.8 ? Style.Grid : r < 0.92 ? Style.Balcony : Style.Ribbon;
  };

  const shell = (
    into: Part[],
    shape: Shape,
    x: number,
    z: number,
    w: number,
    d: number,
    y0: number,
    y1: number,
    of: Look,
  ) => {
    const part: Part = {
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      minY: y0,
      maxY: y1,
      shape,
      ...of,
    };
    if (shape !== Shape.Box) part.radius = (w / 2) * (shape === Shape.Round ? 1 : 0.96);
    into.push(part);
  };

  /** One stretch of the building's plan: a plain box, a notched cross, an octagon or a cylinder. */
  const massingBand = (
    into: Part[],
    massing: Massing,
    x: number,
    z: number,
    w: number,
    d: number,
    y0: number,
    y1: number,
    of: Look,
    notch: number,
  ) => {
    if (massing === "octagon" || massing === "round") {
      const size = Math.min(w, d);
      shell(into, massing === "round" ? Shape.Round : Shape.Octagon, x, z, size, size, y0, y1, of);
    } else if (massing === "cross") {
      shell(into, Shape.Box, x, z, w, d * (1 - 2 * notch), y0, y1, of);
      // Slightly lower so the two roofs never share a plane.
      shell(into, Shape.Box, x, z, w * (1 - 2 * notch), d, y0, y1 - 0.45, of);
    } else {
      shell(into, Shape.Box, x, z, w, d, y0, y1, of);
    }
  };

  /** A protruding band just under an edge: cornices, tier ledges and string courses. */
  const band = (
    into: Part[],
    massing: Massing,
    x: number,
    z: number,
    w: number,
    d: number,
    y: number,
    thickness: number,
    reach: number,
    of: Look,
    notch: number,
  ) => massingBand(into, massing, x, z, w + reach * 2, d + reach * 2, y - thickness, y, trimLook(of), notch);

  const waterTank = (x: number, z: number, roof: number) => {
    const r = 1.6 + rand() * 1.1;
    const legs = 2.2 + rand() * 1.5;
    for (const [dx, dz] of [
      [-0.6, -0.6],
      [0.6, -0.6],
      [0.6, 0.6],
      [-0.6, 0.6],
    ]) {
      const lx = x + dx! * r,
        lz = z + dz! * r;
      units.push({ minX: lx - 0.12, maxX: lx + 0.12, minZ: lz - 0.12, maxZ: lz + 0.12, minY: roof, maxY: roof + legs });
    }
    tanks.push({ x, z, r, y: roof + legs, h: r * 1.8 });
  };

  const mast = (x: number, z: number, y: number, height: number) => {
    units.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, minY: y, maxY: y + height });
    beacons.push({ x, y: y + height + 0.5, z, phase: rand() });
  };

  /** Stacks tiers, ledges, a crown and rooftop plant onto a footprint. */
  const building = (
    into: Part[],
    x: number,
    z: number,
    w: number,
    d: number,
    height: number,
    of: Look,
    options: { limit?: number; massing?: Massing; tiers?: boolean } = {},
  ) => {
    const limit = options.limit ?? Infinity;
    const r = rand();
    const massing: Massing =
      options.massing ??
      (height > 100 && of.style === Style.Glass && r < 0.16
        ? "round"
        : height > 90 && r < 0.3
          ? "octagon"
          : w > 22 && d > 22 && r < 0.55
            ? "cross"
            : "box");
    const notch = 0.1 + rand() * 0.1;
    // Each tier is [top as a fraction of the height, footprint scale].
    const tiers: number[][] =
      options.tiers !== false && height > 95 && rand() < 0.7
        ? [
            [0.6 + rand() * 0.12, 1],
            [0.86 + rand() * 0.05, 0.76 + rand() * 0.08],
            [1, 0.52 + rand() * 0.1],
          ]
        : [[1, 1]];
    let floor = 0;
    let topW = w,
      topD = d;
    tiers.forEach(([top, scale], i) => {
      topW = w * scale!;
      topD = d * scale!;
      const y1 = height * top!;
      massingBand(into, massing, x, z, topW, topD, floor, y1, of, notch);
      // A ledge where each setback begins.
      if (i < tiers.length - 1) band(into, massing, x, z, topW, topD, y1 - 0.2, 0.9, 0.5, of, notch);
      floor = y1;
    });

    // Masonry gets a cornice and a string course above the shops; everything else a slim coping band.
    if (of.style === Style.Stone || (of.style === Style.Grid && height < 70)) {
      band(into, massing, x, z, topW, topD, height - 0.35, 1.3, 0.75, of, notch);
      if (height > 14) band(into, massing, x, z, w, d, 6.6, 0.45, 0.3, of, notch);
    } else if (massing !== "round") {
      band(into, massing, x, z, topW, topD, height - 0.25, 0.7, 0.3, of, notch);
    }
    // Street canopies over some shopfronts.
    if (of.style !== Style.Stone && massing === "box" && rand() < 0.3)
      band(into, "box", x, z, w, d, 5.1, 0.28, 1.6, of, 0);

    const spare = limit - height;
    const size = Math.min(topW, topD);
    const roll = rand();
    let crowned = false;
    if (height > 150 && spare > 60) {
      crowned = roll < 0.8;
      if (roll < 0.3) {
        mast(x, z, height, 20 + rand() * 30);
      } else if (roll < 0.55) {
        const h = size * (0.35 + rand() * 0.25);
        pyramids.push({
          minX: x - topW * 0.46,
          maxX: x + topW * 0.46,
          minZ: z - topD * 0.46,
          maxZ: z + topD * 0.46,
          minY: height,
          maxY: height + h,
        });
        mast(x, z, height + h, 6 + rand() * 10);
      } else if (roll < 0.8) {
        // A lit glass lantern on top.
        const h = 7 + rand() * 7;
        massingBand(
          into,
          massing,
          x,
          z,
          topW * 0.7,
          topD * 0.7,
          height,
          height + h,
          { ...of, style: Style.Glass, lit: 0.95 },
          notch,
        );
        mast(x, z, height + h, 10 + rand() * 14);
      }
    }
    // Plant rooms, penthouses, tanks and antennas on the roofs that are left bare.
    if (!crowned && topW > 12 && topD > 12) {
      const count = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < count; k++) {
        const uw = 3 + rand() * topW * 0.25,
          ud = 3 + rand() * topD * 0.25;
        const ux = x + (rand() - 0.5) * (topW * 0.6 - uw),
          uz = z + (rand() - 0.5) * (topD * 0.6 - ud);
        units.push({
          minX: ux - uw / 2,
          maxX: ux + uw / 2,
          minZ: uz - ud / 2,
          maxZ: uz + ud / 2,
          minY: height,
          maxY: height + 1.6 + rand() * 3,
        });
      }
      if (height > 40 && spare > 14 && rand() < 0.45) {
        const pw = topW * (0.3 + rand() * 0.15),
          pd = topD * (0.3 + rand() * 0.15);
        const px = x + (rand() - 0.5) * (topW - pw) * 0.5,
          pz = z + (rand() - 0.5) * (topD - pd) * 0.5;
        shell(into, Shape.Box, px, pz, pw, pd, height, height + 4 + rand() * 3, { ...of, style: Style.Grid, lit: 0.2 });
      }
      if (height < 70 && spare > 12 && (of.style === Style.Stone || of.style === Style.Grid) && rand() < 0.5)
        waterTank(x + (rand() - 0.5) * topW * 0.4, z + (rand() - 0.5) * topD * 0.4, height);
      if (height > 60 && spare > 30 && rand() < 0.3) mast(x + topW * 0.3, z - topD * 0.3, height, 8 + rand() * 12);
    }
    if (height > 110) {
      beacons.push({ x: x - topW * 0.45, y: height + 0.8, z: z - topD * 0.45, phase: rand() });
      beacons.push({ x: x + topW * 0.45, y: height + 0.8, z: z + topD * 0.45, phase: rand() });
    }
  };

  // Landmarks that the course is designed around.
  const glassy = (options: Partial<Look> = {}) => look(Style.Glass, { lit: 0.3, ...options });
  const plain = (x0: number, x1: number, z0: number, z1: number, height: number, of: Look) =>
    building(specials, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, height, of, { massing: "box", tiers: false });
  const skyBridge = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, of: Look) => {
    const x = (x0 + x1) / 2,
      z = (z0 + z1) / 2;
    shell(specials, Shape.Box, x, z, x1 - x0, z1 - z0, y0, y1, of);
    band(specials, "box", x, z, x1 - x0, z1 - z0, y1, 0.6, 0.3, of, 0);
    band(specials, "box", x, z, x1 - x0, z1 - z0, y0 + 0.6, 0.6, 0.3, of, 0);
  };
  // Harbor Avenue sky bridge with its two anchors.
  plain(-52, -23, 362, 408, 96, glassy());
  plain(23, 52, 362, 408, 104, glassy());
  skyBridge(-26, 26, 378, 392, 44, 50, look(Style.Ribbon, { lit: 0.9 }));
  // Meridian Avenue: one bridge to duck under, one to hop over.
  plain(498, 527, -300, -250, 132, look(Style.Ribbon));
  plain(573, 602, -300, -250, 118, glassy());
  skyBridge(524, 576, -282, -268, 58, 64, look(Style.Ribbon, { lit: 0.9 }));
  plain(498, 527, -410, -360, 78, look(Style.Grid));
  plain(573, 602, -410, -360, 84, look(Style.Grid));
  skyBridge(524, 576, -392, -378, 20, 26, look(Style.Ribbon, { lit: 0.9 }));
  // The Sky Gate: twin slabs joined high over Sunset Street.
  const gate = glassy({ tint: new THREE.Color("#d9d4ca"), glass: 0.1, lit: 0.35 });
  plain(180, 260, -632, -572, 152, gate);
  plain(180, 260, -528, -468, 152, gate);
  skyBridge(180, 260, -572, -528, 56, 104, { ...gate, style: Style.Ribbon, lit: 0.7 });
  const slalomShapes: Massing[] = ["round", "octagon", "cross", "round"];
  SLALOM_TOWERS.forEach((t, i) =>
    building(specials, t.x, t.z, t.size, t.size, t.height, glassy(), { massing: slalomShapes[i] }),
  );
  {
    const { x, z, size, height } = CROWN_TOWER;
    const crown = glassy({ tint: new THREE.Color("#c8ccd0"), glass: 0.35, lit: 0.32 });
    const tiers = [
      [0, 0.55, 1],
      [0.55, 0.8, 0.8],
      [0.8, 0.93, 0.58],
      [0.93, 1, 0.38],
    ];
    for (const [from, to, scale] of tiers) {
      const s = size * scale!;
      massingBand(specials, "cross", x, z, s, s, height * from!, height * to!, crown, 0.14);
      band(specials, "cross", x, z, s, s, height * to! - 0.2, 1.2, 0.6, crown, 0.14);
    }
    const s = size * 0.3;
    massingBand(specials, "box", x, z, s, s, height, height + 10, { ...crown, lit: 1 }, 0);
    mast(x, z, height + 10, 36);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      beacons.push({ x: x + dx! * size * 0.19, y: height + 0.6, z: z + dz! * size * 0.19, phase: 0.5 });
    }
  }

  const blocked = (box: Box) => specials.some((s) => overlaps(box, { ...s, minY: 0, maxY: 1e4 }, 4));

  // The generic grid of blocks.
  for (let i = Math.floor(CITY.x0 / PITCH); (i + 0.5) * PITCH < CITY.x1; i++) {
    for (let j = Math.floor(CITY.z0 / PITCH); (j + 0.5) * PITCH + BLOCK_HALF < WATERFRONT; j++) {
      const cx = (i + 0.5) * PITCH,
        cz = (j + 0.5) * PITCH;
      if (overRiver(cz) || inRect(PARK, cx, cz) || inRect(PLAZA, cx, cz)) continue;
      const core = Math.exp(-((cx + 300) ** 2 + (cz + 520) ** 2) / 560 ** 2);
      const east = Math.exp(-((cx - 520) ** 2 + (cz + 380) ** 2) / 380 ** 2);
      const harbor = Math.exp(-(cx ** 2) / 260 ** 2) * Math.exp(-((cz - 380) ** 2) / 400 ** 2);
      const falloff = Math.exp(-(cx ** 2 + (cz + 300) ** 2) / 1500 ** 2);
      const near = Math.exp(-((courseDistance(cx, cz) / 150) ** 2));
      const far = falloff < 0.35;
      const blockHeight = 12 + 34 * falloff + 230 * core + 150 * east + 70 * harbor + 45 * near;
      const half = BLOCK_HALF - SETBACK;
      const lots: { x: number; z: number; w: number; d: number; h: number; podium?: boolean }[] = [];
      const h = blockHeight * (0.45 + rand() * 0.9) * (rand() < 0.04 ? 1.8 : 1);
      if (h > 110 && rand() < 0.8) {
        // Tower on a podium.
        const w = 30 + rand() * 20,
          d = 30 + rand() * 20;
        lots.push({ x: cx, z: cz, w: half * 2, d: half * 2, h: 9 + rand() * 8, podium: true });
        lots.push({
          x: cx + (rand() - 0.5) * (half * 2 - w - 4),
          z: cz + (rand() - 0.5) * (half * 2 - d - 4),
          w,
          d,
          h,
        });
      } else {
        const split = far ? (rand() < 0.6 ? 1 : 2) : rand() < 0.3 ? 1 : rand() < 0.6 ? 2 : 4;
        const gap = 3;
        const cells =
          split === 1
            ? [[0, 0, 1, 1]]
            : split === 2
              ? rand() < 0.5
                ? [
                    [-0.5, 0, 0.5, 1],
                    [0.5, 0, 0.5, 1],
                  ]
                : [
                    [0, -0.5, 1, 0.5],
                    [0, 0.5, 1, 0.5],
                  ]
              : [
                  [-0.5, -0.5, 0.5, 0.5],
                  [0.5, -0.5, 0.5, 0.5],
                  [-0.5, 0.5, 0.5, 0.5],
                  [0.5, 0.5, 0.5, 0.5],
                ];
        for (const [ox, oz, sw, sd] of cells) {
          const w = half * 2 * sw! - (sw! < 1 ? gap : 0),
            d = half * 2 * sd! - (sd! < 1 ? gap : 0);
          const shrinkW = rand() < 0.4 ? rand() * w * 0.2 : 0,
            shrinkD = rand() < 0.4 ? rand() * d * 0.2 : 0;
          lots.push({
            x: cx + ox! * half + (rand() - 0.5) * shrinkW,
            z: cz + oz! * half + (rand() - 0.5) * shrinkD,
            w: w - shrinkW,
            d: d - shrinkD,
            h: h * (0.55 + rand() * 0.6),
          });
        }
      }
      for (const lot of lots) {
        const box: Box = {
          minX: lot.x - lot.w / 2,
          maxX: lot.x + lot.w / 2,
          minZ: lot.z - lot.d / 2,
          maxZ: lot.z + lot.d / 2,
          minY: 0,
          maxY: lot.h,
        };
        if (blocked(box)) continue;
        const limit = heightLimit(box);
        const height = Math.min(lot.h, limit);
        if (height < 7) continue;
        const style = lot.podium ? (rand() < 0.5 ? Style.Grid : Style.Stone) : chooseStyle(height);
        building(parts, lot.x, lot.z, lot.w, lot.d, height, look(style), {
          limit,
          massing: lot.podium ? "box" : undefined,
        });
      }
    }
  }

  const all = [...specials, ...parts];
  const group = new THREE.Group();
  const glow = { value: 0.55 };
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T) => (disposables.push(item), item);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const identity = new THREE.Quaternion();
  const place = (b: Box) => {
    position.set((b.minX + b.maxX) / 2, b.minY, (b.minZ + b.maxZ) / 2);
    scale.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
    return matrix.compose(position, identity, scale);
  };

  // Building shells: one instanced mesh per cross-section.
  const flatFacade = track(facadeMaterial(glow));
  const roundFacade = track(facadeMaterial(glow, true));
  const octagon = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).rotateY(Math.PI / 8).toNonIndexed();
  octagon.computeVertexNormals();
  const shapes: [Shape, THREE.BufferGeometry, THREE.Material][] = [
    [Shape.Box, new THREE.BoxGeometry(1, 1, 1), flatFacade],
    [Shape.Octagon, octagon, flatFacade],
    [Shape.Round, new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 1), roundFacade],
  ];
  for (const [shape, geometry, material] of shapes) {
    const list = all.filter((p) => p.shape === shape);
    geometry.translate(0, 0.5, 0);
    track(geometry);
    const mesh = track(new THREE.InstancedMesh(geometry, material, list.length));
    const styles = new Float32Array(list.length * 4);
    const tints = new Float32Array(list.length * 3);
    list.forEach((b, i) => {
      mesh.setMatrixAt(i, place(b));
      styles.set([b.seed, b.style, b.lit, b.glass], i * 4);
      tints.set([b.tint.r, b.tint.g, b.tint.b], i * 3);
    });
    geometry.setAttribute("aStyle", new THREE.InstancedBufferAttribute(styles, 4));
    geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 3));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // Rooftop plant, masts and tank legs.
  const unitMesh = track(
    new THREE.InstancedMesh(
      track(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
      track(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35 })),
      units.length,
    ),
  );
  const unitColors = ["#7d8286", "#9aa0a4", "#5c6064", "#b4b2ac"].map((c) => new THREE.Color(c));
  units.forEach((b, i) => {
    unitMesh.setMatrixAt(i, place(b));
    unitMesh.setColorAt(i, unitColors[i % unitColors.length]!);
  });

  // Timber water tanks with conical lids.
  const tankMesh = track(
    new THREE.InstancedMesh(
      track(new THREE.CylinderGeometry(1, 1, 1, 14, 1).translate(0, 0.5, 0)),
      track(new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.9 })),
      tanks.length,
    ),
  );
  const lidMesh = track(
    new THREE.InstancedMesh(
      track(new THREE.ConeGeometry(1.08, 1, 14, 1).translate(0, 0.5, 0)),
      track(new THREE.MeshStandardMaterial({ color: 0x3b3d3f, roughness: 0.6, metalness: 0.4 })),
      tanks.length,
    ),
  );
  tanks.forEach((t, i) => {
    tankMesh.setMatrixAt(i, matrix.compose(position.set(t.x, t.y, t.z), identity, scale.set(t.r, t.h, t.r)));
    lidMesh.setMatrixAt(i, matrix.compose(position.set(t.x, t.y + t.h, t.z), identity, scale.set(t.r, t.r * 0.6, t.r)));
  });

  // Pyramid crowns in weathered copper and dark metal.
  const pyramidMesh = track(
    new THREE.InstancedMesh(
      track(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)),
      track(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.8, flatShading: true })),
      pyramids.length,
    ),
  );
  const crownColors = ["#5f8f80", "#3a3f45", "#b89a6a", "#8a9aa3"].map((c) => new THREE.Color(c));
  pyramids.forEach((b, i) => {
    pyramidMesh.setMatrixAt(i, place(b));
    pyramidMesh.setColorAt(i, crownColors[i % crownColors.length]!);
  });

  for (const mesh of [unitMesh, tankMesh, lidMesh, pyramidMesh]) {
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return {
    group,
    solids: [...all, ...pyramids].map(({ minX, minY, minZ, maxX, maxY, maxZ, radius }) => ({
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      radius,
    })),
    beacons,
    windowGlow: glow,
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}

/** A uniform grid over the XZ plane for quick box lookups. */
export class SolidIndex {
  private cells = new Map<number, Box[]>();
  private static readonly SIZE = 40;

  constructor(boxes: Box[]) {
    for (const box of boxes) {
      const size = SolidIndex.SIZE;
      for (let i = Math.floor(box.minX / size); i <= Math.floor(box.maxX / size); i++) {
        for (let j = Math.floor(box.minZ / size); j <= Math.floor(box.maxZ / size); j++) {
          const key = SolidIndex.key(i, j);
          const list = this.cells.get(key);
          if (list) list.push(box);
          else this.cells.set(key, [box]);
        }
      }
    }
  }

  private static key(i: number, j: number) {
    return (i + 4096) * 8192 + (j + 4096);
  }

  /** Distance from a point to the nearest surface within `reach`, or Infinity. */
  nearest(p: THREE.Vector3, reach: number) {
    const size = SolidIndex.SIZE;
    let best = Infinity;
    const seen = new Set<Box>();
    for (let i = Math.floor((p.x - reach) / size); i <= Math.floor((p.x + reach) / size); i++) {
      for (let j = Math.floor((p.z - reach) / size); j <= Math.floor((p.z + reach) / size); j++) {
        for (const box of this.cells.get(SolidIndex.key(i, j)) ?? []) {
          if (seen.has(box)) continue;
          seen.add(box);
          const dy = Math.max(box.minY - p.y, 0, p.y - box.maxY);
          const horizontal = box.radius
            ? Math.max(0, Math.hypot(p.x - (box.minX + box.maxX) / 2, p.z - (box.minZ + box.maxZ) / 2) - box.radius)
            : Math.hypot(Math.max(box.minX - p.x, 0, p.x - box.maxX), Math.max(box.minZ - p.z, 0, p.z - box.maxZ));
          best = Math.min(best, Math.hypot(horizontal, dy));
        }
      }
    }
    return best;
  }
}
