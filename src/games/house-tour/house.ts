import * as THREE from 'three';
import { Kit, type Solid } from './kit';
import type { MaterialName } from './materials';
import {
  BALCONY, D, DECK, DOMA, EAVE, FL1, FL2, INT, M, OPENINGS, PORCH, RISE, ROOMS, STAIR, TREAD, W,
  isExterior, thickness, type Opening, type Room,
} from './plan';

/** a0, y0, a1, y1 on a wall plane. */
export type Rect = [number, number, number, number];

/** Splits a wall rectangle around holes into as few solid rectangles as it can. */
export function subtract(a0: number, a1: number, y0: number, y1: number, holes: Rect[]): Rect[] {
  const cuts = new Set([a0, a1]);
  for (const h of holes) for (const a of [h[0], h[2]]) if (a > a0 && a < a1) cuts.add(a);
  const columns = [...cuts].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i < columns.length - 1; i++) {
    const c0 = columns[i]!, c1 = columns[i + 1]!;
    const mid = (c0 + c1) / 2;
    const covered = holes
      .filter((h) => h[0] < mid && h[2] > mid)
      .map(([, b, , t]) => [Math.max(y0, b), Math.min(y1, t)] as const)
      .filter(([b, t]) => t > b)
      .sort((p, q) => p[0] - q[0]);
    let y = y0;
    const pieces: Rect[] = [];
    for (const [b, t] of covered) {
      if (b > y + 1e-4) pieces.push([c0, y, c1, b]);
      y = Math.max(y, t);
    }
    if (y1 > y + 1e-4) pieces.push([c0, y, c1, y1]);
    for (const piece of pieces) {
      const prev = out.find((r) => Math.abs(r[2] - c0) < 1e-6 && Math.abs(r[1] - piece[1]) < 1e-6 && Math.abs(r[3] - piece[3]) < 1e-6);
      if (prev) prev[2] = c1;
      else out.push(piece);
    }
  }
  return out;
}

/** Emits a wall face lying in a plane. `axis` is the wall direction; `sign` is the facing side. */
export function face(kit: Kit, mat: MaterialName, color: number, axis: 'x' | 'z', plane: number, sign: number, [a0, y0, a1, y1]: Rect) {
  if (axis === 'x') {
    if (sign > 0) kit.quad(mat, [[a0, y0, plane], [a1, y0, plane], [a1, y1, plane], [a0, y1, plane]], [[a0, y0], [a1, y0], [a1, y1], [a0, y1]], color, [0, 0, 1]);
    else kit.quad(mat, [[a1, y0, plane], [a0, y0, plane], [a0, y1, plane], [a1, y1, plane]], [[-a1, y0], [-a0, y0], [-a0, y1], [-a1, y1]], color, [0, 0, -1]);
  } else if (sign > 0) {
    kit.quad(mat, [[plane, y0, a1], [plane, y0, a0], [plane, y1, a0], [plane, y1, a1]], [[-a1, y0], [-a0, y0], [-a0, y1], [-a1, y1]], color, [1, 0, 0]);
  } else {
    kit.quad(mat, [[plane, y0, a0], [plane, y0, a1], [plane, y1, a1], [plane, y1, a0]], [[a0, y0], [a1, y0], [a1, y1], [a0, y1]], color, [-1, 0, 0]);
  }
}

/** Box helper in wall coordinates: a along the wall, d across it (toward +z or +x). */
export function wallBox(kit: Kit, mat: MaterialName, axis: 'x' | 'z', a0: number, a1: number, y0: number, y1: number, d0: number, d1: number, color: number, swap = false) {
  if (axis === 'x') kit.box(mat, a0, y0, d0, a1, y1, d1, color, { swap });
  else kit.box(mat, d0, y0, a0, d1, y1, a1, color, { swap: !swap });
}

export function wallSolid(solids: Solid[], axis: 'x' | 'z', a0: number, a1: number, d0: number, d1: number, y0: number, y1: number) {
  if (axis === 'x') solids.push({ x0: a0, x1: a1, z0: Math.min(d0, d1), z1: Math.max(d0, d1), y0, y1 });
  else solids.push({ x0: Math.min(d0, d1), x1: Math.max(d0, d1), z0: a0, z1: a1, y0, y1 });
}

