import type { MaterialName } from './materials';

/** One module (半間) of the Japanese 910 mm grid. */
export const M = 0.91;
/** Footprint: 11 × 8 modules. x runs east, z runs south (the street side). */
export const W = 11 * M;
export const D = 8 * M;
export const FL1 = 0.5;
export const FL2 = 3.4;
export const CH = 2.4;
export const DOMA = 0.2;
export const EXT = 0.2;
export const INT = 0.12;
/** Top of the walls where the eaves start. */
export const EAVE = FL2 + CH + 0.4;
export const BALCONY = { x0: 4 * M, x1: W, z0: D, z1: D + 1.1, y: FL2 - 0.1 };
export const DECK = { x0: 0, x1: 5 * M, z0: D, z1: D + 1.9, y: FL1 - 0.06 };
export const PORCH = { x0: 8.0, x1: W + 0.1, z0: D, z1: D + 1.25, y: DOMA - 0.02 };

export const STAIR = { x0: 5 * M, x1: 9 * M, z0: 3 * M, z1: 4 * M, steps: 14 };
export const RISE = (FL2 - FL1) / STAIR.steps;
export const TREAD = (STAIR.x1 - STAIR.x0) / STAIR.steps;

/** Walking height on the stairs; they climb westward from the entrance hall. */
export function stairHeight(x: number) {
  const i = Math.min(STAIR.steps - 1, Math.max(0, Math.floor((STAIR.x1 - x) / TREAD)));
  return FL1 + (i + 1) * RISE;
}

export interface Finish { mat: MaterialName; color: number }
export const PAPER: Finish = { mat: 'paper', color: 0xf2efe8 };
export const CLAY: Finish = { mat: 'clay', color: 0xf0dcc0 };
export const BATH: Finish = { mat: 'bathWall', color: 0xe9e3d8 };
export const ACCENT: Finish = { mat: 'paper', color: 0xb9b2a4 };

export interface Room {
  id: string;
  name: string;
  floor: 1 | 2;
  x0: number; z0: number; x1: number; z1: number;
  /** Floor and ceiling heights. */
  y: number;
  top: number;
  wall: Finish;
  /** Per-edge overrides: n (z0), s (z1), w (x0), e (x1). */
  walls?: Partial<Record<'n' | 's' | 'w' | 'e', Finish>>;
  floorMat: MaterialName | null;
  floorColor?: number;
  ceiling: MaterialName | null;
  /** Closed cupboards: no interior is drawn and nobody walks in. */
  hidden?: boolean;
  walk?: boolean;
}

const room = (id: string, name: string, floor: 1 | 2, x0: number, z0: number, x1: number, z1: number, extra: Partial<Room> = {}): Room => ({
  id, name, floor, x0: x0 * M, z0: z0 * M, x1: x1 * M, z1: z1 * M,
  y: floor === 1 ? FL1 : FL2, top: (floor === 1 ? FL1 : FL2) + CH,
  wall: PAPER, floorMat: 'floor', ceiling: 'ceiling', walk: true, ...extra,
});

