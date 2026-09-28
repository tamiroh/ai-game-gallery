import * as THREE from "three";
import { Builder } from "./builder";
import {
  BLOCK,
  BLOCK_RANGE,
  CURB_HEIGHT,
  DIRECTIONS,
  ROAD_COUNT,
  SIDEWALK,
  blockCenter,
  isPark,
  range,
  rightOf,
  rng,
  roadCenter,
  signalAt,
  type Signal,
} from "./layout";

export interface Circle {
  x: number;
  z: number;
  r: number;
}

const c = (hex: number) => new THREE.Color(hex);
const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

function leafTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const random = rng(3);
  for (let i = 0; i < 260; i++) {
    const r = Math.hypot(random() - 0.5, random() - 0.5);
    const x = 128 + (random() - 0.5) * 220 * (1 - r * 0.3);
    const y = 128 + (random() - 0.5) * 220 * (1 - r * 0.3);
    if (Math.hypot(x - 128, y - 128) > 118) continue;
    const shade = 0.55 + random() * 0.45;
    context.fillStyle = `rgb(${Math.round(70 * shade)},${Math.round(105 * shade)},${Math.round(38 * shade)})`;
    context.save();
    context.translate(x, y);
    context.rotate(random() * Math.PI * 2);
    context.beginPath();
    context.ellipse(0, 0, 9 + random() * 5, 4.5 + random() * 2.5, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Canopy made of leaf cards whose normals point away from the crown center for soft, volumetric shading. */
function canopyGeometry(seed: number) {
  const random = rng(seed);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const center = new THREE.Vector3(0, 5.6, 0);
  const quad = new THREE.PlaneGeometry(1.5, 1.5);
  for (let i = 0; i < 150; i++) {
    const dir = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
    if (dir.lengthSq() > 1) {
      i--;
      continue;
    }
    const p = new THREE.Vector3(dir.x * 2.8, dir.y * 1.9, dir.z * 2.8).add(center);
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI),
    );
    const normal = p.clone().sub(center).normalize();
    normal.y += 0.35;
    normal.normalize();
    const base = positions.length / 3;
    const position = quad.getAttribute("position");
    const scale = 0.8 + random() * 0.6;
    for (let v = 0; v < position.count; v++) {
      const vertex = new THREE.Vector3()
        .fromBufferAttribute(position, v)
        .multiplyScalar(scale)
        .applyQuaternion(rotation)
        .add(p);
      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(quad.getAttribute("uv").getX(v), quad.getAttribute("uv").getY(v));
    }
    quad.index!.array.forEach((index) => indices.push(base + index));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function trunkGeometry() {
  const b = new Builder();
  const bark = c(0x5d564e);
  b.geometry(new THREE.CylinderGeometry(0.1, 0.17, 4.6, 9), at(0, 2.3, 0), bark);
  const random = rng(11);
  for (let i = 0; i < 6; i++) {
    const branch = new THREE.CylinderGeometry(0.035, 0.07, 2.4, 6).translate(0, 1.2, 0);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 3.2 + random() * 1.2, 0),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.7 + random() * 0.4, (i / 6) * Math.PI * 2 + random(), 0, "YXZ"),
      ),
      new THREE.Vector3(1, 1, 1),
    );
    b.geometry(branch, m, bark);
  }
  return b.build();
}

function streetLightGeometry() {
  const b = new Builder();
  const paint = c(0x2c3033);
  b.geometry(new THREE.CylinderGeometry(0.16, 0.2, 0.6, 12), at(0, 0.3, 0), paint);
  b.geometry(new THREE.CylinderGeometry(0.07, 0.11, 8, 10), at(0, 4, 0), paint);
  // Arm curving out over the road along local -x.
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 7.6, 0),
    new THREE.Vector3(0, 8.4, 0),
    new THREE.Vector3(-2.2, 8.3, 0),
  );
  b.geometry(new THREE.TubeGeometry(curve, 10, 0.055, 6), new THREE.Matrix4(), paint);
  b.geometry(new THREE.BoxGeometry(0.9, 0.16, 0.36), at(-2.4, 8.25, 0), paint);
  b.geometry(new THREE.BoxGeometry(0.72, 0.03, 0.28), at(-2.4, 8.16, 0), c(0xe4e1d6));
  return b.build();
}

