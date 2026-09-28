import * as THREE from "three";
import { BLOCK, CURB_HEIGHT, blockCenter, isPark, pick, range, rng } from "./layout";

const CLOTHES = [
  0x1d2433, 0x151515, 0x3b3f45, 0x6f6a60, 0xbdb5a4, 0xe6e3dc, 0x4a5236, 0x2f4a6b, 0x5a3d2b, 0x6b2830, 0x8a8f96,
  0x2b2e3a, 0x7d6a55, 0x324d49,
];
const PANTS = [0x1c2230, 0x121212, 0x2e3a52, 0x44474c, 0x6b6150, 0x3a3f2e, 0x252a36, 0x8e8677];
const SKIN = [0xf1c8a8, 0xe0ac86, 0xc68b62, 0x9c6843, 0x6e4a31, 0xf5d3bb, 0xd49b72];
const HAIR = [0x16110d, 0x2b1d13, 0x4a3322, 0x6d5134, 0xa98a5e, 0x8c8c88, 0x1f1a17];
const SHOES = [0x151515, 0x2a211a, 0xdedcd6, 0x3a3a3a, 0x4d3625];

/** Capsule hanging down from its top joint. */
const limb = (radius: number, length: number, sx = 1, sz = 1) =>
  new THREE.CapsuleGeometry(radius, length, 3, 8).translate(0, -length / 2, 0).scale(sx, 1, sz);

interface Walker {
  cx: number;
  cz: number;
  inset: number;
  /** Distance travelled around the block perimeter. */
  s: number;
  dir: 1 | -1;
  speed: number;
  pace: number;
  phase: number;
  scale: number;
  pos: THREE.Vector2;
  heading: THREE.Vector2;
  dodge: number;
}