export const ROOMS: Room[] = [
  room('ldk', 'Living · Dining · Kitchen', 1, 0, 0, 5, 8, { walls: { w: ACCENT } }),
  room('wash', 'Washroom', 1, 5, 0, 7, 2, { floorMat: 'vinyl', floorColor: 0xd9d2c4 }),
  room('bath', 'Bathroom', 1, 7, 0, 9, 2, { floorMat: 'bathFloor', floorColor: 0xb9b6ae, wall: BATH, ceiling: 'bathWall', top: FL1 + 2.2, y: FL1 + 0.02 }),
  room('toilet1', 'Toilet', 1, 9, 0, 10, 2, { floorMat: 'vinyl', floorColor: 0xcfc6b4 }),
  room('closet1', 'Coat Closet', 1, 10, 0, 11, 2, { hidden: true, walk: false }),
  room('corridor1', 'Hallway', 1, 5, 2, 9, 3),
  room('hall1', 'Entrance Hall', 1, 9, 2, 11, 6),
  room('genkan', 'Genkan', 1, 9, 6, 11, 8, { y: DOMA, floorMat: 'granite', floorColor: 0x8a8580 }),
  room('stair', 'Staircase', 1, 5, 3, 9, 4, { top: FL2 + CH, floorMat: null }),
  room('toko', 'Tokonoma', 1, 5, 4, 7, 5, { y: FL1 + 0.12, wall: CLAY, floorMat: 'whiteoak', floorColor: 0xd8c09a, ceiling: 'cedar', walk: false }),
  room('oshiire', 'Oshiire', 1, 7, 4, 9, 5, { hidden: true, walk: false }),
  room('washitsu', 'Tatami Room', 1, 5, 5, 9, 8, { wall: CLAY, floorMat: null, ceiling: 'cedar' }),

  room('den', 'Study', 2, 0, 0, 5, 2),
  room('storage', 'Storeroom', 2, 5, 0, 9, 2),
  room('toilet2', 'Upstairs Toilet', 2, 9, 0, 10, 2, { floorMat: 'vinyl', floorColor: 0xcfc6b4 }),
  room('linen', 'Linen Cupboard', 2, 10, 0, 11, 2, { hidden: true, walk: false }),
  room('master', 'Main Bedroom', 2, 0, 2, 4, 8, { walls: { n: ACCENT } }),
  room('landing', 'Upstairs Landing', 2, 4, 2, 5, 4),
  room('corridor2', 'Upstairs Hallway', 2, 5, 2, 9, 3),
  room('hall2', 'Upstairs Hall', 2, 9, 2, 11, 4),
  room('bed2', 'Bedroom 2', 2, 4, 4, 8, 8, { walls: { e: { mat: 'paper', color: 0xc9d4d6 } } }),
  room('bed3', 'Bedroom 3', 2, 8, 4, 11, 8, { walls: { w: { mat: 'paper', color: 0xe3d3bd } } }),
];

export type OpeningKind = 'open' | 'swing' | 'slide' | 'fold' | 'closet' | 'entry' | 'window' | 'fusuma' | 'toko' | 'oshiire' | 'rail';

export interface Opening {
  /** The wall runs along this axis: 'x' walls sit at z = at, 'z' walls at x = at. */
  axis: 'x' | 'z';
  at: number;
  a0: number;
  a1: number;
  y0: number;
  y1: number;
  kind: OpeningKind;
  walk: boolean;
  /** Door hinge end (0 → a0, 1 → a1) and which side it swings into (+1 → +z / +x). */
  hinge?: 0 | 1;
  swing?: 1 | -1;
  glass?: boolean;
  window?: { frosted?: boolean; open?: boolean; shoji?: boolean; curtain?: boolean; fixed?: boolean; screen?: boolean };
}

const F1 = FL1, F2 = FL2;
const win = (axis: 'x' | 'z', at: number, a0: number, a1: number, y0: number, y1: number, window: Opening['window'] = {}): Opening => ({ axis, at, a0, a1, y0, y1, kind: 'window', walk: !!window.open, window: { screen: true, ...window } });

