import * as THREE from "three";
import { Builder } from "./builder";
import {
  DIRECTIONS,
  LANE_OFFSETS,
  PITCH,
  ROAD,
  ROAD_COUNT,
  pick,
  range,
  rightOf,
  rng,
  roadCenter,
  signalAt,
} from "./layout";

interface CarType {
  name: string;
  length: number;
  width: number;
  wheelRadius: number;
  wheels: number[];
  weight: number;
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  colors: number[];
}

interface Profile {
  length: number;
  width: number;
  clearance: number;
  wheelRadius: number;
  wheels: [number, number];
  hood: number;
  belt: number;
  roof: number;
  trunk: number;
  windshieldBase: number;
  windshieldTop: number;
  roofRear: number;
  rearBase: number;
}

function extrude(shape: THREE.Shape, width: number, bevel: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  return geometry;
}

function carType(name: string, p: Profile, colors: number[], weight: number): CarType {
  const { length: L, clearance: c, wheelRadius: wr } = p;
  const arch = wr + 0.07;
  const [rear, front] = p.wheels;
  const body = new THREE.Shape();
  body.moveTo(-L / 2 + 0.12, c);
  body.lineTo(rear - arch, c);
  body.absarc(rear, wr, arch, Math.PI, 0, true);
  body.lineTo(front - arch, c);
  body.absarc(front, wr, arch, Math.PI, 0, true);
  body.lineTo(L / 2 - 0.14, c);
  body.quadraticCurveTo(L / 2 + 0.02, c, L / 2, c + 0.22);
  body.lineTo(L / 2 - 0.02, p.hood - 0.08);
  body.quadraticCurveTo(L / 2 - 0.04, p.hood, L / 2 - 0.3, p.hood + 0.02);
  body.lineTo(p.windshieldBase, p.belt);
  body.lineTo(p.rearBase, p.belt);
  body.lineTo(-L / 2 + 0.22, p.trunk);
  body.quadraticCurveTo(-L / 2 + 0.02, p.trunk, -L / 2, p.trunk - 0.18);
  body.lineTo(-L / 2 + 0.02, c + 0.2);
  body.quadraticCurveTo(-L / 2 + 0.02, c, -L / 2 + 0.12, c);

  const cabin = new THREE.Shape();
  cabin.moveTo(p.windshieldBase + 0.02, p.belt - 0.02);
  cabin.lineTo(p.windshieldTop, p.roof - 0.03);
  cabin.lineTo(p.roofRear, p.roof - 0.03);
  cabin.lineTo(p.rearBase - 0.02, p.belt - 0.02);
  cabin.closePath();

  const roof = new THREE.Shape();
  const slope = (p.roof - p.belt) / (p.windshieldTop - p.windshieldBase);
  roof.moveTo(p.windshieldTop - 0.06 / slope, p.roof - 0.09);
  roof.lineTo(p.windshieldTop + 0.05, p.roof);
  roof.lineTo(p.roofRear - 0.05, p.roof);
  roof.lineTo(p.roofRear - 0.1, p.roof - 0.09);
  roof.closePath();

  const bodyGeometry = new Builder();
  const paint = new THREE.Color(1, 1, 1);
  bodyGeometry.geometry(extrude(body, p.width, 0.07), new THREE.Matrix4(), paint);
  bodyGeometry.geometry(extrude(roof, p.width * 0.88, 0.03), new THREE.Matrix4(), paint);
  // Mirrors and window pillars.
  for (const side of [-1, 1])
    bodyGeometry.geometry(
      new THREE.BoxGeometry(0.14, 0.12, 0.2),
      new THREE.Matrix4().makeTranslation(p.windshieldBase - 0.1, p.belt + 0.08, side * (p.width / 2 + 0.06)),
      paint,
    );
  const pillar = (x: number) =>
    bodyGeometry.geometry(
      new THREE.BoxGeometry(0.09, p.roof - p.belt - 0.04, p.width * 0.9 + 0.012),
      new THREE.Matrix4().makeTranslation(x, (p.roof + p.belt) / 2 - 0.02, 0),
      paint,
    );
  pillar((p.windshieldTop + p.roofRear) / 2 + 0.1);

  const trim = new Builder();
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number) =>
    trim.geometry(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.Matrix4().makeTranslation(x, y, z),
      new THREE.Color(hex),
    );
  const w = p.width;
  box(L / 2 - 0.02, c + 0.14, 0, 0.12, 0.2, w - 0.12, 0x151617);
  box(-L / 2 + 0.03, c + 0.16, 0, 0.12, 0.22, w - 0.12, 0x151617);
  box(L / 2 + 0.035, c + 0.3, 0, 0.02, 0.12, 0.5, 0xd8d8d2);
  box(-L / 2 - 0.035, c + 0.36, 0, 0.02, 0.12, 0.5, 0xd8d8d2);
  box(L / 2 - 0.04, p.hood - 0.2, 0, 0.06, 0.16, w * 0.36, 0x0c0d0e);
  const seamX = [front - arch - 0.06, (p.windshieldTop + p.roofRear) / 2 + 0.1, rear + arch + 0.06];
  for (const side of [-1, 1]) {
    // Door seams and handles.
    for (const x of seamX)
      box(x, (c + p.belt) / 2 + 0.05, side * (w / 2 + 0.004), 0.012, p.belt - c - 0.2, 0.012, 0x0a0a0a);
    for (const x of seamX.slice(0, 2)) box(x - 0.25, p.belt - 0.14, side * (w / 2 + 0.01), 0.14, 0.03, 0.02, 0x2a2c2e);
    box(L / 2 - 0.06, p.hood - 0.13, side * (w / 2 - 0.3), 0.12, 0.13, 0.36, 0xe6ecef);
    box(-L / 2 + 0.02, p.trunk - 0.2, side * (w / 2 - 0.22), 0.1, 0.16, 0.34, 0x7a0b0b);
    box(0, c + 0.06, side * (w / 2 - 0.1), L * 0.42, 0.12, 0.06, 0x151617);
  }

  const glass = new Builder();
  glass.geometry(extrude(cabin, w * 0.9, 0.05), new THREE.Matrix4(), paint);

  return {
    name,
    length: L,
    width: w,
    wheelRadius: wr,
    wheels: p.wheels,
    weight,
    body: bodyGeometry.build(),
    glass: glass.build(),
    trim: trim.build(),
    colors,
  };
}

