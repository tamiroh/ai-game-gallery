import * as THREE from 'three';
import { Kit, random, trs, type ColorLike } from './kit';
import { cylinder, lathe, rbox, tube } from './furniture';
import type { MaterialName } from './materials';
import { puffy } from './soft';
import { BALCONY, D, DOMA, FL1, FL2 } from './plan';

const sphereGeometry = new THREE.IcosahedronGeometry(1, 3);

function sphere(kit: Kit, mat: MaterialName, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: ColorLike) {
  kit.geometry(mat, sphereGeometry, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)), color, 'keep');
}

const Y = (a: number) => new THREE.Euler(0, a, 0);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ——— Small objects ———

function mug(kit: Kit, x: number, y: number, z: number, color: number, yaw = 0) {
  kit.at(x, y, z, yaw, () => {
    lathe(kit, 'gloss', [[0, 0], [0.036, 0], [0.04, 0.09], [0.036, 0.092], [0.034, 0.008], [0, 0.008]], 0, 0, 0, color, 24);
    kit.geometry('gloss', new THREE.TorusGeometry(0.024, 0.006, 8, 16, Math.PI), trs(0.04, 0.047, 0, 0, 0, -Math.PI / 2), color, 'keep');
    cylinder(kit, 'matte', 0, 0.07, 0, 0.034, 0.034, 0.002, 0x3a2418, 20);
  });
}

function remote(kit: Kit, x: number, y: number, z: number, yaw: number, color = 0x222325) {
  kit.at(x, y, z, yaw, () => {
    rbox(kit, 'satin', 0, 0.01, 0, 0.05, 0.02, 0.17, 0.008, color);
    for (let i = 0; i < 8; i++) cylinder(kit, 'satin', -0.012 + (i % 2) * 0.024, 0.02, -0.04 + Math.floor(i / 2) * 0.025, 0.006, 0.006, 0.003, i === 0 ? 0xc0392b : 0x55585c, 10);
  });
}

function tissueBox(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    kit.box('satin', -0.12, 0, -0.06, 0.12, 0.085, 0.06, 0xf4f1ea);
    kit.box('satin', -0.121, 0.02, -0.061, 0.121, 0.04, 0.061, 0x7fa7b8);
    puffy(kit, 'linen', 0, 0.1, 0, 0.07, 0.04, 0.05, 0xffffff, 1, new THREE.Euler(0.4, 0.2, 0.3));
  });
}

function sneakers(kit: Kit, x: number, y: number, z: number, yaw: number, color: number, spread = 0.07) {
  kit.at(x, y, z, yaw, () => {
    for (const [s, turn] of [[-1, 0.12], [1, -0.05]] as const) kit.at(s * spread, 0, s * 0.03, turn, () => {
      rbox(kit, 'satin', 0, 0.015, 0, 0.095, 0.03, 0.27, 0.012, 0xf4f3ef);
      puffy(kit, 'linen', 0, 0.06, -0.03, 0.085, 0.07, 0.19, color, 0.8);
      rbox(kit, 'linen', 0, 0.045, 0.08, 0.08, 0.04, 0.09, 0.02, color);
      for (let i = 0; i < 4; i++) kit.box('matte', -0.025, 0.093, -0.01 + i * 0.022, 0.025, 0.097, -0.004 + i * 0.022, 0xf2f2f2);
    });
  });
}

function sandals(kit: Kit, x: number, y: number, z: number, yaw: number, color: number) {
  kit.at(x, y, z, yaw, () => {
    for (const s of [-1, 1]) {
      rbox(kit, 'satin', s * 0.065, 0.012, 0, 0.1, 0.024, 0.25, 0.02, 0x3a3a3a);
      kit.geometry('satin', new THREE.TorusGeometry(0.045, 0.012, 6, 14, Math.PI), trs(s * 0.065, 0.024, 0.03, 0, Math.PI / 2, 0), color, 'keep');
    }
  });
}

function slippers(kit: Kit, x: number, y: number, z: number, yaw: number, color: number) {
  kit.at(x, y, z, yaw, () => {
    for (const s of [-1, 1]) {
      rbox(kit, 'boucle', s * 0.06, 0.01, 0, 0.1, 0.02, 0.26, 0.01, color);
      puffy(kit, 'boucle', s * 0.06, 0.035, 0.06, 0.1, 0.04, 0.12, color, 1);
    }
  });
}