export const OPENINGS: Opening[] = [
  // Ground floor, outside walls.
  win('x', D, 0.95, 3.51, F1 + 0.02, F1 + 2.0, { open: true, curtain: true }),
  win('z', 0, 2.3, 3.7, F1 + 0.9, F1 + 2.0, { curtain: true }),
  win('x', 0, 0.9, 2.6, F1 + 1.15, F1 + 1.75, {}),
  win('x', 0, 5.0, 5.8, F1 + 1.3, F1 + 2.0, { frosted: true }),
  win('x', 0, 6.9, 7.7, F1 + 1.2, F1 + 1.95, { frosted: true }),
  win('x', 0, 8.4, 8.9, F1 + 1.2, F1 + 1.85, { frosted: true }),
  win('z', W, 2.6, 3.4, F1 + 0.9, F1 + 2.0, { frosted: true }),
  win('z', W, 5.95, 6.75, 1.25, 2.2, { frosted: true }),
  win('x', D, 5.09, 7.65, F1 + 0.42, F1 + 1.8, { shoji: true }),
  { axis: 'x', at: D, a0: 8.5, a1: 9.42, y0: DOMA, y1: DOMA + 2.25, kind: 'entry', walk: true, hinge: 0, swing: 1 },

  // Ground floor, inside.
  { axis: 'z', at: 5 * M, a0: 1.9, a1: 2.66, y0: F1, y1: F1 + 2.0, kind: 'swing', walk: true, hinge: 0, swing: -1, glass: true },
  { axis: 'z', at: 5 * M, a0: 5 * M + 0.06, a1: 8 * M - 0.1, y0: F1, y1: F1 + 1.8, kind: 'fusuma', walk: true },
  { axis: 'x', at: 2 * M, a0: 4.7, a1: 5.5, y0: F1, y1: F1 + 2.0, kind: 'slide', walk: true },
  { axis: 'z', at: 7 * M, a0: 0.5, a1: 1.25, y0: F1 + 0.02, y1: F1 + 1.95, kind: 'fold', walk: true },
  { axis: 'x', at: 2 * M, a0: 8.28, a1: 9.02, y0: F1, y1: F1 + 2.0, kind: 'swing', walk: true, hinge: 1, swing: 1 },
  { axis: 'x', at: 2 * M, a0: 9.2, a1: 9.92, y0: F1, y1: F1 + 2.0, kind: 'closet', walk: false },
  { axis: 'z', at: 9 * M, a0: 2 * M + 0.06, a1: 3 * M - 0.06, y0: F1, y1: F1 + 2.1, kind: 'open', walk: true },
  { axis: 'z', at: 9 * M, a0: 3 * M + 0.06, a1: 4 * M - 0.06, y0: F1, y1: F1 + CH, kind: 'open', walk: true },
  { axis: 'z', at: 9 * M, a0: 5 * M + 0.08, a1: 6 * M - 0.08, y0: F1, y1: F1 + 1.8, kind: 'fusuma', walk: true },
  { axis: 'x', at: 5 * M, a0: 5 * M + 0.06, a1: 7 * M - 0.06, y0: F1 + 0.12, y1: F1 + 1.95, kind: 'toko', walk: false },
  { axis: 'x', at: 5 * M, a0: 7 * M + 0.06, a1: 9 * M - 0.06, y0: F1, y1: F1 + 1.8, kind: 'oshiire', walk: false },
  { axis: 'x', at: 6 * M, a0: 9 * M + 0.06, a1: W - 0.1, y0: DOMA, y1: F1 + CH, kind: 'open', walk: true },

  // Stairwell.
  { axis: 'z', at: 9 * M, a0: 3 * M + 0.06, a1: 4 * M - 0.06, y0: F2, y1: F2 + CH, kind: 'rail', walk: false },
  { axis: 'x', at: 3 * M, a0: 5 * M + 0.06, a1: 9 * M - 0.06, y0: F2, y1: F2 + CH, kind: 'rail', walk: false },
  { axis: 'z', at: 5 * M, a0: 3 * M + 0.06, a1: 4 * M - 0.06, y0: F2, y1: F2 + CH, kind: 'open', walk: true },

  // Upper floor, outside walls.
  win('x', D, 0.6, 2.29, F2 + 0.9, F2 + 2.0, { curtain: true }),
  win('z', 0, 3.7, 5.39, F2 + 0.9, F2 + 2.0, { curtain: true }),
  win('x', 0, 1.2, 2.89, F2 + 1.0, F2 + 2.0, { curtain: true }),
  win('x', 0, 5.8, 6.6, F2 + 1.2, F2 + 1.9, {}),
  win('x', 0, 8.4, 8.9, F2 + 1.2, F2 + 1.85, { frosted: true }),
  win('z', W, 2.35, 3.15, F2 + 0.9, F2 + 2.0, { frosted: true }),
  win('x', D, 4.18, 6.74, F2 + 0.02, F2 + 2.0, { open: true, curtain: true }),
  win('x', D, 7.95, 9.64, F2 + 0.02, F2 + 2.0, { open: true, curtain: true }),
  win('z', W, 4.6, 6.29, F2 + 0.9, F2 + 2.0, { curtain: true }),

  // Upper floor, inside.
  { axis: 'z', at: 4 * M, a0: 1.9, a1: 2.66, y0: F2, y1: F2 + 2.0, kind: 'swing', walk: true, hinge: 1, swing: -1 },
  { axis: 'x', at: 2 * M, a0: 3.72, a1: 4.48, y0: F2, y1: F2 + 2.0, kind: 'swing', walk: true, hinge: 0, swing: -1 },
  { axis: 'x', at: 4 * M, a0: 3.72, a1: 4.48, y0: F2, y1: F2 + 2.0, kind: 'swing', walk: true, hinge: 0, swing: 1 },
  { axis: 'z', at: 5 * M, a0: 2 * M + 0.06, a1: 3 * M - 0.06, y0: F2, y1: F2 + CH, kind: 'open', walk: true },
  { axis: 'z', at: 9 * M, a0: 2 * M + 0.06, a1: 3 * M - 0.06, y0: F2, y1: F2 + 2.1, kind: 'open', walk: true },
  { axis: 'x', at: 2 * M, a0: 7.3, a1: 8.06, y0: F2, y1: F2 + 2.0, kind: 'swing', walk: true, hinge: 1, swing: -1 },
  { axis: 'x', at: 2 * M, a0: 8.28, a1: 9.02, y0: F2, y1: F2 + 2.0, kind: 'swing', walk: true, hinge: 1, swing: 1 },
  { axis: 'x', at: 2 * M, a0: 9.2, a1: 9.92, y0: F2, y1: F2 + 2.0, kind: 'closet', walk: false },
  { axis: 'x', at: 4 * M, a0: 8.3, a1: 9.06, y0: F2, y1: F2 + 2.0, kind: 'swing', walk: true, hinge: 1, swing: 1 },
];