export function createPedestrians(count = 190, seed = 17) {
  const random = rng(seed);
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.85 });

  const parts = {
    torso: { geometry: limb(0.16, 0.3, 1.12, 0.66), per: 1 },
    pelvis: { geometry: new THREE.CapsuleGeometry(0.14, 0.08, 3, 8).rotateX(Math.PI / 2).scale(0.72, 1, 1.12), per: 1 },
    thigh: { geometry: limb(0.075, 0.34), per: 2 },
    shin: { geometry: limb(0.058, 0.36), per: 2 },
    foot: { geometry: new THREE.BoxGeometry(0.24, 0.08, 0.1).translate(0.06, -0.04, 0), per: 2 },
    upperArm: { geometry: limb(0.05, 0.22), per: 2 },
    forearm: { geometry: limb(0.042, 0.22), per: 2 },
    head: { geometry: new THREE.SphereGeometry(0.1, 14, 10).scale(1.02, 1.18, 0.92), per: 1 },
    hair: {
      geometry: new THREE.SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)
        .scale(1.04, 1.12, 0.98)
        .translate(-0.01, 0.02, 0),
      per: 1,
    },
  };
  type PartName = keyof typeof parts;
  const meshes = Object.fromEntries(
    Object.entries(parts).map(([name, part]) => {
      const mesh: THREE.InstancedMesh = new THREE.InstancedMesh(part.geometry, material, count * part.per);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      return [name, mesh];
    }),
  ) as Record<PartName, THREE.InstancedMesh>;

  const walkers: Walker[] = [];
  const blocks: [number, number][] = [];
  for (let bx = -3; bx <= 3; bx++) for (let bz = -3; bz <= 3; bz++) if (!isPark(bx, bz)) blocks.push([bx, bz]);
  for (let i = 0; i < count; i++) {
    const [bx, bz] = pick(random, blocks);
    const walker: Walker = {
      cx: blockCenter(bx),
      cz: blockCenter(bz),
      inset: range(random, 1.8, 3.4),
      s: random() * 1000,
      dir: random() < 0.5 ? 1 : -1,
      speed: range(random, 1.05, 1.5),
      pace: 0,
      phase: random() * Math.PI * 2,
      scale: range(random, 0.92, 1.07),
      pos: new THREE.Vector2(),
      heading: new THREE.Vector2(1, 0),
      dodge: 0,
    };
    walker.pace = walker.speed;
    walkers.push(walker);
    const shirt = new THREE.Color(pick(random, CLOTHES));
    const pants = new THREE.Color(pick(random, PANTS));
    const skin = new THREE.Color(pick(random, SKIN));
    const longSleeves = random() < 0.6;
    const colors: Record<PartName, THREE.Color> = {
      torso: shirt,
      pelvis: pants,
      thigh: pants,
      shin: pants,
      foot: new THREE.Color(pick(random, SHOES)),
      upperArm: shirt,
      forearm: longSleeves ? shirt : skin,
      head: skin,
      hair: new THREE.Color(pick(random, HAIR)),
    };
    for (const name of Object.keys(parts) as PartName[]) {
      for (let k = 0; k < parts[name].per; k++) meshes[name].setColorAt(i * parts[name].per + k, colors[name]);
    }
  }

  /** Point on the rounded-corner loop around a block, `inset` meters in from the curb. */
  const place = (w: Walker) => {
    const half = BLOCK / 2 - w.inset;
    const side = half * 2;
    const perimeter = side * 4;
    const s = ((w.s % perimeter) + perimeter) % perimeter;
    const edge = Math.floor(s / side);
    const t = s - edge * side - half;
    const corners: [number, number, number, number][] = [
      [t, -half, 1, 0],
      [half, t, 0, 1],
      [-t, half, -1, 0],
      [-half, -t, 0, -1],
    ];
    const [x, z, dx, dz] = corners[edge]!;
    w.pos.set(w.cx + x, w.cz + z);
    w.heading.set(dx * w.dir, dz * w.dir);
  };
  walkers.forEach(place);

  const root = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  // Scratch matrices: each helper result is consumed by the next multiply.
  const rotation = new THREE.Matrix4();
  const translation = new THREE.Matrix4();
  const tilt = new THREE.Matrix4();
  const thigh = new THREE.Matrix4();
  const shin = new THREE.Matrix4();
  const arm = new THREE.Matrix4();
  const rotZ = (angle: number) => rotation.makeRotationZ(angle);
  const at = (x: number, y: number, z: number) => translation.makeTranslation(x, y, z);
  const rel = new THREE.Vector2();

  const update = (dt: number, player: THREE.Vector2) => {
    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i]!;
      // Slow down for the walker (and anyone) standing right in front.
      let blocked = false;
      // Positions relative to the walker: `ahead` along the heading, `side` toward the walker's right.
      rel.subVectors(player, w.pos);
      const ahead = rel.dot(w.heading);
      const side = -rel.x * w.heading.y + rel.y * w.heading.x;
      if (ahead > 0 && ahead < 1.6 && Math.abs(side) < 0.6) blocked = true;
      let dodgeTarget = 0;
      if (ahead > -0.5 && ahead < 4 && Math.abs(side) < 1.1) dodgeTarget = side > 0 ? -0.9 : 0.9;
      for (let j = 0; j < walkers.length; j++) {
        if (j === i) continue;
        const o = walkers[j]!;
        if (o.cx !== w.cx || o.cz !== w.cz) continue;
        rel.subVectors(o.pos, w.pos);
        const a = rel.dot(w.heading);
        if (a <= 0 || a > 3) continue;
        const l = -rel.x * w.heading.y + rel.y * w.heading.x;
        if (Math.abs(l) < 0.55) {
          if (o.heading.dot(w.heading) > 0.5) {
            if (a < 1.2) blocked = true;
          } else if (dodgeTarget === 0) dodgeTarget = 0.45;
        }
      }
      w.dodge += (dodgeTarget - w.dodge) * (1 - Math.exp(-dt * 3));
      w.pace += ((blocked ? 0 : w.speed) - w.pace) * (1 - Math.exp(-dt * 5));
      w.s += w.pace * dt * w.dir;
      w.phase += (w.pace * dt * Math.PI) / (0.72 * w.scale);
      place(w);
      // Sidestep; positive dodge is to the walker's right.
      w.pos.x += -w.heading.y * w.dodge;
      w.pos.y += w.heading.x * w.dodge;

      const moving = Math.min(1, w.pace / 0.6);
      const swing = Math.sin(w.phase) * 0.42 * moving;
      const bob = Math.abs(Math.cos(w.phase)) * 0.035 * moving;
      const hip = 0.97 + bob;
      q.setFromAxisAngle(up, Math.atan2(-w.heading.y, w.heading.x));
      root.compose(v.set(w.pos.x, CURB_HEIGHT, w.pos.y), q, one.set(w.scale, w.scale, w.scale));

      meshes.pelvis.setMatrixAt(i, m.copy(root).multiply(at(0, hip, 0)));
      meshes.torso.setMatrixAt(
        i,
        m
          .copy(root)
          .multiply(at(0, hip + 0.36, 0))
          .multiply(rotZ(-0.05 * moving)),
      );
      meshes.head.setMatrixAt(i, m.copy(root).multiply(at(0.01, hip + 0.72, 0)));
      meshes.hair.setMatrixAt(i, m.copy(root).multiply(at(0.01, hip + 0.72, 0)));
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        const legSwing = swing * side;
        const knee = 0.06 + 0.75 * Math.max(0, Math.cos(w.phase + (side < 0 ? 0 : Math.PI))) * moving;
        thigh
          .copy(root)
          .multiply(at(0, hip - 0.04, side * 0.085))
          .multiply(rotZ(legSwing));
        meshes.thigh.setMatrixAt(i * 2 + k, thigh);
        shin
          .copy(thigh)
          .multiply(at(0, -0.42, 0))
          .multiply(rotZ(-knee));
        meshes.shin.setMatrixAt(i * 2 + k, shin);
        meshes.foot.setMatrixAt(
          i * 2 + k,
          m
            .copy(shin)
            .multiply(at(0, -0.44, 0))
            .multiply(rotZ(knee - legSwing)),
        );
        arm
          .copy(root)
          .multiply(at(0, hip + 0.47, side * 0.215))
          .multiply(rotZ(-legSwing * 0.8))
          .multiply(tilt.makeRotationX(side * 0.08));
        meshes.upperArm.setMatrixAt(i * 2 + k, arm);
        meshes.forearm.setMatrixAt(
          i * 2 + k,
          m
            .copy(arm)
            .multiply(at(0, -0.3, 0))
            .multiply(rotZ(0.25 + Math.max(0, -legSwing) * 0.5)),
        );
      }
    }
    for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
  };

  /** Pushes the player out of pedestrians. */
  const collide = (point: THREE.Vector2, radius: number) => {
    for (const w of walkers) {
      const dx = point.x - w.pos.x,
        dz = point.y - w.pos.y;
      const reach = radius + 0.25;
      const d = Math.hypot(dx, dz);
      if (d < reach && d > 1e-5) point.set(w.pos.x + (dx / d) * reach, w.pos.y + (dz / d) * reach);
    }
  };

  for (const mesh of Object.values(meshes)) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  update(0, new THREE.Vector2(1e6, 1e6));
  return { group, update, collide };
}