interface Edge { key: 'n' | 's' | 'w' | 'e'; axis: 'x' | 'z'; at: number; a0: number; a1: number; sign: 1 | -1 }

export function roomEdges(r: Room): Edge[] {
  return [
    { key: 'n', axis: 'x', at: r.z0, a0: r.x0, a1: r.x1, sign: 1 },
    { key: 's', axis: 'x', at: r.z1, a0: r.x0, a1: r.x1, sign: -1 },
    { key: 'w', axis: 'z', at: r.x0, a0: r.z0, a1: r.z1, sign: 1 },
    { key: 'e', axis: 'z', at: r.x1, a0: r.z0, a1: r.z1, sign: -1 },
  ];
}

/** Interior extent of a room (inside the wall faces). */
export function inner(r: Room) {
  return {
    x0: r.x0 + thickness('z', r.x0) / 2,
    x1: r.x1 - thickness('z', r.x1) / 2,
    z0: r.z0 + thickness('x', r.z0) / 2,
    z1: r.z1 - thickness('x', r.z1) / 2,
  };
}

const onLine = (o: Opening, axis: 'x' | 'z', at: number) => o.axis === axis && Math.abs(o.at - at) < 0.01;

function roomShell(kit: Kit, r: Room) {
  const box = inner(r);
  for (const edge of roomEdges(r)) {
    const t = thickness(edge.axis, edge.at);
    const plane = edge.at + (edge.sign * t) / 2;
    const [a0, a1] = edge.axis === 'x' ? [box.x0, box.x1] : [box.z0, box.z1];
    const holes = OPENINGS.filter((o) => onLine(o, edge.axis, edge.at) && o.a1 > a0 && o.a0 < a1).map((o): Rect => [Math.max(o.a0, a0), o.y0, Math.min(o.a1, a1), o.y1]);
    const finish = r.walls?.[edge.key] ?? r.wall;
    const pieces = subtract(a0, a1, r.y, r.top, holes);
    for (const piece of pieces) face(kit, finish.mat, finish.color, edge.axis, plane, edge.sign, piece);
    if (r.id === 'bath' || r.id === 'stair') continue;
    const tatami = r.wall.mat === 'clay';
    for (const [p0, py0, p1, py1] of pieces) {
      // Skirting along the floor, a slim crown along the ceiling.
      if (Math.abs(py0 - r.y) < 1e-3) {
        const h = tatami ? 0.035 : 0.06;
        wallBox(kit, tatami ? 'whiteoak' : 'satin', edge.axis, p0, p1, r.y, r.y + h, plane, plane + edge.sign * (tatami ? 0.008 : 0.011), tatami ? 0xd6bf98 : 0xf1efe9, true);
      }
      if (Math.abs(py1 - r.top) < 1e-3) {
        const s = tatami ? 0.04 : 0.022;
        wallBox(kit, tatami ? 'whiteoak' : 'satin', edge.axis, p0, p1, r.top - s, r.top, plane, plane + edge.sign * s, tatami ? 0xc9ad83 : 0xf4f2ee, true);
      }
    }
  }
  if (r.floorMat) kit.quad(r.floorMat, [[box.x0, r.y, box.z1], [box.x1, r.y, box.z1], [box.x1, r.y, box.z0], [box.x0, r.y, box.z0]], [[box.x0, -box.z1], [box.x1, -box.z1], [box.x1, -box.z0], [box.x0, -box.z0]], r.floorColor ?? 0xffffff, [0, 1, 0]);
  if (r.ceiling === 'cedar') {
    // Sao-buchi ceiling: long cedar boards crossed by slim battens.
    kit.quad('cedar', [[box.x0, r.top, box.z0], [box.x1, r.top, box.z0], [box.x1, r.top, box.z1], [box.x0, r.top, box.z1]], [[box.z0, box.x0], [box.z0, box.x1], [box.z1, box.x1], [box.z1, box.x0]], 0xe9d2b4, [0, -1, 0]);
    for (let x = box.x0 + 0.45; x < box.x1 - 0.2; x += 0.45) kit.box('whiteoak', x - 0.015, r.top - 0.03, box.z0, x + 0.015, r.top, box.z1, 0xb99a70);
  } else if (r.ceiling) {
    kit.quad(r.ceiling, [[box.x0, r.top, box.z0], [box.x1, r.top, box.z0], [box.x1, r.top, box.z1], [box.x0, r.top, box.z1]], [[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]], r.ceiling === 'bathWall' ? 0xf3f0ea : 0xfbfaf7, [0, -1, 0]);
  }
}