function busType(): CarType {
  const L = 11.8,
    w = 2.5,
    wr = 0.5,
    c = 0.32,
    h = 3.1;
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, c + 0.1);
  for (const x of [-3.3, 3.6]) {
    shape.lineTo(x - 0.6, c);
    shape.absarc(x, wr, 0.6, Math.PI, 0, true);
  }
  shape.lineTo(L / 2 - 0.1, c);
  shape.quadraticCurveTo(L / 2 + 0.02, c, L / 2, c + 0.25);
  shape.lineTo(L / 2, h - 0.25);
  shape.quadraticCurveTo(L / 2, h, L / 2 - 0.3, h);
  shape.lineTo(-L / 2 + 0.3, h);
  shape.quadraticCurveTo(-L / 2, h, -L / 2, h - 0.3);
  shape.closePath();
  const body = new Builder();
  body.geometry(extrude(shape, w, 0.08), new THREE.Matrix4(), new THREE.Color(1, 1, 1));
  const glass = new Builder();
  const white = new THREE.Color(1, 1, 1);
  glass.geometry(
    new THREE.BoxGeometry(L - 1.6, 1.05, w + 0.02),
    new THREE.Matrix4().makeTranslation(-0.5, 2.05, 0),
    white,
  );
  glass.geometry(
    new THREE.BoxGeometry(0.05, 1.6, w - 0.2),
    new THREE.Matrix4().makeTranslation(L / 2 + 0.01, 1.95, 0),
    white,
  );
  const trim = new Builder();
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number) =>
    trim.geometry(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.Matrix4().makeTranslation(x, y, z),
      new THREE.Color(hex),
    );
  box(L / 2 + 0.02, c + 0.2, 0, 0.1, 0.25, w - 0.1, 0x151617);
  box(-L / 2 - 0.02, c + 0.2, 0, 0.1, 0.25, w - 0.1, 0x151617);
  box(0, 1.2, w / 2 + 0.03, L - 0.6, 0.12, 0.02, 0x1d2a44);
  box(0, 1.2, -w / 2 - 0.03, L - 0.6, 0.12, 0.02, 0x1d2a44);
  box(L / 2 + 0.02, 2.9, 0, 0.04, 0.22, 1.4, 0x0d0d0d);
  for (const side of [-1, 1]) {
    box(L / 2 + 0.03, 0.75, side * (w / 2 - 0.3), 0.04, 0.16, 0.3, 0xe6ecef);
    box(-L / 2 - 0.03, 0.8, side * (w / 2 - 0.2), 0.04, 0.3, 0.16, 0x7a0b0b);
  }
  return {
    name: "bus",
    length: L,
    width: w,
    wheelRadius: wr,
    wheels: [-3.3, 3.6],
    weight: 0.06,
    body: body.build(),
    glass: glass.build(),
    trim: trim.build(),
    colors: [0xe8e6e0, 0x2f5f9e, 0xc9372c],
  };
}

