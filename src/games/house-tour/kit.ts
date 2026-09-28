import * as THREE from 'three';
import type { MaterialName } from './materials';

export type Vec3 = [number, number, number];
export type ColorLike = number | THREE.Color;

/** Axis-aligned collision volume in world space. */
export interface Solid { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }

const toColor = (c: ColorLike) => (c instanceof THREE.Color ? c : new THREE.Color(c));

/** Accumulates world-space triangles for one material so the whole house draws in a few calls. */
class Mesher {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: THREE.Color) {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.uvs.push(u, v);
    this.colors.push(c.r, c.g, c.b);
    return this.positions.length / 3 - 1;
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export interface BoxOptions {
  /** Skip faces: any of 'px','nx','py','ny','pz','nz'. */
  skip?: string;
  /** Swap u and v so wood grain runs horizontally. */
  swap?: boolean;
  /** Offset UVs so repeated parts don't share the same patch of texture. */
  shift?: number;
}

const p = new THREE.Vector3();
const n = new THREE.Vector3();

/**
 * Geometry kit with a transform stack. Coordinates passed to drawing calls are local to the
 * current frame; UVs are in local meters so every surface keeps a real-world texel density.
 */
export class Kit {
  private meshers = new Map<MaterialName, Mesher>();
  private matrix = new THREE.Matrix4();
  private normalMatrix = new THREE.Matrix3();
  private stack: THREE.Matrix4[] = [];
  solids: Solid[] = [];

  private mesher(material: MaterialName) {
    let mesher = this.meshers.get(material);
    if (!mesher) this.meshers.set(material, (mesher = new Mesher()));
    return mesher;
  }

  /** Runs `draw` in a frame translated to (x, y, z) and turned by `yaw` around +Y. */
  at(x: number, y: number, z: number, yaw: number, draw: () => void) {
    this.stack.push(this.matrix.clone());
    this.matrix.multiply(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
    this.normalMatrix.getNormalMatrix(this.matrix);
    try {
      draw();
    } finally {
      this.matrix.copy(this.stack.pop()!);
      this.normalMatrix.getNormalMatrix(this.matrix);
    }
  }

  /** Same as `at` but with an arbitrary local matrix (tilts, scales). */
  within(local: THREE.Matrix4, draw: () => void) {
    this.stack.push(this.matrix.clone());
    this.matrix.multiply(local);
    this.normalMatrix.getNormalMatrix(this.matrix);
    try {
      draw();
    } finally {
      this.matrix.copy(this.stack.pop()!);
      this.normalMatrix.getNormalMatrix(this.matrix);
    }
  }

  /** Quad from four local corners, counter-clockwise seen from the front. */
  quad(material: MaterialName, corners: [Vec3, Vec3, Vec3, Vec3], uvs: [number, number][], color: ColorLike, normal?: Vec3) {
    const mesher = this.mesher(material);
    const c = toColor(color);
    const [a, b, , d] = corners;
    if (normal) n.set(...normal);
    else n.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize();
    n.applyMatrix3(this.normalMatrix).normalize();
    const base = corners.map((corner, i) => mesher.vertex(p.set(...corner).applyMatrix4(this.matrix), n, uvs[i]![0], uvs[i]![1], c));
    mesher.indices.push(base[0]!, base[1]!, base[2]!, base[0]!, base[2]!, base[3]!);
  }

  /** Axis-aligned box in the local frame with box-projected metric UVs. */
  box(material: MaterialName, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: ColorLike, options: BoxOptions = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const skip = options.skip ?? '';
    const s = options.shift ?? 0;
    const uv = (u: number, v: number): [number, number] => (options.swap ? [v + s, u + s] : [u + s, v + s]);
    if (!skip.includes('pz')) this.quad(material, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [uv(x0, y0), uv(x1, y0), uv(x1, y1), uv(x0, y1)], color, [0, 0, 1]);
    if (!skip.includes('nz')) this.quad(material, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [uv(-x1, y0), uv(-x0, y0), uv(-x0, y1), uv(-x1, y1)], color, [0, 0, -1]);
    if (!skip.includes('px')) this.quad(material, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [uv(-z1, y0), uv(-z0, y0), uv(-z0, y1), uv(-z1, y1)], color, [1, 0, 0]);
    if (!skip.includes('nx')) this.quad(material, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [uv(z0, y0), uv(z1, y0), uv(z1, y1), uv(z0, y1)], color, [-1, 0, 0]);
    if (!skip.includes('py')) this.quad(material, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [uv(x0, -z1), uv(x1, -z1), uv(x1, -z0), uv(x0, -z0)], color, [0, 1, 0]);
    if (!skip.includes('ny')) this.quad(material, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [uv(x0, z0), uv(x1, z0), uv(x1, z1), uv(x0, z1)], color, [0, -1, 0]);
  }

  /**
   * Appends a three.js geometry placed by `local` (relative to the current frame).
   * `uv: 'box'` replaces UVs with box projection in the geometry's own meters.
   */
  geometry(material: MaterialName, source: THREE.BufferGeometry, local: THREE.Matrix4 | null, color: ColorLike, uv: 'box' | 'keep' = 'box') {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uvs = geometry.getAttribute('uv');
    const full = local ? this.matrix.clone().multiply(local) : this.matrix;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(full);
    const scale = local ? new THREE.Vector3().setFromMatrixScale(local) : new THREE.Vector3(1, 1, 1);
    const mesher = this.mesher(material);
    const c = toColor(color);
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i);
      n.fromBufferAttribute(normal, i);
      let u = 0;
      let v = 0;
      if (uv === 'box') {
        const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
        const sx = p.x * scale.x, sy = p.y * scale.y, sz = p.z * scale.z;
        if (ay >= ax && ay >= az) [u, v] = [sx, sz];
        else if (ax >= az) [u, v] = [sz, sy];
        else [u, v] = [sx, sy];
      } else if (uvs) {
        u = uvs.getX(i);
        v = uvs.getY(i);
      }
      p.applyMatrix4(full);
      n.applyMatrix3(normalMatrix).normalize();
      mesher.indices.push(mesher.vertex(p, n, u, v, c));
    }
    geometry.dispose();
  }

  /** Collision box given in the local frame; stored as a world-space AABB. */
  solid(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) {
    const box = new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)), new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1))).applyMatrix4(this.matrix);
    this.solids.push({ x0: box.min.x, z0: box.min.z, x1: box.max.x, z1: box.max.z, y0: box.min.y, y1: box.max.y });
  }

  /** Transforms a local point into world space. */
  world(x: number, y: number, z: number) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.matrix);
  }

  build(materials: Record<MaterialName, THREE.Material>, shadows: (name: MaterialName) => { cast: boolean; receive: boolean }) {
    const group = new THREE.Group();
    for (const [name, mesher] of this.meshers) {
      if (!mesher.indices.length) continue;
      const mesh = new THREE.Mesh(mesher.build(), materials[name]);
      const { cast, receive } = shadows(name);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.name = name;
      if ((materials[name] as THREE.Material).transparent) mesh.renderOrder = 2;
      group.add(mesh);
    }
    this.meshers.clear();
    return group;
  }
}

/** Rounded rectangle shape centered at the origin. */
export function roundedRect(width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const x = -width / 2, y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/** Matrix helper: translate, then rotate (Euler XYZ), then scale. */
export function trs(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

/** Small deterministic random generator so the house looks the same on every visit. */
export function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
