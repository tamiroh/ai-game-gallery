import * as THREE from 'three';
import { Kit, random, roundedRect, trs } from './kit';
import { D, W } from './plan';

const LOT = { x0: -4, x1: 14.2, z0: -3.6, z1: 13.2 };
const ROAD = { z0: 13.2, z1: 19.2 };

export const SITE = {
  x0: LOT.x0 + 0.3,
  x1: LOT.x1 - 0.3,
  z0: LOT.z0 + 0.3,
  z1: ROAD.z1 - 0.6,
  groundAt: (_x: number, _z: number) => 0,
};

function blockWall(kit: Kit, x0: number, z0: number, x1: number, z1: number, height: number) {
  kit.box('concrete', x0, 0, z0, x1, height, z1, 0xb9b5ab);
  // Block joints every 0.4 m along, 0.2 m up.
  const along = x1 - x0 > z1 - z0;
  const length = along ? x1 - x0 : z1 - z0;
  for (let y = 0.2; y < height - 0.05; y += 0.2) {
    if (along) for (const z of [z0 - 0.002, z1]) kit.box('matte', x0, y - 0.006, z, x1, y + 0.006, z + 0.002, 0x8e8a82);
    else for (const x of [x0 - 0.002, x1]) kit.box('matte', x, y - 0.006, z0, x + 0.002, y + 0.006, z1, 0x8e8a82);
  }
  for (let a = 0.4; a < length; a += 0.4) {
    if (along) for (const z of [z0 - 0.002, z1]) kit.box('matte', x0 + a - 0.006, 0, z, x0 + a + 0.006, height, z + 0.002, 0x8e8a82);
    else for (const x of [x0 - 0.002, x1]) kit.box('matte', x, 0, z0 + a - 0.006, x + 0.002, height, z0 + a + 0.006, 0x8e8a82);
  }
  kit.box('concrete', x0 - 0.01, height, z0 - 0.01, x1 + 0.01, height + 0.04, z1 + 0.01, 0xa29e95);
  kit.solid(x0, z0, x1, z1, 0, height + 0.04);
}

/** Aluminium louvre fence on top of a low block base. */
function fence(kit: Kit, x0: number, x1: number, z: number) {
  blockWall(kit, x0, z - 0.06, x1, z + 0.06, 0.6);
  for (let x = x0 + 0.05; x < x1; x += 2) kit.box('sash', x, 0.64, z - 0.03, x + 0.05, 1.5, z + 0.03, 0x4a4540);
  for (let y = 0.7; y < 1.48; y += 0.1) kit.box('sash', x0, y, z - 0.012, x1, y + 0.07, z + 0.012, 0x5a534b);
  kit.solid(x0, z - 0.06, x1, z + 0.06, 0, 1.5);
}

function leafCluster(kit: Kit, cx: number, cy: number, cz: number, radius: number, count: number, color: THREE.Color, seed: number, size = 0.09) {
  const rng = random(seed);
  const leaf = new THREE.PlaneGeometry(size, size * 1.4);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.cbrt(rng()) * radius;
    const s = Math.sqrt(1 - u * u);
    const x = cx + s * Math.cos(a) * r, y = cy + u * r * 0.7, z = cz + s * Math.sin(a) * r;
    tint.copy(color).multiplyScalar(0.75 + rng() * 0.45);
    kit.geometry('leaf', leaf, trs(x, y, z, rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI), tint, 'keep');
  }
  leaf.dispose();
}

function branch(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, color: number) {
  const dir = b.clone().sub(a);
  kit.geometry('oak', new THREE.CylinderGeometry(r1, r0, dir.length(), 8), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)), color, 'box');
}

/** A small Japanese maple: slender trunk splitting into a wide, airy crown. */
function maple(kit: Kit, x: number, z: number, seed: number, leaves = 0x9c3b22) {
  const rng = random(seed);
  const base = new THREE.Vector3(x, 0, z);
  const fork = new THREE.Vector3(x + 0.1, 1.3, z - 0.05);
  branch(kit, base, fork, 0.09, 0.07, 0x4e4038);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng();
    const tip = new THREE.Vector3(fork.x + Math.cos(a) * 0.9, fork.y + 0.9 + rng() * 0.6, fork.z + Math.sin(a) * 0.9);
    branch(kit, fork, tip, 0.05, 0.02, 0x4e4038);
    leafCluster(kit, tip.x, tip.y, tip.z, 0.75, 260, new THREE.Color(leaves), seed * 10 + i, 0.08);
  }
  kit.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, 3);
}

