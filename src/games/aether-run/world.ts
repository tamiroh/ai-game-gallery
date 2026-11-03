import * as THREE from "three";
import { COURSE_LENGTH, GAPS, SECTORS, center, elevation, heading, sectorAt, seeded, type Feature } from "./course";

export interface FeatureView {
  feature: Feature;
  root: THREE.Group;
  core?: THREE.Object3D;
}
export function createWorld(scene: THREE.Scene, features: Feature[]) {
  const kinetic: { object: THREE.Object3D; s: number; axis: "x" | "y" | "z"; speed: number }[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  function geometry<T extends THREE.BufferGeometry>(g: T): T {
    geometries.push(g);
    return g;
  }
  function mat(color: number, roughness = 0.7, metalness = 0.05, emissive = 0, intensity = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: intensity });
    materials.push(m);
    return m;
  }
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  const cone = geometry(new THREE.ConeGeometry(1, 1, 6));
  const rock = geometry(new THREE.IcosahedronGeometry(1, 0));
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 8));
  const gem = geometry(new THREE.OctahedronGeometry(0.55));
  const roadMat = mat(0x294b56, 0.92),
    edgeMat = mat(0xd1b98e, 0.55, 0.3),
    beamMat = mat(0x233c4a);
  const glowMat = mat(0x96f5dd, 0.3, 0.3, 0x69f9d7, 2.1);
  const pinkGlow = mat(0xffb9a0, 0.3, 0.2, 0xff7959, 1.7);
  const stone = mat(0xaeb8af, 0.95),
    darkStone = mat(0x536a70, 0.97),
    coral = mat(0xd97860, 0.5, 0.3);
  const treeTrunk = mat(0x6d6860, 0.95),
    leafMat = mat(0x476f61, 0.97),
    leafLight = mat(0x90b38c, 0.96);
  const groundMats = SECTORS.map((s) => mat(s.ground, 0.98));
  const white = mat(0xe9eee1, 0.5, 0.25),
    canopy = mat(0x184453, 0.12, 0.7),
    gold = mat(0xb99a61, 0.4, 0.6);
  const crystalMat = mat(0x80ffdc, 0.2, 0.4, 0x4cf8c9, 2.3);
  const repairMat = mat(0xbdffd4, 0.25, 0.3, 0x75ff9d, 1.5);
  const ringGeo = geometry(new THREE.TorusGeometry(2.1, 0.11, 6, 40));
  const thinRing = geometry(new THREE.TorusGeometry(2.42, 0.035, 4, 40));
  const blob = mat(0xf2eddf, 1);
  blob.transparent = true;
  blob.opacity = 0.38;
  blob.depthWrite = false;
  function mesh(
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  }
  function cube(
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    return mesh(box, material, parent, x, y, z, sx, sy, sz);
  }
  const chunks: { root: THREE.Group; start: number }[] = [];
  const random = seeded(45817);
  // Static scenery is batched by material within each 120 m chunk.
  function batcher(parent: THREE.Group) {
    const batches = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; matrices: THREE.Matrix4[] }>();
    const transform = new THREE.Object3D();
    return {
      add(
        geo: THREE.BufferGeometry,
        material: THREE.Material,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        rx = 0,
        ry = 0,
        rz = 0,
      ) {
        const key = geo.uuid + material.uuid;
        let b = batches.get(key);
        if (!b) {
          b = { geo, mat: material, matrices: [] };
          batches.set(key, b);
        }
        transform.position.set(x, y, z);
        transform.scale.set(sx, sy, sz);
        transform.rotation.set(rx, ry, rz);
        transform.updateMatrix();
        b.matrices.push(transform.matrix.clone());
      },
      finish() {
        for (const b of batches.values()) {
          const inst = new THREE.InstancedMesh(b.geo, b.mat, b.matrices.length);
          b.matrices.forEach((m, i) => inst.setMatrixAt(i, m));
          inst.computeBoundingSphere();
          parent.add(inst);
        }
      },
    };
  }
  for (let start = -120; start < COURSE_LENGTH + 240; start += 120) {
    const root = new THREE.Group();
    scene.add(root);
    chunks.push({ root, start });
    const b = batcher(root);
    const positions: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    for (let s = start; s < start + 120; s += 3) {
      if (GAPS.some((g) => s + 3 > g.start && s < g.end)) continue;
      const n = positions.length / 3;
      for (const p of [
        [s, -6.5],
        [s, 6.5],
        [s + 3, -6.5],
        [s + 3, 6.5],
      ]) {
        positions.push(center(p[0]!) + p[1]!, elevation(p[0]!), -p[0]!);
        uvs.push((p[1]! + 6.5) / 13, p[0]! / 12);
      }
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      const mid = s + 1.5,
        cx = center(mid),
        y = elevation(mid),
        ry = heading(mid);
      for (const side of [-1, 1]) {
        b.add(box, edgeMat, cx + side * 6.6, y - 0.28, -mid, 0.26, 0.55, 3.05, 0, ry);
        b.add(box, glowMat, cx + side * 6.43, y + 0.035, -mid, 0.07, 0.055, 3.05, 0, ry);
        if (s % 12 === 0) b.add(box, beamMat, cx + side * 6.8, y - 0.6, -mid, 0.5, 1.2, 1.5, 0, ry);
      }
      if (s % 12 === 0)
        for (const x of [-2.15, 2.15]) b.add(box, edgeMat, cx + x, y + 0.025, -mid, 0.04, 0.02, 2, 0, ry);
      if (s % 24 === 0) {
        b.add(box, beamMat, cx, y - 0.8, -mid, 13.5, 0.7, 1, 0, ry);
        b.add(box, darkStone, cx, y - 5, -mid, 2.8, 8.5, 2.5, 0, ry);
      }
    }
    const roadGeo = geometry(new THREE.BufferGeometry());
    roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();
    mesh(roadGeo, roadMat, root);
    for (let i = 0; i < 9; i++) {
      const s = start + random() * 120,
        side = random() < 0.5 ? -1 : 1,
        x = center(s) + side * (16 + random() * 65),
        y = elevation(s) - 6 - random() * 15,
        size = 5 + random() * 11;
      const sector = sectorAt(s),
        grass = groundMats[sector]!;
      b.add(rock, darkStone, x, y - size * 0.65, -s, size, size * 1.4, size * 0.9, 0, random() * 6, Math.PI);
      b.add(cylinder, grass, x, y + 0.2, -s, size * 0.85, 0.7, size * 0.75, 0, random() * 6);
      b.add(rock, stone, x + size * 0.4, y + 0.7, -s - 1, 2, 2, 2, 0, random() * 6);
      if (i % 3 !== 0) {
        for (let t = 0; t < 3; t++) {
          const tx = x + (random() - 0.5) * size,
            tz = -s + (random() - 0.5) * size,
            th = 3 + random() * 5;
          b.add(cylinder, treeTrunk, tx, y + th * 0.45, tz, 0.15, th, 0.15);
          if (sector === 0) {
            b.add(sphere, leafMat, tx, y + th, tz, 2.3, 1.7, 2.3);
            b.add(sphere, leafLight, tx + 0.7, y + th + 0.6, tz - 0.5, 1.5, 1.2, 1.6);
          } else {
            b.add(cone, sector === 1 ? leafMat : leafLight, tx, y + th, tz, 1.7, th * 0.8, 1.7);
            b.add(cone, leafMat, tx, y + th * 0.65, tz, 2.2, th * 0.65, 2.2);
          }
        }
      } else {
        // Small wind-powered outposts on the surrounding islands.
        b.add(cylinder, stone, x, y + 3, -s, 1.2, 6, 1.2);
        b.add(cone, gold, x, y + 6.6, -s, 1.7, 1.6, 1.7);
        const rotor = new THREE.Group();
        rotor.position.set(x, y + 5, -s + 1.4);
        root.add(rotor);
        cube(rotor, white, 0, 0, 0, 7, 0.2, 0.12);
        cube(rotor, white, 0, 0, 0, 0.2, 7, 0.12);
        mesh(sphere, gold, rotor, 0, 0, 0.1, 0.35, 0.35, 0.35);
        kinetic.push({ object: rotor, s, axis: "z", speed: 0.55 + random() * 0.3 });
      }
      if (i % 4 === 0) {
        // Water ribbons disappear softly into the cloud layer.
        const water = mat(0x9bdbdb, 0.35, 0.3, 0x336b77, 0.25);
        water.transparent = true;
        water.opacity = 0.45;
        b.add(box, water, x + size * 0.6, y - 14, -s, 0.8, 28, 1.6);
        b.add(box, white, x + size * 0.6, y - 28, -s, 3, 0.15, 4);
      }
    }
    // Ruins, colonnades and observatory arches change the silhouette by sector.
    for (let s = start + 30; s < start + 120; s += 60) {
      if (!GAPS.some((g) => Math.abs(g.start - s) < 35)) {
        const x = center(s),
          y = elevation(s),
          ry = heading(s),
          sector = sectorAt(s);
        for (const side of [-1, 1]) {
          b.add(box, stone, x + side * 8.4, y + 4.4, -s, 1.4, 9.8, 1.7, 0, ry);
          b.add(box, gold, x + side * 8.4, y + 9, -s, 1.8, 0.35, 2, 0, ry);
        }
        if (sector > 0) {
          b.add(box, stone, x, y + 9.8, -s, 18, 1, 2, 0, ry);
          for (const side of [-1, 1]) b.add(box, gold, x + side * 5, y + 9, -s, 3, 0.18, 2.3, 0, ry);
        }
        if (sector === 2) b.add(ringGeo, gold, x, y + 10, -s, 1.7, 1.7, 1.7, 0, ry);
      }
    }
    const landmarkS = start + 72,
      lx = center(landmarkS),
      ly = elevation(landmarkS),
      sector = sectorAt(landmarkS);
    if (sector === 0) {
      for (let side = -1; side <= 1; side += 2)
        for (let vine = 0; vine < 7; vine++) {
          const vs = landmarkS + vine * 2.4,
            vy = elevation(vs),
            vx = center(vs) + side * (9 + random() * 4);
          b.add(cylinder, leafMat, vx, vy - 4, -vs, 0.045, 8 + random() * 6, 0.045);
          for (let leaf = 0; leaf < 4; leaf++)
            b.add(rock, leafLight, vx + (random() - 0.5), vy - leaf * 2, -vs, 0.45, 0.22, 0.6, 0, random() * 6);
          if (vine % 2 === 0) b.add(sphere, coral, vx, vy + 0.2, -vs, 0.5, 0.22, 0.5);
        }
    } else if (sector === 1) {
      for (const side of [-1, 1]) {
        b.add(box, stone, lx + side * 18, ly + 1, -landmarkS, 4, 1, 95);
        b.add(box, glowMat, lx + side * 18, ly + 1.55, -landmarkS, 2.7, 0.05, 95);
        for (const edge of [-1, 1]) b.add(box, stone, lx + side * 18 + edge * 1.8, ly + 2, -landmarkS, 0.4, 1.5, 95);
        for (let col = -2; col <= 2; col++)
          b.add(box, stone, lx + side * 18, ly - 8, -landmarkS + col * 20, 2.7, 18, 3);
      }
    } else {
      const armillary = new THREE.Group();
      armillary.position.set(lx + 24, ly + 9, -landmarkS);
      root.add(armillary);
      mesh(thinRing, gold, armillary, 0, 0, 0, 2, 2, 2);
      const inner = mesh(thinRing, glowMat, armillary, 0, 0, 0, 1.8, 1.8, 1.8);
      inner.rotation.x = Math.PI / 2;
      mesh(sphere, gold, armillary, 0, 0, 0, 1.4, 1.4, 1.4);
      kinetic.push({ object: armillary, s: landmarkS, axis: "y", speed: 0.25 });
      b.add(cylinder, stone, lx + 24, ly + 1, -landmarkS, 2, 14, 2);
    }
    b.finish();
  }
  // Monumental landmarks mark each destination, beyond the driveable corridor.
  const landmarks = new THREE.Group();
  scene.add(landmarks);
  for (const s of [870, 1770, 2670]) {
    const cx = center(s),
      y = elevation(s),
      b = batcher(landmarks);
    for (const side of [-1, 1]) {
      b.add(cylinder, stone, cx + side * 20, y + 12, -s, 3, 30, 3);
      b.add(cone, gold, cx + side * 20, y + 28, -s, 4.5, 4, 4.5);
      for (let h = 0; h < 4; h++) b.add(cylinder, gold, cx + side * 20, y + h * 7, -s, 3.3, 0.6, 3.3);
    }
    b.add(box, stone, cx, y + 25, -s, 43, 2, 4);
    b.add(box, glowMat, cx, y + 24, -s + 2.1, 34, 0.2, 0.12);
    const dial = mesh(geometry(new THREE.TorusGeometry(11, 0.6, 6, 64)), gold, landmarks, cx, y + 37, -s);
    dial.rotation.x = 0.15;
    const orbit = new THREE.Group();
    orbit.position.copy(dial.position);
    landmarks.add(orbit);
    const orbitRing = mesh(thinRing, glowMat, orbit, 0, 0, 0, 3.8, 3.8, 3.8);
    orbitRing.rotation.x = Math.PI / 2.7;
    const satellite = mesh(sphere, gold, orbit, 9, 0, 0, 1, 1, 1);
    satellite.position.y = 2;
    kinetic.push({ object: orbit, s, axis: "y", speed: 0.16 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.add(box, gold, cx + Math.cos(a) * 11, y + 37 + Math.sin(a) * 11, -s, 0.2, 2, 0.3, 0, 0, a - Math.PI / 2);
    }
    b.add(sphere, glowMat, cx, y + 37, -s, 2, 2, 2);
    b.finish();
  }
  // Holographic launch markers announce every jump well before the broken edge.
  for (const gap of GAPS) {
    const s = gap.start - 14,
      y = elevation(s),
      x = center(s);
    for (const side of [-1, 1]) {
      cube(landmarks, gold, x + side * 6.8, y + 1.8, -s, 0.2, 3.6, 0.2);
      const chevron = cube(landmarks, pinkGlow, x + side * 6.8, y + 3.8, -s, 0.9, 0.1, 0.12);
      chevron.rotation.z = side * 0.5;
    }
    for (let i = 0; i < 3; i++) {
      const p = gap.start - 8 - i * 4;
      for (const side of [-1, 1]) {
        const arrow = cube(landmarks, pinkGlow, center(p) + side * 0.6, elevation(p) + 0.04, -p, 1.6, 0.04, 0.2);
        arrow.rotation.y = side * 0.6;
      }
    }
  }
  const finish = new THREE.Group();
  finish.position.set(center(COURSE_LENGTH), elevation(COURSE_LENGTH), -COURSE_LENGTH);
  scene.add(finish);
  for (let x = -6; x < 7; x += 1.3)
    for (let y = 6; y < 8; y += 0.6)
      cube(finish, (Math.round(x / 1.3) + Math.round(y / 0.6)) % 2 ? white : beamMat, x, y, 0, 1.3, 0.6, 0.3);
  for (const x of [-7, 7]) {
    cube(finish, gold, x, 4, 0, 0.5, 8, 0.5);
    cube(finish, glowMat, x, 4, 0.3, 0.12, 8, 0.1);
  }
  const views: FeatureView[] = features.map((feature) => {
    const root = new THREE.Group();
    root.position.set(center(feature.s) + feature.x, elevation(feature.s) + feature.y, -feature.s);
    root.rotation.y = heading(feature.s);
    scene.add(root);
    let core: THREE.Object3D | undefined;
    if (feature.kind === "block") {
      cube(root, coral, 0, 0, 0, feature.width, 2.2, 1.8);
      cube(root, darkStone, 0, -1, 0, feature.width + 0.3, 0.25, 2.1);
      for (const x of [-0.65, 0.65]) cube(root, pinkGlow, x, 0, 0.92, 0.08, 1.75, 0.05);
      cube(root, gold, 0, 1.12, 0, feature.width + 0.1, 0.12, 1.9);
    } else if (feature.kind === "sweeper") {
      core = new THREE.Group();
      root.add(core);
      mesh(rock, coral, core, 0, 0, 0, 1.2, 1.15, 1.2);
      mesh(thinRing, pinkGlow, core, 0, 0, 0, 0.65, 0.65, 0.65);
      cube(root, glowMat, 0, -0.8, 0, 1.8, 0.1, 1.8);
    } else if (feature.kind === "crystal") {
      core = mesh(gem, crystalMat, root);
      mesh(thinRing, glowMat, root, 0, -0.65, 0, 0.18, 0.18, 0.18).rotation.x = Math.PI / 2;
    } else if (feature.kind === "ring") {
      core = new THREE.Group();
      root.add(core);
      mesh(ringGeo, crystalMat, core);
      mesh(thinRing, gold, core);
      for (const x of [-1, 1]) cube(core, white, x * 2.5, 0, 0, 0.25, 0.9, 0.15);
    } else if (feature.kind === "repair") {
      core = new THREE.Group();
      root.add(core);
      mesh(rock, repairMat, core, 0, 0, 0, 0.8, 0.8, 0.8);
      cube(core, white, 0, 0, 0.7, 0.2, 1, 0.1);
      cube(core, white, 0, 0, 0.71, 1, 0.2, 0.1);
    } else {
      cube(root, beamMat, 0, 0, 0, 12, 0.05, 5);
      for (let i = 0; i < 3; i++)
        for (const side of [-1, 1]) {
          const arrow = cube(root, glowMat, side * 0.65, 0.05, i * 1.25 - 1, 1.8, 0.04, 0.3);
          arrow.rotation.y = side * 0.65;
        }
    }
    return { feature, root, core };
  });
  const ship = new THREE.Group();
  scene.add(ship);
  // A swept delta hull, rather than a stack of rectangular blocks.
  const hullGeo = geometry(new THREE.BufferGeometry());
  const hullVertices = [0, 0.15, -1.9, -0.52, -0.1, 0.95, 0.52, -0.1, 0.95, 0, 0.48, -0.05, 0, -0.3, 0.4];
  hullGeo.setAttribute("position", new THREE.Float32BufferAttribute(hullVertices, 3));
  hullGeo.setIndex([0, 1, 3, 0, 3, 2, 1, 2, 3, 0, 4, 1, 0, 2, 4, 1, 4, 2]);
  hullGeo.computeVertexNormals();
  mesh(hullGeo, white, ship);
  const wingGeo = geometry(new THREE.BufferGeometry());
  wingGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.3, 0, -0.7, -2.2, -0.12, 1.3, -0.5, -0.08, 0.8, 0.3, 0, -0.7, 0.5, -0.08, 0.8, 2.2, -0.12, 1.3],
      3,
    ),
  );
  wingGeo.setIndex([0, 1, 2, 2, 1, 0, 3, 4, 5, 5, 4, 3]);
  wingGeo.computeVertexNormals();
  mesh(wingGeo, white, ship);
  mesh(sphere, canopy, ship, 0, 0.27, -0.3, 0.32, 0.25, 0.8);
  const engines: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const nacelle = mesh(cylinder, beamMat, ship, side * 0.73, -0.03, 0.7, 0.2, 1.5, 0.2);
    nacelle.rotation.x = Math.PI / 2;
    const nozzle = mesh(cone, glowMat, ship, side * 0.73, -0.03, 1.7, 0.17, 0.9, 0.17);
    nozzle.rotation.x = Math.PI / 2;
    engines.push(nozzle);
    const fin = cube(ship, coral, side * 0.8, 0.3, 1.03, 0.06, 0.7, 0.65);
    fin.rotation.z = side * -0.2;
    cube(ship, glowMat, side * 1.8, -0.07, 1.15, 0.5, 0.04, 0.1);
  }
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0x8cffdc, wireframe: true, transparent: true, opacity: 0.12 });
  materials.push(shieldMat);
  const shield = mesh(geometry(new THREE.IcosahedronGeometry(2.4, 1)), shieldMat, ship);
  shield.visible = false;
  // Soft contact shadow and underglow help judge jumps and height.
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x0b2934,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });
  materials.push(shadowMat);
  const shadow = mesh(geometry(new THREE.CircleGeometry(1, 24)), shadowMat, scene, 0, 0, 0, 1.6, 1, 1);
  shadow.rotation.x = -Math.PI / 2;
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x5f9eb6) },
      bottom: { value: new THREE.Color(0xcad9d2) },
      sunColor: { value: new THREE.Color(0xffd8a0) },
      sunDirection: { value: new THREE.Vector3(-0.25, 0.18, -0.95).normalize() },
    },
    vertexShader:
      "varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:
      "varying vec3 vDirection;uniform vec3 top;uniform vec3 bottom;uniform vec3 sunColor;uniform vec3 sunDirection;void main(){vec3 d=normalize(vDirection);float h=smoothstep(-0.12,0.8,d.y);vec3 col=mix(bottom,top,h);float sun=max(0.,dot(d,sunDirection));col+=sunColor*(pow(sun,240.)*1.8+pow(sun,10.)*.12);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  });
  materials.push(skyMat);
  const sky = mesh(geometry(new THREE.SphereGeometry(1600, 24, 16)), skyMat, scene);
  sky.renderOrder = -10;
  const clouds = new THREE.Group();
  scene.add(clouds);
  const cloudBatch = batcher(clouds);
  for (let i = 0; i < 90; i++) {
    const a = random() * Math.PI * 2,
      r = 130 + random() * 450,
      y = -20 - random() * 45;
    for (let j = 0; j < 3; j++)
      cloudBatch.add(
        sphere,
        blob,
        Math.sin(a) * r + j * 14,
        y + random() * 3,
        Math.cos(a) * r,
        25 + random() * 25,
        4 + random() * 5,
        13 + random() * 17,
      );
  }
  cloudBatch.finish();
  const far = new THREE.Group();
  scene.add(far);
  const farBatch = batcher(far);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2,
      r = 500 + random() * 200;
    farBatch.add(
      rock,
      darkStone,
      Math.cos(a) * r,
      -110,
      Math.sin(a) * r,
      40 + random() * 70,
      60 + random() * 120,
      35 + random() * 60,
      0,
      random() * 6,
    );
  }
  farBatch.finish();
  // A pooled particle system covers pickup sparks, impacts and exhaust trails.
  const capacity = 600,
    particles = Array.from({ length: capacity }, () => ({ life: 0, max: 1, velocity: new THREE.Vector3() }));
  const coords = new Float32Array(capacity * 3),
    colors = new Float32Array(capacity * 3);
  coords.fill(1e5);
  const particleGeo = geometry(new THREE.BufferGeometry());
  particleGeo.setAttribute("position", new THREE.BufferAttribute(coords, 3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.17,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  materials.push(particleMat);
  const points = new THREE.Points(particleGeo, particleMat);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;
  function emit(position: THREE.Vector3, color: number, count: number, power = 3) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const index = cursor++ % capacity,
        p = particles[index]!;
      p.max = p.life = 0.3 + random() * 0.6;
      p.velocity.set((random() - 0.5) * power, (random() - 0.1) * power, (random() - 0.5) * power);
      coords[index * 3] = position.x;
      coords[index * 3 + 1] = position.y;
      coords[index * 3 + 2] = position.z;
      colors[index * 3] = c.r;
      colors[index * 3 + 1] = c.g;
      colors[index * 3 + 2] = c.b;
    }
  }
  let lastSector = -1;
  const targetFog = new THREE.Color(),
    targetSky = new THREE.Color(),
    targetGround = new THREE.Color();
  const hemi = new THREE.HemisphereLight(0xe8f7ed, 0x354653, 2.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdfb1, 3.1);
  sun.position.set(-50, 80, -80);
  scene.add(sun);
  const fog = new THREE.Fog(SECTORS[0].fog, 145, 620);
  scene.fog = fog;
  return {
    ship,
    shield,
    shadow,
    views,
    emit,
    update(s: number, time: number, dt: number, boost: boolean, jumpHeight: number, quality: boolean) {
      for (const item of kinetic) {
        if (Math.abs(item.s - s) < 650) item.object.rotation[item.axis] += dt * item.speed;
      }
      for (const chunk of chunks) chunk.root.visible = chunk.start > s - 150 && chunk.start < s + (quality ? 650 : 430);
      const sector = sectorAt(s);
      if (sector !== lastSector) {
        lastSector = sector;
        targetFog.setHex(SECTORS[sector]!.fog);
        targetSky.setHex(SECTORS[sector]!.sky);
        targetGround.setHex(SECTORS[sector]!.sun);
      }
      const blend = 1 - Math.exp(-dt * 0.7);
      fog.color.lerp(targetFog, blend);
      skyMat.uniforms.top!.value.lerp(targetSky, blend);
      skyMat.uniforms.bottom!.value.lerp(targetFog, blend);
      sun.color.lerp(targetGround, blend);
      sky.position.set(center(s), 0, -s);
      clouds.position.set(center(s) * 0.5, 0, -s);
      far.position.set(center(s), 0, -s);
      for (const view of views) {
        const ahead = view.feature.s - s;
        view.root.visible = ahead > -15 && ahead < 400 && view.root.userData.collected !== true;
        if (!view.root.visible) continue;
        if (view.core && ["crystal", "repair", "sweeper"].includes(view.feature.kind))
          view.core.rotation.y = time * (view.feature.kind === "sweeper" ? 2 : 0.9);
        if (view.feature.kind === "crystal" || view.feature.kind === "repair")
          view.root.position.y =
            elevation(view.feature.s) + view.feature.y + Math.sin(time * 2 + view.feature.id) * 0.12;
      }
      engines.forEach((engine, i) => {
        engine.scale.y = (boost ? 1.9 : 0.85) + Math.sin(time * 41 + i) * 0.12;
      });
      shadow.position.set(ship.position.x, elevation(s) + 0.04, ship.position.z);
      shadow.scale.setScalar(Math.max(0.45, 1 - jumpHeight * 0.08));
      shadowMat.opacity = Math.max(0.04, 0.25 - jumpHeight * 0.035);
      shadow.visible = !GAPS.some((g) => s > g.start && s < g.end);
      shield.rotation.y = time * 0.6;
      for (let i = 0; i < capacity; i++) {
        const p = particles[i]!;
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          coords[i * 3] = 1e5;
          continue;
        }
        coords[i * 3] += p.velocity.x * dt;
        coords[i * 3 + 1] += p.velocity.y * dt;
        coords[i * 3 + 2] += p.velocity.z * dt;
        p.velocity.y -= dt * 1.5;
      }
      particleGeo.attributes.position!.needsUpdate = true;
    },
    reset() {
      for (const view of views) view.root.userData.collected = false;
      particles.forEach((p) => (p.life = 0));
      coords.fill(1e5);
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      scene.clear();
    },
  };
}