/** Plain drywall reveals and floor thresholds through wall thickness. */
function openingReveals(kit: Kit, o: Opening) {
  const t = thickness(o.axis, o.at);
  const d0 = o.at - t / 2, d1 = o.at + t / 2;
  const sides = ROOMS.filter((r) => (o.axis === 'x' ? (Math.abs(r.z0 - o.at) < 0.01 || Math.abs(r.z1 - o.at) < 0.01) && r.x0 < o.a1 && r.x1 > o.a0 : (Math.abs(r.x0 - o.at) < 0.01 || Math.abs(r.x1 - o.at) < 0.01) && r.z0 < o.a1 && r.z1 > o.a0));
  const floors = sides.filter((r) => r.y >= o.y0 - 0.01 && r.y <= o.y0 + 0.4);
  if (o.kind === 'rail') wallBox(kit, 'ceiling', o.axis, o.a0 - 0.06, o.a1 + 0.06, o.y1 - 0.002, o.y1, d0, d1, 0xfbfaf7);
  if (o.kind === 'open') {
    for (const a of [o.a0, o.a1]) wallBox(kit, 'paper', o.axis, a - 0.001, a + 0.001, o.y0, o.y1, d0, d1, 0xf2efe8);
    wallBox(kit, 'paper', o.axis, o.a0, o.a1, o.y1 - 0.001, o.y1 + 0.001, d0, d1, 0xf2efe8);
  }
  if (o.walk && !isExterior(o.axis, o.at)) {
    const top = Math.max(...floors.map((r) => r.y), o.y0);
    const floor = floors.find((r) => r.y === top && r.floorMat) ?? floors.find((r) => r.floorMat);
    const mat: MaterialName = o.kind === 'open' && floor?.floorMat ? floor.floorMat : 'whiteoak';
    wallBox(kit, mat, o.axis, o.a0, o.a1, top - 0.1, top + (o.kind === 'open' ? 0 : 0.004), d0, d1, o.kind === 'open' ? floor?.floorColor ?? 0xffffff : 0xd9c29e, true);
  }
}

/** Collision boxes for every wall, leaving door openings passable. */
function wallSolids(solids: Solid[]) {
  for (const r of ROOMS) {
    for (const edge of roomEdges(r)) {
      const t = thickness(edge.axis, edge.at);
      const d0 = edge.at - t / 2, d1 = edge.at + t / 2;
      const walks = OPENINGS.filter((o) => o.walk && onLine(o, edge.axis, edge.at) && o.a1 > edge.a0 && o.a0 < edge.a1);
      const pieces = subtract(edge.a0 - t / 2, edge.a1 + t / 2, r.y, r.top, walks.map((o) => [o.a0, o.y0, o.a1, o.y1]));
      for (const [a0, y0, a1, y1] of pieces) wallSolid(solids, edge.axis, a0, a1, d0, d1, y0, y1);
    }
  }
}

