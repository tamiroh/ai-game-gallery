/** Street grid, zones and ground heights shared by the city, the world and the flight model. */

export const PITCH = 110;
export const STREET_HALF = 20;
export const ROAD_HALF = 15;
export const BLOCK_HALF = PITCH / 2 - STREET_HALF;
export const SETBACK = 3;

export const RIVER = { z0: 20, z1: 90, water: -17 };
export const WATERFRONT = 680;
export const BAY_WATER = -4;
export const CITY = { x0: -2420, x1: 2420, z0: -2640, z1: WATERFRONT };

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const PARK: Rect = { x0: -530, x1: -240, z0: -310, z1: -20 };
export const PLAZA: Rect = { x0: -530, x1: -130, z0: -640, z1: -460 };

/** Avenues (constant x) that end at the river instead of crossing it. */
export const NO_BRIDGE = new Set([0, 550]);

export const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

export const overRiver = (z: number) => z > RIVER.z0 && z < RIVER.z1;

/** Height of the solid ground (or water surface) under a point. */
export function floorAt(z: number) {
  if (z > WATERFRONT) return BAY_WATER;
  return overRiver(z) ? RIVER.water : 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bridgeAvenues() {
  const avenues: number[] = [];
  for (let k = Math.ceil(CITY.x0 / PITCH); k * PITCH <= CITY.x1; k++) {
    if (!NO_BRIDGE.has(k * PITCH)) avenues.push(k * PITCH);
  }
  return avenues;
}
