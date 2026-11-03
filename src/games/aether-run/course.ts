/** A repeatable expedition: scores and flight times share the same course. */
export const COURSE_LENGTH = 2700;
export const ROAD_HALF = 6.5;
export const SECTORS = [
  {
    name: "The Hanging Gardens",
    short: "GARDENS",
    subtitle: "Follow the light. Find your line.",
    start: 0,
    sky: 0xa8cbd0,
    fog: 0xb1cbd0,
    sun: 0xffedc5,
    ground: 0x688a72,
  },
  {
    name: "The Broken Aqueduct",
    short: "AQUEDUCT",
    subtitle: "Old stones. New paths.",
    start: 900,
    sky: 0x8ea9bd,
    fog: 0x9eb5c5,
    sun: 0xffdbb6,
    ground: 0x7d8796,
  },
  {
    name: "The Sunward Observatory",
    short: "OBSERVATORY",
    subtitle: "One last push toward the sun.",
    start: 1800,
    sky: 0xb1a4b2,
    fog: 0xcab5bc,
    sun: 0xffbd82,
    ground: 0x92797e,
  },
] as const;
export type FeatureKind = "block" | "sweeper" | "crystal" | "ring" | "repair" | "pad";
export interface Feature {
  id: number;
  kind: FeatureKind;
  s: number;
  x: number;
  y: number;
  width: number;
}
export interface Gap {
  start: number;
  end: number;
}
export const GAPS: Gap[] = [
  { start: 685, end: 698 },
  { start: 1145, end: 1160 },
  { start: 1510, end: 1525 },
  { start: 2055, end: 2070 },
  { start: 2445, end: 2462 },
];
export function center(s: number) {
  return Math.sin(s / 175) * 21 + Math.sin(s / 67) * 4;
}
export function elevation(s: number) {
  return Math.sin(s / 210) * 6 + Math.sin(s / 81) * 1.8;
}
export function heading(s: number) {
  return -Math.atan((center(s + 1) - center(s - 1)) / 2);
}
export function sectorAt(s: number) {
  return Math.min(2, Math.floor(Math.max(0, s) / 900));
}
export function onRoad(s: number) {
  return !GAPS.some((g) => s > g.start && s < g.end);
}
export function movingX(feature: Feature, time: number) {
  return feature.kind === "sweeper" ? Math.sin(time * 1.35 + feature.s * 0.01) * 4 : feature.x;
}
export function seeded(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export function createCourse(): Feature[] {
  const features: Feature[] = [];
  const add = (kind: FeatureKind, s: number, x: number, y = 1, width = 1.9) =>
    features.push({ id: features.length, kind, s, x, y, width });
  const clear = (s: number, margin = 28) => !GAPS.some((g) => s > g.start - margin && s < g.end + margin);
  // The first stretch teaches steering before asking for a jump.
  for (let s = 65, row = 0; s < COURSE_LENGTH - 65; s += 37, row++) {
    if (!clear(s)) continue;
    const lane = [-3.7, 0, 3.7, 0][row % 4]!;
    if (s > 1050 && row % 5 === 0) add("sweeper", s, 0, 1.05, 2.4);
    else {
      add("block", s, lane, 1.1, 2.1);
      if (s > 1800 && row % 3 === 0) add("block", s, -lane || -3.7, 1.1, 2.1);
    }
    const doubleBlock = s > 1800 && row % 3 === 0;
    const safeX = doubleBlock && lane !== 0 ? 0 : lane <= 0 ? 3.7 : -3.7;
    if (s < 1000 || row % 5 !== 0)
      for (let j = 0; j < 4; j++) if (clear(s - 12 + j * 4, 17)) add("crystal", s - 12 + j * 4, safeX, 1.15, 0.65);
  }
  for (let s = 140, i = 0; s < COURSE_LENGTH - 40; s += 145, i++) {
    if (!clear(s, 45)) continue;
    const x = [0, -3.7, 3.7][i % 3]!;
    // Rings live between obstacle rows and give a clear, readable target.
    if (
      features.some(
        (f) => (f.kind === "block" || f.kind === "sweeper") && Math.abs(f.s - s) < 12 && Math.abs(f.x - x) < 2.8,
      )
    )
      continue;
    add("ring", s, x, 1.7, 2.1);
  }
  for (const gap of GAPS) {
    add("pad", gap.start - 30, 0, 0.02, 11.8);
    for (let j = 0; j < 5; j++) add("crystal", gap.start - 3 + j * 4, 0, 2.4 + Math.sin((j / 4) * Math.PI) * 1.1, 0.65);
    add("ring", gap.start + 7, 0, 3.4, 2.1);
  }
  for (const s of [830, 1700, 2310]) add("repair", s, 0, 1.2, 1);
  return features.sort((a, b) => a.s - b.s);
}
