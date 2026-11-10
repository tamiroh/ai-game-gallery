import * as THREE from "three";

export const ARENA_RADIUS = 13;
const SUN = new THREE.Vector3(-0.45, 0.2, -0.87).normalize();
const CLOUD_LEVEL = -26;

const HORIZON_GLSL = /* glsl */ `
  uniform vec3 uSun;
  vec3 horizonColor(vec2 direction) {
    float toward = max(dot(normalize(direction + 1e-5), normalize(uSun.xz)), 0.0);
    return mix(vec3(0.3, 0.12, 0.36), vec3(0.98, 0.42, 0.2), pow(toward, 2.2));
  }
`;

const NOISE_GLSL = /* glsl */ `
  float hash2(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
      mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amplitude * valueNoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      amplitude *= 0.5;
    }
    return sum;
  }
`;

function createSky(uniforms: Record<string, THREE.IUniform>) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(600, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vDirection;
        ${HORIZON_GLSL}
        float hash3(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        void main() {
          vec3 d = normalize(vDirection);
          float h = d.y;
          vec3 horizon = horizonColor(d.xz);
          vec3 color = mix(horizon, vec3(0.5, 0.15, 0.4), smoothstep(0.0, 0.14, h));
          color = mix(color, vec3(0.13, 0.06, 0.3), smoothstep(0.08, 0.36, h));
          color = mix(color, vec3(0.012, 0.018, 0.085), smoothstep(0.3, 0.9, h));
          float sun = max(dot(d, uSun), 0.0);
          color += vec3(1.6, 0.85, 0.45) * pow(sun, 1200.0) * 8.0;
          color += vec3(1.0, 0.45, 0.22) * pow(sun, 28.0) * 0.6;
          color += vec3(0.8, 0.25, 0.35) * pow(sun, 4.0) * 0.16;
          vec3 cell = d * 190.0;
          float seed = hash3(floor(cell));
          float star = step(0.9962, seed) * smoothstep(0.42, 0.0, length(fract(cell) - 0.5));
          star *= smoothstep(0.1, 0.5, h) * (0.65 + 0.35 * sin(uTime * 2.0 + seed * 400.0));
          color += vec3(0.85, 0.92, 1.25) * star * 2.2;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
}

function createClouds(uniforms: Record<string, THREE.IUniform>) {
  const clouds = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.ShaderMaterial({
      uniforms,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorld;
        ${HORIZON_GLSL}
        ${NOISE_GLSL}
        void main() {
          vec2 p = vWorld.xz * 0.021;
          vec2 drift = vec2(uTime * 0.014, uTime * 0.006);
          vec2 warp = vec2(fbm(p + drift), fbm(p + vec2(5.2, 1.3) - drift)) * 1.7;
          float n = fbm(p + warp + drift);
          float ahead = fbm(p + normalize(uSun.xz) * 0.1 + warp + drift);
          float lit = clamp((n - ahead) * 7.0 + 0.45, 0.0, 1.0);
          vec3 color = mix(vec3(0.035, 0.02, 0.13), vec3(0.22, 0.09, 0.32), smoothstep(0.25, 0.62, n));
          color = mix(color, vec3(0.8, 0.34, 0.3), lit * smoothstep(0.36, 0.78, n));
          float distance = length(vWorld.xz);
          color += vec3(0.08, 0.42, 0.62) * exp(-distance * distance / 300.0);
          color = mix(color, horizonColor(vWorld.xz), smoothstep(80.0, 380.0, distance));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = CLOUD_LEVEL;
  return clouds;
}

function roughen(geometry: THREE.BufferGeometry, amount: number) {
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const seed = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const offset = (seed - Math.floor(seed) - 0.5) * amount;
    position.setXYZ(i, x * (1 + offset), y + offset * 0.6, z * (1 + offset));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function arenaTextures() {
  const size = 1024;
  const half = size / 2;
  const make = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return canvas;
  };
  const base = make();
  const glow = make();
  const ctx = base.getContext("2d")!;
  const emissive = glow.getContext("2d")!;

  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "#3a4a8c");
  gradient.addColorStop(0.6, "#262f63");
  gradient.addColorStop(1, "#141938");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const rings = [0.25, 0.5, 0.77, 1];
  const segments = [0, 8, 16, 28];
  ctx.strokeStyle = "rgba(8,10,30,0.55)";
  ctx.lineWidth = 4;
  for (let ring = 1; ring < rings.length; ring++) {
    const count = segments[ring]!;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + ring * 0.2;
      ctx.beginPath();
      ctx.moveTo(half + Math.cos(angle) * rings[ring - 1]! * half, half + Math.sin(angle) * rings[ring - 1]! * half);
      ctx.lineTo(half + Math.cos(angle) * rings[ring]! * half, half + Math.sin(angle) * rings[ring]! * half);
      ctx.stroke();
    }
  }

  emissive.fillStyle = "#000";
  emissive.fillRect(0, 0, size, size);
  const stroke = (radius: number, width: number, color: string, dash: number[] = []) => {
    for (const target of [ctx, emissive]) {
      target.strokeStyle = color;
      target.lineWidth = width;
      target.setLineDash(dash);
      target.beginPath();
      target.arc(half, half, radius * half, 0, Math.PI * 2);
      target.stroke();
    }
  };
  stroke(0.25, 6, "#55e6ff");
  stroke(0.5, 4, "#3fb4ff");
  stroke(0.77, 4, "#3fb4ff");
  stroke(0.9, 16, "#ff7a2e", [30, 26]);
  for (const target of [ctx, emissive]) {
    target.setLineDash([]);
    target.fillStyle = "#55e6ff";
    target.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const radius = (i % 2 === 0 ? 0.13 : 0.055) * half;
      target.lineTo(half + Math.cos(angle) * radius, half + Math.sin(angle) * radius);
    }
    target.closePath();
    target.fill();
  }

  const map = new THREE.CanvasTexture(base);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(glow);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.anisotropy = 8;
  return { map, emissiveMap };
}

function createArena(textures: THREE.Texture[]) {
  const arena = new THREE.Group();
  const { map, emissiveMap } = arenaTextures();
  textures.push(map, emissiveMap);

  const deckMaterial = new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: "#ffffff",
    emissiveIntensity: 1.5,
    roughness: 0.36,
    metalness: 0.55,
  });
  const deck = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS, 96), deckMaterial);
  deck.rotation.x = -Math.PI / 2;
  deck.receiveShadow = true;
  arena.add(deck);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS * 0.93, 1.3, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: "#1c2147", roughness: 0.3, metalness: 0.85 }),
  );
  wall.position.y = -0.65;
  arena.add(wall);

  const rimMaterial = new THREE.MeshStandardMaterial({
    color: "#2a1c08",
    emissive: "#ffb347",
    emissiveIntensity: 2.2,
    roughness: 0.4,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS, 0.2, 12, 160), rimMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.02;
  arena.add(rim);

  const lowerRim = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_RADIUS * 0.93, 0.1, 8, 120),
    new THREE.MeshStandardMaterial({ color: "#06202c", emissive: "#3fd8ff", emissiveIntensity: 2 }),
  );
  lowerRim.rotation.x = Math.PI / 2;
  lowerRim.position.y = -1.3;
  arena.add(lowerRim);

  const rock = new THREE.Mesh(
    roughen(new THREE.CylinderGeometry(ARENA_RADIUS * 0.9, 0.9, 9, 11, 5), 0.16),
    new THREE.MeshStandardMaterial({ color: "#3b2d63", roughness: 0.95, flatShading: true }),
  );
  rock.position.y = -5.8;
  arena.add(rock);

  const crystalMaterial = new THREE.MeshStandardMaterial({
    color: "#0a3140",
    emissive: "#4de1ff",
    emissiveIntensity: 1.7,
    flatShading: true,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.5), crystalMaterial);
  crystal.scale.y = 2.1;
  crystal.position.y = -11.6;
  arena.add(crystal);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 5.5, 13, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: "#46cfff",
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    }),
  );
  beam.position.y = -19.5;
  arena.add(beam);

  return { arena, rimMaterial, crystal, deckMaterial };
}

