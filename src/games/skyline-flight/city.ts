import * as THREE from "three";
import { CROWN_TOWER, SLALOM_TOWERS, type Course } from "./course";
import { BLOCK_HALF, CITY, PARK, PITCH, PLAZA, SETBACK, WATERFRONT, inRect, mulberry32, overRiver } from "./layout";

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

const enum Style {
  Glass = 0,
  Grid = 1,
  Stone = 2,
  Ribbon = 3,
}

interface Building extends Box {
  style: Style;
  tint: THREE.Color;
  seed: number;
  lit: number;
  glass: number;
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
};

const overlaps = (a: Box, b: Box, pad = 0) =>
  a.minX < b.maxX + pad &&
  a.maxX > b.minX - pad &&
  a.minZ < b.maxZ + pad &&
  a.maxZ > b.minZ - pad &&
  a.minY < b.maxY &&
  a.maxY > b.minY;

const BUILDING_VERTEX = /* glsl */ `
attribute vec4 aStyle;
attribute vec3 aTint;
varying vec3 vBPos;
varying vec3 vBNormal;
varying vec4 vBStyle;
varying vec3 vBTint;
varying vec3 vBSize;
varying float vBBase;
`;

const BUILDING_FRAGMENT = /* glsl */ `
uniform float uWindowGlow;
varying vec3 vBPos;
varying vec3 vBNormal;
varying vec4 vBStyle;
varying vec3 vBTint;
varying vec3 vBSize;
varying float vBBase;

float bHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 glassTint(float h) {
  if (h < 0.25) return vec3(0.09, 0.15, 0.17);
  if (h < 0.5) return vec3(0.08, 0.11, 0.18);
  if (h < 0.75) return vec3(0.17, 0.13, 0.09);
  return vec3(0.12, 0.13, 0.14);
}
`;

const BUILDING_SURFACE = /* glsl */ `
{
  vec3 bn = normalize(vBNormal);
  float seed = vBStyle.x;
  float style = vBStyle.y;
  float litRatio = vBStyle.z;
  vec3 glass = glassTint(vBStyle.w);
  float localY = vBPos.y - vBBase;
  float ao = mix(0.4, 1.0, smoothstep(-4.0, 42.0, vBPos.y));
  vec3 emit = vec3(0.0);
  if (abs(bn.y) > 0.5) {
    float grit = bHash(floor(vBPos.xz * 1.5));
    diffuseColor.rgb = vBTint * (bn.y > 0.0 ? 0.42 : 0.28) * (0.88 + 0.24 * grit);
    roughnessFactor = 0.92;
    metalnessFactor = 0.0;
  } else {
    float u = (abs(bn.x) > 0.5 ? vBPos.z : vBPos.x) + seed * 53.0;
    vec2 cellSize = vec2(3.4, 3.3);
    vec2 win = vec2(0.42, 0.55);
    float sill = 0.25;
    if (style < 0.5) { cellSize = vec2(1.6, 3.9); win = vec2(0.92, 0.74); sill = 0.16; }
    else if (style < 1.5) { cellSize = vec2(3.0, 3.9); win = vec2(0.6, 0.56); sill = 0.24; }
    else if (style > 2.5) { cellSize = vec2(1.8, 3.7); win = vec2(0.97, 0.48); sill = 0.3; }
    vec2 c = vec2(u, localY) / cellSize;
    vec2 id = floor(c);
    vec2 f = fract(c);
    vec2 fw = max(fwidth(c), vec2(1e-4));
    float x0 = 0.5 - win.x * 0.5;
    float x1 = 0.5 + win.x * 0.5;
    float mx = smoothstep(x0 - fw.x, x0 + fw.x, f.x) - smoothstep(x1 - fw.x, x1 + fw.x, f.x);
    float my = smoothstep(sill - fw.y, sill + fw.y, f.y) - smoothstep(sill + win.y - fw.y, sill + win.y + fw.y, f.y);
    float detail = 1.0 - smoothstep(0.2, 0.6, max(fw.x, fw.y));
    float mask = mix(win.x * win.y, mx * my, detail);
    float parapet = step(vBSize.y - 1.3, localY);
    float mech = style < 1.5 && vBSize.y > 90.0 ? step(15.0, mod(id.y, 16.0)) : 0.0;
    mask *= (1.0 - parapet) * (1.0 - mech);

    float h1 = bHash(id + seed * vec2(17.13, 5.71));
    float h2 = bHash(id.yx * 1.37 + seed * 3.1);
    float floorLit = bHash(vec2(id.y * 0.37, seed * 91.7));
    float isLit = step(h1, litRatio * (0.35 + 1.3 * floorLit * floorLit));
    vec3 warm = mix(vec3(1.0, 0.56, 0.24), vec3(1.0, 0.8, 0.52), h2);
    vec3 lamp = mix(warm, vec3(0.74, 0.85, 1.0), step(0.84, h2)) * (0.4 + 0.9 * fract(h1 * 13.7));
    vec3 room = lamp * isLit * (0.6 + 0.4 * smoothstep(0.1, 0.95, f.y));
    room = mix(litRatio * vec3(0.9, 0.62, 0.34) * 0.75, room, detail);

    if (vBBase < 0.5 && localY < 5.6) {
      float bay = fract(u / 6.0);
      float shop = smoothstep(0.05, 0.08, bay) * (1.0 - smoothstep(0.92, 0.95, bay));
      mask = shop * step(0.35, localY) * (1.0 - step(4.7, localY));
      room = mix(vec3(1.0, 0.66, 0.36), vec3(1.0, 0.84, 0.62), bHash(vec2(floor(u / 6.0), seed))) * 0.9;
    }

    if (style > 1.5 && style < 2.5) {
      vec2 brick = floor(vec2(u * 2.2, localY * 4.2));
      diffuseColor.rgb = vBTint * (0.86 + 0.24 * bHash(brick + seed));
    } else {
      diffuseColor.rgb = vBTint;
    }
    float panel = bHash(id * 0.71 + seed);
    diffuseColor.rgb = mix(diffuseColor.rgb * ao, glass, mask);
    roughnessFactor = mix(style < 0.5 ? 0.42 : 0.8, 0.12 + 0.12 * panel, mask);
    metalnessFactor = mix(style < 0.5 ? 0.55 : 0.0, 0.7, mask);
    emit = room * mask * uWindowGlow;

    vec3 across = abs(bn.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 wobble = (across * (panel - 0.5) + vec3(0.0, fract(panel * 7.3) - 0.5, 0.0)) * 0.06 * mask * detail;
    normal = normalize(normal + (viewMatrix * vec4(wobble, 0.0)).xyz);
  }
  totalEmissiveRadiance += emit;
}
`;