function stairs(kit: Kit, solids: Solid[]) {
  const z0 = STAIR.z0 + INT / 2, z1 = STAIR.z1 - INT / 2;
  for (let i = 0; i < STAIR.steps; i++) {
    const xa = STAIR.x1 - (i + 1) * TREAD, xb = STAIR.x1 - i * TREAD;
    const top = FL1 + (i + 1) * RISE;
    if (i < STAIR.steps - 1) {
      // Tread with a rounded nosing over a painted riser.
      kit.box('oak', xa, top - 0.03, z0, xb + 0.02, top, z1, 0xc8a071, { swap: true, shift: i * 0.37 });
      kit.box('satin', xb - 0.001, top - RISE, z0, xb + 0.001, top - 0.03, z1, 0xeeebe4);
      kit.box('oak', xb + 0.004, top - 0.045, z0, xb + 0.026, top - 0.03, z1, 0xb88f60, { swap: true });
    } else {
      kit.box('floor', xa, top - 0.03, z0, xb, top, z1, 0xffffff);
      kit.box('satin', xb - 0.001, top - RISE, z0, xb + 0.001, top - 0.03, z1, 0xeeebe4);
    }
    // Solid mass under each step keeps the underside closed.
    kit.box('satin', xa, FL1, z0 + 0.001, xb, top - 0.03, z1 - 0.001, 0xeeebe4, { skip: 'py' });
    // Stringer skirting that follows the slope along both walls.
    for (const [za, zb] of [[z0, z0 + 0.012], [z1 - 0.012, z1]] as const) {
      kit.box('satin', xa, top - 0.12, za, xb, top + 0.09, zb, 0xf1efe9);
    }
  }
  // Wall handrail on the north side of the stair, following the pitch.
  const pitch = Math.atan2(RISE, TREAD);
  const length = Math.hypot(STAIR.x1 - STAIR.x0, FL2 - FL1);
  const rail = new THREE.CylinderGeometry(0.018, 0.018, length, 14);
  const mid = new THREE.Vector3((STAIR.x0 + STAIR.x1) / 2, (FL1 + FL2) / 2 + 0.8, z0 + 0.06);
  kit.geometry('walnut', rail, new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 - pitch)), new THREE.Vector3(1, 1, 1)), 0x8a6444, 'keep');
  for (let k = 0; k < 4; k++) {
    const x = STAIR.x1 - 0.5 - k * 0.95;
    const y = FL1 + ((STAIR.x1 - x) / TREAD) * RISE + 0.8;
    kit.box('chrome', x - 0.012, y - 0.03, z0, x + 0.012, y - 0.012, z0 + 0.06, 0xd8d8d8);
  }
  // Upstairs guard walls with a wooden cap around the stairwell.
  const cap = FL2 + 0.9;
  const guard = (axis: 'x' | 'z', at: number, a0: number, a1: number) => {
    const d0 = at - INT / 2, d1 = at + INT / 2;
    wallBox(kit, 'paper', axis, a0, a1, FL2, cap - 0.03, d0, d1, 0xf2efe8);
    wallBox(kit, 'oak', axis, a0 - 0.01, a1 + 0.01, cap - 0.03, cap, d0 - 0.015, d1 + 0.015, 0xc8a071, true);
    wallSolid(solids, axis, a0, a1, d0, d1, FL2, cap);
  };
  guard('x', STAIR.z0, STAIR.x0 + 0.06, STAIR.x1 + 0.06);
  guard('z', STAIR.x1, STAIR.z0 + 0.06, STAIR.z1 - 0.06);
}

const PITCH = 0.45;
const OVERHANG = 0.6;
const GABLE = 0.45;
const SLAB = 0.17;

/** Height of the underside of the roof at horizontal distance `d` inward from the outer wall face. */
const roofUnder = (d: number) => EAVE + d * PITCH;

