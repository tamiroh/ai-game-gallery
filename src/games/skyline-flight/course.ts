import * as THREE from "three";

/** A corner of the flight line: horizontal position, altitude, and the radius used to round the turn. */
interface Knot {
  x: number;
  z: number;
  y: number;
  r?: number;
}

// North is -z. The line comes in over the bay, runs up Harbor Avenue, drops onto the river under four bridges,
// climbs River Street to the Sky Gate, slaloms through the Crown Plaza towers, and dives into the park.
const KNOTS: Knot[] = [
  { x: 0, z: 1180, y: 92 },
  { x: 0, z: 700, y: 44 },
  { x: 0, z: 330, y: 27 },
  { x: 0, z: 140, y: 12 },
  { x: 0, z: 55, y: 4, r: 45 },
  { x: 100, z: 55, y: -9 },
  { x: 290, z: 55, y: -9.5 },
  { x: 452, z: 55, y: -9 },
  { x: 550, z: 55, y: 6, r: 45 },
  { x: 550, z: -200, y: 40 },
  { x: 550, z: -550, y: 44, r: 45 },
  { x: 220, z: -550, y: 42 },
  { x: -60, z: -550, y: 46, r: 40 },
  { x: -150, z: -508, y: 52, r: 48 },
  { x: -250, z: -592, y: 60, r: 48 },
  { x: -350, z: -508, y: 68, r: 48 },
  { x: -450, z: -592, y: 78, r: 48 },
  { x: -552, z: -540, y: 104, r: 55 },
  { x: -552, z: -330, y: 128, r: 70 },
  { x: -400, z: -165, y: 52 },
  { x: -320, z: -85, y: 34 },
];

export const COURSE_RADIUS = 24;
export const SLALOM_TOWERS = [
  { x: -150, z: -558, size: 40, height: 268 },
  { x: -250, z: -542, size: 42, height: 304 },
  { x: -350, z: -558, size: 38, height: 246 },
  { x: -450, z: -542, size: 42, height: 336 },
];
export const CROWN_TOWER = { x: -495, z: -385, size: 44, height: 392 };

export interface Course {
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
  distances: number[];
  length: number;
  /** Returns the index of the closest sample, searching near a previous index. */
  nearest(position: THREE.Vector3, hint: number): number;
  at(distance: number, target?: THREE.Vector3): THREE.Vector3;
  tangentAt(distance: number, target?: THREE.Vector3): THREE.Vector3;
}

const STEP = 1;

/** Builds straight runs joined by circular fillets in plan view, then threads a smooth altitude profile through the knots. */
function planPath() {
  const plan: { x: number; z: number }[] = [];
  const knotDistance: number[] = [];
  let travelled = 0;
  const push = (x: number, z: number) => {
    const last = plan[plan.length - 1];
    if (last) travelled += Math.hypot(x - last.x, z - last.z);
    plan.push({ x, z });
  };
  const line = (ax: number, az: number, bx: number, bz: number) => {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / STEP));
    for (let i = 1; i <= steps; i++) push(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps);
  };

  const first = KNOTS[0]!;
  push(first.x, first.z);
  knotDistance.push(0);
  let cursor = { x: first.x, z: first.z };
  for (let i = 1; i < KNOTS.length; i++) {
    const knot = KNOTS[i]!;
    const next = KNOTS[i + 1];
    if (!next || !knot.r) {
      line(cursor.x, cursor.z, knot.x, knot.z);
      cursor = { x: knot.x, z: knot.z };
      knotDistance.push(travelled);
      continue;
    }
    const inX = knot.x - cursor.x,
      inZ = knot.z - cursor.z;
    const outX = next.x - knot.x,
      outZ = next.z - knot.z;
    const inLength = Math.hypot(inX, inZ),
      outLength = Math.hypot(outX, outZ);
    const ax = inX / inLength,
      az = inZ / inLength;
    const bx = outX / outLength,
      bz = outZ / outLength;
    const turn = Math.acos(THREE.MathUtils.clamp(ax * bx + az * bz, -1, 1));
    const cut = Math.min(knot.r * Math.tan(turn / 2), inLength * 0.9, outLength * 0.45);
    const radius = cut / Math.tan(turn / 2);
    const startX = knot.x - ax * cut,
      startZ = knot.z - az * cut;
    line(cursor.x, cursor.z, startX, startZ);
    // Center of the fillet sits on the inside of the turn.
    const side = Math.sign(ax * bz - az * bx);
    const cx = startX - az * radius * side,
      cz = startZ + ax * radius * side;
    const startAngle = Math.atan2(startZ - cz, startX - cx);
    const steps = Math.max(2, Math.ceil((radius * turn) / STEP));
    for (let s = 1; s <= steps; s++) {
      const angle = startAngle + side * turn * (s / steps);
      push(cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius);
      if (s === Math.round(steps / 2)) knotDistance.push(travelled);
    }
    cursor = { x: knot.x + bx * cut, z: knot.z + bz * cut };
  }
  return { plan, knotDistance };
}

