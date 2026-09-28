import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { Water } from "three/addons/objects/Water2.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { rockShader, barkShader, groundShader, grassWindShader, type ShaderPatch } from "./shaders";

export const HALF_WIDTH = 7;
export const GOAL = 200;
const START_Z = 40;
const END_Z = -760;
const NEAR_EDGE = 400;
const CHUNK = 40;
const SUN_DIRECTION = new THREE.Vector3(0.38, 0.52, -0.76).normalize();

export type Model = { geometry: THREE.BufferGeometry; material: THREE.Material; radius: number };
export type World = Awaited<ReturnType<typeof createWorld>>;

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const lattice = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = THREE.MathUtils.lerp(lattice(ix, iy), lattice(ix + 1, iy), sx);
  const bottom = THREE.MathUtils.lerp(lattice(ix, iy + 1), lattice(ix + 1, iy + 1), sx);
  return THREE.MathUtils.lerp(top, bottom, sy) * 2 - 1;
}

const fbm = (x: number, y: number) =>
  noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15;

function ridged(x: number, y: number) {
  let value = 0;
  let amplitude = 0.5;
  let weight = 1;
  for (let octave = 0; octave < 5; octave++) {
    const ridge = (1 - Math.abs(noise(x, y))) ** 2 * weight;
    weight = THREE.MathUtils.clamp(ridge * 1.6, 0, 1);
    value += ridge * amplitude;
    x = x * 2.03 + 13.7;
    y = y * 2.03 + 7.1;
    amplitude *= 0.5;
  }
  return value;
}

// Alpine ranges on both sides of the valley and a ridge closing it off far upstream.
function mountainHeight(x: number, z: number) {
  const side = smoothstep(220, 2300, Math.abs(x) + fbm(x * 0.0015, z * 0.0015) * 300);
  const ends = Math.max(smoothstep(-1300, -4200, z), smoothstep(900, 2400, z));
  const mask = Math.max(side, ends);
  if (mask === 0) return 0;
  return mask * (120 + 1800 * ridged(x * 0.0004 + 3.1, z * 0.0004 + 1.7)) + fbm(x * 0.003, z * 0.003) * 60 * mask;
}

export function terrainHeight(x: number, z: number) {
  const ax = Math.abs(x);
  const ends =
    smoothstep(START_Z - 25, START_Z, z) * 14 +
    smoothstep(-590, -760, z) * (40 + fbm(x * 0.02, z * 0.02) * 12) * (1 - smoothstep(250, 600, ax));
  if (ax < HALF_WIDTH) {
    const t = ax / HALF_WIDTH;
    return -0.25 - 2 * (1 - t * t) + fbm(x * 0.4, z * 0.4) * 0.2 * (1 - t * t) + mountainHeight(x, z) + ends;
  }
  const bank = ax - HALF_WIDTH;
  return (
    -0.25 +
    smoothstep(0, 3.5, bank) * 1.3 +
    fbm(x * 0.5, z * 0.5) * 0.18 * smoothstep(0, 2, bank) +
    fbm(x * 0.04, z * 0.04) * 2.5 * smoothstep(4, 20, bank) +
    smoothstep(22, 75, bank) * (9 + fbm(x * 0.015, z * 0.015) * 10) +
    mountainHeight(x, z) +
    ends
  );
}

const shoreWeight = (x: number, z: number) =>
  1 - smoothstep(2.2, 4.5, Math.abs(x) - HALF_WIDTH + fbm(x * 0.15, z * 0.15) * 1.8);

function range(from: number, to: number, step: number) {
  const values: number[] = [];
  for (let value = from; value < to - 1e-6; value += step) values.push(value);
  values.push(to);
  return values;
}

