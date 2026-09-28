import * as THREE from "three";

export function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** A flat shape in the XY plane, extruded to a thin slab. */
function slab(points: [number, number][], thickness: number) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.4,
    bevelSize: thickness * 0.5,
    bevelSegments: 2,
  }).translate(0, 0, -thickness / 2);
}

export interface Aircraft {
  group: THREE.Group;
  /** Wingtip positions in local space, for the vapor trails. */
  tips: [THREE.Vector3, THREE.Vector3];
  update(time: number, boost: number): void;
  dispose(): void;
}

export function createAircraft(): Aircraft {
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T) => (disposables.push(item), item);

  const paint = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xf4f2ee,
      roughness: 0.28,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  );
  const accent = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xc8321f,
      roughness: 0.3,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    }),
  );
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.4, metalness: 0.7 }));
  const canopyGlass = track(
    new THREE.MeshPhysicalMaterial({ color: 0x0f1a24, roughness: 0.03, metalness: 0.9, clearcoat: 1 }),
  );

  // Fuselage: a lathe profile running nose (-z) to tail (+z).
  const profile: [number, number][] = [
    [0.001, 3.7],
    [0.2, 3.5],
    [0.42, 3.05],
    [0.58, 2.3],
    [0.66, 1.2],
    [0.66, 0],
    [0.6, -1.2],
    [0.46, -2.4],
    [0.3, -3.3],
    [0.24, -3.55],
  ];
  const fuselageGeometry = track(
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ).rotateX(-Math.PI / 2),
  );
  const fuselage = new THREE.Mesh(fuselageGeometry, paint);
  fuselage.scale.set(1, 0.92, 1);
  model.add(fuselage);

  // Red nose cone and a red stripe along the spine.
  const nose = new THREE.Mesh(
    track(new THREE.ConeGeometry(0.205, 0.46, 24).rotateX(-Math.PI / 2).translate(0, 0, -3.72)),
    accent,
  );
  model.add(nose);
  const stripe = new THREE.Mesh(track(new THREE.BoxGeometry(1.36, 0.14, 4.2)), accent);
  stripe.position.set(0, -0.05, 0.4);
  model.add(stripe);

  const canopy = new THREE.Mesh(track(new THREE.SphereGeometry(1, 24, 16)), canopyGlass);
  canopy.scale.set(0.46, 0.42, 1.25);
  canopy.position.set(0, 0.42, -1.25);
  model.add(canopy);

  // Swept wings (shape drawn with +y forward, then laid flat so +y becomes -z).
  const wingGeometry = track(
    slab(
      [
        [-4.3, -0.35],
        [0, 1.05],
        [4.3, -0.35],
        [4.3, -1.05],
        [0, -1.55],
        [-4.3, -1.05],
      ],
      0.12,
    ).rotateX(-Math.PI / 2),
  );
  const wings = new THREE.Mesh(wingGeometry, paint);
  wings.position.set(0, -0.22, 0.25);
  model.add(wings);
  const tipGeometry = track(
    slab(
      [
        [0.35, 0],
        [-0.2, 0.55],
        [-0.5, 0.55],
        [-0.45, 0],
      ],
      0.06,
    ).rotateY(Math.PI / 2),
  );
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(tipGeometry, accent);
    tip.position.set(side * 4.32, -0.16, 0.95);
    model.add(tip);
  }

  const tailGeometry = track(
    slab(
      [
        [-1.7, -0.1],
        [0, 0.6],
        [1.7, -0.1],
        [1.7, -0.55],
        [0, -0.75],
        [-1.7, -0.55],
      ],
      0.08,
    ).rotateX(-Math.PI / 2),
  );
  const tail = new THREE.Mesh(tailGeometry, paint);
  tail.position.set(0, 0.05, 3.0);
  model.add(tail);

  // Fin: drawn with +x forward and +y up, rotated so its thickness runs across the plane.
  const finGeometry = track(
    slab(
      [
        [0.6, 0],
        [-0.55, 1.65],
        [-1.15, 1.7],
        [-1.05, 0],
      ],
      0.09,
    ).rotateY(Math.PI / 2),
  );
  const fin = new THREE.Mesh(finGeometry, accent);
  fin.position.set(0, 0.35, 2.75);
  model.add(fin);

  const nozzle = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.3, 0.26, 0.5, 20, 1, true).rotateX(Math.PI / 2)),
    dark,
  );
  nozzle.position.set(0, 0, 3.72);
  model.add(nozzle);

  // Afterburner and navigation lights.
  const glow = track(glowTexture());
  const sprite = (color: THREE.Color, scale: number) => {
    const material = track(
      new THREE.SpriteMaterial({
        map: glow,
        color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    const s = new THREE.Sprite(material);
    s.scale.setScalar(scale);
    return s;
  };
  const exhaust = sprite(new THREE.Color(3, 1.6, 0.7), 1.2);
  exhaust.position.set(0, 0, 3.95);
  model.add(exhaust);
  const flame = new THREE.Mesh(
    track(new THREE.ConeGeometry(0.24, 1, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)),
    track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.2, 1.3, 0.8),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  flame.position.set(0, 0, 3.9);
  model.add(flame);
  const red = sprite(new THREE.Color(4, 0.2, 0.15), 0.9);
  red.position.set(-4.36, -0.1, 0.1);
  const green = sprite(new THREE.Color(0.2, 4, 0.6), 0.9);
  green.position.set(4.36, -0.1, 0.1);
  const strobe = sprite(new THREE.Color(5, 5, 5), 1.4);
  strobe.position.set(0, 2.1, 3.7);
  model.add(red, green, strobe);

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });

  return {
    group,
    tips: [new THREE.Vector3(-4.3, -0.15, 0.9), new THREE.Vector3(4.3, -0.15, 0.9)],
    update(time, boost) {
      const flicker = 0.9 + Math.sin(time * 61) * 0.06 + Math.sin(time * 37) * 0.05;
      exhaust.scale.setScalar((1.1 + boost * 1.4) * flicker);
      flame.scale.set(1 + boost * 0.5, 1 + boost * 0.5, (0.8 + boost * 3.2) * flicker);
      (flame.material as THREE.MeshBasicMaterial).opacity = 0.25 + boost * 0.45;
      strobe.visible = time % 1.2 < 0.06;
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}

/** Camera-facing ribbons trailing from the wingtips; they thicken in hard turns. */
export function createTrails(samples = 56) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(2 * samples * 2 * 3);
  const alphas = new Float32Array(2 * samples * 2);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
  const indices: number[] = [];
  for (let t = 0; t < 2; t++) {
    const base = t * samples * 2;
    for (let i = 0; i < samples - 1; i++) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() { gl_FragColor = vec4(vec3(1.0, 0.97, 0.93) * vAlpha, 1.0); }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const history: THREE.Vector3[][] = [[], []];
  const strengths: number[] = [];
  const side = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const along = new THREE.Vector3();

  return {
    mesh,
    reset() {
      history[0] = [];
      history[1] = [];
      strengths.length = 0;
      alphas.fill(0);
      geometry.attributes.alpha!.needsUpdate = true;
    },
    push(left: THREE.Vector3, right: THREE.Vector3, strength: number) {
      history[0]!.unshift(left.clone());
      history[1]!.unshift(right.clone());
      strengths.unshift(strength);
      for (const h of history) if (h.length > samples) h.pop();
      if (strengths.length > samples) strengths.pop();
    },
    update(camera: THREE.Camera) {
      for (let t = 0; t < 2; t++) {
        const h = history[t]!;
        for (let i = 0; i < samples; i++) {
          const index = (t * samples + i) * 2;
          const p = h[Math.min(i, h.length - 1)];
          if (!p) continue;
          const next = h[Math.min(i + 1, h.length - 1)]!;
          along.subVectors(p, next);
          if (along.lengthSq() < 1e-6) along.set(0, 0, 1);
          toCamera.subVectors(camera.position, p);
          side.crossVectors(along, toCamera).normalize();
          const fade = 1 - i / (samples - 1);
          const width = 0.08 + (1 - fade) * 0.14;
          // Trails that stream past the chase camera would smear across the screen; fade them out up close.
          const near = THREE.MathUtils.smoothstep(toCamera.length(), 6, 30);
          positions.set([p.x + side.x * width, p.y + side.y * width, p.z + side.z * width], index * 3);
          positions.set([p.x - side.x * width, p.y - side.y * width, p.z - side.z * width], index * 3 + 3);
          const alpha = i < h.length ? fade * fade * near * (strengths[i] ?? 0) : 0;
          alphas[index] = alphas[index + 1] = alpha;
        }
      }
      geometry.attributes.position!.needsUpdate = true;
      geometry.attributes.alpha!.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
