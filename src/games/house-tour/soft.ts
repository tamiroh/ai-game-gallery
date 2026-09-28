import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, random, trs, type ColorLike } from './kit';
import type { MaterialName } from './materials';

const puffyCache = new Map<string, THREE.BufferGeometry>();

/**
 * Stuffed shape: a finely subdivided box whose thickness swells toward the middle and
 * pinches at the seams, like a pillow, cushion or zabuton.
 */
export function puffy(kit: Kit, mat: MaterialName, x: number, y: number, z: number, w: number, h: number, d: number, color: ColorLike, puff = 1, rot?: THREE.Euler) {
  const key = [w, h, d, puff].map((v) => v.toFixed(3)).join('|');
  let geometry = puffyCache.get(key);
  if (!geometry) {
    const box = new THREE.BoxGeometry(w, h, d, 14, 3, 11);
    box.deleteAttribute('normal');
    box.deleteAttribute('uv');
    const merged = mergeVertices(box);
    box.dispose();
    const pos = merged.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const nx = (2 * pos.getX(i)) / w, ny = (2 * pos.getY(i)) / h, nz = (2 * pos.getZ(i)) / d;
      const swell = (1 - nx ** 4) * (1 - nz ** 4);
      pos.setY(i, ny * (h / 2) * (1 - puff + puff * (0.18 + 0.82 * swell)));
      // Seams pull in slightly at mid-height.
      const seam = 1 - 0.06 * puff * (1 - ny * ny);
      pos.setX(i, pos.getX(i) * (Math.abs(nx) > 0.9 ? seam : 1));
      pos.setZ(i, pos.getZ(i) * (Math.abs(nz) > 0.9 ? seam : 1));
    }
    merged.computeVertexNormals();
    puffyCache.set(key, (geometry = merged));
  }
  kit.geometry(mat, geometry, rot ? trs(x, y, z, rot.x, rot.y, rot.z) : new THREE.Matrix4().makeTranslation(x, y, z), color);
}

/**
 * Duvet draped over a mattress in the bed's frame: a puffy top that rolls over the sides and
 * foot, hanging in soft folds that deepen toward the hem. The head end starts at `z0`.
 */
export function duvet(kit: Kit, w: number, footZ: number, z0: number, top: number, drop: number, color: ColorLike, seed: number) {
  const rng = random(seed);
  const phase = Array.from({ length: 6 }, () => rng() * Math.PI * 2);
  const nu = 44, nv = 48;
  const r = 0.06;
  const positions: number[] = [];
  const edge = (dist: number) => {
    // Quarter-round over the mattress edge, then straight down.
    if (dist <= 0) return { out: 0, down: 0 };
    const arc = (r * Math.PI) / 2;
    if (dist < arc) {
      const a = dist / r;
      return { out: r * Math.sin(a), down: r * (1 - Math.cos(a)) };
    }
    return { out: r, down: r + (dist - arc) };
  };
  for (let j = 0; j <= nv; j++) {
    const v = z0 + ((footZ + drop - z0) * j) / nv;
    for (let i = 0; i <= nu; i++) {
      const u = -w / 2 - drop + ((w + 2 * drop) * i) / nu;
      const ex = Math.max(0, Math.abs(u) - w / 2);
      const ez = Math.max(0, v - footZ);
      const dist = Math.hypot(ex, ez);
      const { out, down } = edge(dist);
      const dx = dist > 0 ? ex / dist : 0, dz = dist > 0 ? ez / dist : 0;
      let x = Math.sign(u) * Math.min(Math.abs(u), w / 2) + Math.sign(u) * dx * out;
      let z = Math.min(v, footZ) + dz * out;
      // Loft: thickest in the middle of the bed, thinning toward the edges.
      const inside = dist === 0 ? (1 - (Math.abs(u) / (w / 2)) ** 6) * (1 - (2 * (v - z0) / (footZ - z0) - 1) ** 8) : 0;
      let y = top + 0.035 + 0.035 * inside - down;
      // Gentle wrinkles on top; folds that grow toward the hem on the hanging part.
      y += 0.008 * Math.sin(u * 7 + phase[0]!) * Math.sin(v * 5 + phase[1]!) + 0.006 * Math.sin(u * 13 + v * 9 + phase[2]!);
      const hang = Math.max(0, down - r) / drop;
      if (hang > 0) {
        const along = dx > dz ? v : u;
        const fold = (0.028 * Math.sin(along * 11 + phase[3]!) + 0.014 * Math.sin(along * 23 + phase[4]!)) * hang;
        x += Math.sign(u) * dx * fold;
        z += dz * fold;
        y += 0.02 * hang * Math.sin(along * 5 + phase[5]!);
      }
      positions.push(x, y, z);
    }
  }
  const indices: number[] = [];
  const row = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  kit.geometry('linen', geometry, null, color);
  // The underside of the hem so the hanging edge has thickness when seen from low down.
  const back = geometry.clone();
  const index = back.getIndex()!;
  for (let i = 0; i < index.count; i += 3) {
    const t = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, t);
  }
  back.computeVertexNormals();
  back.translate(0, -0.012, 0);
  kit.geometry('linen', back, null, new THREE.Color(color).multiplyScalar(0.8));
  back.dispose();
  geometry.dispose();
}

/** A board bent into an arc across its width (chair backs, curved rails). */
export function bentBoard(kit: Kit, mat: MaterialName, x: number, y: number, z: number, w: number, h: number, t: number, sag: number, color: ColorLike, tilt = 0) {
  const geometry = new THREE.BoxGeometry(w, h, t, 20, 2, 1);
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const nx = (2 * pos.getX(i)) / w;
    pos.setZ(i, pos.getZ(i) + sag * nx * nx);
  }
  geometry.computeVertexNormals();
  kit.geometry(mat, geometry, trs(x, y, z, tilt, 0, 0), color);
  geometry.dispose();
}

export function releaseSoft() {
  for (const geometry of puffyCache.values()) geometry.dispose();
  puffyCache.clear();
}