function facades(kit: Kit) {
  const out = 0.115;
  const sides = [
    { axis: 'x' as const, at: 0, sign: -1, a0: -out, a1: W + out },
    { axis: 'x' as const, at: D, sign: 1, a0: -out, a1: W + out },
    { axis: 'z' as const, at: 0, sign: -1, a0: -out, a1: D + out },
    { axis: 'z' as const, at: W, sign: 1, a0: -out, a1: D + out },
  ];
  for (const side of sides) {
    const holes = OPENINGS.filter((o) => onLine(o, side.axis, side.at)).map((o): Rect => [o.a0, o.y0, o.a1, o.y1]);
    for (const piece of subtract(side.a0, side.a1, 0, FL1 - 0.04, holes)) face(kit, 'concrete', 0xc4c0b8, side.axis, side.at + side.sign * 0.1, side.sign, piece);
    for (const piece of subtract(side.a0, side.a1, FL1 - 0.04, EAVE, holes)) face(kit, 'siding', 0xf1ece2, side.axis, side.at + side.sign * out, side.sign, piece);
    // Drip flashing where the siding meets the foundation.
    const cuts = subtract(side.a0, side.a1, FL1 - 0.06, FL1 - 0.03, holes);
    for (const [a0, y0, a1, y1] of cuts) wallBox(kit, 'sash', side.axis, a0, a1, y0, y1, side.at + side.sign * 0.09, side.at + side.sign * (out + 0.02), 0x4a4540);
    // Belly band between the floors.
    const band = side.axis === 'x' && side.at === D ? [side.a0, BALCONY.x0 - 0.02] : [side.a0, side.a1];
    wallBox(kit, 'satin', side.axis, band[0]!, band[1]!, FL2 - 0.42, FL2 - 0.3, side.at + side.sign * out, side.at + side.sign * (out + 0.025), 0x5a5249);
  }
  // Corner boards.
  for (const [x, z] of [[0, 0], [W, 0], [0, D], [W, D]] as const) {
    const sx = x === 0 ? -1 : 1, sz = z === 0 ? -1 : 1;
    kit.box('siding', x + sx * 0.08, FL1 - 0.03, z + sz * 0.08, x + sx * 0.14, EAVE, z + sz * 0.14, 0xe4ddd0);
  }
  // Gable triangles.
  const apex = roofUnder(D / 2 + out);
  for (const x of [0, W]) {
    const plane = x === 0 ? -out : W + out;
    const corners: [number, number, number][] = x === 0
      ? [[plane, EAVE, -out], [plane, EAVE, D + out], [plane, apex, D / 2], [plane, apex, D / 2]]
      : [[plane, EAVE, D + out], [plane, EAVE, -out], [plane, apex, D / 2], [plane, apex, D / 2]];
    kit.quad('siding', corners as never, corners.map(([, y, z]) => [x === 0 ? z : -z, y]), 0xf1ece2, [x === 0 ? -1 : 1, 0, 0]);
    // Gable vent.
    kit.box('sash', plane - 0.03, apex - 0.9, D / 2 - 0.22, plane + 0.03, apex - 0.55, D / 2 + 0.22, 0x5a5249);
  }
}

/** Profile of a sanwa-style J tile across its width: a shallow pan and a rounded roll. */
function tileProfile(u: number) {
  return u < 0.6 ? -0.022 * Math.sin((Math.PI * u) / 0.6) : 0.03 * Math.sin((Math.PI * (u - 0.6)) / 0.4);
}

