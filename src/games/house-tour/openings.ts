import * as THREE from 'three';
import { Kit } from './kit';
import type { MaterialName } from './materials';
import { CH, FL1, M, OPENINGS, ROOMS, thickness, type Opening } from './plan';

const SASH = 0x3a3531;
const TRIM = 0xe2d3b8;
const LACQUER = 0x16110e;

/**
 * Runs `draw` in an opening's local frame: x runs along the wall (same numbers as a0/a1),
 * y is world height, z crosses the wall (0 at its centerline).
 */
function inFrame(kit: Kit, o: Opening, draw: () => void) {
  if (o.axis === 'x') kit.at(0, 0, o.at, 0, draw);
  else kit.at(o.at, 0, 0, -Math.PI / 2, draw);
}

/** Converts a world-side sign (+z / +x) into the local z sign of the opening frame. */
const localSign = (o: Opening, worldSign: number) => (o.axis === 'x' ? worldSign : -worldSign);

/** Local z sign pointing outdoors for an outside wall. */
const outward = (o: Opening) => localSign(o, o.at < 0.01 ? -1 : 1);

function floorAt(o: Opening) {
  const rooms = ROOMS.filter((r) => (o.axis === 'x' ? (Math.abs(r.z0 - o.at) < 0.01 || Math.abs(r.z1 - o.at) < 0.01) && r.x0 < o.a1 && r.x1 > o.a0 : (Math.abs(r.x0 - o.at) < 0.01 || Math.abs(r.x1 - o.at) < 0.01) && r.z0 < o.a1 && r.z1 > o.a0));
  return Math.max(...rooms.filter((r) => r.y <= o.y0 + 0.01).map((r) => r.y));
}

/** Sliding sash: stiles, rails, and a pane. */
function sash(kit: Kit, a0: number, a1: number, y0: number, y1: number, d0: number, d1: number, frosted: boolean) {
  const s = 0.034, r = 0.042;
  kit.box('sash', a0, y0, d0, a0 + s, y1, d1, SASH);
  kit.box('sash', a1 - s, y0, d0, a1, y1, d1, SASH);
  kit.box('sash', a0 + s, y0, d0, a1 - s, y0 + r, d1, SASH);
  kit.box('sash', a0 + s, y1 - r, d0, a1 - s, y1, d1, SASH);
  const dm = (d0 + d1) / 2;
  kit.box(frosted ? 'frosted' : 'glass', a0 + s, y0 + r, dm - 0.002, a1 - s, y1 - r, dm + 0.002, 0xffffff);
}

function curtains(kit: Kit, o: Opening, inside: number, floor: number, rng: number) {
  const room = ROOMS.find((r) => r.floor === (o.y0 > 3 ? 2 : 1) && (o.axis === 'x' ? r.x0 <= o.a0 && r.x1 >= o.a1 && (Math.abs(r.z0 - o.at) < 0.01 || Math.abs(r.z1 - o.at) < 0.01) : r.z0 <= o.a0 && r.z1 >= o.a1 && (Math.abs(r.x0 - o.at) < 0.01 || Math.abs(r.x1 - o.at) < 0.01)));
  const palette: Record<string, number> = { ldk: 0xcfc5b4, master: 0x7d8a92, bed2: 0x9fb3a6, bed3: 0xc9b39a, den: 0x8e8577 };
  const color = palette[room?.id ?? ''] ?? 0xcfc5b4;
  const top = o.y1 + 0.16;
  const bottom = o.y0 < floor + 0.3 ? floor + 0.015 : o.y0 - 0.12;
  const d = inside * 0.19;
  kit.box('satin', o.a0 - 0.18, top - 0.02, d - 0.012, o.a1 + 0.18, top + 0.02, d + 0.012, 0xe9e5dc);
  for (const a of [o.a0 - 0.18, o.a1 + 0.18]) kit.box('satin', a - 0.01, top - 0.04, inside * 0.1, a + 0.01, top + 0.03, d, 0xe9e5dc);
  const drape = (a0: number, width: number, depth: number, mat: MaterialName, tint: number, folds: number) => {
    const height = top - 0.03 - bottom;
    const geometry = new THREE.PlaneGeometry(width, height, folds * 6, 1);
    const pos = geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(((pos.getX(i) + width / 2) / width) * folds * Math.PI * 2 + rng) * depth);
    geometry.computeVertexNormals();
    kit.geometry(mat, geometry, new THREE.Matrix4().makeTranslation(a0 + width / 2, bottom + height / 2, d - inside * 0.03), tint, 'keep');
    geometry.dispose();
  };
  // Drapes gathered at both sides; a sheer panel drawn across part of the glass.
  drape(o.a0 - 0.16, 0.36, 0.04, 'curtain', color, 5);
  drape(o.a1 - 0.2, 0.36, 0.04, 'curtain', color, 5);
  if (!o.walk) {
    const width = (o.a1 - o.a0) * 0.45;
    kit.at(0, 0, inside * 0.03, 0, () => drape(o.a1 - width - 0.05, width, 0.02, 'sheer', 0xffffff, 7));
  }
}