function createIslands() {
  const group = new THREE.Group();
  const rockMaterial = new THREE.MeshStandardMaterial({ color: "#46346f", roughness: 0.95, flatShading: true });
  const turfMaterial = new THREE.MeshStandardMaterial({ color: "#3c8f86", roughness: 0.9, flatShading: true });
  const shardMaterials = ["#ff6fb1", "#4de1ff", "#ffb347"].map(
    (color) =>
      new THREE.MeshStandardMaterial({ color: "#150a20", emissive: color, emissiveIntensity: 2.2, flatShading: true }),
  );
  const islands: { object: THREE.Group; height: number; phase: number; spin: number }[] = [];
  const count = 11;
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * (1.08 + (i / (count - 1)) * 0.84) + (((i * 7919) % 13) / 13 - 0.5) * 0.12;
    const distance = 36 + ((i * 37) % 5) * 7;
    const size = 2 + ((i * 53) % 4) * 0.9;
    const island = new THREE.Group();
    const turf = new THREE.Mesh(roughen(new THREE.CylinderGeometry(size, size * 0.85, 0.7, 8, 1), 0.12), turfMaterial);
    const base = new THREE.Mesh(
      roughen(new THREE.CylinderGeometry(size * 0.85, 0.2, size * 2.1, 8, 3), 0.2),
      rockMaterial,
    );
    base.position.y = -0.35 - size * 1.05;
    island.add(turf, base);
    const shards = 1 + (i % 3);
    for (let j = 0; j < shards; j++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.45 + j * 0.12), shardMaterials[(i + j) % 3]);
      shard.scale.y = 2.4;
      shard.position.set((j - (shards - 1) / 2) * size * 0.5, 1.2 + j * 0.25, ((j * 31) % 3) * 0.4 - 0.4);
      shard.rotation.z = (j - 1) * 0.25;
      island.add(shard);
    }
    const height = -9 + ((i * 29) % 7) * 2.6;
    island.position.set(Math.cos(angle) * distance, height, Math.sin(angle) * distance);
    island.rotation.y = i * 1.7;
    group.add(island);
    islands.push({ object: island, height, phase: i * 1.3, spin: 0.04 + (i % 3) * 0.02 });
  }
  return { group, islands };
}

