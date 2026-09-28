import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Beacon } from "./city";
import {
  BAY_WATER,
  CITY,
  NO_BRIDGE,
  PARK,
  PITCH,
  PLAZA,
  RIVER,
  ROAD_HALF,
  STREET_HALF,
  WATERFRONT,
  bridgeAvenues,
  inRect,
  mulberry32,
  overRiver,
} from "./layout";

export const SUN_DIRECTION = new THREE.Vector3(-0.83, 0.13, 0.54).normalize();
export const FOG_COLOR = new THREE.Color().setRGB(0.74, 0.6, 0.5, THREE.SRGBColorSpace);
export const FOG_DENSITY = 0.00038;

// -------------------------------------------------------------------------------------------------
// Glow sprites: street lamps, aviation beacons, car lights. One additive point cloud per kind.

const GLOW_VERTEX = /* glsl */ `
attribute vec3 color;
attribute float size;
attribute float phase;
uniform float uTime;
uniform float uScale;
uniform float uFogDensity;
varying vec3 vColor;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = -mv.z;
  float blink = phase < 0.0 ? 1.0 : pow(max(0.0, sin((uTime * 0.9 + phase) * 6.2832)), 12.0) * 1.4 + 0.08;
  float fog = exp(-uFogDensity * uFogDensity * depth * depth);
  float pixels = size * uScale / max(depth, 1.0);
  gl_PointSize = clamp(pixels, 1.6, 90.0);
  // Keep sub-pixel lights from vanishing: shrink energy instead of size.
  vColor = color * blink * fog * clamp(pixels / 1.6, 0.25, 1.0);
  vFade = fog;
}
`;