function windowUnit(kit: Kit, o: Opening) {
  const out = outward(o);
  const inside = -out;
  const dd = (v: number) => out * v;
  const w = o.window ?? {};
  const floor = Math.max(floorAt(o), o.y0 > FL1 + 2 ? 3.4 : FL1);
  const frosted = !!w.frosted;
  // Outer frame.
  const fa = 0.03;
  kit.box('sash', o.a0, o.y0, dd(-0.03), o.a0 + fa, o.y1, dd(0.105), SASH);
  kit.box('sash', o.a1 - fa, o.y0, dd(-0.03), o.a1, o.y1, dd(0.105), SASH);
  kit.box('sash', o.a0, o.y1 - fa, dd(-0.03), o.a1, o.y1, dd(0.105), SASH);
  kit.box('sash', o.a0, o.y0, dd(-0.03), o.a1, o.y0 + 0.028, dd(0.115), SASH);
  // Two sliding sashes; the open ones slide the inner sash over the outer one.
  const a0 = o.a0 + fa, a1 = o.a1 - fa;
  const half = (a1 - a0) / 2 + 0.018;
  const y0 = o.y0 + 0.028, y1 = o.y1 - fa;
  sash(kit, a1 - half, a1, y0, y1, dd(0.04), dd(0.07), frosted);
  if (w.open) sash(kit, a1 - half - 0.035, a1 - 0.035, y0, y1, dd(0.002), dd(0.032), frosted);
  else {
    sash(kit, a0, a0 + half, y0, y1, dd(0.002), dd(0.032), frosted);
    kit.box('chrome', a0 + half - 0.05, y0 + (y1 - y0) * 0.48, dd(-0.01), a0 + half - 0.01, y0 + (y1 - y0) * 0.48 + 0.03, dd(0.002), 0xdcdcdc);
    if (w.screen && !frosted) {
      kit.box('sash', a0, y0, dd(0.075), a0 + half, y1, dd(0.09), SASH, { skip: '' });
      kit.box('mesh', a0 + 0.02, y0 + 0.02, dd(0.08), a0 + half - 0.02, y1 - 0.02, dd(0.085), 0xffffff);
    }
  }
  if (w.open) {
    // The glass that stays shut still blocks the way.
    kit.solid(a1 - half - 0.04, -0.12, o.a1 + 0.1, 0.12, o.y0, o.y1);
  }
  // Interior lining and sill board.
  const di0 = dd(-0.1 - 0.012), di1 = dd(-0.03);
  const lining = TRIM;
  kit.box('whiteoak', o.a0 - 0.012, o.y0, di0, o.a0, o.y1 + 0.012, di1, lining, { swap: true });
  kit.box('whiteoak', o.a1, o.y0, di0, o.a1 + 0.012, o.y1 + 0.012, di1, lining, { swap: true });
  kit.box('whiteoak', o.a0 - 0.012, o.y1, di0, o.a1 + 0.012, o.y1 + 0.012, di1, lining, { swap: true });
  if (o.y0 > floor + 0.2) kit.box('whiteoak', o.a0 - 0.04, o.y0 - 0.025, dd(-0.14), o.a1 + 0.04, o.y0, dd(-0.03), lining, { swap: true });
  // Outside: drip sill, and a slim hood over the larger windows.
  kit.box('sash', o.a0 - 0.02, o.y0 - 0.03, dd(0.1), o.a1 + 0.02, o.y0, dd(0.15), SASH);
  if (w.curtain || w.shoji) {
    kit.box('sash', o.a0 - 0.12, o.y1 + 0.14, dd(0.115), o.a1 + 0.12, o.y1 + 0.17, dd(0.52), 0x4a4540);
    kit.box('sash', o.a0 - 0.12, o.y1 + 0.1, dd(0.5), o.a1 + 0.12, o.y1 + 0.17, dd(0.52), 0x4a4540);
  }
  if (w.curtain) curtains(kit, o, inside, floor, o.a0 * 3.1);
  if (w.shoji) shoji(kit, o, inside);
}