function createPlanet() {
  const planet = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(46, 48, 32),
    new THREE.MeshStandardMaterial({ color: "#8f6fd0", roughness: 1, fog: false, envMapIntensity: 0.2 }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(62, 92, 96),
    new THREE.MeshBasicMaterial({
      color: "#ff9db0",
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    }),
  );
  ring.rotation.x = Math.PI / 2 - 0.35;
  ring.rotation.y = 0.3;
  planet.add(body, ring);
  planet.position.set(210, 150, -330);
  return planet;
}

export function createScenery(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const textures: THREE.Texture[] = [];
  const uniforms = { uTime: { value: 0 }, uSun: { value: SUN } };
  const sky = createSky(uniforms);
  const clouds = createClouds(uniforms);

  const backdrop = new THREE.Scene();
  backdrop.add(sky, clouds);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(backdrop, 0, 0.1, 2000);
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;
  scene.fog = new THREE.FogExp2("#4a2456", 0.0038);
  scene.add(sky, clouds);

  scene.add(new THREE.HemisphereLight("#8d7bff", "#ff8f6b", 0.55));
  const sun = new THREE.DirectionalLight("#ffd2a1", 3.1);
  sun.position.set(-17, 27, -13);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -17;
  sun.shadow.camera.right = 17;
  sun.shadow.camera.top = 17;
  sun.shadow.camera.bottom = -17;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#6f8cff", 0.7);
  fill.position.set(12, 10, 18);
  scene.add(fill);

  const { arena, rimMaterial, crystal, deckMaterial } = createArena(textures);
  scene.add(arena);
  const { group, islands } = createIslands();
  scene.add(group);
  scene.add(createPlanet());

  let flash = 0;
  const rimBase = new THREE.Color("#ffb347");
  const rimHot = new THREE.Color("#fff3d0");

  return {
    arena,
    flashRim(amount: number) {
      flash = Math.min(1, flash + amount);
    },
    update(time: number, dt: number) {
      uniforms.uTime.value = time;
      flash = Math.max(0, flash - dt * 2.2);
      rimMaterial.emissive.copy(rimBase).lerp(rimHot, flash);
      rimMaterial.emissiveIntensity = 2 + Math.sin(time * 3) * 0.35 + flash * 5;
      deckMaterial.emissiveIntensity = 1.35 + Math.sin(time * 1.7) * 0.25 + flash * 1.2;
      crystal.rotation.y = time * 0.8;
      for (const island of islands) {
        island.object.position.y = island.height + Math.sin(time * 0.45 + island.phase) * 0.8;
        island.object.rotation.y += island.spin * dt;
      }
    },
    dispose() {
      environment.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