function cardboard(kit: Kit, x: number, y: number, z: number, yaw: number, w: number, h: number, d: number) {
  kit.at(x, y, z, yaw, () => {
    kit.box('matte', -w / 2, 0, -d / 2, w / 2, h, d / 2, 0xb58a5a);
    kit.box('satin', -0.03, h, -d / 2 - 0.001, 0.03, h + 0.002, d / 2 + 0.001, 0xc9a878);
    kit.box('satin', -0.03, h - 0.08, d / 2, 0.03, h, d / 2 + 0.002, 0xc9a878);
    kit.box('matte', w / 2 - 0.16, h + 0.001, -d / 2 + 0.04, w / 2 - 0.04, h + 0.003, -d / 2 + 0.12, 0xf6f4ee);
  });
}

function newspaper(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    rbox(kit, 'matte', 0, 0.006, 0, 0.29, 0.012, 0.4, 0.004, 0xe7e4dc);
    for (let i = 0; i < 9; i++) kit.box('matte', -0.12 + (i % 3) * 0.085, 0.0121, -0.17 + Math.floor(i / 3) * 0.12, -0.06 + (i % 3) * 0.085, 0.0123, -0.07 + Math.floor(i / 3) * 0.12, 0xa9a59c);
    kit.box('matte', -0.13, 0.0121, -0.19, 0.13, 0.0124, -0.175, 0x3a3a3a);
  });
}

function trashBin(kit: Kit, x: number, y: number, z: number, yaw: number, tag: number) {
  kit.at(x, y, z, yaw, () => {
    rbox(kit, 'satin', 0, 0.3, 0, 0.26, 0.6, 0.4, 0.03, 0xe9e8e3);
    rbox(kit, 'satin', 0, 0.61, 0, 0.27, 0.03, 0.41, 0.012, 0xcfcdc6);
    kit.box('satin', -0.06, 0.45, 0.2, 0.06, 0.53, 0.202, tag);
    kit.box('satin', -0.05, 0.02, 0.2, 0.05, 0.05, 0.25, 0x9a9892);
    kit.solid(-0.14, -0.21, 0.14, 0.21, 0, 0.62);
  });
}

function fridgeNotes(kit: Kit, x: number, y: number, z: number) {
  const papers: [number, number, number, number, number][] = [[-0.18, 0.2, 0.2, 0.28, -0.04], [0.05, 0.3, 0.15, 0.21, 0.06], [-0.05, -0.1, 0.22, 0.16, 0.02]];
  papers.forEach(([px, py, w, h, tilt], i) => {
    kit.within(trs(x + px, y + py, z, 0, 0, tilt), () => {
      kit.box('matte', -w / 2, -h / 2, 0, w / 2, h / 2, 0.001, i === 1 ? 0xf6e6b0 : 0xfbfaf6);
      for (let l = 0; l < 5; l++) kit.box('matte', -w / 2 + 0.02, h / 2 - 0.05 - l * (h / 7), 0.001, w / 2 - 0.03 - (l % 2) * 0.04, h / 2 - 0.045 - l * (h / 7), 0.0013, i === 1 ? 0xd46a4a : 0x8e8a84);
      cylinder(kit, 'gloss', 0, h / 2 - 0.015, 0.006, 0.012, 0.012, 0.01, [0xd64b3d, 0x3d8bd6, 0xf0c53a][i]!, 14, new THREE.Euler(Math.PI / 2, 0, 0));
    });
  });
}

function bananas(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * 0.12;
      tube(kit, 'satin', [v3(Math.sin(a) * 0.02, 0.05, 0), v3(Math.sin(a) * 0.08, 0.025 + i * 0.006, 0.06), v3(Math.sin(a) * 0.16, 0.02 + i * 0.008, 0.1), v3(Math.sin(a) * 0.23, 0.05, 0.11)], 0.018, 0xe9c948);
    }
    cylinder(kit, 'matte', 0, 0.035, 0, 0.012, 0.01, 0.04, 0x5b4a2c, 8);
  });
}