/** Shoji screens on their own wooden track inside the tatami room window. */
function shoji(kit: Kit, o: Opening, inside: number) {
  const dd = (v: number) => inside * v;
  kit.box('whiteoak', o.a0 - 0.05, o.y0 - 0.02, dd(0.09), o.a1 + 0.05, o.y0 + 0.005, dd(0.2), 0xd6bf98, { swap: true });
  kit.box('whiteoak', o.a0 - 0.05, o.y1 - 0.005, dd(0.09), o.a1 + 0.05, o.y1 + 0.05, dd(0.2), 0xd6bf98, { swap: true });
  const width = (o.a1 - o.a0) / 2 + 0.015;
  const panel = (a0: number, d0: number) => {
    const y0 = o.y0 + 0.005, y1 = o.y1 - 0.005, a1 = a0 + width;
    const d1 = d0 + 0.03;
    const frame = 0.028;
    kit.box('whiteoak', a0, y0, dd(d0), a0 + frame, y1, dd(d1), 0xe6d3b2, { swap: true });
    kit.box('whiteoak', a1 - frame, y0, dd(d0), a1, y1, dd(d1), 0xe6d3b2, { swap: true });
    kit.box('whiteoak', a0, y0, dd(d0), a1, y0 + 0.07, dd(d1), 0xe6d3b2);
    kit.box('whiteoak', a0, y1 - frame, dd(d0), a1, y1, dd(d1), 0xe6d3b2);
    const cols = 4;
    for (let i = 1; i < cols; i++) {
      const a = a0 + frame + ((a1 - a0 - 2 * frame) * i) / cols;
      kit.box('whiteoak', a - 0.006, y0 + 0.07, dd(d0 + 0.004), a + 0.006, y1 - frame, dd(d1 - 0.004), 0xece0c8);
    }
    const rows = Math.round((y1 - y0) / 0.23);
    for (let j = 1; j < rows; j++) {
      const y = y0 + 0.07 + ((y1 - frame - y0 - 0.07) * j) / rows;
      kit.box('whiteoak', a0 + frame, y - 0.006, dd(d0 + 0.004), a1 - frame, y + 0.006, dd(d1 - 0.004), 0xece0c8);
    }
    kit.box('shoji', a0 + frame, y0 + 0.07, dd(d0 - 0.001), a1 - frame, y1 - frame, dd(d0 + 0.001), 0xffffff);
  };
  panel(o.a0, 0.1);
  panel(o.a0 + width * 0.6, 0.14);
}

function doorCasing(kit: Kit, o: Opening, color = TRIM, depth?: number) {
  const t = depth ?? thickness(o.axis, o.at);
  const j = 0.025, c = 0.06;
  kit.box('whiteoak', o.a0, o.y0, -t / 2 - 0.004, o.a0 + j, o.y1, t / 2 + 0.004, color, { swap: true });
  kit.box('whiteoak', o.a1 - j, o.y0, -t / 2 - 0.004, o.a1, o.y1, t / 2 + 0.004, color, { swap: true });
  kit.box('whiteoak', o.a0, o.y1 - j, -t / 2 - 0.004, o.a1, o.y1, t / 2 + 0.004, color);
  for (const side of [-1, 1]) {
    const d0 = side * (t / 2), d1 = side * (t / 2 + 0.012);
    kit.box('whiteoak', o.a0 - c + j, o.y0, d0, o.a0 + j, o.y1 + c - j, d1, color, { swap: true });
    kit.box('whiteoak', o.a1 - j, o.y0, d0, o.a1 + c - j, o.y1 + c - j, d1, color, { swap: true });
    kit.box('whiteoak', o.a0 - c + j, o.y1 - j, d0, o.a1 + c - j, o.y1 + c - j, d1, color);
  }
}