function tileRow(length: number, tiles: number, s0: number, s1: number, base: number) {
  const samples = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const period = length / tiles;
  const xs: number[] = [];
  const ps: number[] = [];
  for (let t = 0; t < tiles; t++) for (const u of samples) { xs.push((t + u) * period); ps.push(tileProfile(u)); }
  xs.push(length);
  ps.push(tileProfile(0));
  const positions: number[] = [];
  const indices: number[] = [];
  const count = xs.length;
  const lift0 = base + 0.045, lift1 = base + 0.012;
  // Rows of vertices: lip bottom, lip top (= surface at s0), surface at s1.
  const rows: [number, number][] = [[s0, base + 0.012], [s0, lift0], [s1, lift1]];
  for (const [s, lift] of rows) for (let i = 0; i < count; i++) positions.push(xs[i]!, lift + ps[i]!, s);
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < count - 1; i++) {
      const a = r * count + i, b = a + 1, c = a + count, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roof(kit: Kit) {
  const out = 0.115;
  const theta = Math.atan(PITCH);
  const run = D / 2 + out + OVERHANG;
  const slope = run / Math.cos(theta);
  const length = W + 2 * (out + GABLE);
  const tiles = Math.round(length / 0.265);
  const eaveY = roofUnder(-OVERHANG);
  for (const north of [true, false]) {
    const c = Math.cos(theta), s = Math.sin(theta);
    const U = new THREE.Vector3(0, s, north ? c : -c);
    const N = new THREE.Vector3(0, c, north ? -s : s);
    const X = new THREE.Vector3(north ? 1 : -1, 0, 0);
    const origin = new THREE.Vector3(north ? -out - GABLE : W + out + GABLE, eaveY, north ? -out - OVERHANG : D + out + OVERHANG);
    const frame = new THREE.Matrix4().makeBasis(X, N, U).setPosition(origin);
    kit.within(frame, () => {
      // Roof deck: soffit underneath, fascia and barge boards around the edge.
      kit.box('cedar', 0, 0, 0, length, SLAB, slope + 0.05, 0xf0dcc0, { skip: 'py', swap: true });
      kit.box('sash', -0.01, -0.02, -0.03, length + 0.01, SLAB + 0.02, 0, 0x3f3b37);
      kit.box('sash', -0.03, -0.02, 0, 0, SLAB + 0.05, slope + 0.05, 0x3f3b37);
      kit.box('sash', length, -0.02, 0, length + 0.03, SLAB + 0.05, slope + 0.05, 0x3f3b37);
      const exposure = 0.235;
      const rows = Math.ceil(slope / exposure);
      for (let r = 0; r < rows; r++) {
        const s0 = r * exposure;
        const s1 = Math.min(slope + 0.03, s0 + exposure + 0.05);
        const shade = 0.93 + ((r * 7919) % 13) / 13 * 0.1;
        kit.geometry('kawara', tileRow(length - 0.2, tiles, s0, s1, SLAB), new THREE.Matrix4().makeTranslation(0.1, 0, 0), new THREE.Color(0x4f545b).multiplyScalar(shade), 'keep');
      }
      // Verge roll tiles along the gable edges.
      for (const x of [0.07, length - 0.07]) {
        const roll = new THREE.CylinderGeometry(0.055, 0.055, slope, 12, 1, false, 0, Math.PI);
        kit.geometry('kawara', roll, new THREE.Matrix4().compose(new THREE.Vector3(x, SLAB + 0.03, slope / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, x < 1 ? -Math.PI / 2 : Math.PI / 2)), new THREE.Vector3(1, 1, 1)), 0x4a4f56, 'keep');
        kit.box('kawara', x - 0.06, SLAB - 0.01, 0, x + 0.06, SLAB + 0.03, slope, 0x4a4f56);
      }
    });
    // Half-round gutter with hangers, and a downspout at each end.
    const gz = north ? -out - OVERHANG - 0.08 : D + out + OVERHANG + 0.08;
    const gy = eaveY - 0.03;
    const gutter = new THREE.CylinderGeometry(0.065, 0.065, length - 0.2, 16, 1, true, Math.PI / 2, Math.PI);
    kit.geometry('satin', gutter, new THREE.Matrix4().compose(new THREE.Vector3(W / 2, gy, gz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1)), 0x6b645c, 'keep');
    for (const x of north ? [0.25, W - 0.25] : [0.25, BALCONY.x0 - 0.3]) {
      const wallZ = north ? -out - 0.05 : D + out + 0.05;
      const pipe = (a: THREE.Vector3, b: THREE.Vector3) => {
        const dir = b.clone().sub(a);
        const geometry = new THREE.CylinderGeometry(0.03, 0.03, dir.length(), 12);
        kit.geometry('satin', geometry, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)), 0x6b645c, 'keep');
      };
      const top = new THREE.Vector3(x, gy - 0.05, gz);
      const bend = new THREE.Vector3(x, gy - 0.45, wallZ);
      pipe(top, bend);
      pipe(bend, new THREE.Vector3(x, 0.12, wallZ));
      for (let y = 0.8; y < EAVE - 0.8; y += 1.6) kit.box('satin', x - 0.04, y, Math.min(wallZ, north ? -out : wallZ), x + 0.04, y + 0.03, north ? -out : D + out, 0x6b645c);
    }
  }
  // Ridge: stacked noshi tiles, a round cap, and demon tiles at the ends.
  const ridgeY = roofUnder(D / 2 + out) + SLAB / Math.cos(theta) + 0.02;
  const x0 = -out - GABLE - 0.02, x1 = W + out + GABLE + 0.02;
  for (let i = 0; i < 3; i++) kit.box('kawara', x0, ridgeY - 0.06 + i * 0.05, D / 2 - 0.17 + i * 0.03, x1, ridgeY - 0.01 + i * 0.05, D / 2 + 0.17 - i * 0.03, new THREE.Color(0x484d53).multiplyScalar(1 - i * 0.03));
  const cap = new THREE.CylinderGeometry(0.1, 0.1, x1 - x0, 18, 1, false, 0, Math.PI);
  kit.geometry('kawara', cap, new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, ridgeY + 0.14, D / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)), 0x454a50, 'keep');
  const oni = new THREE.Shape();
  oni.moveTo(-0.3, 0);
  oni.lineTo(0.3, 0);
  oni.lineTo(0.3, 0.2);
  oni.quadraticCurveTo(0.34, 0.42, 0.18, 0.46);
  oni.quadraticCurveTo(0.12, 0.34, 0, 0.36);
  oni.quadraticCurveTo(-0.12, 0.34, -0.18, 0.46);
  oni.quadraticCurveTo(-0.34, 0.42, -0.3, 0.2);
  oni.closePath();
  const oniGeometry = new THREE.ExtrudeGeometry(oni, { depth: 0.08, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 10 });
  for (const x of [x0 - 0.02, x1 + 0.02]) {
    kit.geometry('kawara', oniGeometry, new THREE.Matrix4().compose(new THREE.Vector3(x + (x < 0 ? 0.04 : -0.04), ridgeY - 0.12, D / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)), 0x3e4349, 'keep');
  }
}