const GLOW_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vFade;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float core = exp(-r * 9.0);
  float halo = exp(-r * 2.6) * 0.35;
  gl_FragColor = vec4(vColor * (core + halo), 1.0);
}
`;

export function glowMaterial(uniforms: { uTime: { value: number }; uScale: { value: number } }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uFogDensity: { value: FOG_DENSITY } },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

function glowPoints(count: number, material: THREE.ShaderMaterial) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute("phase", new THREE.BufferAttribute(new Float32Array(count).fill(-1), 1));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

// -------------------------------------------------------------------------------------------------
// Ground: streets, sidewalks, markings, plazas and lawns drawn procedurally from world position.

const GROUND_FRAGMENT_HEAD = /* glsl */ `
varying vec3 vGPos;
uniform vec4 uPark;
uniform vec4 uPlaza;
float gHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
}
bool inZone(vec4 r, vec2 p) { return p.x > r.x && p.x < r.y && p.y > r.z && p.y < r.w; }
// Soft stripe: 1 inside |v| < w with antialiasing from the pixel footprint.
float band(float v, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(v)); }
`;

const GROUND_SURFACE = /* glsl */ `
{
  vec2 p = vGPos.xz;
  vec2 local = p - ${PITCH.toFixed(1)} * floor(p / ${PITCH.toFixed(1)} + 0.5);
  vec2 aa = max(fwidth(p), vec2(0.02));
  float detail = 1.0 - smoothstep(0.3, 1.2, max(aa.x, aa.y));
  vec2 dist = abs(local);
  bool roadX = dist.x < ${ROAD_HALF.toFixed(1)};
  bool roadZ = dist.y < ${ROAD_HALF.toFixed(1)};
  bool streetX = dist.x < ${STREET_HALF.toFixed(1)};
  bool streetZ = dist.y < ${STREET_HALF.toFixed(1)};
  float grain = gNoise(p * 0.7) * 0.5 + gNoise(p * 3.1) * 0.25 + gNoise(p * 0.05) * 0.5;
  vec3 asphalt = vec3(0.045, 0.046, 0.05) * (0.8 + 0.35 * grain);
  vec3 concrete = vec3(0.34, 0.32, 0.3) * (0.85 + 0.2 * grain);
  vec3 base = vec3(0.26, 0.25, 0.24) * (0.85 + 0.25 * grain);
  float rough = 0.9;
  vec3 lamp = vec3(0.0);

  if (inZone(uPark, p)) {
    vec3 grass = mix(vec3(0.07, 0.13, 0.035), vec3(0.13, 0.19, 0.05), gNoise(p * 0.08)) * (0.85 + 0.3 * gNoise(p * 1.7));
    float path = band(local.x, 2.2, aa.x) + band(local.y, 2.2, aa.y);
    base = mix(grass, vec3(0.42, 0.38, 0.32), clamp(path, 0.0, 1.0));
  } else if (inZone(uPlaza, p)) {
    vec2 tile = fract(p / 4.0);
    float joint = max(band(tile.x - 0.5, 0.49, aa.x / 4.0), band(tile.y - 0.5, 0.49, aa.y / 4.0));
    base = mix(vec3(0.44, 0.41, 0.37), vec3(0.5, 0.47, 0.42), gHash(floor(p / 4.0))) * mix(0.8, 1.0, joint);
    float ring = abs(length(p - vec2(-330.0, -550.0)) - 60.0);
    base = mix(base, vec3(0.28, 0.27, 0.26), band(ring, 1.2, aa.x));
    rough = 0.7;
  } else if (roadX || roadZ) {
    base = asphalt;
    rough = 0.85;
    float along = roadX && !roadZ ? p.y : p.x;
    float across = roadX && !roadZ ? local.x : local.y;
    bool intersection = roadX && roadZ;
    if (!intersection && !(streetX && streetZ)) {
      float yellow = band(abs(across) - 0.35, 0.12, aa.x);
      float dash = step(0.5, fract(along / 12.0));
      float lanes = band(abs(across) - 7.5, 0.12, aa.x) * dash;
      base = mix(base, vec3(0.55, 0.42, 0.1), yellow * detail);
      base = mix(base, vec3(0.62), lanes * detail);
    }
    // Zebra crossings just outside each intersection.
    float cross = 0.0;
    if (roadX && dist.y > ${ROAD_HALF.toFixed(1)} + 1.0 && dist.y < ${STREET_HALF.toFixed(1)}) cross = step(0.5, fract(local.x / 1.6));
    if (roadZ && dist.x > ${ROAD_HALF.toFixed(1)} + 1.0 && dist.x < ${STREET_HALF.toFixed(1)}) cross = step(0.5, fract(local.y / 1.6));
    base = mix(base, vec3(0.6), cross * detail);
  } else if (streetX || streetZ) {
    vec2 slab = fract(p / 2.5);
    float joint = max(band(slab.x - 0.5, 0.48, aa.x / 2.5), band(slab.y - 0.5, 0.48, aa.y / 2.5));
    base = concrete * mix(0.82, 1.0, mix(1.0, joint, detail));
  }

  // Warm pools under the street lamps that line every sidewalk.
  if ((streetX || streetZ) && !inZone(uPark, p) && !inZone(uPlaza, p)) {
    float glow = 0.0;
    for (int axis = 0; axis < 2; axis++) {
      float across = axis == 0 ? local.x : local.y;
      float along = axis == 0 ? p.y : p.x;
      float side = abs(abs(across) - 17.0);
      float step35 = along - 35.0 * floor(along / 35.0 + 0.5);
      glow += exp(-(side * side + step35 * step35) / 60.0);
    }
    lamp = vec3(1.0, 0.62, 0.3) * glow * 0.22;
  }
  diffuseColor.rgb = base;
  roughnessFactor = rough;
  totalEmissiveRadiance += lamp;
}
`;

function groundMaterial() {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPark = { value: new THREE.Vector4(PARK.x0, PARK.x1, PARK.z0, PARK.z1) };
    shader.uniforms.uPlaza = { value: new THREE.Vector4(PLAZA.x0, PLAZA.x1, PLAZA.z0, PLAZA.z1) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGPos;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${GROUND_FRAGMENT_HEAD}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${GROUND_SURFACE}`);
  };
  material.customProgramCacheKey = () => "skyline-ground";
  return material;
}

