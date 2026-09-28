import * as THREE from "three";

const assetUrls = import.meta.glob<string>("./assets/*.webp", { eager: true, query: "?url", import: "default" });
const assetUrl = (name: string) => {
  const url = assetUrls[`./assets/${name}.webp`];
  if (!url) throw new Error(`Missing asset ${name}`);
  return url;
};

export type SurfaceName = "asphalt" | "pavers" | "brick" | "concrete" | "sandstone" | "grass";
export interface Surface {
  color: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
}
export type Surfaces = Record<SurfaceName, Surface>;

export function loadSurfaces(manager: THREE.LoadingManager, anisotropy: number): Surfaces {
  const loader = new THREE.TextureLoader(manager);
  const load = (name: string, color: boolean) => {
    const texture = loader.load(assetUrl(name));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const surface = (name: SurfaceName): Surface => ({
    color: load(`${name}-color`, true),
    normal: load(`${name}-normal`, false),
    rough: load(`${name}-rough`, false),
  });
  return {
    asphalt: surface("asphalt"),
    pavers: surface("pavers"),
    brick: surface("brick"),
    concrete: surface("concrete"),
    sandstone: surface("sandstone"),
    grass: surface("grass"),
  };
}

export const skyUrl = () => assetUrl("sky");

/** Standard material that tiles a scanned surface every `meters` of world-space UV. */
export function surfaceMaterial(surface: Surface, meters: number, params: THREE.MeshStandardMaterialParameters = {}) {
  const repeat = (texture: THREE.Texture) => {
    const clone = texture.clone();
    clone.repeat.set(1 / meters, 1 / meters);
    return clone;
  };
  return new THREE.MeshStandardMaterial({
    map: repeat(surface.color),
    normalMap: repeat(surface.normal),
    roughnessMap: repeat(surface.rough),
    vertexColors: true,
    ...params,
  });
}

export const FacadeKind = { Punched: 0, Ribbon: 1, Curtain: 2, Shop: 3 } as const;
export type FacadeKind = (typeof FacadeKind)[keyof typeof FacadeKind];

export interface FacadeStyle {
  kind: FacadeKind;
  bay: number;
  floor: number;
  /** Window rectangle within one bay × floor cell, in meters: x0, y0, x1, y1. */
  window: [number, number, number, number];
  frame: number;
  frameColor: number;
  frameMetal: number;
  glassColor: number;
  glassMetal: number;
  mullions: number;
  transom: boolean;
  trim: number | null;
  roomBays: number;
  roomDepth: number;
  interior: number;
  wall: { surface: SurfaceName; meters: number } | null;
  wallColor: number;
  wallRoughness?: number;
  wallMetalness?: number;
}

export const FACADES = {
  brick: {
    kind: FacadeKind.Punched,
    bay: 3,
    floor: 3.3,
    window: [0.85, 0.95, 2.15, 2.75],
    frame: 0.075,
    frameColor: 0xe9e5dc,
    frameMetal: 0,
    glassColor: 0x07090b,
    glassMetal: 0,
    mullions: 2,
    transom: true,
    trim: 0xcfc3ad,
    roomBays: 1,
    roomDepth: 5,
    interior: 0.15,
    wall: { surface: "brick", meters: 2.2 },
    wallColor: 0xffffff,
  },
  sandstone: {
    kind: FacadeKind.Punched,
    bay: 3.6,
    floor: 3.9,
    window: [1.0, 0.9, 2.6, 3.3],
    frame: 0.08,
    frameColor: 0x2d2822,
    frameMetal: 0.4,
    glassColor: 0x06080a,
    glassMetal: 0,
    mullions: 2,
    transom: true,
    trim: null,
    roomBays: 1,
    roomDepth: 6,
    interior: 0.14,
    wall: { surface: "sandstone", meters: 2.4 },
    wallColor: 0xffffff,
  },
  plaster: {
    kind: FacadeKind.Punched,
    bay: 3.2,
    floor: 3.1,
    window: [0.65, 0.85, 2.55, 2.55],
    frame: 0.06,
    frameColor: 0xd9dcdd,
    frameMetal: 0.5,
    glassColor: 0x06080a,
    glassMetal: 0,
    mullions: 3,
    transom: false,
    trim: 0xe3dccd,
    roomBays: 1,
    roomDepth: 4.5,
    interior: 0.16,
    wall: { surface: "concrete", meters: 3 },
    wallColor: 0xffffff,
  },
  ribbon: {
    kind: FacadeKind.Ribbon,
    bay: 3,
    floor: 3.6,
    window: [0, 1.0, 3, 3.15],
    frame: 0.05,
    frameColor: 0x303438,
    frameMetal: 0.7,
    glassColor: 0x6a7a82,
    glassMetal: 0.55,
    mullions: 1,
    transom: false,
    trim: null,
    roomBays: 3,
    roomDepth: 8,
    interior: 0.1,
    wall: { surface: "concrete", meters: 3.5 },
    wallColor: 0xffffff,
  },
  curtain: {
    kind: FacadeKind.Curtain,
    bay: 1.6,
    floor: 3.9,
    window: [0, 0.75, 1.6, 3.2],
    frame: 0.035,
    frameColor: 0xa9afb4,
    frameMetal: 0.85,
    glassColor: 0x5d7680,
    glassMetal: 0.75,
    mullions: 1,
    transom: false,
    trim: null,
    roomBays: 4,
    roomDepth: 10,
    interior: 0.07,
    wall: null,
    wallColor: 0x22303a,
    wallRoughness: 0.14,
    wallMetalness: 0.7,
  },
  shop: {
    kind: FacadeKind.Shop,
    bay: 4.2,
    floor: 4.8,
    window: [0.3, 0.5, 3.9, 3.55],
    frame: 0.06,
    frameColor: 0x1c1d1f,
    frameMetal: 0.6,
    glassColor: 0x06080a,
    glassMetal: 0,
    mullions: 2,
    transom: false,
    trim: null,
    roomBays: 3,
    roomDepth: 11,
    interior: 0.22,
    wall: { surface: "sandstone", meters: 2.4 },
    wallColor: 0xffffff,
  },
} satisfies Record<string, FacadeStyle>;

export type FacadeName = keyof typeof FACADES;

const glsl = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const vec3 = (hex: number) => {
  const c = new THREE.Color(hex);
  return `vec3(${glsl(c.r)}, ${glsl(c.g)}, ${glsl(c.b)})`;
};

/**
 * Facade material: the scanned wall surface plus procedurally drawn windows with
 * interior mapping, so every window shows a lit room with depth behind glass.
 */
export function facadeMaterial(name: FacadeName, surfaces: Surfaces) {
  const style: FacadeStyle = FACADES[name];
  const [wx0, wy0, wx1, wy1] = style.window;
  const cellArea = style.bay * style.floor;
  const coverGlass = (((wx1 - wx0) * (wy1 - wy0)) / cellArea) * 0.9;
  const coverFrame = ((wx1 - wx0 + 2 * style.frame) * (wy1 - wy0 + 2 * style.frame)) / cellArea - coverGlass;

  const params: THREE.MeshStandardMaterialParameters = {
    color: style.wallColor,
    roughness: style.wallRoughness ?? 1,
    metalness: style.wallMetalness ?? 0,
    vertexColors: true,
  };
  if (style.wall) {
    const surface = surfaces[style.wall.surface];
    const repeat = (texture: THREE.Texture) => {
      const clone = texture.clone();
      clone.repeat.set(style.bay / style.wall!.meters, style.floor / style.wall!.meters);
      return clone;
    };
    Object.assign(params, {
      map: repeat(surface.color),
      normalMap: repeat(surface.normal),
      roughnessMap: repeat(surface.rough),
    });
  }
  const material = new THREE.MeshStandardMaterial(params);

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float seed;
varying vec2 vBay;
varying vec3 vWPos;
varying vec3 vWNormal;
varying float vSeed;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vBay = uv;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNormal = normalize(mat3(modelMatrix) * objectNormal);
vSeed = seed;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vBay;
varying vec3 vWPos;
varying vec3 vWNormal;
varying float vSeed;

const vec2 CELL = vec2(${glsl(style.bay)}, ${glsl(style.floor)});
const vec4 WIN = vec4(${glsl(wx0)}, ${glsl(wy0)}, ${glsl(wx1)}, ${glsl(wy1)});
const float FRAME = ${glsl(style.frame)};
const float ROOM_BAYS = ${glsl(style.roomBays)};
const float ROOM_DEPTH = ${glsl(style.roomDepth)};

float fhash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float fbox(vec2 p, vec4 r, float e) {
  vec2 a = smoothstep(r.xy - e, r.xy + e, p);
  vec2 b = 1.0 - smoothstep(r.zw - e, r.zw + e, p);
  return a.x * a.y * b.x * b.y;
}

struct FacadeSample { float glass; float frame; float trim; float grime; vec3 interior; };

vec3 roomPalette(float h) {
  if (h < 0.25) return vec3(0.82, 0.8, 0.75);
  if (h < 0.45) return vec3(0.9, 0.88, 0.84);
  if (h < 0.6) return vec3(0.74, 0.77, 0.78);
  if (h < 0.75) return vec3(0.84, 0.76, 0.64);
  if (h < 0.88) return vec3(0.62, 0.68, 0.64);
  return vec3(0.9, 0.85, 0.78);
}

FacadeSample facadeSample() {
  FacadeSample s;
  vec2 cell = floor(vBay);
  vec2 m = fract(vBay) * CELL;
  vec2 px = fwidth(vBay) * CELL;
  float e = max(max(px.x, px.y), 0.002);
  float far = smoothstep(0.07, 0.2, e / min(CELL.x, CELL.y));

  float glass = fbox(m, WIN, e);
  float outer = fbox(m, WIN + vec4(-FRAME, -FRAME, FRAME, FRAME), e);
  float bars = 0.0;
  for (int i = 1; i < ${Math.max(style.mullions, 1)}; i++) {
    float x = mix(WIN.x, WIN.z, float(i) / ${glsl(style.mullions)});
    bars = max(bars, 1.0 - smoothstep(FRAME * 0.5 - e, FRAME * 0.5 + e, abs(m.x - x)));
  }
  ${style.transom ? "bars = max(bars, 1.0 - smoothstep(FRAME * 0.5 - e, FRAME * 0.5 + e, abs(m.y - mix(WIN.y, WIN.w, 0.74))));" : ""}
  s.frame = max(outer - glass, glass * bars);
  s.glass = glass * (1.0 - bars);
  s.trim = 0.0;
  ${style.trim === null ? "" : `s.trim = max(fbox(m, vec4(WIN.x - 0.1, WIN.y - FRAME - 0.12, WIN.z + 0.1, WIN.y - FRAME), e), fbox(m, vec4(WIN.x - 0.06, WIN.w + FRAME, WIN.z + 0.06, WIN.w + FRAME + 0.26), e));`}
  float under = step(WIN.x, m.x) * step(m.x, WIN.z) * step(m.y, WIN.y);
  s.grime = under * (1.0 - m.y / WIN.y) * (0.35 + 0.65 * fhash(vec2(floor(m.x * 7.0), cell.x + cell.y * 17.0 + vSeed))) * 0.8;
  s.grime += (1.0 - smoothstep(0.0, 2.5, vWPos.y)) * 0.35;

  // Interior mapping: trace the view ray into a box-shaped room behind the glass.
  vec3 n = normalize(vWNormal);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), n));
  vec3 view = normalize(vWPos - cameraPosition);
  vec3 d = vec3(dot(view, r), view.y, max(-dot(view, n), 0.02));
  d.x = abs(d.x) < 1e-4 ? 1e-4 : d.x;
  d.y = abs(d.y) < 1e-4 ? 1e-4 : d.y;
  vec2 room = vec2(floor(vBay.x / ROOM_BAYS), cell.y);
  float roomWidth = CELL.x * ROOM_BAYS;
  vec3 p = vec3(mod(vBay.x, ROOM_BAYS) * CELL.x, m.y, 0.0);
  float h1 = fhash(room + vSeed * 17.13);
  float h2 = fhash(room.yx * 1.7 + vSeed * 3.71 + 11.0);
  float h3 = fhash(room * 2.3 + vSeed * 7.9 + 5.0);
  float h4 = fhash(room.yx * 3.1 + vSeed * 1.3 + 23.0);
  float depth = ROOM_DEPTH * (0.7 + 0.6 * h2);
  float tx = ((d.x > 0.0 ? roomWidth : 0.0) - p.x) / d.x;
  float ty = ((d.y > 0.0 ? CELL.y : 0.0) - p.y) / d.y;
  float tz = depth / d.z;
  float t = min(min(tx, ty), tz);
  vec3 hit = p + d * t;
  vec3 wallTone = roomPalette(h1);
  float lit = step(0.3, h3);
  vec3 col;
  if (t == tz) {
    col = wallTone * 0.9;
    col *= 0.85 + 0.15 * step(0.5, fract(hit.x / roomWidth * 2.0 + h4));
    ${
      style.kind === FacadeKind.Shop
        ? `// Stocked shelves along the back wall.
    float shelf = fract(hit.y / 0.42);
    vec2 slot = vec2(floor(hit.x / 0.28), floor(hit.y / 0.42));
    vec3 goods = 0.35 + 0.6 * vec3(fhash(slot + h1), fhash(slot + h2 + 3.0), fhash(slot + h3 + 7.0));
    if (hit.y > 0.3 && hit.y < 2.3) col = shelf < 0.12 ? vec3(0.3) : mix(vec3(0.55), goods, 0.45) * (0.55 + 0.45 * step(0.25, fhash(slot * 1.7 + h4)));`
        : ""
    }
  } else if (t == tx) {
    col = wallTone * 0.72;
  } else if (d.y < 0.0) {
    col = h2 > 0.5 ? vec3(0.42, 0.29, 0.19) : vec3(0.36, 0.36, 0.37);
    col *= 0.85 + 0.15 * step(0.5, fract(hit.x * 1.3));
  } else {
    col = vec3(0.92, 0.92, 0.9);
    vec2 panel = abs(fract(hit.xz / vec2(2.4, 2.4)) - 0.5);
    col += lit * ${style.kind === FacadeKind.Shop ? "1.4" : "0.55"} * step(panel.x, 0.14) * step(panel.y, 0.3);
  }
  col *= mix(1.0, 0.38, clamp(hit.z / depth, 0.0, 1.0));
  col *= mix(0.55, 1.0, lit);

  // A piece of furniture or a partition at some depth.
  float zf = depth * (0.25 + 0.4 * h4);
  float tf = zf / d.z;
  vec3 hf = p + d * tf;
  float fx0 = roomWidth * (0.1 + 0.4 * h1);
  float fx1 = fx0 + roomWidth * (0.25 + 0.3 * h3);
  float fh = mix(0.75, 1.9, h2);
  if (tf < t && hf.y < fh && hf.x > fx0 && hf.x < fx1) {
    col = (h3 > 0.6 ? vec3(0.12, 0.1, 0.09) : vec3(0.3, 0.28, 0.26)) * mix(1.0, 0.5, zf / depth);
  }

  // Window blinds, lit from the street.
  float blind = ${style.kind === FacadeKind.Shop ? "0.0" : "h4 < 0.4 ? 0.0 : (h4 - 0.4) / 0.6 * 0.85"};
  if (m.y > WIN.w - blind * (WIN.w - WIN.y)) {
    col = mix(vec3(0.78, 0.74, 0.66), vec3(0.86), h1) * (0.8 + 0.2 * step(0.35, fract(m.y * 22.0))) * 0.9;
  }
  ${style.kind === 0 ? "col *= mix(0.45, 1.0, smoothstep(0.0, 0.3, WIN.w - m.y)) * mix(0.7, 1.0, smoothstep(0.0, 0.18, m.x - WIN.x));" : ""}
  float fresnel = pow(1.0 - clamp(d.z, 0.0, 1.0), 5.0);
  s.interior = col * ${glsl(style.interior)} * (1.0 - 0.95 * fresnel) * smoothstep(0.02, 0.25, d.z);

  s.glass = mix(s.glass, ${glsl(coverGlass)}, far);
  s.frame = mix(s.frame, ${glsl(coverFrame)}, far);
  s.trim *= 1.0 - far;
  s.interior = mix(s.interior, vec3(0.5, 0.48, 0.45) * ${glsl(style.interior * 0.55)}, far);
  return s;
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
FacadeSample facade = facadeSample();
vec3 glassTone = ${vec3(style.glassColor)}${style.kind === FacadeKind.Curtain ? " * vColor.rgb * 1.6" : ""};
diffuseColor.rgb *= 1.0 - facade.grime * 0.35;
diffuseColor.rgb = mix(diffuseColor.rgb, ${style.trim === null ? "vec3(0.0)" : vec3(style.trim)}, facade.trim);
diffuseColor.rgb = mix(diffuseColor.rgb, ${vec3(style.frameColor)}, facade.frame);
diffuseColor.rgb = mix(diffuseColor.rgb, glassTone, facade.glass);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.85, facade.trim);
roughnessFactor = mix(roughnessFactor, 0.4, facade.frame);
roughnessFactor = mix(roughnessFactor, 0.03, facade.glass);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.0, facade.trim);
metalnessFactor = mix(metalnessFactor, ${glsl(style.frameMetal)}, facade.frame);
metalnessFactor = mix(metalnessFactor, ${glsl(style.glassMetal)}, facade.glass);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
normal = normalize(mix(normal, normalize(vNormal) * faceDirection, max(facade.glass, max(facade.frame, facade.trim))));`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += facade.interior * facade.glass * (1.0 - ${glsl(style.glassMetal * 0.6)});`,
      );
  };
  material.customProgramCacheKey = () => `facade-${name}`;
  return material;
}