function balcony(kit: Kit, solids: Solid[]) {
  const { x0, x1, z0, z1, y } = BALCONY;
  const out = 0.115;
  const zs = z0 + out;
  // Cantilevered slab clad in siding, FRP deck on top.
  kit.box('siding', x0, y - 0.38, zs, x1 + out, y, z1, 0xf1ece2, { skip: 'py' });
  kit.box('matte', x0 + 0.1, y - 0.01, zs, x1 - 0.1, y, z1 - 0.1, 0x8d8f8c);
  kit.box('matte', x0 + 0.1, y - 0.02, z1 - 0.26, x1 - 0.1, y - 0.005, z1 - 0.2, 0x6f716e);
  // Parapet: siding outside, smooth panel inside, aluminum cap.
  const top = y + 1.1;
  kit.box('siding', x0, y, z1 - 0.1, x1 + out, top, z1, 0xf1ece2);
  kit.box('siding', x0, y, zs, x0 + 0.1, top, z1, 0xf1ece2);
  kit.box('siding', x1 - 0.1 + out, y, zs, x1 + out, top, z1, 0xf1ece2);
  kit.box('sash', x0 - 0.01, top, zs, x1 + out + 0.01, top + 0.03, z1 + 0.01, 0x5d5953, { skip: '' });
  solids.push({ x0, x1: x1 + out, z0: z1 - 0.1, z1, y0: y, y1: top }, { x0, x1: x0 + 0.1, z0: zs, z1, y0: y, y1: top }, { x0: x1 - 0.1 + out, x1: x1 + out, z0: zs, z1, y0: y, y1: top });
  // Laundry pole hangers and poles.
  for (const x of [x0 + 0.5, x1 - 0.5]) {
    kit.box('metal', x - 0.015, top - 0.2, z1 - 0.12, x + 0.015, top + 0.62, z1 - 0.1, 0x9a9da0);
    kit.box('metal', x - 0.015, top + 0.6, z1 - 0.48, x + 0.015, top + 0.62, z1 - 0.1, 0x9a9da0);
  }
  for (const dz of [0.25, 0.4]) {
    const pole = new THREE.CylinderGeometry(0.016, 0.016, x1 - x0 - 0.7, 10);
    kit.geometry('satin', pole, new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, top + 0.64, z1 - 0.1 - dz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1)), 0x6b8fa6, 'keep');
  }
  // Soffit downlight over the porch.
  const lamp = new THREE.CylinderGeometry(0.06, 0.06, 0.01, 20);
  kit.geometry('lamp', lamp, new THREE.Matrix4().makeTranslation(9.1, y - 0.385, D + 0.6), 0xffffff, 'keep');
}