/** Monotone cubic (Fritsch–Carlson) altitude so climbs never overshoot between knots. */
function altitudeProfile(distances: number[], heights: number[]) {
  const n = distances.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) slopes.push((heights[i + 1]! - heights[i]!) / (distances[i + 1]! - distances[i]!));
  const tangents = heights.map((_, i) => {
    if (i === 0) return slopes[0]!;
    if (i === n - 1) return slopes[n - 2]!;
    const a = slopes[i - 1]!,
      b = slopes[i]!;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  return (s: number) => {
    let i = 0;
    while (i < n - 2 && s > distances[i + 1]!) i++;
    const h = distances[i + 1]! - distances[i]!;
    const t = THREE.MathUtils.clamp((s - distances[i]!) / h, 0, 1);
    const t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * heights[i]! +
      (t3 - 2 * t2 + t) * h * tangents[i]! +
      (-2 * t3 + 3 * t2) * heights[i + 1]! +
      (t3 - t2) * h * tangents[i + 1]!
    );
  };
}

export function createCourse(): Course {
  const { plan, knotDistance } = planPath();
  const altitude = altitudeProfile(
    knotDistance,
    KNOTS.map((knot) => knot.y),
  );
  const points: THREE.Vector3[] = [];
  let planDistance = 0;
  plan.forEach((p, i) => {
    if (i > 0) planDistance += Math.hypot(p.x - plan[i - 1]!.x, p.z - plan[i - 1]!.z);
    points.push(new THREE.Vector3(p.x, altitude(planDistance), p.z));
  });
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
  const tangents = points.map((_, i) =>
    new THREE.Vector3()
      .subVectors(points[Math.min(points.length - 1, i + 2)]!, points[Math.max(0, i - 2)]!)
      .normalize(),
  );
  const length = distances[distances.length - 1]!;

  const indexAt = (distance: number) => {
    const d = THREE.MathUtils.clamp(distance, 0, length);
    let lo = 0,
      hi = distances.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (distances[mid]! <= d) lo = mid;
      else hi = mid;
    }
    return { i: lo, t: (d - distances[lo]!) / Math.max(1e-6, distances[hi]! - distances[lo]!), j: hi };
  };

  return {
    points,
    tangents,
    distances,
    length,
    nearest(position, hint) {
      let best = hint,
        bestDistance = Infinity;
      const from = Math.max(0, hint - 80),
        to = Math.min(points.length - 1, hint + 160);
      for (let i = from; i <= to; i++) {
        const d = points[i]!.distanceToSquared(position);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      return best;
    },
    at(distance, target = new THREE.Vector3()) {
      const { i, j, t } = indexAt(distance);
      return target.lerpVectors(points[i]!, points[j]!, t);
    },
    tangentAt(distance, target = new THREE.Vector3()) {
      const { i, j, t } = indexAt(distance);
      return target.lerpVectors(tangents[i]!, tangents[j]!, t).normalize();
    },
  };
}

/** Names the stretch of the course a point on the line belongs to, for the HUD. */
export function sectionName(point: THREE.Vector3) {
  if (point.z > 680) return "Harbor Approach";
  if (Math.abs(point.x) < 30 && point.z > 90) return "Harbor Avenue";
  if (point.z > 10 && point.z < 100) return "River Gorge";
  if (point.x > 400) return "Meridian Avenue";
  if (point.x > -120) return "Sunset Street · Sky Gate";
  if (point.z < -470 && point.x > -500) return "Crown Plaza Slalom";
  if (point.z < -250) return "Crown Tower";
  return "Central Park";
}