function detergent(kit: Kit, x: number, y: number, z: number, color: number, h = 0.2) {
  lathe(kit, 'gloss', [[0, 0], [0.035, 0], [0.037, h * 0.8], [0.02, h * 0.92], [0.012, h], [0, h]], x, y, z, color, 18, new THREE.Vector3(1, 1, 0.7));
  cylinder(kit, 'satin', x, y + h, z, 0.012, 0.012, 0.025, 0xf2f2f2, 12);
}

function laundryStack(kit: Kit, x: number, y: number, z: number, yaw: number, seed: number) {
  const rng = random(seed);
  const colors = [0xf3f1ea, 0x7d8fa3, 0xd9c7a3, 0x3b4a5c, 0xe8d6d2, 0x9aa88a];
  kit.at(x, y, z, yaw, () => {
    for (let i = 0; i < 5; i++) puffy(kit, 'linen', (rng() - 0.5) * 0.03, 0.022 + i * 0.042, (rng() - 0.5) * 0.03, 0.34 - i * 0.015, 0.045, 0.27 - i * 0.01, colors[Math.floor(rng() * colors.length)]!, 0.5, Y((rng() - 0.5) * 0.15));
  });
}

function bear(kit: Kit, x: number, y: number, z: number, yaw: number, color: number) {
  kit.at(x, y, z, yaw, () => {
    const light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45);
    sphere(kit, 'boucle', 0, 0.12, 0, 0.1, 0.12, 0.085, color);
    sphere(kit, 'boucle', 0, 0.27, 0.01, 0.085, 0.08, 0.075, color);
    for (const s of [-1, 1]) {
      sphere(kit, 'boucle', s * 0.06, 0.33, 0, 0.03, 0.03, 0.018, color);
      sphere(kit, 'boucle', s * 0.1, 0.14, 0.03, 0.035, 0.06, 0.035, color);
      sphere(kit, 'boucle', s * 0.055, 0.04, 0.08, 0.04, 0.035, 0.06, color);
      sphere(kit, 'gloss', s * 0.03, 0.29, 0.07, 0.009, 0.009, 0.006, 0x111111);
    }
    sphere(kit, 'boucle', 0, 0.255, 0.07, 0.035, 0.028, 0.025, light);
    sphere(kit, 'gloss', 0, 0.265, 0.093, 0.01, 0.008, 0.006, 0x1a1a1a);
    kit.geometry('linen', new THREE.TorusGeometry(0.06, 0.012, 6, 20), trs(0, 0.205, 0.01, Math.PI / 2 - 0.2, 0, 0), 0xc0392b, 'keep');
  });
}

/** Randoseru: the stiff leather school backpack every Japanese primary pupil carries. */
function randoseru(kit: Kit, x: number, y: number, z: number, yaw: number, color: number) {
  kit.at(x, y, z, yaw, () => {
    rbox(kit, 'gloss', 0, 0.16, 0, 0.26, 0.3, 0.18, 0.04, color);
    // Flap over the top and down the front.
    rbox(kit, 'gloss', 0, 0.305, 0.0, 0.27, 0.018, 0.2, 0.008, color);
    rbox(kit, 'gloss', 0, 0.2, 0.095, 0.27, 0.23, 0.018, 0.008, color);
    kit.box('metal', -0.025, 0.09, 0.104, 0.025, 0.12, 0.112, 0xd4b24c);
    kit.box('satin', -0.1, 0.25, 0.104, 0.1, 0.27, 0.106, 0xf2f2f2);
    for (const s of [-1, 1]) tube(kit, 'satin', [v3(s * 0.08, 0.28, -0.09), v3(s * 0.09, 0.2, -0.13), v3(s * 0.085, 0.06, -0.1)], 0.012, new THREE.Color(color).multiplyScalar(0.8));
  });
}