const PAINT = [
  0xf0f0ee, 0x121314, 0x1a1c1f, 0x8a8f94, 0xb8bcc0, 0x30343a, 0x1f2d4a, 0x6b1c1c, 0x274a33, 0x4c5a6a, 0xd6d0c4,
  0x2b3a55,
];

function carTypes() {
  return [
    carType(
      "sedan",
      {
        length: 4.75,
        width: 1.84,
        clearance: 0.3,
        wheelRadius: 0.33,
        wheels: [-1.42, 1.4],
        hood: 0.92,
        belt: 1.0,
        roof: 1.44,
        trunk: 1.0,
        windshieldBase: 0.95,
        windshieldTop: 0.02,
        roofRear: -0.95,
        rearBase: -1.58,
      },
      PAINT,
      0.45,
    ),
    carType(
      "suv",
      {
        length: 4.8,
        width: 1.92,
        clearance: 0.42,
        wheelRadius: 0.38,
        wheels: [-1.45, 1.45],
        hood: 1.14,
        belt: 1.2,
        roof: 1.78,
        trunk: 1.28,
        windshieldBase: 1.05,
        windshieldTop: 0.35,
        roofRear: -2.0,
        rearBase: -2.12,
      },
      PAINT,
      0.3,
    ),
    carType(
      "taxi",
      {
        length: 4.75,
        width: 1.84,
        clearance: 0.3,
        wheelRadius: 0.33,
        wheels: [-1.42, 1.4],
        hood: 0.92,
        belt: 1.0,
        roof: 1.44,
        trunk: 1.0,
        windshieldBase: 0.95,
        windshieldTop: 0.02,
        roofRear: -0.95,
        rearBase: -1.58,
      },
      [0xf1b61a],
      0.12,
    ),
    carType(
      "hatch",
      {
        length: 4.1,
        width: 1.78,
        clearance: 0.3,
        wheelRadius: 0.31,
        wheels: [-1.28, 1.22],
        hood: 0.9,
        belt: 0.98,
        roof: 1.46,
        trunk: 1.02,
        windshieldBase: 0.78,
        windshieldTop: -0.05,
        roofRear: -1.6,
        rearBase: -1.8,
      },
      PAINT,
      0.2,
    ),
    busType(),
  ];
}

/** A quadratic Bézier path piece; straight pieces place the control point at the midpoint. */
interface Piece {
  p0: THREE.Vector2;
  p1: THREE.Vector2;
  p2: THREE.Vector2;
  length: number;
  turn: boolean;
  node: [number, number] | null;
  axis: number;
}