function signalPoleGeometry() {
  const b = new Builder();
  const paint = c(0x3a3e40);
  const housing = c(0x1b1c1d);
  b.geometry(new THREE.CylinderGeometry(0.14, 0.18, 6.6, 10), at(0, 3.3, 0), paint);
  b.geometry(new THREE.CylinderGeometry(0.07, 0.1, 8, 8).rotateZ(Math.PI / 2), at(-4, 6.25, 0), paint);
  for (const x of [-3.9, -7.4]) {
    b.geometry(new THREE.BoxGeometry(0.1, 0.3, 0.1), at(x, 6.05, 0), paint);
    b.geometry(new THREE.BoxGeometry(0.38, 1.1, 0.26), at(x, 5.35, 0), housing);
    b.geometry(new THREE.BoxGeometry(0.62, 1.3, 0.03), at(x, 5.35, -0.14), c(0x161616));
    for (const y of [5.7, 5.35, 5.0]) {
      // Visor over each lamp.
      b.geometry(
        new THREE.CylinderGeometry(0.15, 0.15, 0.2, 12, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2),
        at(x, y, 0.22),
        housing,
      );
    }
  }
  // Pedestrian signal on the pole.
  b.geometry(new THREE.BoxGeometry(0.34, 0.34, 0.2), at(0, 2.9, 0.26), housing);
  return b.build();
}

function hydrantGeometry() {
  const b = new Builder();
  const red = c(0xa3261c);
  b.geometry(new THREE.CylinderGeometry(0.17, 0.2, 0.08, 12), at(0, 0.04, 0), red);
  b.geometry(new THREE.CylinderGeometry(0.13, 0.14, 0.6, 12), at(0, 0.36, 0), red);
  b.geometry(new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), at(0, 0.66, 0), red);
  b.geometry(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8), at(0, 0.82, 0), c(0xc8c2b5));
  b.geometry(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 10).rotateZ(Math.PI / 2), at(0, 0.48, 0), red);
  b.geometry(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10).rotateX(Math.PI / 2), at(0, 0.44, 0.12), red);
  return b.build();
}

function benchGeometry() {
  const b = new Builder();
  const wood = c(0x7a5534);
  const iron = c(0x222426);
  for (let i = 0; i < 4; i++) b.geometry(new THREE.BoxGeometry(1.8, 0.035, 0.09), at(0, 0.45, -0.18 + i * 0.12), wood);
  for (let i = 0; i < 3; i++) b.geometry(new THREE.BoxGeometry(1.8, 0.09, 0.03), at(0, 0.6 + i * 0.13, 0.25), wood);
  for (const x of [-0.75, 0.75]) {
    b.geometry(new THREE.BoxGeometry(0.05, 0.45, 0.5), at(x, 0.225, 0), iron);
    b.geometry(new THREE.BoxGeometry(0.05, 0.5, 0.05), at(x, 0.7, 0.27), iron);
  }
  return b.build();
}

function binGeometry() {
  const b = new Builder();
  b.geometry(new THREE.CylinderGeometry(0.28, 0.25, 0.95, 16, 1, true), at(0, 0.5, 0), c(0x1f3a2c));
  b.geometry(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), at(0, 0.98, 0), c(0x1f3a2c));
  b.geometry(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 12), at(0, 1.01, 0), c(0x0b0b0b));
  return b.build();
}