function lever(kit: Kit, a: number, y: number, d: number, dir: number, side: number) {
  kit.box('chrome', a - 0.028, y - 0.028, d, a + 0.028, y + 0.028, d + side * 0.008, 0xcfcfcf);
  kit.box('chrome', a - 0.008, y - 0.008, d, a + 0.008, y + 0.008, d + side * 0.055, 0xcfcfcf);
  kit.box('chrome', Math.min(a, a + dir * 0.12), y - 0.009, d + side * 0.045, Math.max(a, a + dir * 0.12), y + 0.009, d + side * 0.063, 0xcfcfcf);
}

/** Flush interior door leaf in its own frame: x from 0 to `width` (away from the hinge). */
function leaf(kit: Kit, width: number, height: number, glass: boolean, color: number) {
  const t = 0.017;
  if (glass) {
    const s = 0.1;
    kit.box('whiteoak', 0, 0, -t, s, height, t, color, { swap: true });
    kit.box('whiteoak', width - s, 0, -t, width, height, t, color, { swap: true });
    kit.box('whiteoak', s, 0, -t, width - s, 0.22, t, color);
    kit.box('whiteoak', s, height - 0.12, -t, width - s, height, t, color);
    const panes = 3;
    const h = (height - 0.34) / panes;
    for (let i = 0; i < panes; i++) {
      if (i) kit.box('whiteoak', s, 0.22 + i * h - 0.03, -t, width - s, 0.22 + i * h + 0.03, t, color);
      kit.box('frosted', s, 0.22 + i * h, -0.003, width - s, 0.22 + (i + 1) * h, 0.003, 0xffffff);
    }
  } else {
    kit.box('whiteoak', 0, 0, -t, width, height, t, color, { swap: true, shift: width * 1.7 });
    // Two shallow grooves give the flush panel its proportions.
    for (const y of [height * 0.33, height * 0.66]) for (const side of [-1, 1]) kit.box('satin', 0.08, y - 0.002, side * t, width - 0.08, y + 0.002, side * (t + 0.001), 0x9d8a6c);
  }
  for (const side of [-1, 1]) lever(kit, width - 0.07, 0.95, side * t, -1, side);
}

function swingDoor(kit: Kit, o: Opening) {
  const t = thickness(o.axis, o.at);
  const side = localSign(o, o.swing ?? 1);
  doorCasing(kit, o);
  const width = o.a1 - o.a0 - 0.052;
  const hingeA = o.hinge === 1 ? o.a1 - 0.026 : o.a0 + 0.026;
  // Opened 90° into the room it swings toward.
  const yaw = o.hinge === 1 ? side * (Math.PI / 2) : -side * (Math.PI / 2);
  kit.at(hingeA, o.y0 + 0.008, side * (t / 2 - 0.02), yaw, () => {
    kit.at(0, 0, 0, o.hinge === 1 ? Math.PI : 0, () => {
      leaf(kit, width, o.y1 - o.y0 - 0.035, !!o.glass, 0xe7d8bd);
      kit.solid(0, -0.03, width, 0.03, o.y0, o.y1);
    });
    for (const y of [0.2, 1.0, 1.75]) kit.box('chrome', -0.012, y, -0.02, 0.012, y + 0.1, 0.02, 0xbdbdbd);
  });
}

function slideDoor(kit: Kit, o: Opening) {
  const t = thickness(o.axis, o.at);
  doorCasing(kit, o);
  const side = -1;
  const width = o.a1 - o.a0 + 0.02;
  const d = side * (t / 2 + 0.03);
  kit.box('satin', o.a0 - 0.05, o.y1 + 0.03, d - 0.02, o.a1 + width, o.y1 + 0.07, d + 0.02, 0xe9e5dc);
  kit.at(o.a1 - 0.14, o.y0 + 0.01, d, 0, () => {
    kit.box('whiteoak', 0, 0, -0.016, width, o.y1 - o.y0 + 0.05, 0.016, 0xe7d8bd, { swap: true });
    kit.box('satin', 0.03, 0.85, -0.02, 0.05, 1.15, 0.02, 0x5c554c);
    kit.solid(0, -0.02, width, 0.02, o.y0, o.y1);
  });
}