function guitar(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    // Stand.
    tube(kit, 'metal', [v3(-0.16, 0, 0.12), v3(0, 0.05, 0.06), v3(0.16, 0, 0.12)], 0.008, 0x222222);
    tube(kit, 'metal', [v3(0, 0.05, 0.06), v3(0, 0.3, -0.02), v3(0, 0.62, -0.08)], 0.008, 0x222222);
    kit.within(trs(0, 0.07, 0.04, -0.18, 0, 0), () => {
      const body = new THREE.Shape();
      body.moveTo(0, 0);
      body.bezierCurveTo(0.26, 0, 0.22, 0.28, 0.13, 0.33);
      body.bezierCurveTo(0.18, 0.42, 0.17, 0.52, 0.06, 0.55);
      body.lineTo(-0.06, 0.55);
      body.bezierCurveTo(-0.17, 0.52, -0.18, 0.42, -0.13, 0.33);
      body.bezierCurveTo(-0.22, 0.28, -0.26, 0, 0, 0);
      const geometry = new THREE.ExtrudeGeometry(body, { depth: 0.09, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 16 });
      kit.geometry('oak', geometry, new THREE.Matrix4().makeTranslation(0, 0, -0.045), 0xc9864a, 'keep');
      geometry.dispose();
      cylinder(kit, 'screen', 0, 0.36, 0.054, 0.045, 0.045, 0.002, 0x120d0a, 28, new THREE.Euler(Math.PI / 2, 0, 0));
      kit.box('walnut', -0.07, 0.16, 0.053, 0.07, 0.18, 0.062, 0x3a2418);
      kit.box('walnut', -0.024, 0.55, 0.02, 0.024, 1.05, 0.045, 0x5a3e2c);
      kit.box('walnut', -0.04, 1.05, 0.015, 0.04, 1.22, 0.04, 0x3a2418);
      for (let i = 0; i < 6; i++) {
        const sx = -0.015 + i * 0.006;
        kit.box('chrome', sx - 0.0006, 0.17, 0.058, sx + 0.0006, 1.05, 0.0595, 0xdadada);
        cylinder(kit, 'chrome', (i < 3 ? -0.05 : 0.05), 1.09 + (i % 3) * 0.045, 0.028, 0.006, 0.006, 0.02, 0xdadada, 8, new THREE.Euler(0, 0, Math.PI / 2));
      }
    });
    kit.solid(-0.22, -0.12, 0.22, 0.2, 0, 1.2);
  });
}

function duck(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    sphere(kit, 'gloss', 0, 0.03, 0, 0.05, 0.035, 0.04, 0xf2c522);
    sphere(kit, 'gloss', 0.03, 0.075, 0, 0.028, 0.028, 0.026, 0xf2c522);
    sphere(kit, 'gloss', 0.06, 0.07, 0, 0.018, 0.007, 0.014, 0xe07b24);
    for (const s of [-1, 1]) sphere(kit, 'gloss', 0.045, 0.085, s * 0.015, 0.004, 0.004, 0.004, 0x111111);
  });
}

function headphones(kit: Kit, x: number, y: number, z: number, yaw: number) {
  kit.at(x, y, z, yaw, () => {
    kit.geometry('satin', new THREE.TorusGeometry(0.085, 0.009, 8, 24, Math.PI), trs(0, 0.03, 0, -Math.PI / 2 + 0.2, 0, 0), 0x2a2a2a, 'keep');
    for (const s of [-1, 1]) {
      cylinder(kit, 'satin', s * 0.085, 0.03, 0, 0.045, 0.045, 0.03, 0x2a2a2a, 20);
      cylinder(kit, 'boucle', s * 0.085, 0.06, 0, 0.038, 0.038, 0.012, 0x3a3a3a, 20);
    }
  });
}

function globe(kit: Kit, x: number, y: number, z: number) {
  lathe(kit, 'walnut', [[0, 0], [0.08, 0], [0.07, 0.02], [0.015, 0.03], [0.012, 0.06], [0, 0.06]], x, y, z, 0x5a3e2c, 20);
  kit.within(trs(x, y + 0.2, z, 0, 0, 0.41), () => {
    sphere(kit, 'gloss', 0, 0, 0, 0.13, 0.13, 0.13, 0x3f78a8);
    const rng = random(5);
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, b = (rng() - 0.5) * 2.2;
      sphere(kit, 'satin', Math.cos(a) * Math.cos(b) * 0.12, Math.sin(b) * 0.12, Math.sin(a) * Math.cos(b) * 0.12, 0.035 + rng() * 0.03, 0.03, 0.035 + rng() * 0.03, 0x8faa6a);
    }
    kit.geometry('metal', new THREE.TorusGeometry(0.145, 0.004, 6, 40, Math.PI * 1.2), trs(0, 0, 0, 0, 0, -Math.PI * 0.1), 0xb89a5a, 'keep');
  });
}