function deckAndPorch(kit: Kit, solids: Solid[]) {
  const { x0, x1, z0, z1, y } = DECK;
  // Deck boards running east-west with gaps, over a dark skirt.
  const z = z0 + 0.115;
  kit.box('deck', x0 + 0.02, 0, z, x1 - 0.02, y - 0.03, z1 - 0.03, 0x4a4038, { skip: 'py' });
  for (let bz = z; bz < z1 - 0.01; bz += 0.126) kit.box('deck', x0, y - 0.03, bz, x1, y, Math.min(z1, bz + 0.12), 0x9e968e, { swap: false, shift: bz * 3.1 });
  // Stepping stone.
  const stone = new THREE.CylinderGeometry(0.44, 0.48, 0.24, 9);
  kit.geometry('granite', stone, new THREE.Matrix4().compose(new THREE.Vector3(2, 0.12, z1 + 0.25), new THREE.Quaternion(), new THREE.Vector3(1, 1, 0.6)), 0xb5b0a8);
  // Terrace canopy: aluminum posts and beam, translucent polycarbonate roof.
  const cz = z1 - 0.05;
  for (const px of [x0 + 0.08, x1 - 0.12]) {
    kit.box('sash', px - 0.035, 0, cz - 0.035, px + 0.035, 2.45, cz + 0.035, 0x4a4540);
    solids.push({ x0: px - 0.08, x1: px + 0.08, z0: cz - 0.08, z1: cz + 0.08, y0: 0, y1: 2.6 });
  }
  kit.box('sash', x0 - 0.05, 2.45, cz - 0.05, x1 + 0.05, 2.57, cz + 0.05, 0x4a4540);
  const rise = 2.95 - 2.57;
  const run = cz - D - 0.115;
  const tilt = Math.atan2(rise, run);
  const roofLength = Math.hypot(rise, run) + 0.25;
  kit.within(new THREE.Matrix4().compose(new THREE.Vector3(0, 2.57, cz + 0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), new THREE.Vector3(1, 1, 1)), () => {
    kit.box('frosted', x0 - 0.05, 0.02, -roofLength, x1 + 0.05, 0.03, 0, 0xffffff);
    for (let x = x0 - 0.05; x <= x1 + 0.06; x += (x1 - x0 + 0.1) / 5) kit.box('sash', x - 0.02, 0, -roofLength, x + 0.02, 0.05, 0, 0x4a4540);
  });
  // Porch: granite slab, one step, lamp and house plate by the door.
  kit.box('granite', PORCH.x0, 0, PORCH.z0 + 0.1, PORCH.x1, PORCH.y, PORCH.z1, 0x9c9894);
  kit.box('granite', PORCH.x0 + 0.2, 0, PORCH.z1, PORCH.x1 - 0.2, 0.09, PORCH.z1 + 0.35, 0x9c9894);
}

export interface HouseResult { solids: Solid[] }

export function buildHouse(kit: Kit): HouseResult {
  const solids: Solid[] = [];
  for (const r of ROOMS) if (!r.hidden) roomShell(kit, r);
  for (const o of OPENINGS) openingReveals(kit, o);
  // Genkan step (agari-kamachi): a polished beam at the edge of the raised floor.
  kit.box('whiteoak', 9 * M + 0.06, DOMA, 6 * M - 0.07, W - 0.1, FL1, 6 * M + 0.05, 0xc39a6a, { swap: true });
  wallSolids(solids);
  stairs(kit, solids);
  facades(kit);
  roof(kit);
  balcony(kit, solids);
  deckAndPorch(kit, solids);
  return { solids };
}