/** Tileable ripple normals for the water, drawn from a sum of sine waves. */
function waterNormals() {
  const size = 256;
  const heights = new Float32Array(size * size);
  const rand = mulberry32(7);
  const waves = Array.from({ length: 24 }, () => ({
    kx: Math.round((rand() - 0.5) * 16),
    ky: Math.round((rand() - 0.5) * 16),
    phase: rand() * Math.PI * 2,
  })).filter((w) => w.kx || w.ky);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0;
      for (const w of waves) {
        const k = Math.hypot(w.kx, w.ky);
        h += Math.sin(((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.phase) / k;
      }
      heights[y * size + x] = h;
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = heights[y * size + ((x + 1) % size)]! - heights[y * size + ((x - 1 + size) % size)]!;
      const dy = heights[((y + 1) % size) * size + x]! - heights[((y - 1 + size) % size) * size + x]!;
      const n = new THREE.Vector3(-dx * 0.9, -dy * 0.9, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Cut stone for the river walls and seawall, drawn on a canvas. */
function stoneTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(11);
  ctx.fillStyle = "#6d665d";
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 ? 32 : 0;
    for (let col = -1; col < 5; col++) {
      const shade = 88 + rand() * 40;
      ctx.fillStyle = `rgb(${shade + 10}, ${shade + 4}, ${shade - 6})`;
      ctx.fillRect(col * 64 + offset + 1.5, row * 32 + 1.5, 61, 29);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export interface World {
  group: THREE.Group;
  sky: Sky;
  sun: THREE.DirectionalLight;
  water: THREE.MeshStandardMaterial;
  glowUniforms: { uTime: { value: number }; uScale: { value: number } };
  bridgeSolids: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }[];
  update(time: number, dt: number): void;
  dispose(): void;
}

export function createWorld(beacons: Beacon[]): World {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T) => (disposables.push(item), item);
  const rand = mulberry32(4242);

  // Sky and clouds.
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity!.value = 5.5;
  skyUniforms.rayleigh!.value = 2.1;
  skyUniforms.mieCoefficient!.value = 0.0055;
  skyUniforms.mieDirectionalG!.value = 0.86;
  skyUniforms.sunPosition!.value.copy(SUN_DIRECTION);
  skyUniforms.cloudCoverage!.value = 0.38;
  skyUniforms.cloudDensity!.value = 0.55;
  skyUniforms.cloudElevation!.value = 0.55;
  skyUniforms.cloudScale!.value = 0.00018;
  group.add(sky);
  track(sky.geometry);
  track(sky.material);

  // Low golden sun with a blue sky fill.
  const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(1, 0.68, 0.42, THREE.SRGBColorSpace), 4.2);
  sun.castShadow = true;
  const extent = 260;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 2400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(
    new THREE.Color().setRGB(0.55, 0.62, 0.8, THREE.SRGBColorSpace),
    new THREE.Color().setRGB(0.36, 0.28, 0.22, THREE.SRGBColorSpace),
    0.55,
  );
  group.add(hemi);

  // Ground on both sides of the river.
  const ground = track(groundMaterial());
  const plane = (x0: number, x1: number, z0: number, z1: number) => {
    const geometry = track(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2));
    const mesh = new THREE.Mesh(geometry, ground);
    mesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  plane(-7000, 7000, -7000, RIVER.z0);
  plane(-7000, 7000, RIVER.z1, WATERFRONT);

  // Water: the river gorge far below the streets, and the bay beyond the seawall.
  const normals = track(waterNormals());
  normals.repeat.set(1 / 38, 1 / 38);
  const water = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.03, 0.075, 0.085, THREE.SRGBColorSpace),
      roughness: 0.06,
      metalness: 0.15,
      normalMap: normals,
      normalScale: new THREE.Vector2(0.32, 0.32),
      envMapIntensity: 1.25,
    }),
  );
  const waterPlane = (y: number, x0: number, x1: number, z0: number, z1: number) => {
    const geometry = track(new THREE.PlaneGeometry(x1 - x0, z1 - z0));
    // World-space UVs so the ripples keep their scale on every plane.
    const uv = geometry.attributes.uv!;
    const pos = geometry.attributes.position!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + (x0 + x1) / 2, pos.getY(i) - (z0 + z1) / 2);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, water);
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  waterPlane(RIVER.water, -7000, 7000, RIVER.z0, RIVER.z1);
  waterPlane(BAY_WATER, -9000, 9000, WATERFRONT, 9000);

  // Stone walls of the gorge and the seawall, with railings along the top.
  const stone = track(stoneTexture());
  const wallMaterial = track(new THREE.MeshStandardMaterial({ map: stone, roughness: 0.92 }));
  const wall = (x0: number, x1: number, z: number, y0: number, y1: number, facing: 1 | -1) => {
    const geometry = track(new THREE.PlaneGeometry(x1 - x0, y1 - y0));
    const uv = geometry.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / 16, (uv.getY(i) * (y1 - y0)) / 8);
    const mesh = new THREE.Mesh(geometry, wallMaterial);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    if (facing < 0) mesh.rotation.y = Math.PI;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  wall(-7000, 7000, RIVER.z0, RIVER.water - 1, 0, 1);
  wall(-7000, 7000, RIVER.z1, RIVER.water - 1, 0, -1);
  wall(-9000, 9000, WATERFRONT, BAY_WATER - 1, 0, 1);
  const railMaterial = track(new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.45, metalness: 0.6 }));
  for (const z of [RIVER.z0 + 0.4, RIVER.z1 - 0.4, WATERFRONT - 0.4]) {
    const rail = new THREE.Mesh(track(new THREE.BoxGeometry(14000, 0.12, 0.12)), railMaterial);
    rail.position.set(0, 1.1, z);
    group.add(rail);
  }

  // Bridges over the gorge on every avenue that crosses it.
  const bridgeSolids: World["bridgeSolids"] = [];
  const deckMaterial = track(new THREE.MeshStandardMaterial({ color: 0x8b857c, roughness: 0.8 }));
  const steelMaterial = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(0.36, 0.42, 0.44, THREE.SRGBColorSpace),
      roughness: 0.5,
      metalness: 0.5,
    }),
  );
  const span = RIVER.z1 - RIVER.z0 + 8;
  const deckGeometry = track(new THREE.BoxGeometry(26, 2.2, span));
  const girderGeometry = track(new THREE.BoxGeometry(1.4, 1.6, span));
  const archCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, -1, -span / 2 + 2),
    new THREE.Vector3(0, 30, 0),
    new THREE.Vector3(0, -1, span / 2 - 2),
  );
  const archGeometry = track(new THREE.TubeGeometry(archCurve, 40, 0.75, 8));
  const hangerGeometry = track(new THREE.CylinderGeometry(0.09, 0.09, 1, 5).translate(0, 0.5, 0));
  const zc = (RIVER.z0 + RIVER.z1) / 2;
  for (const x of bridgeAvenues()) {
    const deck = new THREE.Mesh(deckGeometry, deckMaterial);
    deck.position.set(x, -1.1, zc);
    deck.castShadow = deck.receiveShadow = true;
    group.add(deck);
    for (const side of [-1, 1]) {
      const girder = new THREE.Mesh(girderGeometry, steelMaterial);
      girder.position.set(x + side * 10, -2.4, zc);
      girder.castShadow = true;
      group.add(girder);
    }
    bridgeSolids.push({ minX: x - 13, maxX: x + 13, minY: -3.2, maxY: 1.4, minZ: RIVER.z0 - 4, maxZ: RIVER.z1 + 4 });
    // Every other bridge carries a tied arch overhead.
    if (Math.round(x / PITCH) % 2 === 0) {
      for (const side of [-1, 1]) {
        const arch = new THREE.Mesh(archGeometry, steelMaterial);
        arch.position.set(x + side * 12.2, 0, zc);
        arch.castShadow = true;
        group.add(arch);
        for (let k = 1; k < 10; k++) {
          const t = k / 10;
          const point = archCurve.getPoint(t);
          const hanger = new THREE.Mesh(hangerGeometry, steelMaterial);
          hanger.position.set(x + side * 12.2, 0.5, zc + point.z);
          hanger.scale.y = Math.max(0.1, point.y - 0.5);
          group.add(hanger);
        }
        bridgeSolids.push({
          minX: x + side * 12.2 - 1,
          maxX: x + side * 12.2 + 1,
          minY: 0,
          maxY: 15,
          minZ: RIVER.z0,
          maxZ: RIVER.z1,
        });
      }
    }
  }

  // Street lamps, aviation beacons and bridge lamps as glow sprites.
  const glowUniforms = { uTime: { value: 0 }, uScale: { value: 600 } };
  const glow = track(glowMaterial(glowUniforms));
  const lampSpots: number[] = [];
  const LAMP_REACH = 1700;
  for (let a = -LAMP_REACH; a <= LAMP_REACH; a += 35) {
    for (let k = Math.ceil(-LAMP_REACH / PITCH); k * PITCH <= LAMP_REACH; k++) {
      for (const side of [-17, 17]) {
        // Along avenues (constant x) and along streets (constant z).
        const ax = k * PITCH + side,
          az = a;
        if (!overRiver(az) && az < WATERFRONT - 2 && az > CITY.z0 && !inRect(PARK, ax, az) && !inRect(PLAZA, ax, az))
          lampSpots.push(ax, 8, az);
        const bx = a,
          bz = k * PITCH + side;
        if (!overRiver(bz) && bz < WATERFRONT && bz > CITY.z0 && !inRect(PARK, bx, bz) && !inRect(PLAZA, bx, bz))
          lampSpots.push(bx, 8, bz);
      }
    }
  }
  const lampCount = lampSpots.length / 3;
  const glowCount = lampCount + beacons.length;
  const lamps = glowPoints(glowCount, glow);
  {
    const position = lamps.geometry.attributes.position as THREE.BufferAttribute;
    const color = lamps.geometry.attributes.color as THREE.BufferAttribute;
    const size = lamps.geometry.attributes.size as THREE.BufferAttribute;
    const phase = lamps.geometry.attributes.phase as THREE.BufferAttribute;
    for (let i = 0; i < lampCount; i++) {
      position.setXYZ(i, lampSpots[i * 3]!, lampSpots[i * 3 + 1]!, lampSpots[i * 3 + 2]!);
      color.setXYZ(i, 2.4, 1.45, 0.72);
      size.setX(i, 2.4);
    }
    beacons.forEach((b, k) => {
      const i = lampCount + k;
      position.setXYZ(i, b.x, b.y, b.z);
      color.setXYZ(i, 6, 0.35, 0.2);
      size.setX(i, 4.5);
      phase.setX(i, b.phase);
    });
  }
  track(lamps.geometry);
  group.add(lamps);

  // Lamp posts, only near the middle of the city where they can be seen.
  const posts: THREE.Vector3[] = [];
  for (let i = 0; i < lampCount; i++) {
    const x = lampSpots[i * 3]!,
      z = lampSpots[i * 3 + 2]!;
    if (Math.abs(x) < 900 && z > -1000) posts.push(new THREE.Vector3(x, 0, z));
  }
  const postMesh = new THREE.InstancedMesh(
    track(new THREE.CylinderGeometry(0.12, 0.16, 8, 5).translate(0, 4, 0)),
    track(new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.5 })),
    posts.length,
  );
  const matrix = new THREE.Matrix4();
  posts.forEach((p, i) => postMesh.setMatrixAt(i, matrix.makeTranslation(p.x, 0, p.z)));
  group.add(postMesh);

  // Trees in the park and around the plaza.
  const trees: THREE.Vector3[] = [];
  for (let n = 0; n < 900 && trees.length < 420; n++) {
    const x = THREE.MathUtils.lerp(PARK.x0 + 6, PARK.x1 - 6, rand());
    const z = THREE.MathUtils.lerp(PARK.z0 + 6, PARK.z1 - 6, rand());
    const local = (v: number) => Math.abs(v - PITCH * Math.round(v / PITCH));
    if (local(x) < 5 || local(z) < 5) continue;
    trees.push(new THREE.Vector3(x, 0, z));
  }
  for (let n = 0; n < 60; n++) {
    const angle = (n / 60) * Math.PI * 2;
    trees.push(new THREE.Vector3(-330 + Math.cos(angle) * 72, 0, -550 + Math.sin(angle) * 72));
  }
  // Lumpy, smooth-shaded canopies: weld the icosphere so neighbouring faces share the jittered vertices.
  const canopyGeometry = track(
    mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute("normal").deleteAttribute("uv")),
  );
  {
    const pos = canopyGeometry.attributes.position!;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const lump = 0.88 + 0.12 * Math.sin(p.x * 5.1 + p.y * 3.7) * Math.cos(p.z * 4.3 - p.y * 2.9);
      pos.setXYZ(i, p.x * lump, p.y * lump * 0.9, p.z * lump);
    }
    canopyGeometry.computeVertexNormals();
  }
  const canopies = new THREE.InstancedMesh(
    canopyGeometry,
    track(new THREE.MeshStandardMaterial({ roughness: 0.95 })),
    trees.length,
  );
  const trunks = new THREE.InstancedMesh(
    track(new THREE.CylinderGeometry(0.25, 0.35, 1, 5).translate(0, 0.5, 0)),
    track(new THREE.MeshStandardMaterial({ color: 0x3d2c20, roughness: 1 })),
    trees.length,
  );
  const leaf = ["#3f5a22", "#4e6b2a", "#5b7430", "#6b7a2e", "#374f20"].map((c) => new THREE.Color(c));
  const q = new THREE.Quaternion();
  trees.forEach((t, i) => {
    const s = 3.2 + rand() * 2.4;
    const trunk = 2.2 + rand() * 1.5;
    trunks.setMatrixAt(i, matrix.compose(t, q, new THREE.Vector3(1, trunk + s * 0.5, 1)));
    canopies.setMatrixAt(
      i,
      matrix.compose(new THREE.Vector3(t.x, trunk + s * 0.85, t.z), q, new THREE.Vector3(s, s * 1.1, s)),
    );
    canopies.setColorAt(i, leaf[i % leaf.length]!);
  });
  canopies.castShadow = trunks.castShadow = true;
  canopies.receiveShadow = true;
  group.add(canopies, trunks);

  // Traffic: cars loop along the avenues and streets near the course with head and tail lights.
  interface Car {
    axis: 0 | 1;
    line: number;
    lane: number;
    pos: number;
    speed: number;
    min: number;
    max: number;
  }
  const cars: Car[] = [];
  const REACH = 1300;
  for (let k = Math.ceil(-REACH / PITCH); k * PITCH <= REACH; k++) {
    for (const axis of [0, 1] as const) {
      const line = k * PITCH;
      for (const lane of [-10.5, -4.5, 4.5, 10.5]) {
        const count = 5 + Math.floor(rand() * 6);
        for (let n = 0; n < count; n++) {
          const min = axis === 0 ? CITY.z0 * 0.5 : -REACH,
            max = axis === 0 ? WATERFRONT - 30 : REACH;
          cars.push({
            axis,
            line,
            lane,
            pos: THREE.MathUtils.lerp(min, max, rand()),
            speed: (9 + rand() * 7) * Math.sign(lane),
            min,
            max,
          });
        }
      }
    }
  }
  const carBodies = new THREE.InstancedMesh(
    track(new THREE.BoxGeometry(1.9, 1.4, 4.4).translate(0, 0.7, 0)),
    track(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.6 })),
    cars.length,
  );
  const paint = ["#e8e6e1", "#1d1f22", "#8d9196", "#7a1f1f", "#1f3350", "#c9c3b4", "#2f3d31"].map(
    (c) => new THREE.Color(c),
  );
  cars.forEach((_, i) => carBodies.setColorAt(i, paint[Math.floor(rand() * paint.length)]!));
  carBodies.castShadow = true;
  carBodies.frustumCulled = false;
  group.add(carBodies);
  const carLights = glowPoints(cars.length * 2, glow);
  {
    const color = carLights.geometry.attributes.color as THREE.BufferAttribute;
    const size = carLights.geometry.attributes.size as THREE.BufferAttribute;
    cars.forEach((_, i) => {
      color.setXYZ(i * 2, 3.2, 2.9, 2.4);
      color.setXYZ(i * 2 + 1, 2.6, 0.12, 0.08);
      size.setX(i * 2, 2.2);
      size.setX(i * 2 + 1, 1.6);
    });
  }
  track(carLights.geometry);
  group.add(carLights);

  // A few boats out on the bay.
  const hulls = new THREE.InstancedMesh(
    track(new THREE.BoxGeometry(5, 2.2, 16).translate(0, 1.1, 0)),
    track(new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.5 })),
    18,
  );
  for (let i = 0; i < 18; i++) {
    const x = (rand() - 0.5) * 2600,
      z = WATERFRONT + 200 + rand() * 1400;
    if (Math.abs(x) < 60) continue;
    hulls.setMatrixAt(
      i,
      matrix.compose(
        new THREE.Vector3(x, BAY_WATER - 0.6, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI),
        new THREE.Vector3(1, 1, 0.6 + rand()),
      ),
    );
  }
  hulls.castShadow = true;
  group.add(hulls);

  // Distant hills, drawn as haze-colored silhouettes behind everything.
  {
    const segments = 180;
    const positions: number[] = [];
    const colors: number[] = [];
    const near = new THREE.Color().setRGB(0.47, 0.42, 0.46, THREE.SRGBColorSpace);
    const far = FOG_COLOR.clone();
    const ridge = (a: number, layer: number) =>
      (Math.sin(a * 3 + layer) * 0.5 + Math.sin(a * 7.3 + layer * 2.1) * 0.3 + Math.sin(a * 17.1 + layer) * 0.15 + 1) *
      (layer ? 210 : 330);
    for (const [layer, radius] of [
      [0, 9000],
      [1, 7600],
    ] as const) {
      const tint = layer ? near : far.clone().lerp(near, 0.45);
      for (let s = 0; s < segments; s++) {
        const a0 = (s / segments) * Math.PI * 2,
          a1 = ((s + 1) / segments) * Math.PI * 2;
        // Leave the bay open to the south so the approach reads as sea.
        const open = (a: number) => (Math.sin(a) > 0.55 ? 0.12 : 1);
        const h0 = ridge(a0, layer) * open(a0),
          h1 = ridge(a1, layer) * open(a1);
        const p = (a: number, r: number, h: number) => [Math.cos(a) * r, h, Math.sin(a) * r];
        positions.push(
          ...p(a0, radius, -40),
          ...p(a1, radius, -40),
          ...p(a1, radius, h1),
          ...p(a0, radius, -40),
          ...p(a1, radius, h1),
          ...p(a0, radius, h0),
        );
        for (let v = 0; v < 6; v++) colors.push(tint.r, tint.g, tint.b);
      }
    }
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const hills = new THREE.Mesh(
      geometry,
      track(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })),
    );
    group.add(hills);
  }

  const carMatrix = new THREE.Matrix4();
  const carPosition = new THREE.Vector3();
  const carRotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const lightPositions = carLights.geometry.attributes.position as THREE.BufferAttribute;

  return {
    group,
    sky,
    sun,
    water,
    glowUniforms,
    bridgeSolids,
    update(time, dt) {
      glowUniforms.uTime.value = time;
      skyUniforms.time!.value = time;
      normals.offset.set(time * 0.012, time * 0.007);
      cars.forEach((car, i) => {
        car.pos += car.speed * dt;
        if (car.pos > car.max) car.pos = car.min;
        if (car.pos < car.min) car.pos = car.max;
        // Cars on avenues without bridges turn back at the river instead of driving into it.
        if (car.axis === 0 && overRiver(car.pos) && NO_BRIDGE.has(car.line))
          car.pos = car.speed > 0 ? RIVER.z1 + 1 : RIVER.z0 - 1;
        const dir = Math.sign(car.speed);
        const x = car.axis === 0 ? car.line + car.lane : car.pos;
        const z = car.axis === 0 ? car.pos : car.line - car.lane;
        // Park paths and the plaza are car-free; park those cars out of sight below the street.
        const hidden = inRect(PARK, x, z, 4) || inRect(PLAZA, x, z, 4) ? -60 : 0;
        carPosition.set(x, hidden, z);
        carRotation.setFromAxisAngle(
          up,
          car.axis === 0 ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2,
        );
        carBodies.setMatrixAt(i, carMatrix.compose(carPosition, carRotation, one));
        const fx = car.axis === 0 ? 0 : dir,
          fz = car.axis === 0 ? dir : 0;
        lightPositions.setXYZ(i * 2, x + fx * 2.3, 0.75 + hidden, z + fz * 2.3);
        lightPositions.setXYZ(i * 2 + 1, x - fx * 2.3, 0.85 + hidden, z - fz * 2.3);
      });
      carBodies.instanceMatrix.needsUpdate = true;
      lightPositions.needsUpdate = true;
    },
    dispose() {
      for (const item of disposables) item.dispose();
      for (const mesh of [postMesh, canopies, trunks, carBodies, hulls]) mesh.dispose();
    },
  };
}