function foldDoor(kit: Kit, o: Opening) {
  doorCasing(kit, o, 0xf1efe9);
  const side = localSign(o, 1);
  const panel = (o.a1 - o.a0 - 0.05) / 2;
  const h = o.y1 - o.y0 - 0.04;
  kit.at(o.a0 + 0.03, o.y0 + 0.02, side * 0.06, 0, () => {
    for (const [x, yaw] of [[0, side * -1.35], [panel * Math.cos(1.35) + 0.01, side * 1.35 - Math.PI]] as const) {
      kit.at(x, 0, side * panel * Math.sin(1.35) * (x ? 1 : 0), yaw, () => {
        kit.box('satin', 0, 0, -0.012, panel, h, 0.012, 0xf4f3f0, { skip: '' });
        kit.box('frosted', 0.05, 0.08, -0.014, panel - 0.05, h - 0.08, 0.014, 0xffffff);
      });
    }
  });
}

function closetDoors(kit: Kit, o: Opening) {
  doorCasing(kit, o);
  const w = (o.a1 - o.a0 - 0.05) / 2;
  for (let i = 0; i < 2; i++) {
    const a = o.a0 + 0.025 + i * w;
    kit.box('whiteoak', a + 0.002, o.y0 + 0.01, -0.016, a + w - 0.002, o.y1 - 0.025, 0.016, 0xe7d8bd, { swap: true, shift: i * 0.6 });
    for (const s of [-1, 1]) kit.box('chrome', a + (i ? 0.03 : w - 0.05), o.y0 + 0.9, s * 0.016, a + (i ? 0.05 : w - 0.03), o.y0 + 1.1, s * 0.03, 0xcfcfcf);
  }
}

function entryDoor(kit: Kit, o: Opening) {
  const out = outward(o);
  const depth = 0.23;
  kit.at(0, 0, out * 0.005, 0, () => doorCasing(kit, o, 0x2e2a27, depth));
  const width = o.a1 - o.a0 - 0.06;
  const height = o.y1 - o.y0 - 0.04;
  // Aluminum threshold.
  kit.box('metal', o.a0, o.y0 - 0.01, -0.12, o.a1, o.y0 + 0.012, 0.12, 0x8c8a86);
  kit.at(o.a0 + 0.03, o.y0 + 0.012, out * 0.1, -out * (Math.PI / 2) * 1.05, () => {
    kit.box('walnut', 0, 0, -0.03, width, height, 0.03, 0x6d5140, { swap: true });
    // Vertical slit window and grooves.
    kit.box('frosted', width - 0.2, 0.35, -0.032, width - 0.12, height - 0.3, 0.032, 0xffffff);
    for (let x = 0.12; x < width - 0.3; x += 0.12) for (const s of [-1, 1]) kit.box('satin', x - 0.003, 0.08, s * 0.03, x + 0.003, height - 0.08, s * 0.031, 0x4a372b);
    // Long pull bar outside, lever inside.
    kit.box('metal', width - 0.1, 0.6, out * 0.03, width - 0.08, 1.45, out * 0.075, 0x2b2b2b);
    kit.box('metal', width - 0.1, 0.62, out * 0.03, width - 0.08, 0.64, out * 0.075, 0x2b2b2b);
    kit.box('metal', width - 0.1, 1.41, out * 0.03, width - 0.08, 1.43, out * 0.075, 0x2b2b2b);
    lever(kit, width - 0.08, 0.95, -out * 0.03, -1, -out);
    kit.solid(0, -0.04, width, 0.04, o.y0, o.y1);
  });
}