function shrub(kit: Kit, x: number, z: number, r: number, seed: number) {
  leafCluster(kit, x, r * 0.7, z, r, Math.round(r * 380), new THREE.Color(0x3f5a2c), seed, 0.06);
  kit.solid(x - r * 0.7, z - r * 0.7, x + r * 0.7, z + r * 0.7, 0, r * 1.4);
}

function hedge(kit: Kit, x0: number, z0: number, x1: number, z1: number, h: number, seed: number) {
  const rng = random(seed);
  kit.box('matte', x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, h - 0.05, z1 - 0.05, 0x2d4020);
  const area = (x1 - x0) * (z1 - z0) + ((x1 - x0) + (z1 - z0)) * 2 * h;
  const leaf = new THREE.PlaneGeometry(0.06, 0.08);
  for (let i = 0; i < area * 900; i++) {
    const face = rng();
    let x = x0 + rng() * (x1 - x0), y = rng() * h, z = z0 + rng() * (z1 - z0);
    if (face < 0.3) y = h - rng() * 0.05;
    else if (face < 0.65) z = rng() > 0.5 ? z0 + rng() * 0.05 : z1 - rng() * 0.05;
    else x = rng() > 0.5 ? x0 + rng() * 0.05 : x1 - rng() * 0.05;
    kit.geometry('leaf', leaf, trs(x, y, z, rng() * 3, rng() * 3, rng() * 3), new THREE.Color(0x456b30).multiplyScalar(0.7 + rng() * 0.5), 'keep');
  }
  leaf.dispose();
  kit.solid(x0, z0, x1, z1, 0, h);
}

/** A compact hatchback built from an extruded side profile. */
function car(kit: Kit, x: number, z: number, yaw: number) {
  kit.at(x, 0, z, yaw, () => {
    const body = new THREE.Shape();
    body.moveTo(-1.85, 0.32);
    body.lineTo(-1.85, 0.72);
    body.quadraticCurveTo(-1.8, 0.86, -1.5, 0.9);
    body.lineTo(-1.1, 0.92);
    body.lineTo(1.55, 0.9);
    body.quadraticCurveTo(1.82, 0.88, 1.85, 0.66);
    body.lineTo(1.85, 0.32);
    body.closePath();
    const width = 1.64;
    const bodyGeometry = new THREE.ExtrudeGeometry(body, { depth: width - 0.16, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 4, curveSegments: 10 });
    kit.geometry('gloss', bodyGeometry, new THREE.Matrix4().makeTranslation(0, 0, -(width - 0.16) / 2), 0xe8e6e1, 'keep');
    const cabin = new THREE.Shape();
    cabin.moveTo(-1.55, 0.9);
    cabin.quadraticCurveTo(-1.45, 1.38, -1.2, 1.48);
    cabin.lineTo(0.55, 1.5);
    cabin.quadraticCurveTo(0.75, 1.48, 1.3, 0.92);
    cabin.closePath();
    const cabinGeometry = new THREE.ExtrudeGeometry(cabin, { depth: width - 0.34, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 10 });
    kit.geometry('screen', cabinGeometry, new THREE.Matrix4().makeTranslation(0, 0, -(width - 0.34) / 2), 0x1b2226, 'keep');
    kit.box('gloss', -1.25, 1.52, -0.66, 0.45, 1.56, 0.66, 0xe8e6e1);
    // Pillars.
    for (const s of [-1, 1]) {
      kit.box('gloss', -0.12, 0.9, s * 0.75 - 0.04, -0.02, 1.52, s * 0.75 + 0.04, 0xe8e6e1);
      kit.box('satin', -0.6, 0.62, s * 0.815, -0.48, 0.66, s * 0.84, 0x2a2a2a);
      kit.box('satin', 0.4, 0.62, s * 0.815, 0.52, 0.66, s * 0.84, 0x2a2a2a);
    }
    // Wheels.
    const tyre = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 24);
    const rim = new THREE.CylinderGeometry(0.19, 0.19, 0.21, 16);
    for (const wx of [-1.2, 1.25]) for (const s of [-1, 1]) {
      kit.geometry('matte', tyre, trs(wx, 0.31, s * 0.7, Math.PI / 2), 0x1d1d1d, 'keep');
      kit.geometry('metal', rim, trs(wx, 0.31, s * 0.7, Math.PI / 2), 0x9a9da0, 'keep');
    }
    // Lamps, grille, plates, mirrors.
    for (const s of [-1, 1]) {
      kit.box('lamp', 1.88, 0.7, s * 0.55 - 0.16, 1.9, 0.78, s * 0.55 + 0.16, 0xdfe6ea);
      kit.box('gloss', -1.9, 0.72, s * 0.6 - 0.12, -1.88, 0.84, s * 0.6 + 0.12, 0x8a1a18);
      kit.box('gloss', 0.55, 1.0, s * 0.86, 0.72, 1.1, s * 0.95, 0xe8e6e1);
    }
    kit.box('screen', 1.9, 0.45, -0.45, 1.92, 0.62, 0.45, 0x222426);
    kit.box('satin', 1.92, 0.38, -0.2, 1.935, 0.5, 0.2, 0xf1f0e6);
    kit.box('satin', -1.935, 0.5, -0.2, -1.92, 0.62, 0.2, 0xf1f0e6);
    kit.box('matte', -1.88, 0.3, -0.8, 1.88, 0.42, 0.8, 0x2d2d2d);
    kit.solid(-1.95, -0.9, 1.95, 0.9, 0, 1.6);
  });
}