class Instances {
  readonly matrices: THREE.Matrix4[] = [];
  private colors: THREE.Color[] = [];
  add(matrix: THREE.Matrix4, color?: THREE.Color) {
    this.matrices.push(matrix);
    if (color) this.colors.push(color);
  }
  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, shadows = true) {
    const mesh = new THREE.InstancedMesh(geometry, material, this.matrices.length);
    this.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    this.colors.forEach((color, i) => mesh.setColorAt(i, color));
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/** Orientation whose local +x points along `x` and local +z along `z` (both horizontal). */
function frame(px: number, py: number, pz: number, xDir: [number, number], yaw = 0, scale = 1) {
  const x = new THREE.Vector3(xDir[0], 0, xDir[1]);
  const y = new THREE.Vector3(0, 1, 0);
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4()
    .makeBasis(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .setPosition(px, py, pz)
    .scale(new THREE.Vector3(scale, scale, scale));
}

export function createProps(seed = 5) {
  const random = rng(seed);
  const group = new THREE.Group();
  const circles: Circle[] = [];
  const lights = new Instances();
  const trees = new Instances();
  const canopyA = new Instances();
  const canopyB = new Instances();
  const pits = new Instances();
  const hydrants = new Instances();
  const benches = new Instances();
  const bins = new Instances();
  const poles = new Instances();

  const sidewalkY = CURB_HEIGHT;
  const addTree = (x: number, z: number, y = sidewalkY, pit = true) => {
    const s = range(random, 0.8, 1.2);
    const m = new THREE.Matrix4()
      .makeRotationY(random() * Math.PI * 2)
      .scale(new THREE.Vector3(s, s * range(random, 0.9, 1.15), s))
      .setPosition(x, y, z);
    trees.add(m);
    (random() < 0.5 ? canopyA : canopyB).add(
      m,
      new THREE.Color().setHSL(range(random, 0.14, 0.3), range(random, 0.25, 0.5), range(random, 0.72, 0.9)),
    );
    if (pit) pits.add(at(x, sidewalkY + 0.004, z));
    circles.push({ x, z, r: 0.3 });
  };

  for (let bx = -BLOCK_RANGE - 1; bx <= BLOCK_RANGE + 1; bx++) {
    for (let bz = -BLOCK_RANGE - 1; bz <= BLOCK_RANGE + 1; bz++) {
      const cx = blockCenter(bx);
      const cz = blockCenter(bz);
      const half = BLOCK / 2;
      // Each edge: outward normal toward the road, and the direction along the curb.
      for (const [nx, nz] of DIRECTIONS) {
        const [ax, az] = rightOf(nx, nz);
        const edge = (t: number, inset: number): [number, number] => [
          cx + nx * (half - inset) + ax * t,
          cz + nz * (half - inset) + az * t,
        ];
        const offset = (bx * 3 + bz * 5 + nx + nz * 2) % 2 ? 0 : 15;
        for (let t = -half + 12 + offset; t <= half - 12; t += 30) {
          const [x, z] = edge(t, 0.55);
          lights.add(frame(x, sidewalkY, z, [-nx, -nz]));
          circles.push({ x, z, r: 0.22 });
        }
        for (let t = -half + 8 + offset / 2; t <= half - 8; t += 9.5) {
          const fromLight = (((t - (-half + 12 + offset)) % 30) + 30) % 30;
          if (fromLight < 2.5 || fromLight > 27.5) continue;
          if (random() < 0.12) continue;
          const [x, z] = edge(t, 1.1);
          addTree(x, z);
        }
        if (random() < 0.7) {
          const [x, z] = edge(range(random, -half + 14, half - 14), 0.5);
          hydrants.add(frame(x, sidewalkY, z, [ax, az]));
          circles.push({ x, z, r: 0.25 });
        }
        if (random() < 0.55) {
          const [x, z] = edge(range(random, -half + 10, half - 10), SIDEWALK - 0.8);
          benches.add(frame(x, sidewalkY, z, [ax, az]));
          circles.push({ x, z, r: 0.7 });
        }
        const [bxp, bzp] = edge(half - 9, 0.7);
        bins.add(at(bxp, sidewalkY, bzp));
        circles.push({ x: bxp, z: bzp, r: 0.35 });
      }
      if (isPark(bx, bz)) {
        const inner = half - SIDEWALK - 3;
        for (let i = 0; i < 26; i++) {
          const x = cx + range(random, -inner, inner);
          const z = cz + range(random, -inner, inner);
          if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4) continue;
          addTree(x, z, CURB_HEIGHT + 0.08, false);
        }
        for (const [nx, nz] of DIRECTIONS) {
          for (const side of [-1, 1]) {
            const [ax, az] = rightOf(nx, nz);
            const x = cx + nx * 10 + ax * 2.3 * side;
            const z = cz + nz * 10 + az * 2.3 * side;
            benches.add(frame(x, sidewalkY, z, [-nz * side, nx * side]));
            circles.push({ x, z, r: 0.7 });
          }
        }
      }
    }
  }

  // Traffic signals: one pole per approach on its near-right corner.
  const heads: { i: number; j: number; axis: number; slot: number }[] = [];
  for (let i = 0; i < ROAD_COUNT; i++) {
    for (let j = 0; j < ROAD_COUNT; j++) {
      const cx = roadCenter(i);
      const cz = roadCenter(j);
      for (const [dx, dz] of DIRECTIONS) {
        const [rx, rz] = rightOf(dx, dz);
        const x = cx - dx * 9.1 + rx * 9.1;
        const z = cz - dz * 9.1 + rz * 9.1;
        poles.add(frame(x, CURB_HEIGHT, z, [rx, rz]));
        circles.push({ x, z, r: 0.25 });
        for (let slot = 0; slot < 2; slot++) heads.push({ i, j, axis: dx !== 0 ? 0 : 1, slot });
      }
    }
  }

  const lampGeometry = new THREE.CircleGeometry(0.11, 14);
  const lamps = new THREE.InstancedMesh(
    lampGeometry,
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    heads.length * 3,
  );
  const poleFrames = poles.matrices;
  let lamp = 0;
  heads.forEach((head, h) => {
    const pole = poleFrames[Math.floor(h / 2)]!;
    const x = head.slot === 0 ? -3.9 : -7.4;
    for (const y of [5.7, 5.35, 5.0]) lamps.setMatrixAt(lamp++, pole.clone().multiply(at(x, y, 0.135)));
  });
  let lastStates = "";
  const colors = {
    red: [new THREE.Color(7, 0.35, 0.2), new THREE.Color(0.1, 0.02, 0.01)],
    yellow: [new THREE.Color(7, 3.6, 0.3), new THREE.Color(0.1, 0.06, 0.01)],
    green: [new THREE.Color(0.4, 6, 3.2), new THREE.Color(0.01, 0.07, 0.04)],
  };
  const updateSignals = (time: number) => {
    const states = heads.map((head) => signalAt(head.i, head.j, head.axis, time)[0]).join("");
    if (states === lastStates) return;
    lastStates = states;
    heads.forEach((head, h) => {
      const state: Signal = signalAt(head.i, head.j, head.axis, time);
      (["red", "yellow", "green"] as const).forEach((name, k) =>
        lamps.setColorAt(h * 3 + k, colors[name][name === state ? 0 : 1]!),
      );
    });
    lamps.instanceColor!.needsUpdate = true;
  };
  updateSignals(0);
  group.add(lamps);

  const standard = (params: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
  group.add(lights.mesh(streetLightGeometry(), standard({ roughness: 0.5, metalness: 0.6 })));
  group.add(poles.mesh(signalPoleGeometry(), standard({ roughness: 0.55, metalness: 0.5 })));
  group.add(trees.mesh(trunkGeometry(), standard({ roughness: 0.95 })));
  const leaves = new THREE.MeshStandardMaterial({
    map: leafTexture(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.8,
    emissive: 0x0c1606,
  });
  group.add(canopyA.mesh(canopyGeometry(21), leaves));
  group.add(canopyB.mesh(canopyGeometry(42), leaves));
  group.add(
    pits.mesh(
      new THREE.BoxGeometry(1.1, 0.01, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 1 }),
      false,
    ),
  );
  group.add(hydrants.mesh(hydrantGeometry(), standard({ roughness: 0.45, metalness: 0.2 })));
  group.add(benches.mesh(benchGeometry(), standard({ roughness: 0.7 })));
  group.add(bins.mesh(binGeometry(), standard({ roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide })));

  return { group, circles, updateSignals };
}
