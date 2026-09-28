// City grid: square blocks separated by four-lane roads. Blocks are indexed
// -BLOCK_RANGE..BLOCK_RANGE on both axes and roads 0..ROAD_COUNT-1.
export const BLOCK = 76;
export const ROAD = 16;
export const PITCH = BLOCK + ROAD;
export const SIDEWALK = 5;
export const CURB_HEIGHT = 0.15;
export const BLOCK_RANGE = 4;
export const ROAD_COUNT = BLOCK_RANGE * 2 + 2;
export const LANE_OFFSETS = [1.75, 5.25] as const;
export const WALK_LIMIT = (BLOCK_RANGE - 0.5) * PITCH;
export const SPAWN = { x: BLOCK / 2 - 2.2, z: 18, yaw: 0 };

export const AVENUES = ['Harbor Ave', 'Linden Ave', 'Park Ave', 'Mercer Ave', 'Central Ave', 'Grand Ave', 'Bishop Ave', 'Fulton Ave', 'Crescent Ave', 'Riverside Ave'];
export const STREETS = ['1st St', '2nd St', '3rd St', '4th St', '5th St', '6th St', '7th St', '8th St', '9th St', '10th St'];

export const roadCenter = (k: number) => (k - BLOCK_RANGE - 0.5) * PITCH;
export const blockCenter = (b: number) => b * PITCH;
export const nearestBlock = (v: number) => Math.round(v / PITCH);
export const nearestRoad = (v: number) => Math.round(v / PITCH + BLOCK_RANGE + 0.5);

export const PARKS = new Set(['-1,1', '2,-2']);
export const isPark = (bx: number, bz: number) => PARKS.has(`${bx},${bz}`);

/** Whether a point is on a raised block (sidewalk, lot, or park), including the curb edge. */
export function onBlock(x: number, z: number) {
  return Math.abs(x - blockCenter(nearestBlock(x))) < BLOCK / 2 && Math.abs(z - blockCenter(nearestBlock(z))) < BLOCK / 2;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Random = ReturnType<typeof rng>;
export const range = (random: Random, min: number, max: number) => min + (max - min) * random();
export const pick = <T>(random: Random, items: readonly T[]) => items[Math.floor(random() * items.length)]!;

/** Human-readable location like GTA's street readout. */
export function locationName(x: number, z: number) {
  const avenue = nearestRoad(x);
  const street = nearestRoad(z);
  const onAvenue = Math.abs(x - roadCenter(avenue)) < ROAD / 2 + SIDEWALK;
  const onStreet = Math.abs(z - roadCenter(street)) < ROAD / 2 + SIDEWALK;
  const avenueName = AVENUES[avenue] ?? '';
  const streetName = STREETS[street] ?? '';
  if (onAvenue && onStreet) return `${streetName} & ${avenueName}`;
  if (onAvenue) return avenueName;
  if (onStreet) return streetName;
  const bx = nearestBlock(x);
  const bz = nearestBlock(z);
  return isPark(bx, bz) ? (bx < 0 ? 'Linden Square' : 'Mercer Park') : Math.abs(x - roadCenter(avenue)) < Math.abs(z - roadCenter(street)) ? avenueName : streetName;
}

export function districtName(x: number, z: number) {
  const d = Math.hypot(x, z);
  if (d < 150) return 'Financial District';
  if (z < -150) return x < 0 ? 'Old Harbor' : 'North Market';
  if (z > 150) return x < 0 ? 'Riverside' : 'Southgate';
  return x < 0 ? 'West End' : 'Midtown East';
}

export const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
/** Right-hand side of a heading on the XZ plane (traffic drives on the right). */
export const rightOf = (dx: number, dz: number): [number, number] => [-dz, dx];

export type Signal = 'green' | 'yellow' | 'red';
const CYCLE = 40;
/** Signal shown to traffic moving along `axis` (0 = x, 1 = z) at intersection (i, j). */
export function signalAt(i: number, j: number, axis: number, time: number): Signal {
  const offset = (((i * 7 + j * 13) % 10) / 10) * CYCLE;
  const t = (time + offset) % CYCLE;
  const start = axis === 0 ? 0 : 20;
  const local = (t - start + CYCLE) % CYCLE;
  return local < 16 ? 'green' : local < 19 ? 'yellow' : 'red';
}