function buildingMaterial(glow: { value: number }) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindowGlow = glow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BUILDING_VERTEX}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vBPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vBNormal = normal;
        vBStyle = aStyle;
        vBTint = aTint;
        vBSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vBBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${BUILDING_FRAGMENT}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${BUILDING_SURFACE}`);
  };
  material.customProgramCacheKey = () => "skyline-building";
  return material;
}

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
  const buildings: Building[] = [];
  const specials: Building[] = [];
  const roofUnits: Box[] = [];
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
  const make = (box: Box, style: Style, options: Partial<Building> = {}): Building => ({
    ...box,
    style,
    tint: new THREE.Color(pick(PALETTES[style])),
    seed: rand(),
    lit: 0.12 + rand() * 0.3,
    glass: rand(),
    ...options,
  });
  const chooseStyle = (height: number): Style => {
    const r = rand();
    if (height > 120) return r < 0.58 ? Style.Glass : r < 0.84 ? Style.Ribbon : Style.Grid;
    if (height > 50) return r < 0.22 ? Style.Glass : r < 0.6 ? Style.Grid : r < 0.8 ? Style.Ribbon : Style.Stone;
    return r < 0.55 ? Style.Stone : r < 0.88 ? Style.Grid : Style.Ribbon;
  };

  /** Stacks setback tiers, a crown and rooftop plant onto a footprint. */
  const tower = (x: number, z: number, w: number, d: number, height: number, style: Style, into: Building[]) => {
    const base = make(
      { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: height },
      style,
    );
    // Each tier is [top as a fraction of the height, footprint scale].
    const tiers: number[][] =
      height > 95 && rand() < 0.7
        ? [
            [0.6 + rand() * 0.12, 1],
            [0.86 + rand() * 0.05, 0.76 + rand() * 0.08],
            [1, 0.52 + rand() * 0.1],
          ]
        : [[1, 1]];
    let floor = 0;
    for (const [top, scale] of tiers) {
      const tw = w * scale!,
        td = d * scale!;
      into.push({
        ...base,
        minX: x - tw / 2,
        maxX: x + tw / 2,
        minZ: z - td / 2,
        maxZ: z + td / 2,
        minY: floor,
        maxY: height * top!,
      });
      floor = height * top!;
    }
    const last = into[into.length - 1]!;
    const topW = last.maxX - last.minX,
      topD = last.maxZ - last.minZ;
    if (height > 200 && rand() < 0.55) {
      const spire = 18 + rand() * 30;
      roofUnits.push({
        minX: x - 0.7,
        maxX: x + 0.7,
        minZ: z - 0.7,
        maxZ: z + 0.7,
        minY: height,
        maxY: height + spire,
      });
      beacons.push({ x, y: height + spire + 0.6, z, phase: rand() });
    } else if (topW > 10 && topD > 10) {
      const units = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < units; k++) {
        const uw = 3 + rand() * topW * 0.28,
          ud = 3 + rand() * topD * 0.28;
        const ux = x + (rand() - 0.5) * (topW - uw - 2),
          uz = z + (rand() - 0.5) * (topD - ud - 2);
        roofUnits.push({
          minX: ux - uw / 2,
          maxX: ux + uw / 2,
          minZ: uz - ud / 2,
          maxZ: uz + ud / 2,
          minY: height,
          maxY: height + 2 + rand() * 3.5,
        });
      }
    }
    if (height > 110) {
      for (const [cx, cz] of [
        [last.minX + 0.6, last.minZ + 0.6],
        [last.maxX - 0.6, last.maxZ - 0.6],
      ]) {
        beacons.push({ x: cx!, y: height + 0.8, z: cz!, phase: rand() });
      }
    }
  };

  // Landmarks that the course is designed around.
  const glassy = (options: Partial<Building> = {}) => ({ glass: rand(), lit: 0.3, ...options });
  const addSpecial = (box: Box, style: Style, options: Partial<Building> = {}) =>
    specials.push(make(box, style, options));
  // Harbor Avenue sky bridge with its two anchors.
  addSpecial({ minX: -52, maxX: -23, minZ: 362, maxZ: 408, minY: 0, maxY: 96 }, Style.Glass, glassy());
  addSpecial({ minX: 23, maxX: 52, minZ: 362, maxZ: 408, minY: 0, maxY: 104 }, Style.Glass, glassy());
  addSpecial({ minX: -26, maxX: 26, minZ: 378, maxZ: 392, minY: 44, maxY: 50 }, Style.Ribbon, { lit: 0.9 });
  // Meridian Avenue: one bridge to duck under, one to hop over.
  addSpecial({ minX: 498, maxX: 527, minZ: -300, maxZ: -250, minY: 0, maxY: 132 }, Style.Ribbon);
  addSpecial({ minX: 573, maxX: 602, minZ: -300, maxZ: -250, minY: 0, maxY: 118 }, Style.Glass, glassy());
  addSpecial({ minX: 524, maxX: 576, minZ: -282, maxZ: -268, minY: 58, maxY: 64 }, Style.Ribbon, { lit: 0.9 });
  addSpecial({ minX: 498, maxX: 527, minZ: -410, maxZ: -360, minY: 0, maxY: 78 }, Style.Grid);
  addSpecial({ minX: 573, maxX: 602, minZ: -410, maxZ: -360, minY: 0, maxY: 84 }, Style.Grid);
  addSpecial({ minX: 524, maxX: 576, minZ: -392, maxZ: -378, minY: 20, maxY: 26 }, Style.Ribbon, { lit: 0.9 });
  // The Sky Gate: twin slabs joined high over Sunset Street.
  const gateTint = new THREE.Color("#d9d4ca");
  addSpecial({ minX: 180, maxX: 260, minZ: -632, maxZ: -572, minY: 0, maxY: 152 }, Style.Glass, {
    tint: gateTint,
    glass: 0.1,
    lit: 0.35,
  });
  addSpecial({ minX: 180, maxX: 260, minZ: -528, maxZ: -468, minY: 0, maxY: 152 }, Style.Glass, {
    tint: gateTint,
    glass: 0.1,
    lit: 0.35,
  });
  addSpecial({ minX: 180, maxX: 260, minZ: -572, maxZ: -528, minY: 56, maxY: 104 }, Style.Ribbon, {
    tint: gateTint,
    lit: 0.7,
  });
  for (const t of SLALOM_TOWERS) {
    tower(t.x, t.z, t.size, t.size, t.height, Style.Glass, specials);
  }
  {
    const { x, z, size, height } = CROWN_TOWER;
    const crown = make({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 0 }, Style.Glass, {
      tint: new THREE.Color("#c8ccd0"),
      glass: 0.35,
      lit: 0.32,
    });
    const tiers = [
      [0, 0.55, 1],
      [0.55, 0.8, 0.8],
      [0.8, 0.93, 0.58],
      [0.93, 1, 0.38],
    ];
    for (const [from, to, scale] of tiers) {
      const half = (size * scale!) / 2;
      specials.push({
        ...crown,
        minX: x - half,
        maxX: x + half,
        minZ: z - half,
        maxZ: z + half,
        minY: height * from!,
        maxY: height * to!,
      });
    }
    roofUnits.push({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1, minY: height, maxY: height + 46 });
    beacons.push({ x, y: height + 46.8, z, phase: 0 });
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
      const lots: { x: number; z: number; w: number; d: number; h: number }[] = [];
      const h = blockHeight * (0.45 + rand() * 0.9) * (rand() < 0.04 ? 1.8 : 1);
      if (h > 110 && rand() < 0.8) {
        // Tower on a podium.
        const w = 30 + rand() * 20,
          d = 30 + rand() * 20;
        lots.push({ x: cx, z: cz, w: half * 2, d: half * 2, h: 9 + rand() * 8 });
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
        const height = Math.min(lot.h, heightLimit(box));
        if (height < 7) continue;
        tower(lot.x, lot.z, lot.w, lot.d, height, chooseStyle(height), buildings);
      }
    }
  }

  const all = [...specials, ...buildings];
  const group = new THREE.Group();
  const glow = { value: 0.55 };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(boxGeometry, buildingMaterial(glow), all.length);
  const styles = new Float32Array(all.length * 4);
  const tints = new Float32Array(all.length * 3);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const identity = new THREE.Quaternion();
  all.forEach((b, i) => {
    position.set((b.minX + b.maxX) / 2, b.minY, (b.minZ + b.maxZ) / 2);
    scale.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
    mesh.setMatrixAt(i, matrix.compose(position, identity, scale));
    styles.set([b.seed, b.style, b.lit, b.glass], i * 4);
    tints.set([b.tint.r, b.tint.g, b.tint.b], i * 3);
  });
  boxGeometry.setAttribute("aStyle", new THREE.InstancedBufferAttribute(styles, 4));
  boxGeometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 3));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  const unitGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const units = new THREE.InstancedMesh(
    unitGeometry,
    new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35 }),
    roofUnits.length,
  );
  const unitColors = ["#7d8286", "#9aa0a4", "#5c6064", "#b4b2ac"].map((c) => new THREE.Color(c));
  roofUnits.forEach((b, i) => {
    position.set((b.minX + b.maxX) / 2, b.minY, (b.minZ + b.maxZ) / 2);
    scale.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
    units.setMatrixAt(i, matrix.compose(position, identity, scale));
    units.setColorAt(i, unitColors[i % unitColors.length]!);
  });
  units.castShadow = true;
  units.receiveShadow = true;
  units.computeBoundingSphere();
  group.add(units);

  return {
    group,
    solids: all.map(({ minX, minY, minZ, maxX, maxY, maxZ }) => ({ minX, minY, minZ, maxX, maxY, maxZ })),
    beacons,
    windowGlow: glow,
    dispose() {
      boxGeometry.dispose();
      unitGeometry.dispose();
      mesh.material.dispose();
      units.material.dispose();
      mesh.dispose();
      units.dispose();
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
          const dx = Math.max(box.minX - p.x, 0, p.x - box.maxX);
          const dy = Math.max(box.minY - p.y, 0, p.y - box.maxY);
          const dz = Math.max(box.minZ - p.z, 0, p.z - box.maxZ);
          best = Math.min(best, Math.hypot(dx, dy, dz));
        }
      }
    }
    return best;
  }
}