function piece(
  p0: THREE.Vector2,
  p1: THREE.Vector2,
  p2: THREE.Vector2,
  turn: boolean,
  node: [number, number] | null,
  axis: number,
): Piece {
  let length = 0;
  let prev = p0.clone();
  for (let i = 1; i <= 12; i++) {
    const point = bezier(p0, p1, p2, i / 12, new THREE.Vector2());
    length += point.distanceTo(prev);
    prev = point;
  }
  return { p0, p1, p2, length, turn, node, axis };
}

function bezier(p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, t: number, out: THREE.Vector2) {
  const u = 1 - t;
  return out.set(u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y);
}

function tangent(p: Piece, t: number, out: THREE.Vector2) {
  return out
    .set(
      2 * (1 - t) * (p.p1.x - p.p0.x) + 2 * t * (p.p2.x - p.p1.x),
      2 * (1 - t) * (p.p1.y - p.p0.y) + 2 * t * (p.p2.y - p.p1.y),
    )
    .normalize();
}

interface Car {
  type: number;
  slot: number;
  node: [number, number];
  dir: number;
  lane: number;
  pieces: Piece[];
  s: number;
  speed: number;
  cruise: number;
  pos: THREE.Vector2;
  fwd: THREE.Vector2;
  spin: number;
}

const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < ROAD_COUNT && j < ROAD_COUNT;
const laneOffset = (lane: number) => LANE_OFFSETS[lane]!;
const nodePoint = (i: number, j: number) => new THREE.Vector2(roadCenter(i), roadCenter(j));