function gridGeometry(
  xs: number[],
  zs: number[],
  vertex: (x: number, z: number) => { y: number; color?: THREE.Color; shore?: number },
) {
  const positions: number[] = [];
  const colors: number[] = [];
  const shore: number[] = [];
  const indices: number[] = [];
  for (const z of zs) {
    for (const x of xs) {
      const data = vertex(x, z);
      positions.push(x, data.y, z);
      if (data.color) colors.push(data.color.r, data.color.g, data.color.b);
      if (data.shore !== undefined) shore.push(data.shore);
    }
  }
  for (let row = 0; row < zs.length - 1; row++) {
    for (let col = 0; col < xs.length - 1; col++) {
      const a = row * xs.length + col;
      const b = a + xs.length;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (colors.length) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (shore.length) geometry.setAttribute("shore", new THREE.Float32BufferAttribute(shore, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function patch(
  material: THREE.MeshStandardMaterial,
  key: string,
  shader: ShaderPatch,
  uniforms: Record<string, THREE.IUniform> = {},
) {
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (program) => {
    Object.assign(program.uniforms, uniforms);
    program.vertexShader = program.vertexShader
      .replace("#include <common>", `#include <common>\n${shader.vertexHead ?? ""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${shader.afterBegin ?? ""}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\n${shader.afterProject ?? ""}`);
    program.fragmentShader = program.fragmentShader
      .replace("#include <common>", `#include <common>\n${shader.fragmentHead ?? ""}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${shader.afterMap ?? ""}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${shader.afterRoughness ?? ""}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${shader.afterNormal ?? ""}`);
  };
  return material;
}

// A tileable ripple normal map built from integer-frequency waves.
function waterNormalMap(seed: number) {
  const size = 256;
  const waves = Array.from({ length: 48 }, (_, i) => {
    const angle = lattice(seed, i) * Math.PI * 2;
    const frequency = 2 + Math.floor(lattice(i, seed) * 14);
    return {
      kx: Math.round(Math.cos(angle) * frequency),
      ky: Math.round(Math.sin(angle) * frequency),
      phase: lattice(seed + 3, i + 7) * Math.PI * 2,
      amplitude: 1 / frequency ** 1.3,
    };
  });
  const data = new Uint8Array(size * size * 4);
  const normal = new THREE.Vector3();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const wave of waves) {
        const angle = ((wave.kx * x + wave.ky * y) / size) * Math.PI * 2 + wave.phase;
        const slope = Math.cos(angle) * wave.amplitude * Math.PI * 2;
        dx += slope * wave.kx;
        dy += slope * wave.ky;
      }
      normal.set(-dx * 0.012, -dy * 0.012, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (normal.x * 0.5 + 0.5) * 255;
      data[i + 1] = (normal.y * 0.5 + 0.5) * 255;
      data[i + 2] = (normal.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function rockGeometry(seed: number) {
  const base = new THREE.IcosahedronGeometry(1, 4);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  const geometry = mergeVertices(base);
  base.dispose();
  const position = geometry.getAttribute("position");
  const point = new THREE.Vector3();
  const stretch = new THREE.Vector3(
    1 + lattice(seed, 1) * 0.6,
    0.55 + lattice(seed, 2) * 0.3,
    0.8 + lattice(seed, 3) * 0.5,
  );
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const nx = point.x * 1.6 + seed * 7.3;
    const ny = point.y * 1.6 - seed * 3.1;
    const nz = point.z * 1.6;
    const lumps = fbm(nx + nz * 0.7, ny - nz * 0.4) * 0.28;
    const facets = Math.max(0, noise(nx * 2.3 + 5, ny * 2.3 - nz)) * 0.18;
    point.multiplyScalar(1 + lumps - facets).multiply(stretch);
    if (point.y < -0.25) point.y = -0.25 + (point.y + 0.25) * 0.35;
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  return { geometry, radius: (size.x + size.z) / 4 };
}

function logGeometry() {
  const trunk = new THREE.CylinderGeometry(0.34, 0.4, 4, 18, 30, false);
  trunk.rotateZ(Math.PI / 2);
  const position = trunk.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (Math.hypot(y, z) < 0.01) continue;
    const angle = Math.atan2(z, y);
    const bumps = 1 + noise(x * 1.2, angle * 1.5) * 0.12 + noise(x * 6, angle * 4) * 0.03;
    position.setXYZ(i, x, y * bumps + Math.sin(x * 0.6) * 0.08, z * bumps);
  }
  const branch = (
    length: number,
    radius: number,
    rotateZ: number,
    rotateX: number,
    offset: [number, number, number],
  ) => {
    const stub = new THREE.CylinderGeometry(radius * 0.4, radius, length, 8, 1);
    stub.translate(0, length / 2, 0);
    stub.rotateZ(rotateZ);
    stub.rotateX(rotateX);
    stub.translate(...offset);
    return stub;
  };
  const parts = [
    trunk,
    branch(0.7, 0.14, -0.7, 0.5, [0.8, 0.25, 0.05]),
    branch(0.5, 0.11, 0.9, -1.2, [-1.1, 0.1, -0.2]),
  ];
  const geometry = mergeGeometries(parts.map((part) => part.toNonIndexed()))!;
  geometry.deleteAttribute("uv");
  geometry.computeVertexNormals();
  for (const part of parts) part.dispose();
  return geometry;
}

function coloured(geometry: THREE.BufferGeometry, color: (x: number, y: number, z: number) => THREE.Color) {
  geometry.computeVertexNormals();
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = flat.getAttribute("position");
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const c = color(position.getX(i), position.getY(i), position.getZ(i));
    colors.push(c.r, c.g, c.b);
  }
  flat.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  flat.deleteAttribute("uv");
  return flat;
}

function coniferGeometry(seed: number, tiers: number, radialSegments: number, heightSegments: number) {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.05, 0.12, 1.2, Math.min(6, radialSegments), 1);
  trunk.translate(0, 0.6, 0);
  parts.push(coloured(trunk, () => srgb(0.24, 0.17, 0.12)));
  trunk.dispose();
  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1);
    const radius = THREE.MathUtils.lerp(1.1, 0.18, t ** 0.9) * (0.85 + lattice(seed, tier) * 0.3);
    const height = THREE.MathUtils.lerp(1.1, 0.6, t);
    const cone = new THREE.ConeGeometry(radius, height, radialSegments, heightSegments, true);
    const position = cone.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const rim = 0.5 - y / height;
      const angle = Math.atan2(position.getZ(i), position.getX(i));
      const jitter =
        1 + (noise(angle * 2.5 + seed * 3, tier * 1.7) * 0.35 + (lattice(i + seed, tier) - 0.5) * 0.3) * rim;
      const droop = -rim * rim * (0.2 + lattice(i * 7 + tier, seed) * 0.25);
      position.setXYZ(i, position.getX(i) * jitter, y + droop, position.getZ(i) * jitter);
    }
    cone.rotateY(lattice(seed, tier + 9) * Math.PI);
    cone.translate(0, 0.8 + t * 4.1, 0);
    const shade = 0.8 + lattice(seed + tier, 4) * 0.35;
    const foliage = coloured(cone, (x, y, z) => {
      const outer = Math.min(1, Math.hypot(x, z) / 1.1);
      return srgb(0.09 * shade, (0.16 + outer * 0.06 + y * 0.004) * shade, 0.09 * shade);
    });
    const vertices = foliage.getAttribute("position");
    const normals = foliage.getAttribute("normal");
    const direction = new THREE.Vector3();
    for (let i = 0; i < vertices.count; i++) {
      direction.set(vertices.getX(i), 0.45 + (vertices.getY(i) - 2.5) * 0.08, vertices.getZ(i)).normalize();
      normals.setXYZ(i, direction.x, direction.y, direction.z);
    }
    parts.push(foliage);
    cone.dispose();
  }
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

function grassTuftGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const segments = 3;
  const root = srgb(0.1, 0.14, 0.05);
  for (let blade = 0; blade < 11; blade++) {
    const r = lattice(blade, 1) * 0.14;
    const a = lattice(blade, 2) * Math.PI * 2;
    const baseX = Math.cos(a) * r;
    const baseZ = Math.sin(a) * r;
    const height = 0.22 + lattice(blade, 3) * 0.3;
    const width = 0.012 + lattice(blade, 4) * 0.01;
    const facing = lattice(blade, 5) * Math.PI;
    const lean = (lattice(blade, 6) - 0.3) * 0.25;
    const tip = lattice(blade, 7) > 0.82 ? srgb(0.55, 0.5, 0.3) : srgb(0.3 + lattice(blade, 8) * 0.12, 0.44, 0.15);
    const point = (t: number, side: number) => {
      const w = width * (1 - t) * side;
      const bend = lean * t * t;
      return [
        baseX + Math.cos(facing) * w + Math.cos(a) * bend,
        height * t,
        baseZ + Math.sin(facing) * w + Math.sin(a) * bend,
      ];
    };
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      const corners: [number, number][] = [
        [t0, -1],
        [t0, 1],
        [t1, 1],
        [t0, -1],
        [t1, 1],
        [t1, -1],
      ];
      for (const [t, side] of corners) {
        positions.push(...point(t, side));
        const c = root.clone().lerp(tip, t);
        colors.push(c.r, c.g, c.b);
        normals.push(0, 1, 0);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function mountainColor(x: number, z: number, y: number, slope: number) {
  const treeline = 950 + fbm(x * 0.004, z * 0.004) * 180;
  const snowline = 1450 + fbm(x * 0.003 + 9, z * 0.003) * 200;
  const variation = 0.85 + fbm(x * 0.02, z * 0.02) * 0.25;
  const color = srgb(0.36, 0.42, 0.2).lerp(
    srgb(0.1, 0.16, 0.09),
    smoothstep(25, 60, y) * smoothstep(-0.2, 0.3, fbm(x * 0.01, z * 0.01) + 0.25),
  );
  color.lerp(
    srgb(0.42, 0.4, 0.37),
    Math.max(smoothstep(treeline - 120, treeline + 120, y), smoothstep(0.75, 0.95, slope)),
  );
  color.multiplyScalar(variation);
  color.lerp(srgb(0.92, 0.94, 0.97), smoothstep(snowline - 60, snowline + 60, y) * (1 - smoothstep(0.62, 0.8, slope)));
  return color;
}

// Renders the sky shader (with its clouds) once into a cube map for the background and lighting.
function createSky(renderer: THREE.WebGLRenderer) {
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const uniforms = sky.material.uniforms;
  uniforms.turbidity!.value = 3.2;
  uniforms.rayleigh!.value = 1.1;
  uniforms.mieCoefficient!.value = 0.004;
  uniforms.mieDirectionalG!.value = 0.82;
  uniforms.sunPosition!.value.copy(SUN_DIRECTION);
  uniforms.cloudCoverage!.value = 0.38;
  uniforms.cloudDensity!.value = 0.55;
  uniforms.cloudElevation!.value = 0.55;
  const skyScene = new THREE.Scene();
  skyScene.add(sky);
  const background = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(1, 2000, background).update(renderer, skyScene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(skyScene, 0, 1, 2000);
  pmrem.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  return { background, environment };
}

export async function createWorld(renderer: THREE.WebGLRenderer, onProgress: (ratio: number) => void) {
  const step = async (ratio: number) => {
    onProgress(ratio);
    await new Promise((resolve) => setTimeout(resolve));
  };
  const time = { value: 0 };
  const scene = new THREE.Scene();
  const sky = createSky(renderer);
  scene.background = sky.background.texture;
  scene.backgroundIntensity = 0.45;
  scene.environment = sky.environment.texture;
  scene.environmentIntensity = 0.22;
  scene.fog = new THREE.Fog("#b9c7d2", 80, 9500);

  const sun = new THREE.DirectionalLight("#fff0d8", 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  await step(0.2);

  const groundMaterial = patch(
    new THREE.MeshPhysicalMaterial({ roughness: 1, specularIntensity: 0.3 }),
    "river-ground",
    groundShader,
  );
  const zs = range(END_Z, START_Z, 1.5).reverse();
  const outer = [
    ...range(HALF_WIDTH + 0.5, 14, 0.5),
    ...range(15, 30, 1.5),
    ...range(34, 110, 6),
    ...range(116, NEAR_EDGE, 12),
  ];
  const ground = (x: number, z: number) => ({ y: terrainHeight(x, z), shore: shoreWeight(x, z) });
  for (const xs of [range(-HALF_WIDTH - 0.5, HALF_WIDTH + 0.5, 0.5), outer, outer.map((x) => -x).reverse()]) {
    const mesh = new THREE.Mesh(gridGeometry(xs, zs, ground), groundMaterial);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  await step(0.4);

  // Coarse far terrain; it dips well below the detailed strips wherever those cover it.
  const far = 40;
  const inside = (x: number, z: number) => Math.abs(x) < NEAR_EDGE - 1 && z < START_Z - 1 && z > END_Z + 1;
  const mountains = new THREE.Mesh(
    gridGeometry(range(-4000, 4000, far), range(-4400, 2400, far).reverse(), (x, z) => {
      const y = terrainHeight(x, z);
      const slope = Math.min(1, Math.hypot(terrainHeight(x + far, z) - y, terrainHeight(x, z + far) - y) / far);
      return { y: inside(x, z) ? y - 30 : y, color: mountainColor(x, z, y, slope) };
    }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  mountains.receiveShadow = true;
  scene.add(mountains);
  await step(0.6);

  const waterLength = START_Z - END_Z;
  const waterWidth = HALF_WIDTH * 2 + 6;
  const waterGeometry = new THREE.PlaneGeometry(waterWidth, waterLength, 1, 1);
  const waterUv = waterGeometry.getAttribute("uv");
  for (let i = 0; i < waterUv.count; i++)
    waterUv.setXY(i, (waterUv.getX(i) * waterWidth) / 3, (waterUv.getY(i) * waterLength) / 3);
  const waterNormals = [waterNormalMap(1), waterNormalMap(2)] as const;
  const water = new Water(waterGeometry, {
    color: "#8fb3a6",
    scale: 1,
    flowDirection: new THREE.Vector2(0, 1),
    flowSpeed: 0.07,
    reflectivity: 0.05,
    textureWidth: 1024,
    textureHeight: 1024,
    normalMap0: waterNormals[0],
    normalMap1: waterNormals[1],
  });
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0, (START_Z + END_Z) / 2);
  scene.add(water);

  const rockMaterial = patch(
    new THREE.MeshPhysicalMaterial({ roughness: 0.9, specularIntensity: 0.5 }),
    "river-rock",
    rockShader,
  );
  const rocks: Model[] = [1, 2, 3, 4, 5].map((seed) => ({ ...rockGeometry(seed), material: rockMaterial }));
  const trunk: Model = {
    geometry: logGeometry(),
    material: patch(new THREE.MeshStandardMaterial({ roughness: 0.85 }), "river-bark", barkShader),
    radius: 0.4,
  };
  const grass: Model = {
    geometry: grassTuftGeometry(),
    material: patch(
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.9,
        specularIntensity: 0.25,
        side: THREE.DoubleSide,
      }),
      "river-grass",
      grassWindShader,
      { uTime: time },
    ),
    radius: 0.2,
  };
  const treeMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, specularIntensity: 0.2 });
  const nearTrees = [1, 2, 3].map((seed) => coniferGeometry(seed, 10, 14, 3));
  const farTrees = [1, 2, 3].map((seed) => coniferGeometry(seed, 6, 7, 1));
  await step(0.8);

  // Scatter grass and boulders along the banks in chunks; grass chunks are only drawn near the swimmer.
  const placement = new THREE.Object3D();
  const plantChunks: { z: number; mesh: THREE.InstancedMesh }[] = [];
  const scatter = (
    model: Model,
    perChunk: number,
    minBank: number,
    maxBank: number,
    scale: [number, number],
    options: { shadows: boolean; nearOnly: boolean; sink: number; spread: number },
  ) => {
    for (let chunkZ = START_Z; chunkZ > END_Z + 150; chunkZ -= CHUNK) {
      const instances = new THREE.InstancedMesh(model.geometry, model.material, perChunk);
      for (let i = 0; i < perChunk; i++) {
        const side = i % 2 ? 1 : -1;
        const x = side * (HALF_WIDTH + minBank + Math.random() ** options.spread * (maxBank - minBank));
        const z = chunkZ - Math.random() * CHUNK;
        const size = scale[0] + Math.random() * (scale[1] - scale[0]);
        placement.position.set(x, terrainHeight(x, z) - options.sink * size, z);
        placement.rotation.set(0, Math.random() * Math.PI * 2, 0);
        placement.scale.setScalar(size);
        placement.updateMatrix();
        instances.setMatrixAt(i, placement.matrix);
      }
      instances.castShadow = options.shadows;
      instances.receiveShadow = true;
      instances.computeBoundingSphere();
      scene.add(instances);
      if (options.nearOnly) plantChunks.push({ z: chunkZ, mesh: instances });
    }
  };
  scatter(grass, 2400, 3, 16, [0.8, 1.5], { shadows: false, nearOnly: true, sink: 0.02, spread: 1.2 });
  for (const rock of rocks.slice(0, 3))
    scatter(rock, 1, 1.5, 30, [0.8, 2.4], { shadows: true, nearOnly: false, sink: 0.25, spread: 1.8 });

  // Spruce forest on the hillsides, thicker in patches and on the ridge upstream; distant trees use a cheaper mesh.
  const treeMatrices: THREE.Matrix4[][] = [...nearTrees, ...farTrees].map(() => []);
  for (let attempt = 0, planted = 0; attempt < 16000 && planted < 4200; attempt++) {
    const bank = 14 + Math.random() ** 1.3 * 700;
    const x = (Math.random() < 0.5 ? -1 : 1) * (HALF_WIDTH + bank);
    const z = START_Z + 60 - Math.random() * 1000;
    const y = terrainHeight(x, z);
    const density =
      smoothstep(-0.1, 0.35, fbm(x * 0.012, z * 0.012)) * smoothstep(9, 30, bank) + smoothstep(-600, -700, z) * 0.8;
    if (Math.random() > density || y > 700) continue;
    const size = 3 + Math.random() * 3.5;
    placement.position.set(x, y - 0.3, z);
    placement.rotation.set(0, Math.random() * Math.PI * 2, 0);
    placement.scale.set(size * (0.8 + Math.random() * 0.3), size, size * (0.8 + Math.random() * 0.3));
    placement.updateMatrix();
    const variant = Math.floor(Math.random() * nearTrees.length) + (bank < 70 && z > -560 ? 0 : nearTrees.length);
    treeMatrices[variant]!.push(placement.matrix.clone());
    planted++;
  }
  [...nearTrees, ...farTrees].forEach((geometry, i) => {
    const forest = new THREE.InstancedMesh(geometry, treeMaterial, treeMatrices[i]!.length);
    treeMatrices[i]!.forEach((matrix, n) => {
      forest.setMatrixAt(n, matrix);
      forest.setColorAt(n, new THREE.Color().setHSL(0.2 + Math.random() * 0.15, 0.3, 0.78 + Math.random() * 0.2));
    });
    forest.castShadow = i < nearTrees.length;
    forest.receiveShadow = true;
    forest.computeBoundingSphere();
    scene.add(forest);
  });

  const finish = createFinish(scene);
  await step(1);

  return {
    scene,
    sun,
    sunDirection: SUN_DIRECTION,
    water,
    rocks,
    trunk,
    finish,
    update(elapsed: number) {
      time.value = elapsed;
    },
    showPlantsNear(z: number) {
      for (const chunk of plantChunks) chunk.mesh.visible = chunk.z > z - 110 && chunk.z - CHUNK < z + 15;
    },
    dispose() {
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
        object.geometry.dispose();
        for (const material of [object.material].flat()) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      });
      for (const model of [...rocks, trunk]) {
        model.geometry.dispose();
        model.material.dispose();
      }
      for (const texture of waterNormals) texture.dispose();
      sky.background.dispose();
      sky.environment.dispose();
    },
  };
}

function createFinish(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.position.z = -GOAL;
  const buoys: THREE.Mesh[] = [];
  const buoyGeometry = new THREE.SphereGeometry(0.2, 20, 14);
  const red = new THREE.MeshStandardMaterial({ color: "#d8321f", roughness: 0.35 });
  const white = new THREE.MeshStandardMaterial({ color: "#f2f2ee", roughness: 0.35 });
  for (let x = -HALF_WIDTH - 0.5, i = 0; x <= HALF_WIDTH + 0.5; x += 0.8, i++) {
    const buoy = new THREE.Mesh(buoyGeometry, i % 2 ? white : red);
    buoy.position.set(x, 0.02, 0);
    buoy.castShadow = true;
    group.add(buoy);
    buoys.push(buoy);
  }
  const wood = patch(new THREE.MeshStandardMaterial({ roughness: 0.9 }), "river-bark", barkShader);
  const postHeight = 4.2;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, postHeight, 12), wood);
    const x = side * (HALF_WIDTH + 1.6);
    post.position.set(x, terrainHeight(x, -GOAL) + postHeight / 2 - 0.2, 0);
    post.castShadow = true;
    group.add(post);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#e8672c";
  context.fillRect(0, 0, 1024, 96);
  context.fillStyle = "#fff8ee";
  context.font = "600 60px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("F I N I S H", 512, 52);
  const bannerTexture = new THREE.CanvasTexture(canvas);
  bannerTexture.colorSpace = THREE.SRGBColorSpace;
  const bannerGeometry = new THREE.PlaneGeometry((HALF_WIDTH + 1.6) * 2, 1.1, 40, 4);
  const banner = new THREE.Mesh(
    bannerGeometry,
    new THREE.MeshStandardMaterial({ map: bannerTexture, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  banner.position.set(0, terrainHeight(HALF_WIDTH + 1.6, -GOAL) + postHeight - 0.9, 0);
  banner.castShadow = true;
  group.add(banner);
  scene.add(group);
  const rest = Float32Array.from(bannerGeometry.getAttribute("position").array);
  return {
    update(time: number) {
      buoys.forEach((buoy, i) => {
        buoy.position.y = 0.03 + Math.sin(time * 1.8 + i * 0.7) * 0.03;
      });
      const position = bannerGeometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const x = rest[i * 3]!;
        const sag = 1 - (x / (HALF_WIDTH + 1.6)) ** 2;
        position.setZ(i, Math.sin(time * 2.2 + x * 0.6) * 0.12 * sag);
        position.setY(i, rest[i * 3 + 1]! - sag * 0.25);
      }
      position.needsUpdate = true;
    },
  };
}