function fusumaPanel(kit: Kit, a0: number, a1: number, y0: number, y1: number, d: number) {
  const f = 0.018, t = 0.0095;
  kit.box('lacquer', a0, y0, d - t, a0 + f, y1, d + t, LACQUER);
  kit.box('lacquer', a1 - f, y0, d - t, a1, y1, d + t, LACQUER);
  kit.box('lacquer', a0, y0, d - t, a1, y0 + f, d + t, LACQUER);
  kit.box('lacquer', a0, y1 - f, d - t, a1, y1, d + t, LACQUER);
  kit.box('fusuma', a0 + f, y0 + f, d - t + 0.001, a1 - f, y1 - f, d + t - 0.001, 0xffffff);
  const pull = new THREE.CylinderGeometry(0.03, 0.03, 0.022, 20);
  for (const a of [a0 + 0.075, a1 - 0.075]) kit.geometry('metal', pull, new THREE.Matrix4().compose(new THREE.Vector3(a, y0 + 0.82, d), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)), 0x6d5a3a, 'keep');
}

/** Kamoi lintel and grooved shikii sill shared by fusuma openings. */
function tracks(kit: Kit, o: Opening, t: number) {
  kit.box('whiteoak', o.a0, o.y1, -t / 2 - 0.005, o.a1, o.y1 + 0.045, t / 2 + 0.005, 0xd6bf98, { swap: true });
  kit.box('whiteoak', o.a0, o.y0 - 0.05, -t / 2, o.a1, o.y0 + 0.004, t / 2, 0xd9c29e, { swap: true });
  for (const d of [-0.018, 0.018]) kit.box('satin', o.a0, o.y0 + 0.003, d - 0.01, o.a1, o.y0 + 0.005, d + 0.01, 0x8e7658);
}

function fusumaOpening(kit: Kit, o: Opening) {
  const t = thickness(o.axis, o.at);
  tracks(kit, o, t);
  const span = o.a1 - o.a0;
  const y0 = o.y0 + 0.004, y1 = o.y1;
  if (span > 1.5) {
    const pw = span / 4 + 0.012;
    fusumaPanel(kit, o.a0, o.a0 + pw, y0, y1, -0.018);
    fusumaPanel(kit, o.a0 + 0.03, o.a0 + 0.03 + pw, y0, y1, 0.018);
    fusumaPanel(kit, o.a1 - pw - 0.03, o.a1 - 0.03, y0, y1, 0.018);
    fusumaPanel(kit, o.a1 - pw, o.a1, y0, y1, -0.018);
    kit.solid(o.a0, -0.04, o.a0 + pw + 0.05, 0.04, o.y0, o.y1);
    kit.solid(o.a1 - pw - 0.05, -0.04, o.a1, 0.04, o.y0, o.y1);
  } else {
    // A single sliding panel pushed aside along the tatami-room face.
    const side = localSign(o, -1);
    const d = side * (t / 2 + 0.02);
    kit.box('whiteoak', o.a0 - span, o.y1, d - 0.02, o.a1, o.y1 + 0.045, d + 0.02, 0xd6bf98, { swap: true });
    fusumaPanel(kit, o.a0 - span + 0.1, o.a0 + 0.1, y0, y1, d);
  }
}