function toyCar(kit: Kit, x: number, y: number, z: number, yaw: number, color: number) {
  kit.at(x, y, z, yaw, () => {
    rbox(kit, 'gloss', 0, 0.035, 0, 0.16, 0.04, 0.08, 0.012, color);
    rbox(kit, 'gloss', -0.01, 0.065, 0, 0.08, 0.035, 0.07, 0.012, color);
    for (const wx of [-0.05, 0.05]) for (const s of [-1, 1]) cylinder(kit, 'matte', wx, 0.018, s * 0.04, 0.018, 0.018, 0.012, 0x1a1a1a, 12, new THREE.Euler(Math.PI / 2, 0, 0));
  });
}

function bag(kit: Kit, x: number, y: number, z: number, yaw: number, color: number) {
  kit.at(x, y, z, yaw, () => {
    puffy(kit, 'linen', 0, 0.17, 0, 0.36, 0.1, 0.3, color, 0.8, new THREE.Euler(Math.PI / 2 - 0.12, 0, 0));
    for (const s of [-1, 1]) kit.geometry('linen', new THREE.TorusGeometry(0.07, 0.01, 6, 16, Math.PI), trs(s * 0.07, 0.31, 0.01, 0, 0, 0), new THREE.Color(color).multiplyScalar(0.7), 'keep');
  });
}

// ——— Laundry drying on the balcony ———

function hanger(kit: Kit, x: number, y: number, z: number) {
  tube(kit, 'satin', [v3(x, y - 0.06, z), v3(x, y + 0.01, z), v3(x + 0.02, y + 0.03, z), v3(x + 0.035, y + 0.005, z)], 0.003, 0xdadada);
  tube(kit, 'satin', [v3(x - 0.2, y - 0.14, z), v3(x, y - 0.06, z), v3(x + 0.2, y - 0.14, z)], 0.005, 0xe8e8e8);
}

function shirt(kit: Kit, x: number, top: number, z: number, color: number) {
  hanger(kit, x, top, z);
  const shape = new THREE.Shape();
  shape.moveTo(-0.07, 0);
  shape.lineTo(-0.2, -0.06);
  shape.lineTo(-0.3, -0.2);
  shape.lineTo(-0.23, -0.25);
  shape.lineTo(-0.2, -0.2);
  shape.lineTo(-0.2, -0.66);
  shape.quadraticCurveTo(0, -0.68, 0.2, -0.66);
  shape.lineTo(0.2, -0.2);
  shape.lineTo(0.23, -0.25);
  shape.lineTo(0.3, -0.2);
  shape.lineTo(0.2, -0.06);
  shape.lineTo(0.07, 0);
  shape.quadraticCurveTo(0, -0.05, -0.07, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 6 });
  kit.geometry('linen', geometry, trs(x, top - 0.12, z - 0.006, 0.03, 0, 0), color);
  geometry.dispose();
}

function towel(kit: Kit, x: number, top: number, z: number, w: number, color: number, drop = 0.45) {
  cylinder(kit, 'linen', x, top, z, 0.022, 0.022, w, color, 12, new THREE.Euler(0, 0, Math.PI / 2));
  for (const [s, len] of [[-1, drop], [1, drop * 0.8]] as const) rbox(kit, 'linen', x, top - len / 2, z + s * 0.018, w, len, 0.012, 0.005, color);
  for (const s of [-1, 1]) kit.box('linen', x - w / 2, top - drop + 0.03, z + s * 0.026 - 0.002, x + w / 2, top - drop + 0.05, z + s * 0.026 + 0.002, new THREE.Color(color).multiplyScalar(0.85));
}