export function createTraffic(count = 250, seed = 9) {
  const random = rng(seed);
  const types = carTypes();
  const group = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.45,
    roughness: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0c1014,
    metalness: 0.2,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.35 });

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const sc = shadowCanvas.getContext("2d")!;
  const gradient = sc.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  sc.fillStyle = gradient;
  sc.fillRect(0, 0, 64, 64);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: new THREE.CanvasTexture(shadowCanvas),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  // Assign each car a type by weight.
  const counts = types.map(() => 0);
  const assignments: number[] = [];
  const total = types.reduce((sum, t) => sum + t.weight, 0);
  for (let i = 0; i < count; i++) {
    let r = random() * total;
    const type = Math.max(
      0,
      types.findIndex((t) => (r -= t.weight) < 0),
    );
    assignments.push(type);
    counts[type]!++;
  }

  const meshes = types.map((type, t) => {
    const n = counts[t]!;
    const body = new THREE.InstancedMesh(type.body, paint, n);
    const glass = new THREE.InstancedMesh(type.glass, glassMaterial, n);
    const trim = new THREE.InstancedMesh(type.trim, trimMaterial, n);
    const wheelGeometry = new Builder();
    wheelGeometry.geometry(
      new THREE.CylinderGeometry(type.wheelRadius, type.wheelRadius, 0.25, 22).rotateX(Math.PI / 2),
      new THREE.Matrix4(),
      new THREE.Color(0x111111),
    );
    wheelGeometry.geometry(
      new THREE.CylinderGeometry(type.wheelRadius * 0.64, type.wheelRadius * 0.64, 0.252, 20).rotateX(Math.PI / 2),
      new THREE.Matrix4(),
      new THREE.Color(0x3a3d40),
    );
    for (let k = 0; k < 5; k++) {
      const spoke = new THREE.BoxGeometry(0.045, type.wheelRadius * 1.2, 0.02).rotateZ((k / 5) * Math.PI);
      for (const side of [-1, 1])
        wheelGeometry.geometry(
          spoke,
          new THREE.Matrix4().makeTranslation(0, 0, side * 0.127),
          new THREE.Color(0xa5aaae),
        );
    }
    for (const side of [-1, 1])
      wheelGeometry.geometry(
        new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12).rotateX(Math.PI / 2),
        new THREE.Matrix4().makeTranslation(0, 0, side * 0.13),
        new THREE.Color(0xb5b9bc),
      );
    const wheels = new THREE.InstancedMesh(wheelGeometry.build(), wheelMaterial, n * 4);
    const shadow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(type.length * 1.25, type.width * 1.5).rotateX(-Math.PI / 2),
      shadowMaterial,
      n,
    );
    for (const mesh of [body, glass, trim, wheels]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    shadow.frustumCulled = false;
    group.add(shadow);
    return { body, glass, trim, wheels, shadow };
  });

  const straight = (car: Car) => {
    const [dx, dz] = DIRECTIONS[car.dir]!;
    const [rx, rz] = rightOf(dx, dz);
    const o = laneOffset(car.lane);
    const a = nodePoint(...car.node);
    const b = nodePoint(car.node[0] + dx, car.node[1] + dz);
    const p0 = new THREE.Vector2(a.x + dx * (ROAD / 2) + rx * o, a.y + dz * (ROAD / 2) + rz * o);
    const p2 = new THREE.Vector2(b.x - dx * (ROAD / 2) + rx * o, b.y - dz * (ROAD / 2) + rz * o);
    return piece(p0, p0.clone().lerp(p2, 0.5), p2, false, [car.node[0] + dx, car.node[1] + dz], dx !== 0 ? 0 : 1);
  };

  /** Plans the turn at the next node and appends the intersection piece plus the following block. */
  const planNext = (car: Car) => {
    const [dx, dz] = DIRECTIONS[car.dir]!;
    const node: [number, number] = [car.node[0] + dx, car.node[1] + dz];
    const options: { dir: number; weight: number; lane: number }[] = [];
    const straightDir = car.dir,
      rightDir = (car.dir + 1) % 4,
      leftDir = (car.dir + 3) % 4;
    const valid = (dir: number) => inside(node[0] + DIRECTIONS[dir]![0], node[1] + DIRECTIONS[dir]![1]);
    if (valid(straightDir)) options.push({ dir: straightDir, weight: 6, lane: car.lane });
    if (valid(rightDir)) options.push({ dir: rightDir, weight: car.lane === 1 ? 2.5 : 0.2, lane: 1 });
    if (valid(leftDir)) options.push({ dir: leftDir, weight: car.lane === 0 ? 1.2 : 0.1, lane: 0 });
    // Drift toward downtown so the walkable core stays busy.
    const mid = (ROAD_COUNT - 1) / 2;
    for (const option of options) {
      const [ox, oz] = DIRECTIONS[option.dir]!;
      const before = Math.abs(node[0] - mid) + Math.abs(node[1] - mid);
      const after = Math.abs(node[0] + ox - mid) + Math.abs(node[1] + oz - mid);
      if (after < before) option.weight *= 1.6;
    }
    let r = random() * options.reduce((sum, option) => sum + option.weight, 0);
    const choice = options.find((option) => (r -= option.weight) < 0) ?? options[0]!;
    const center = nodePoint(...node);
    const [rx, rz] = rightOf(dx, dz);
    const o = laneOffset(car.lane);
    const entry = new THREE.Vector2(center.x - dx * (ROAD / 2) + rx * o, center.y - dz * (ROAD / 2) + rz * o);
    const [ndx, ndz] = DIRECTIONS[choice.dir]!;
    const [nrx, nrz] = rightOf(ndx, ndz);
    const no = laneOffset(choice.lane);
    const exit = new THREE.Vector2(center.x + ndx * (ROAD / 2) + nrx * no, center.y + ndz * (ROAD / 2) + nrz * no);
    let control = entry.clone().lerp(exit, 0.5);
    if (choice.dir !== car.dir) {
      // Corner where the entry and exit lane lines meet.
      control = dx !== 0 ? new THREE.Vector2(exit.x, entry.y) : new THREE.Vector2(entry.x, exit.y);
    }
    car.pieces.push(piece(entry, control, exit, choice.dir !== car.dir, null, dx !== 0 ? 0 : 1));
    car.node = node;
    car.dir = choice.dir;
    car.lane = choice.lane;
    car.pieces.push(straight(car));
  };

  const cars: Car[] = [];
  for (let i = 0; i < count; i++) {
    const type = assignments[i]!;
    const slot = assignments.slice(0, i).filter((t) => t === type).length;
    for (let attempt = 0; attempt < 40; attempt++) {
      const dir = Math.floor(random() * 4);
      const [dx, dz] = DIRECTIONS[dir]!;
      const spread = random() < 0.7 ? 6 : ROAD_COUNT;
      const offset = (ROAD_COUNT - spread) / 2;
      const node: [number, number] = [offset + Math.floor(random() * spread), offset + Math.floor(random() * spread)];
      if (!inside(node[0] + dx, node[1] + dz)) continue;
      const car: Car = {
        type,
        slot,
        node,
        dir,
        lane: types[type]!.name === "bus" ? 1 : Math.floor(random() * 2),
        pieces: [],
        s: range(random, 0, PITCH - ROAD - 12),
        speed: 0,
        cruise: range(random, 10, 13.5),
        pos: new THREE.Vector2(),
        fwd: new THREE.Vector2(),
        spin: 0,
      };
      car.pieces.push(straight(car));
      bezier(car.pieces[0]!.p0, car.pieces[0]!.p1, car.pieces[0]!.p2, car.s / car.pieces[0]!.length, car.pos);
      if (cars.some((other) => other.pos.distanceTo(car.pos) < 14)) continue;
      // Keep the sidewalk around the start clear of cars parked on top of the player.
      if (Math.abs(car.pos.x - 46) < 10 && Math.abs(car.pos.y - 18) < 30) continue;
      planNext(car);
      car.speed = car.cruise * 0.8;
      tangent(car.pieces[0]!, car.s / car.pieces[0]!.length, car.fwd);
      cars.push(car);
      const color = pick(random, types[type]!.colors);
      meshes[type]!.body.setColorAt(slot, new THREE.Color(color));
      break;
    }
  }
  meshes.forEach((m) => m.body.instanceColor && (m.body.instanceColor.needsUpdate = true));
  for (const [t, m] of meshes.entries()) {
    const used = cars.filter((car) => car.type === t).length;
    m.body.count = m.glass.count = m.trim.count = m.shadow.count = used;
    m.wheels.count = used * 4;
  }
  // Re-pack slots after skipped spawns.
  types.forEach((_, t) =>
    cars
      .filter((car) => car.type === t)
      .forEach((car, i) => {
        if (car.slot !== i) {
          const color = new THREE.Color();
          meshes[t]!.body.getColorAt(car.slot, color);
          meshes[t]!.body.setColorAt(i, color);
          car.slot = i;
        }
      }),
  );

  const matrix = new THREE.Matrix4();
  const wheelMatrix = new THREE.Matrix4();
  const spinMatrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  const rel = new THREE.Vector2();

  const gapAhead = (car: Car, player: THREE.Vector2) => {
    const type = types[car.type]!;
    let gap = Infinity;
    let leadSpeed = 0;
    for (const other of cars) {
      if (other === car) continue;
      if (other.fwd.dot(car.fwd) < 0.2) continue;
      rel.subVectors(other.pos, car.pos);
      const along = rel.dot(car.fwd);
      if (along <= 0 || along > 45) continue;
      if (Math.abs(rel.x * car.fwd.y - rel.y * car.fwd.x) > 1.7) continue;
      const g = along - type.length / 2 - types[other.type]!.length / 2;
      if (g < gap) {
        gap = g;
        leadSpeed = other.speed;
      }
    }
    rel.subVectors(player, car.pos);
    const along = rel.dot(car.fwd);
    if (along > 0 && along < 35 && Math.abs(rel.x * car.fwd.y - rel.y * car.fwd.x) < type.width / 2 + 0.9) {
      const g = along - type.length / 2 - 0.6;
      if (g < gap) {
        gap = g;
        leadSpeed = 0;
      }
    }
    return { gap, leadSpeed };
  };

  const update = (dt: number, time: number, player: THREE.Vector2) => {
    for (const car of cars) {
      const type = types[car.type]!;
      const current = car.pieces[0]!;
      const cruise = current.turn ? 6 : car.cruise * (type.name === "bus" ? 0.8 : 1);
      let { gap, leadSpeed } = gapAhead(car, player);
      // Stop line before a red or late yellow signal.
      if (current.node) {
        const toLine = current.length - car.s - 4.8 - type.length / 2;
        const signal = signalAt(current.node[0], current.node[1], current.axis, time);
        const braking = (car.speed * car.speed) / 8;
        if (toLine > -0.5 && (signal === "red" || (signal === "yellow" && toLine > braking))) {
          if (toLine < gap) {
            gap = Math.max(toLine, 0);
            leadSpeed = 0;
          }
        }
      }
      // Intelligent-driver-model style acceleration.
      const desired = 2.2 + car.speed * 1.1 + (car.speed * (car.speed - leadSpeed)) / (2 * Math.sqrt(2.2 * 4));
      let accel = 2.2 * (1 - (car.speed / cruise) ** 4 - (gap < Infinity ? (desired / Math.max(gap, 0.05)) ** 2 : 0));
      accel = Math.max(-9, Math.min(2.4, accel));
      car.speed = Math.max(0, car.speed + accel * dt);
      if (gap < 0.3) car.speed = Math.min(car.speed, 0.5);
      car.s += car.speed * dt;
      while (car.s >= car.pieces[0]!.length) {
        car.s -= car.pieces[0]!.length;
        car.pieces.shift();
        if (car.pieces.length < 2) planNext(car);
      }
      const p = car.pieces[0]!;
      const t = car.s / p.length;
      bezier(p.p0, p.p1, p.p2, t, car.pos);
      tangent(p, t, car.fwd);
      car.spin -= (car.speed * dt) / type.wheelRadius;

      const yaw = Math.atan2(-car.fwd.y, car.fwd.x);
      quaternion.setFromAxisAngle(up, yaw);
      matrix.compose(position.set(car.pos.x, 0, car.pos.y), quaternion, scale);
      const m = meshes[car.type]!;
      m.body.setMatrixAt(car.slot, matrix);
      m.glass.setMatrixAt(car.slot, matrix);
      m.trim.setMatrixAt(car.slot, matrix);
      m.shadow.setMatrixAt(car.slot, spinMatrix.copy(matrix).multiply(wheelMatrix.makeTranslation(0, 0.015, 0)));
      spinMatrix.makeRotationZ(car.spin);
      let w = 0;
      for (const x of type.wheels) {
        for (const side of [-1, 1]) {
          wheelMatrix.makeTranslation(x, type.wheelRadius, side * (type.width / 2 - 0.16)).multiply(spinMatrix);
          m.wheels.setMatrixAt(car.slot * 4 + w++, wheelMatrix.premultiply(matrix));
        }
      }
    }
    for (const m of meshes) {
      m.body.instanceMatrix.needsUpdate =
        m.glass.instanceMatrix.needsUpdate =
        m.trim.instanceMatrix.needsUpdate =
        m.wheels.instanceMatrix.needsUpdate =
        m.shadow.instanceMatrix.needsUpdate =
          true;
    }
  };

  /** Pushes a walker circle out of any car body it overlaps. */
  const collide = (point: THREE.Vector2, radius: number) => {
    for (const car of cars) {
      const type = types[car.type]!;
      rel.subVectors(point, car.pos);
      const along = rel.dot(car.fwd);
      const side = rel.x * car.fwd.y - rel.y * car.fwd.x;
      const hl = type.length / 2 + radius,
        hw = type.width / 2 + radius;
      if (Math.abs(along) >= hl || Math.abs(side) >= hw) continue;
      const pushAlong = hl - Math.abs(along),
        pushSide = hw - Math.abs(side);
      if (pushAlong < pushSide) point.addScaledVector(car.fwd, Math.sign(along) * pushAlong);
      else
        point.set(point.x + car.fwd.y * Math.sign(side) * pushSide, point.y - car.fwd.x * Math.sign(side) * pushSide);
    }
  };

  const nearby = (point: THREE.Vector2) =>
    cars.map((car) => ({
      distance: car.pos.distanceTo(point),
      speed: car.speed,
      bus: types[car.type]!.name === "bus",
    }));

  return { group, update, collide, nearby, cars };
}