function tokonoma(kit: Kit, o: Opening) {
  // Lacquered front rail of the raised alcove floor, and the cedar hanging beam.
  kit.box('lacquer', o.a0, FL1, -0.06, o.a1, o.y0, 0.05, LACQUER);
  kit.box('cedar', o.a0, o.y1, -0.05, o.a1, o.y1 + 0.075, 0.035, 0xb88b5c, { swap: true });
  // Tokobashira: a lightly figured natural post between the alcove and the cupboard.
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const y = (i / 24) * CH;
    points.push(new THREE.Vector2(0.058 + Math.sin(i * 1.7) * 0.004 + Math.sin(i * 0.43) * 0.003, y));
  }
  kit.geometry('whiteoak', new THREE.LatheGeometry(points, 20), new THREE.Matrix4().makeTranslation(o.a1 + 0.06, FL1, 0), 0xd8b384);
  // Hanging scroll: brocade mount, painting, rods.
  const back = -(M - 0.07);
  kit.box('linen', (o.a0 + o.a1) / 2 - 0.3, FL1 + 0.35, back, (o.a0 + o.a1) / 2 + 0.3, FL1 + 1.85, back + 0.006, 0x6e5a3e);
  kit.quad('scroll', [[(o.a0 + o.a1) / 2 - 0.22, FL1 + 0.55, back + 0.008], [(o.a0 + o.a1) / 2 + 0.22, FL1 + 0.55, back + 0.008], [(o.a0 + o.a1) / 2 + 0.22, FL1 + 1.6, back + 0.008], [(o.a0 + o.a1) / 2 - 0.22, FL1 + 1.6, back + 0.008]], [[0, 0], [1, 0], [1, 1], [0, 1]], 0xffffff, [0, 0, 1]);
  const rod = new THREE.CylinderGeometry(0.012, 0.012, 0.68, 12);
  kit.geometry('lacquer', rod, new THREE.Matrix4().compose(new THREE.Vector3((o.a0 + o.a1) / 2, FL1 + 0.34, back + 0.015), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1)), 0x2a1b12, 'keep');
  kit.box('satin', (o.a0 + o.a1) / 2 - 0.005, FL1 + 1.85, back, (o.a0 + o.a1) / 2 + 0.005, FL1 + 2.05, back + 0.01, 0xd8c8a0);
  // Vase with a flowering branch.
  const vase = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.07, 0.005), new THREE.Vector2(0.095, 0.08), new THREE.Vector2(0.06, 0.2), new THREE.Vector2(0.035, 0.26), new THREE.Vector2(0.045, 0.3), new THREE.Vector2(0.04, 0.3)], 28);
  const vx = o.a0 + 0.45, vz = back + 0.35;
  kit.geometry('gloss', vase, new THREE.Matrix4().makeTranslation(vx, o.y0, vz), 0x2f4a5c, 'keep');
  const branch = (x: number, y: number, z: number, dx: number, dy: number, dz: number, r: number) => {
    const a = new THREE.Vector3(x, y, z), b = new THREE.Vector3(x + dx, y + dy, z + dz);
    const dir = b.clone().sub(a);
    kit.geometry('matte', new THREE.CylinderGeometry(r * 0.7, r, dir.length(), 6), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)), 0x3b2a1e, 'keep');
    return b;
  };
  const tip = branch(vx, o.y0 + 0.28, vz, 0.12, 0.45, 0.02, 0.012);
  const tip2 = branch(tip.x, tip.y, tip.z, 0.22, 0.12, 0.05, 0.008);
  const tip3 = branch(tip.x - 0.02, tip.y - 0.12, tip.z, -0.18, 0.2, 0.03, 0.007);
  const blossom = new THREE.IcosahedronGeometry(0.018, 0);
  for (const [i, t] of [tip, tip2, tip3, tip.clone().lerp(tip2, 0.5), tip.clone().lerp(tip3, 0.6)].entries()) {
    for (let k = 0; k < 3; k++) kit.geometry('satin', blossom, new THREE.Matrix4().makeTranslation(t.x + Math.sin(i * 3 + k) * 0.03, t.y + Math.cos(i + k * 2) * 0.03, t.z + Math.sin(k * 1.3) * 0.03), 0xf2c7cf, 'keep');
  }
}

function oshiire(kit: Kit, o: Opening) {
  tracks(kit, o, INT_T);
  const pw = (o.a1 - o.a0) / 2 + 0.012;
  fusumaPanel(kit, o.a0, o.a0 + pw, o.y0 + 0.004, o.y1, -0.018);
  fusumaPanel(kit, o.a1 - pw, o.a1, o.y0 + 0.004, o.y1, 0.018);
}

const INT_T = 0.12;

/** Transom above the fusuma: a slim frame filled with close-set vertical slats. */
function ranma(kit: Kit, o: Opening) {
  const t = INT_T;
  const f = 0.03;
  kit.box('whiteoak', o.a0, o.y0, -t / 2, o.a0 + f, o.y1, t / 2, 0xd6bb90, { swap: true });
  kit.box('whiteoak', o.a1 - f, o.y0, -t / 2, o.a1, o.y1, t / 2, 0xd6bb90, { swap: true });
  kit.box('whiteoak', o.a0, o.y0, -t / 2, o.a1, o.y0 + f, t / 2, 0xd6bb90);
  kit.box('whiteoak', o.a0, o.y1 - f, -t / 2, o.a1, o.y1, t / 2, 0xd6bb90);
  const mid = (o.y0 + o.y1) / 2;
  kit.box('whiteoak', o.a0 + f, mid - 0.008, -0.012, o.a1 - f, mid + 0.008, 0.012, 0xc9ad83);
  for (let a = o.a0 + f + 0.03; a < o.a1 - f - 0.01; a += 0.032) kit.box('whiteoak', a - 0.005, o.y0 + f, -0.009, a + 0.005, o.y1 - f, 0.009, 0xdcc29a);
}