/** Pinch hanger: a ring of pegs holding socks and small towels. */
function pinchHanger(kit: Kit, x: number, top: number, z: number, seed: number) {
  const rng = random(seed);
  const ringY = top - 0.18;
  tube(kit, 'satin', [v3(x, ringY, z), v3(x, top - 0.02, z), v3(x + 0.02, top + 0.03, z), v3(x + 0.04, top, z)], 0.004, 0x9fc3d6);
  kit.geometry('satin', new THREE.TorusGeometry(0.22, 0.008, 6, 40), trs(x, ringY, z, Math.PI / 2, 0, 0), 0x9fc3d6, 'keep');
  const colors = [0xf3f1ea, 0x3b4a5c, 0xc0392b, 0x7d8fa3, 0xf0c53a, 0x2d2d2d];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = x + Math.cos(a) * 0.22, pz = z + Math.sin(a) * 0.22;
    kit.box('satin', px - 0.008, ringY - 0.05, pz - 0.006, px + 0.008, ringY, pz + 0.006, 0x9fc3d6);
    if (rng() < 0.75) {
      const color = colors[Math.floor(rng() * colors.length)]!;
      kit.at(px, ringY - 0.05, pz, -a, () => {
        rbox(kit, 'linen', 0, -0.1, 0, 0.012, 0.2, 0.07, 0.005, color);
        rbox(kit, 'linen', 0, -0.2, 0.035, 0.012, 0.06, 0.1, 0.005, color);
      });
    }
  }
}