export const isExterior = (axis: 'x' | 'z', at: number) => (axis === 'x' ? at < 0.01 || at > D - 0.01 : at < 0.01 || at > W - 0.01);
export const thickness = (axis: 'x' | 'z', at: number) => (isExterior(axis, at) ? EXT : INT);

/** Areas you can stand on outside of the rooms. */
export interface Ground { x0: number; z0: number; x1: number; z1: number; y: number; name: string }
export const GROUNDS: Ground[] = [
  { x0: DECK.x0, z0: DECK.z0, x1: DECK.x1, z1: DECK.z1, y: DECK.y, name: 'Wood Deck' },
  { x0: 1.55, z0: DECK.z1, x1: 2.45, z1: DECK.z1 + 0.5, y: 0.24, name: 'Garden' },
  { x0: PORCH.x0, z0: PORCH.z0, x1: PORCH.x1, z1: PORCH.z1, y: PORCH.y, name: 'Porch' },
  { x0: PORCH.x0 + 0.2, z0: PORCH.z1, x1: PORCH.x1 - 0.2, z1: PORCH.z1 + 0.35, y: 0.09, name: 'Porch' },
  { x0: BALCONY.x0, z0: BALCONY.z0, x1: BALCONY.x1, z1: BALCONY.z1, y: BALCONY.y, name: 'Balcony' },
];

export const SPAWN = { x: 8.95, z: 14.2, yaw: 0.06 };