/** Six mats in the classic pinwheel layout, with posts, nageshi and tatami-yose. */
function washitsu(kit: Kit) {
  const x0 = 5 * M + 0.06, x1 = 9 * M - 0.06, z0 = 5 * M + 0.06, z1 = 8 * M - 0.1;
  const sx = (x1 - x0) / 4, sz = (z1 - z0) / 3;
  const mats: [number, number, number, number][] = [[0, 0, 2, 1], [2, 0, 4, 1], [0, 1, 1, 3], [3, 1, 4, 3], [1, 1, 3, 2], [1, 2, 3, 3]];
  for (const [i, [a, b, c, d]] of mats.entries()) {
    const mx0 = x0 + a * sx + 0.0015, mx1 = x0 + c * sx - 0.0015, mz0 = z0 + b * sz + 0.0015, mz1 = z0 + d * sz - 0.0015;
    const alongX = mx1 - mx0 > mz1 - mz0;
    const y = FL1;
    const shift = (i * 0.37) % 1;
    const len = Math.max(mx1 - mx0, mz1 - mz0) / 1.82;
    const uv: [number, number][] = alongX
      ? [[shift, 0], [shift + len, 0], [shift + len, 0.5], [shift, 0.5]]
      : [[shift + len, 0], [shift + len, 0.5], [shift, 0.5], [shift, 0]];
    kit.quad('tatami', [[mx0, y, mz1], [mx1, y, mz1], [mx1, y, mz0], [mx0, y, mz0]], alongX ? uv : [uv[1]!, uv[2]!, uv[3]!, uv[0]!], 0xf2efe0, [0, 1, 0]);
    kit.box('matte', mx0, y - 0.055, mz0, mx1, y - 0.002, mz1, 0x7d7658, { skip: 'py' });
  }
  // Posts at corners and beside openings.
  const post = (x: number, z: number) => kit.box('whiteoak', x - 0.055, FL1, z - 0.055, x + 0.055, FL1 + CH, z + 0.055, 0xdcc29a, { swap: false, shift: x + z });
  for (const [x, z] of [[5 * M + 0.02, 5 * M + 0.02], [9 * M - 0.02, 5 * M + 0.02], [5 * M + 0.02, 8 * M - 0.06], [9 * M - 0.02, 8 * M - 0.06], [9 * M - 0.02, 6 * M], [5.0, 8 * M - 0.06], [7.74, 8 * M - 0.06]] as const) post(x, z);
  // Nageshi band all around at lintel height.
  const ny0 = FL1 + 1.85, ny1 = ny0 + 0.09;
  kit.box('whiteoak', x0, ny0, z0, x1, ny1, z0 + 0.03, 0xd6bb90);
  kit.box('whiteoak', x0, ny0, z1 - 0.03, x1, ny1, z1, 0xd6bb90);
  kit.box('whiteoak', x0, ny0, z0, x0 + 0.03, ny1, z1, 0xd6bb90, { swap: true });
  kit.box('whiteoak', x1 - 0.03, ny0, z0, x1, ny1, z1, 0xd6bb90, { swap: true });
}

export function buildOpenings(kit: Kit) {
  for (const o of OPENINGS) {
    inFrame(kit, o, () => {
      switch (o.kind) {
        case 'window': return windowUnit(kit, o);
        case 'swing': return swingDoor(kit, o);
        case 'slide': return slideDoor(kit, o);
        case 'fold': return foldDoor(kit, o);
        case 'closet': return closetDoors(kit, o);
        case 'entry': return entryDoor(kit, o);
        case 'fusuma': return fusumaOpening(kit, o);
        case 'toko': return tokonoma(kit, o);
        case 'oshiire': return oshiire(kit, o);
        case 'ranma': return ranma(kit, o);
        default: return undefined;
      }
    });
  }
  washitsu(kit);
}