export function buildClutter(kit: Kit) {
  // Kitchen: dish rack, sink things, fruit, sorted bins, notes on the fridge, a mat.
  kit.at(1.18, FL1 + 0.9, 0.33, 0, () => {
    kit.box('metal', -0.17, 0, -0.14, 0.17, 0.012, 0.14, 0xc9cbcc);
    for (let i = 0; i < 5; i++) kit.box('metal', -0.17 + i * 0.085, 0.012, -0.14, -0.165 + i * 0.085, 0.1, 0.14, 0xc9cbcc);
    for (let i = 0; i < 4; i++) cylinder(kit, 'gloss', -0.1 + i * 0.045, 0.12, 0, 0.11, 0.11, 0.012, i % 2 ? 0xf4f1ea : 0xe9e2d2, 28, new THREE.Euler(0, 0, Math.PI / 2 - 0.1));
    for (const [cx, cz] of [[0.1, -0.08], [0.12, 0.06]] as const) lathe(kit, 'gloss', [[0, 0], [0.03, 0], [0.035, 0.08], [0.031, 0.08], [0, 0.005]], cx, 0.012, cz, 0xd96d4a, 16);
  });
  detergent(kit, 0.47, FL1 + 0.86, 1.64, 0x4fae6a);
  rbox(kit, 'boucle', 0.5, FL1 + 0.875, 1.76, 0.1, 0.03, 0.065, 0.008, 0xf0c53a);
  bananas(kit, 2.45, FL1 + 1.08, 2.3, 0.4);
  for (const [dx, c] of [[0, 0xd64b3d], [0.09, 0xb8322a]] as const) {
    sphere(kit, 'gloss', 2.7 + dx, FL1 + 1.12, 2.3, 0.042, 0.04, 0.042, c);
    cylinder(kit, 'matte', 2.7 + dx, FL1 + 1.155, 2.3, 0.003, 0.002, 0.02, 0x4a3a2a, 6);
  }
  trashBin(kit, 4.25, FL1, 0.27, -Math.PI / 2, 0x3d7fc0);
  trashBin(kit, 4.25, FL1, 0.7, -Math.PI / 2, 0x4fae6a);
  fridgeNotes(kit, 3.55, FL1 + 1.45, 0.815);
  rbox(kit, 'boucle', 1.6, FL1 + 0.006, 1.05, 2.2, 0.012, 0.6, 0.006, 0x8a9a8a);
  // Dining table: morning paper, tissues, a phone.
  newspaper(kit, 1.38, FL1 + 0.72, 3.5, 0.15);
  tissueBox(kit, 2.62, FL1 + 0.72, 3.45, 0.2);
  rbox(kit, 'screen', 2.66, FL1 + 0.726, 3.82, 0.075, 0.009, 0.155, 0.008, 0x14181b);
  // Living: remotes and a mug on the coffee table, magazines, slippers, photo frames.
  remote(kit, 1.93, FL1 + 0.36, 5.45, 0.3);
  mug(kit, 1.6, FL1 + 0.36, 5.95, 0xf2efe6, 0.8);
  kit.at(3.3, FL1, 4.35, 0.2, () => {
    for (let i = 0; i < 4; i++) rbox(kit, 'satin', (i % 2) * 0.01, 0.006 + i * 0.012, (i % 3) * 0.008, 0.23, 0.011, 0.3, 0.004, [0xd8cbb0, 0x3a5a7a, 0xe9e5dc, 0xb85c3b][i]!);
  });
  slippers(kit, 2.35, FL1, 6.2, -Math.PI / 2, 0x8e9ba5);
  slippers(kit, 3.9, FL1, 2.4, 0.4, 0xc9a9a0);
  puffy(kit, 'boucle', 1.2, FL1 + 0.05, 6.45, 0.5, 0.1, 0.5, 0x6d7f74, 1, Y(0.3));
  rbox(kit, 'screen', 0.45, FL1 + 0.425, 4.8, 0.075, 0.009, 0.155, 0.008, 0x14181b);
  tube(kit, 'matte', [v3(0.45, FL1 + 0.43, 4.72), v3(0.5, FL1 + 0.42, 4.68), v3(0.56, FL1 + 0.3, 4.7), v3(0.58, FL1 + 0.05, 4.72)], 0.002, 0xf2f2f2);
  // Genkan: shoes left out, a delivery box, keys, a shoehorn.
  sneakers(kit, 8.65, DOMA, 6.05, 0.3, 0x3a4a5c);
  sneakers(kit, 8.85, DOMA, 6.6, -0.2, 0xe86a5a, 0.055);
  sandals(kit, 9.2, DOMA, 6.95, 3.3, 0x6b5b4a);
  cardboard(kit, 8.48, DOMA, 5.75, 0.1, 0.4, 0.28, 0.3);
  kit.box('chrome', 9.72, 1.15, 5.95, 9.76, 1.155, 6.02, 0xcfcfcf);
  kit.geometry('satin', new THREE.TorusGeometry(0.02, 0.004, 6, 16), trs(9.74, 1.157, 6.05, Math.PI / 2, 0, 0), 0xc0392b, 'keep');
  kit.box('satin', 9.545, DOMA + 0.35, 5.64, 9.555, DOMA + 0.95, 5.68, 0x2d2d2d);
  // Washroom: detergents on the machine, dryer on the vanity, clothes in the basket.
  detergent(kit, 5.45, FL1 + 1.13, 0.28, 0x3d8bd6, 0.24);
  detergent(kit, 5.56, FL1 + 1.13, 0.3, 0xf2efe6, 0.18);
  kit.at(4.93, FL1 + 0.826, 0.38, 0.5, () => {
    cylinder(kit, 'satin', 0, 0.035, 0, 0.035, 0.03, 0.16, 0xf2d2d8, 20, new THREE.Euler(0, 0, Math.PI / 2));
    rbox(kit, 'satin', -0.03, 0.0, 0.0, 0.04, 0.02, 0.12, 0.012, 0xf2d2d8, new THREE.Euler(0.9, 0, 0));
  });
  for (let i = 0; i < 4; i++) puffy(kit, 'linen', 5.0 + Math.sin(i * 2) * 0.06, FL1 + 0.32 + i * 0.03, 1.45 + Math.cos(i * 3) * 0.06, 0.2, 0.08, 0.16, [0xf3f1ea, 0x7d8fa3, 0xd9c7a3, 0x3b4a5c][i]!, 1, Y(i));
  duck(kit, 8.0, FL1 + 0.57, 0.81, 2.6);
  // Tatami room: folded laundry and stacked cushions waiting to be put away.
  laundryStack(kit, 7.75, FL1, 5.15, 0.2, 7);
  for (let i = 0; i < 3; i++) puffy(kit, 'linen', 4.95, FL1 + 0.04 + i * 0.075, 4.95, 0.55, 0.08, 0.59, 0x6d3a3a, 0.9, Y(i * 0.08));
  newspaper(kit, 6.0, FL1 + 0.34, 5.85, 1.2);
  // Main bedroom: slippers, a tote bag, a jacket on the closet door.
  slippers(kit, 1.35, FL2, 4.3, Math.PI / 2, 0xd8cdb8);
  bag(kit, 0.4, FL2, 5.5, 1.3, 0x8a6a4a);
  kit.at(2.3, FL2, 2.5, 0, () => shirt(kit, 0, 1.95, 0.02, 0x4a5a6a));
  // Child's room: school bag, bear on the bed, toys, a globe.
  randoseru(kit, 4.45, FL2, 5.05, Math.PI / 2 + 0.3, 0xb8322a);
  bear(kit, 6.75, FL2 + 0.58, 5.3, Math.PI + 0.2, 0xb88a5c);
  toyCar(kit, 5.5, FL2 + 0.012, 5.6, 0.7, 0x3d8bd6);
  toyCar(kit, 5.75, FL2 + 0.012, 5.3, 2.1, 0xf0c53a);
  globe(kit, 5.55, FL2 + 1.2, 3.86);
  lathe(kit, 'satin', [[0, 0], [0.035, 0], [0.035, 0.1], [0.032, 0.1], [0.032, 0.005], [0, 0.005]], 3.85, FL2 + 0.73, 6.25, 0x3d8bd6, 16);
  for (let i = 0; i < 5; i++) cylinder(kit, 'satin', 3.85 + Math.sin(i * 1.3) * 0.015, FL2 + 0.78, 6.25 + Math.cos(i * 1.3) * 0.015, 0.004, 0.004, 0.17, [0xd64b3d, 0xf0c53a, 0x3d8bd6, 0x4fae6a, 0x2d2d2d][i]!, 6);
  // Bedroom 3: a guitar on its stand.
  guitar(kit, 9.75, FL2, 6.95, Math.PI + 0.3);
  // Study: coffee, papers, headphones.
  mug(kit, 2.6, FL2 + 0.73, 0.55, 0x2d4a6b, 2.4);
  kit.within(trs(1.6, FL2 + 0.731, 0.52, 0, 0.3, 0), () => {
    kit.box('matte', -0.105, 0, -0.15, 0.105, 0.002, 0.15, 0xfbfaf6);
    kit.within(trs(0.04, 0.002, 0.03, 0, -0.5, 0), () => kit.box('matte', -0.105, 0, -0.15, 0.105, 0.002, 0.15, 0xf6f4ee));
  });
  headphones(kit, 2.7, FL2 + 0.73, 0.28, 0.4);
  // Balcony: washing on the poles, sandals by the door.
  const poleY = BALCONY.y + 1.1 + 0.64;
  const front = BALCONY.z1 - 0.35, back = BALCONY.z1 - 0.5;
  [0x7d8fa3, 0xf3f1ea, 0x3b4a5c].forEach((c, i) => shirt(kit, 5.0 + i * 0.55, poleY, front, c));
  towel(kit, 7.0, poleY, back, 0.55, 0xe8d6d2);
  towel(kit, 7.7, poleY, back, 0.6, 0x9fc3c8, 0.5);
  pinchHanger(kit, 8.8, poleY, front, 11);
  sandals(kit, 5.4, BALCONY.y, D + 0.3, 0.1, 0x55585c);
  // Garden: watering can, hose reel, a ball, a doormat.
  kit.at(5.0, 0, D + 0.45, 0.6, () => {
    lathe(kit, 'satin', [[0, 0], [0.1, 0], [0.11, 0.2], [0.07, 0.24], [0, 0.24]], 0, 0, 0, 0x4fae6a, 24);
    tube(kit, 'satin', [v3(0.09, 0.05, 0), v3(0.2, 0.18, 0), v3(0.28, 0.3, 0)], 0.012, 0x4fae6a);
    kit.geometry('satin', new THREE.TorusGeometry(0.08, 0.012, 6, 16, Math.PI), trs(-0.02, 0.24, 0, 0, 0, 0.2), 0x4fae6a, 'keep');
  });
  kit.at(5.5, 0, D + 0.3, 0, () => {
    for (const s of [-1, 1]) kit.box('satin', s * 0.12 - 0.01, 0, -0.12, s * 0.12 + 0.01, 0.32, 0.12, 0x2d6a4a);
    for (let i = 0; i < 6; i++) kit.geometry('satin', new THREE.TorusGeometry(0.1 + (i % 3) * 0.012, 0.012, 6, 24), trs(-0.08 + i * 0.03, 0.2, 0, 0, Math.PI / 2, 0), 0x3f8f3f, 'keep');
    kit.solid(-0.14, -0.14, 0.14, 0.14, 0, 0.35);
  });
  sphere(kit, 'gloss', 2.8, 0.1, 11.3, 0.1, 0.1, 0.1, 0xe86a3a);
  rbox(kit, 'boucle', 8.96, 0.185, D + 0.55, 0.7, 0.012, 0.45, 0.006, 0x5a4a3a);
}