function utilityPole(kit: Kit, x: number, z: number) {
  const pole = new THREE.CylinderGeometry(0.13, 0.17, 10, 14);
  kit.geometry('concrete', pole, trs(x, 5, z), 0xb8b4ac);
  kit.box('sash', x - 0.9, 8.6, z - 0.05, x + 0.9, 8.7, z + 0.05, 0x5a5a5a);
  kit.box('sash', x - 0.6, 7.6, z - 0.05, x + 0.6, 7.7, z + 0.05, 0x5a5a5a);
  const transformer = new THREE.CylinderGeometry(0.22, 0.22, 0.7, 16);
  kit.geometry('satin', transformer, trs(x + 0.35, 7.0, z), 0x8f9392, 'keep');
  // Yellow and black guard sleeve at the base.
  for (let i = 0; i < 6; i++) kit.geometry('satin', new THREE.CylinderGeometry(0.18, 0.18, 0.3, 14, 1, true), trs(x, 0.15 + i * 0.3, z), i % 2 ? 0x1e1e1e : 0xe2b52b, 'keep');
  kit.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, 10);
}

function wire(kit: Kit, a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    points.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)));
  }
  kit.geometry('matte', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.012, 5), null, 0x1c1c1c, 'keep');
}

/** Simplified neighbouring houses so the windows look out onto a street, not a void. */
function neighbour(kit: Kit, x: number, z: number, w: number, d: number, yaw: number, siding: number, roofColor: number) {
  kit.at(x, 0, z, yaw, () => {
    const h = 5.8;
    kit.box('concrete', -w / 2, 0, -d / 2, w / 2, 0.45, d / 2, 0xb8b4ac);
    kit.box('siding', -w / 2, 0.45, -d / 2, w / 2, h, d / 2, siding, { skip: 'py' });
    const rise = (d / 2 + 0.5) * 0.45;
    const roof = new THREE.Shape();
    roof.moveTo(-d / 2 - 0.5, 0);
    roof.lineTo(0, rise);
    roof.lineTo(d / 2 + 0.5, 0);
    roof.lineTo(d / 2 + 0.5, -0.12);
    roof.lineTo(0, rise - 0.14);
    roof.lineTo(-d / 2 - 0.5, -0.12);
    roof.closePath();
    const geometry = new THREE.ExtrudeGeometry(roof, { depth: w + 0.8, bevelEnabled: false });
    kit.geometry('kawara', geometry, trs(-w / 2 - 0.4, h, 0, 0, Math.PI / 2, 0).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0)), roofColor, 'keep');
    for (const s of [-1, 1]) {
      kit.quad('siding', s < 0
        ? [[-w / 2, h, -d / 2], [-w / 2, h, d / 2], [-w / 2, h + rise - 0.2, 0], [-w / 2, h + rise - 0.2, 0]]
        : [[w / 2, h, d / 2], [w / 2, h, -d / 2], [w / 2, h + rise - 0.2, 0], [w / 2, h + rise - 0.2, 0]], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]], siding);
    }
    // Windows on the long faces: dark glass, frames, a few with drawn curtains.
    const rng = random(Math.round(x * 13 + z * 7));
    for (const s of [-1, 1]) for (const y of [1.3, 4.1]) for (let wx = -w / 2 + 1.1; wx < w / 2 - 1; wx += 2.1) {
      if (rng() < 0.25) continue;
      const zf = s * (d / 2 + 0.01);
      kit.box('sash', wx - 0.02, y - 0.02, zf - 0.03, wx + 1.3, y + 1.12, zf + 0.03, 0x3a3531);
      kit.box('screen', wx + 0.02, y + 0.02, zf - 0.035, wx + 1.26, y + 1.08, zf + 0.035, rng() < 0.3 ? 0x6e675c : 0x1f2429);
    }
  });
  kit.solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, 6);
}

