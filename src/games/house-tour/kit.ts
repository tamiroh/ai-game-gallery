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
  /** Edge chamfer applied to boxes (meters); 0 draws plain sharp boxes. */
  bevel = 0;

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
    const b = options.skip ? 0 : Math.min(this.bevel, (x1 - x0) * 0.3, (y1 - y0) * 0.3, (z1 - z0) * 0.3);
    if (b > 0.0008) {
      this.chamferBox(material, [x0, y0, z0], [x1, y1, z1], b, color, options);
      return;
    }
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
   * Box with chamfered edges and corners. Vertices on each strip keep the normal of the face they
   * touch, so the narrow bevel shades like a rounded edge and catches highlights.
   */
  private chamferBox(material: MaterialName, lo: Vec3, hi: Vec3, b: number, color: ColorLike, options: BoxOptions) {
    const mesher = this.mesher(material);
    const c = toColor(color);
    const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const h = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
    const hin = h.map((v) => v - b);
    const s = options.shift ?? 0;
    const uvOf = (q: number[], axis: number, sign: number): [number, number] => {
      const [x, y, z] = q as [number, number, number];
      let u: number, v: number;
      if (axis === 0) [u, v] = [sign > 0 ? -z : z, y];
      else if (axis === 1) [u, v] = [x, sign > 0 ? -z : z];
      else [u, v] = [sign > 0 ? x : -x, y];
      return options.swap ? [v + s, u + s] : [u + s, v + s];
    };
    const outward = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    // points: local offsets from center; axes/signs: the face each vertex belongs to.
    const poly = (points: number[][], axes: number[], signs: number[], out: number[]) => {
      e1.set(points[1]![0]! - points[0]![0]!, points[1]![1]! - points[0]![1]!, points[1]![2]! - points[0]![2]!);
      e2.set(points[2]![0]! - points[0]![0]!, points[2]![1]! - points[0]![1]!, points[2]![2]! - points[0]![2]!);
      outward.set(out[0]!, out[1]!, out[2]!);
      const order = e1.cross(e2).dot(outward) < 0 ? [...points.keys()].reverse() : [...points.keys()];
      const ids = order.map((i) => {
        const q = points[i]!.map((v, k) => v + center[k]!);
        const axis = axes[i]!, sign = signs[i]!;
        n.set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0).applyMatrix3(this.normalMatrix).normalize();
        const [u, v] = uvOf(q, axis, sign);
        return mesher.vertex(p.set(q[0]!, q[1]!, q[2]!).applyMatrix4(this.matrix), n, u, v, c);
      });
      for (let i = 1; i < ids.length - 1; i++) mesher.indices.push(ids[0]!, ids[i]!, ids[i + 1]!);
    };
    const pt = (k: number, vk: number, a: number, va: number, bb: number, vb: number) => {
      const q = [0, 0, 0];
      q[k] = vk; q[a] = va; q[bb] = vb;
      return q;
    };
    for (let k = 0; k < 3; k++) {
      const a = (k + 1) % 3, bb = (k + 2) % 3;
      for (const sign of [-1, 1]) {
        const out = [0, 0, 0];
        out[k] = sign;
        const skipKey = `${sign > 0 ? 'p' : 'n'}${'xyz'[k]}`;
        if (options.skip?.includes(skipKey)) continue;
        poly([pt(k, sign * h[k]!, a, -hin[a]!, bb, -hin[bb]!), pt(k, sign * h[k]!, a, hin[a]!, bb, -hin[bb]!), pt(k, sign * h[k]!, a, hin[a]!, bb, hin[bb]!), pt(k, sign * h[k]!, a, -hin[a]!, bb, hin[bb]!)], [k, k, k, k], [sign, sign, sign, sign], out);
      }
    }
    // Edge strips.
    for (const [a, bb, k] of [[0, 1, 2], [0, 2, 1], [1, 2, 0]] as const) {
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        const P = (vk: number) => { const q = [0, 0, 0]; q[a] = sa * h[a]!; q[bb] = sb * hin[bb]!; q[k] = vk; return q; };
        const Q = (vk: number) => { const q = [0, 0, 0]; q[a] = sa * hin[a]!; q[bb] = sb * h[bb]!; q[k] = vk; return q; };
        const out = [0, 0, 0];
        out[a] = sa; out[bb] = sb;
        poly([P(-hin[k]!), P(hin[k]!), Q(hin[k]!), Q(-hin[k]!)], [a, a, bb, bb], [sa, sa, sb, sb], out);
      }
    }
    // Corner triangles.
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      poly([[sx * h[0]!, sy * hin[1]!, sz * hin[2]!], [sx * hin[0]!, sy * h[1]!, sz * hin[2]!], [sx * hin[0]!, sy * hin[1]!, sz * h[2]!]], [0, 1, 2], [sx, sy, sz], [sx, sy, sz]);
    }
  }

  /** Runs `draw` with a different edge chamfer. */
  withBevel(bevel: number, draw: () => void) {
    const previous = this.bevel;
    this.bevel = bevel;
    try {
      draw();
    } finally {
      this.bevel = previous;
    }
  }

  /** Total vertices queued so far, for budgeting. */
  get vertexCount() {
    let total = 0;
    for (const mesher of this.meshers.values()) total += mesher.positions.length / 3;
    return total;
  }

  /**
   * Appends a three.js geometry placed by `local` (relative to the current frame).
   * `uv: 'box'` replaces UVs with box projection in the geometry's own meters.
   */
  geometry(material: MaterialName, source: THREE.BufferGeometry, local: THREE.Matrix4 | null, color: ColorLike, uv: 'box' | 'keep' = 'box') {
    const geometry = source.clone();
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uvs = geometry.getAttribute('uv');
    const full = local ? this.matrix.clone().multiply(local) : this.matrix;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(full);
    const scale = local ? new THREE.Vector3().setFromMatrixScale(local) : new THREE.Vector3(1, 1, 1);
    const mesher = this.mesher(material);
    const c = toColor(color);
    const base = mesher.positions.length / 3;
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
      mesher.vertex(p, n, u, v, c);
    }
    // Keep the source's index buffer so smooth meshes share their vertices.
    const index = geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) mesher.indices.push(base + index.getX(i));
    else for (let i = 0; i < position.count; i++) mesher.indices.push(base + i);
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