export function buildSite(kit: Kit) {
  // Ground: lawn, gravel strips, parking slab, approach, road.
  const flat = (mat: 'grass' | 'gravel' | 'concrete' | 'asphalt' | 'granite', x0: number, z0: number, x1: number, z1: number, y: number, color: number) =>
    kit.quad(mat, [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]], color, [0, 1, 0]);
  flat('grass', LOT.x0, D, 7.8, LOT.z1, 0.004, 0xb9c49a);
  flat('gravel', LOT.x0, LOT.z0, LOT.x1, D, 0, 0xd7d0c4);
  flat('gravel', 7.8, D, 10.2, LOT.z1, 0.002, 0xd7d0c4);
  flat('concrete', 10.2, 8.2, LOT.x1, LOT.z1, 0.02, 0xd5d0c5);
  for (let x = 10.2 + 1.3; x < LOT.x1; x += 1.3) kit.box('matte', x - 0.01, 0.02, 8.2, x + 0.01, 0.022, LOT.z1, 0x9d998f);
  flat('asphalt', -40, ROAD.z0 + 0.25, 40, 60, -0.02, 0xbdbdbd);
  kit.box('concrete', -40, -0.02, ROAD.z0, 40, 0.04, ROAD.z0 + 0.25, 0xbab6ad);
  for (const z of [ROAD.z0 + 0.45]) kit.box('matte', -40, -0.019, z, 40, -0.014, z + 0.15, 0xe9e7e1);
  flat('grass', -40, -40, 40, LOT.z0 - 0.2, -0.01, 0x9fae84);
  flat('grass', -40, LOT.z0 - 0.2, LOT.x0 - 0.2, ROAD.z0, -0.01, 0x9fae84);
  flat('grass', LOT.x1 + 0.2, LOT.z0 - 0.2, 40, ROAD.z0, -0.01, 0x9fae84);
  // Stepping stones from the gate to the porch.
  const stone = new THREE.ExtrudeGeometry(roundedRect(0.62, 0.46, 0.12), { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  for (let i = 0; i < 5; i++) kit.geometry('granite', stone, trs(8.95 + (i % 2 ? 0.12 : -0.1), 0.0, 12.9 - i * 0.78, -Math.PI / 2, 0, (i * 0.7) % 0.3), 0xbab4aa);
  // Garden stepping stones to the deck.
  for (let i = 0; i < 4; i++) kit.geometry('granite', stone, trs(2.2 + i * 0.35, 0.0, 10.8 + i * 0.6, -Math.PI / 2, 0, i * 0.4), 0xb0aaa0);

  // Boundary walls, front fence, gate posts.
  blockWall(kit, LOT.x0, LOT.z0, LOT.x0 + 0.12, LOT.z1, 1.2);
  blockWall(kit, LOT.x0, LOT.z0, LOT.x1, LOT.z0 + 0.12, 1.2);
  blockWall(kit, LOT.x1 - 0.12, LOT.z0, LOT.x1, 8.2, 1.2);
  fence(kit, LOT.x0, 7.9, LOT.z1 - 0.1);
  kit.box('siding', 7.9, 0, LOT.z1 - 0.3, 8.45, 1.45, LOT.z1 + 0.05, 0x6f6259);
  kit.box('concrete', 7.88, 1.45, LOT.z1 - 0.32, 8.47, 1.49, LOT.z1 + 0.07, 0x8d8a83);
  kit.solid(7.9, LOT.z1 - 0.3, 8.45, LOT.z1 + 0.05, 0, 1.5);
  // Name plate (house number only), intercom, mailbox, gate lamp.
  kit.box('gloss', 8.0, 1.12, LOT.z1 + 0.05, 8.35, 1.3, LOT.z1 + 0.065, 0xece6d6);
  for (let i = 0; i < 3; i++) kit.box('matte', 8.07 + i * 0.08, 1.17, LOT.z1 + 0.065, 8.12 + i * 0.08, 1.25, LOT.z1 + 0.068, 0x3a3531);
  kit.box('satin', 8.1, 0.95, LOT.z1 + 0.05, 8.25, 1.07, LOT.z1 + 0.08, 0x2a2a2a);
  kit.box('lamp', 8.16, 1.03, LOT.z1 + 0.08, 8.2, 1.05, LOT.z1 + 0.082, 0x9fd3ff);
  kit.box('satin', 7.93, 0.55, LOT.z1 + 0.05, 8.4, 0.85, LOT.z1 + 0.15, 0x3d3a36);
  kit.box('sash', 10.0, 0, LOT.z1 - 0.3, 10.2, 1.45, LOT.z1 + 0.05, 0x3a3531);
  kit.solid(10.0, LOT.z1 - 0.3, 10.2, LOT.z1 + 0.05, 0, 1.5);

  // Garden planting.
  maple(kit, 6.4, 10.8, 3);
  maple(kit, -2.6, 11.5, 8, 0x5f7f35);
  shrub(kit, 5.2, 8.3, 0.55, 12);
  shrub(kit, 7.2, 8.4, 0.45, 13);
  shrub(kit, -3.2, 8.6, 0.6, 14);
  hedge(kit, LOT.x0 + 0.15, 12.3, 7.6, 12.9, 1.1, 21);
  for (let i = 0; i < 12; i++) {
    const rng = random(40 + i);
    leafCluster(kit, 4.9 + rng() * 2.6, 0.15, 9.3 + rng() * 0.6, 0.18, 40, new THREE.Color(i % 3 ? 0x4c6d34 : 0x8a5f9c), 60 + i, 0.05);
  }
  car(kit, 12.1, 10.9, Math.PI / 2);

  // Service yard: air-conditioner condensers, heat-pump water heater, meters.
  const condenser = (x: number, z: number, yaw: number) => kit.at(x, 0, z, yaw, () => {
    kit.box('concrete', -0.45, 0, -0.2, 0.45, 0.08, 0.2, 0xa6a39c);
    kit.box('satin', -0.4, 0.08, -0.15, 0.4, 0.66, 0.15, 0xe6e4de);
    kit.box('screen', -0.33, 0.14, 0.15, 0.08, 0.6, 0.152, 0x2f3335);
    for (let y = 0.17; y < 0.6; y += 0.04) kit.box('satin', -0.33, y, 0.152, 0.08, y + 0.012, 0.16, 0xd8d6d0);
    kit.solid(-0.45, -0.2, 0.45, 0.25, 0, 0.7);
  });
  condenser(-0.6, 5.2, -Math.PI / 2);
  condenser(-0.6, 1.6, -Math.PI / 2);
  kit.box('satin', W + 0.18, 0, 3.8, W + 0.85, 1.8, 4.5, 0xeeece6);
  kit.box('satin', W + 0.18, 0, 4.6, W + 1.0, 0.8, 5.3, 0xeeece6);
  kit.solid(W + 0.15, 3.8, W + 1.0, 5.3, 0, 1.8);
  kit.box('gloss', W + 0.12, 1.2, 1.4, W + 0.2, 1.5, 1.65, 0xdddcd6);
  kit.box('glass', W + 0.2, 1.3, 1.45, W + 0.21, 1.45, 1.6, 0xffffff);
  // Outdoor tap.
  kit.box('concrete', 3.6, 0, D + 0.3, 3.72, 0.8, D + 0.42, 0x9c968c);
  kit.box('chrome', 3.62, 0.62, D + 0.42, 3.7, 0.66, D + 0.55, 0xcfcfcf);


  // Street: poles, wires, neighbours.
  for (const x of [-12, 11.5, 35]) utilityPole(kit, x, ROAD.z0 + 0.5);
  for (const [a, b] of [[-12, 11.5], [11.5, 35]] as const) for (const [dx, y] of [[-0.8, 8.65], [0.8, 8.65], [0, 7.65]] as const) wire(kit, new THREE.Vector3(a + dx, y, ROAD.z0 + 0.5), new THREE.Vector3(b + dx, y, ROAD.z0 + 0.5), 0.45);
  wire(kit, new THREE.Vector3(11.5, 7.6, ROAD.z0 + 0.5), new THREE.Vector3(W + 0.1, 5.2, 3), 0.3);
  neighbour(kit, -12, 4, 8.5, 7.5, 0, 0xd9d2c4, 0x5a5048);
  neighbour(kit, 22.5, 3.5, 9, 7.8, 0, 0xc4c9cc, 0x464b52);
  neighbour(kit, 4.5, -12.5, 10, 7.5, 0, 0xe3dccb, 0x4c5157);
  neighbour(kit, -2, 26.5, 9.5, 8, 0, 0xcfc5b5, 0x3f444a);
  neighbour(kit, 14, 26, 8.5, 7.5, 0, 0xdedbd3, 0x5b4f45);
  blockWall(kit, -30, ROAD.z1 + 0.6, 30, ROAD.z1 + 0.72, 1.3);
}
