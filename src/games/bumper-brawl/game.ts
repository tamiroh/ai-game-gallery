import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { createAudio } from "./audio";
import { ARENA_RADIUS, createScenery } from "./scenery";

type Kind = "player" | "grunt" | "swift" | "heavy";

interface Ball {
  kind: Kind;
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  radius: number;
  mass: number;
  accel: number;
  phase: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  state: "dropping" | "grounded" | "falling";
}

const KINDS: Record<Kind, { radius: number; mass: number; accel: number; top: string; bottom: string; band: string }> =
  {
    player: { radius: 0.9, mass: 1.2, accel: 22, top: "#fffaf0", bottom: "#e9d3bd", band: "#ff7a1a" },
    grunt: { radius: 0.9, mass: 1, accel: 13, top: "#1d3b7a", bottom: "#0a1433", band: "#19c2ff" },
    swift: { radius: 0.65, mass: 0.6, accel: 21, top: "#1f5a3a", bottom: "#082015", band: "#a6ff3a" },
    heavy: { radius: 1.35, mass: 2.6, accel: 9, top: "#4a1f7a", bottom: "#170830", band: "#e25bff" },
  };

const GRAVITY = 32;
const DRAG = 1.5;
const DASH_COOLDOWN = 1.1;
const PARTICLES = 700;
const RINGS = 12;

function ballTextures(top: string, bottom: string, band: string) {
  const draw = (emissive: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    if (emissive) {
      ctx.fillStyle = "#000";
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, top);
      gradient.addColorStop(1, bottom);
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = band;
    ctx.fillRect(0, 108, 512, 40);
    ctx.fillRect(0, 90, 512, 6);
    ctx.fillRect(0, 160, 512, 6);
    ctx.fillRect(0, 0, 512, 22);
    ctx.fillRect(0, 234, 512, 22);
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(i * 64 + 32, 128, 9, 0, Math.PI * 2);
      ctx.fillStyle = emissive ? "#000" : bottom;
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  return { map: draw(false), emissiveMap: draw(true) };
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

class BumperBrawl extends HTMLElement {
  private cleanup = () => {};

  connectedCallback() {
    const canvas = this.querySelector("canvas")!;
    const stage = this.querySelector<HTMLElement>("[data-stage]")!;
    const overlay = this.querySelector<HTMLElement>("[data-overlay]")!;
    const overlayTitle = this.querySelector<HTMLElement>("[data-overlay-title]")!;
    const overlayText = this.querySelector<HTMLElement>("[data-overlay-text]")!;
    const startButton = this.querySelector<HTMLButtonElement>("[data-start]")!;
    const dashButton = this.querySelector<HTMLButtonElement>("[data-dash]")!;
    const muteButton = this.querySelector<HTMLButtonElement>("[data-mute]")!;
    const waveLabel = this.querySelector<HTMLElement>("[data-wave]")!;
    const scoreLabel = this.querySelector<HTMLElement>("[data-score]")!;
    const bestLabel = this.querySelector<HTMLElement>("[data-best]")!;
    const dashMeter = this.querySelector<HTMLElement>("[data-dash-meter]")!;
    const banner = this.querySelector<HTMLElement>("[data-banner]")!;
    const status = this.querySelector<HTMLElement>('[role="status"]')!;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    } catch {
      overlayTitle.textContent = "WebGL unavailable";
      overlayText.textContent = "This game needs a browser with WebGL support.";
      startButton.hidden = true;
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1500);
    const scenery = createScenery(scene, renderer);
    const arena = scenery.arena;

    const composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
    );
    composer.setPixelRatio(pixelRatio);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.6, 1));
    composer.addPass(new OutputPass());

    const sprite = glowTexture();
    const kinds = Object.keys(KINDS) as Kind[];
    const sphere = new THREE.SphereGeometry(1, 48, 32);
    const glowPlane = new THREE.PlaneGeometry(1, 1);
    const ballMaterials = {} as Record<Kind, THREE.MeshPhysicalMaterial>;
    const glowMaterials = {} as Record<Kind, THREE.MeshBasicMaterial>;
    const kindColors = {} as Record<Kind, THREE.Color>;
    for (const kind of kinds) {
      const spec = KINDS[kind];
      const { map, emissiveMap } = ballTextures(spec.top, spec.bottom, spec.band);
      ballMaterials[kind] = new THREE.MeshPhysicalMaterial({
        map,
        emissiveMap,
        emissive: "#ffffff",
        emissiveIntensity: kind === "player" ? 0.9 : 1.9,
        roughness: 0.22,
        metalness: kind === "player" ? 0 : 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
      });
      glowMaterials[kind] = new THREE.MeshBasicMaterial({
        map: sprite,
        color: spec.band,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      kindColors[kind] = new THREE.Color(spec.band);
    }

    const playerLight = new THREE.PointLight("#ff9a4d", 0, 11, 1.6);
    scene.add(playerLight);

    const particlePositions = new Float32Array(PARTICLES * 3).fill(-999);
    const particleColors = new Float32Array(PARTICLES * 3);
    const particleBase = new Float32Array(PARTICLES * 3);
    const particleVelocities = new Float32Array(PARTICLES * 3);
    const particleLife = new Float32Array(PARTICLES);
    const particleSpan = new Float32Array(PARTICLES);
    const particleGravity = new Float32Array(PARTICLES);
    const particleGeometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(particlePositions, 3);
    const colorAttribute = new THREE.BufferAttribute(particleColors, 3);
    particleGeometry.setAttribute("position", positionAttribute);
    particleGeometry.setAttribute("color", colorAttribute);
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        map: sprite,
        size: 0.7,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    particles.frustumCulled = false;
    scene.add(particles);
    let particleCursor = 0;

    const emit = (
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      color: THREE.Color,
      life: number,
      gravity: number,
      brightness = 1,
    ) => {
      const index = particleCursor;
      particleCursor = (particleCursor + 1) % PARTICLES;
      particlePositions[index * 3] = x;
      particlePositions[index * 3 + 1] = y;
      particlePositions[index * 3 + 2] = z;
      particleVelocities[index * 3] = vx;
      particleVelocities[index * 3 + 1] = vy;
      particleVelocities[index * 3 + 2] = vz;
      particleBase[index * 3] = color.r * brightness;
      particleBase[index * 3 + 1] = color.g * brightness;
      particleBase[index * 3 + 2] = color.b * brightness;
      particleLife[index] = life;
      particleSpan[index] = life;
      particleGravity[index] = gravity;
    };

    const burst = (x: number, y: number, z: number, count: number, speed: number, color: THREE.Color) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const magnitude = speed * (0.3 + Math.random() * 0.7);
        emit(
          x,
          y,
          z,
          Math.cos(angle) * magnitude,
          1.5 + Math.random() * speed * 0.7,
          Math.sin(angle) * magnitude,
          color,
          0.45 + Math.random() * 0.5,
          16,
          1.6,
        );
      }
    };

    const ringGeometry = new THREE.RingGeometry(0.82, 1, 64);
    const rings = Array.from({ length: RINGS }, () => {
      const mesh = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, life: 0, span: 1, size: 1 };
    });
    let ringCursor = 0;
    const shockwave = (x: number, z: number, color: THREE.Color, size: number, span = 0.45) => {
      const ring = rings[ringCursor]!;
      ringCursor = (ringCursor + 1) % RINGS;
      ring.mesh.position.set(x, 0.06, z);
      ring.mesh.material.color.copy(color).multiplyScalar(1.8);
      ring.mesh.visible = true;
      ring.life = span;
      ring.span = span;
      ring.size = size;
    };

    const white = new THREE.Color("#ffe6b8");

    const makeBall = (kind: Kind, x: number, z: number, y: number): Ball => {
      const spec = KINDS[kind];
      const mesh = new THREE.Mesh(sphere, ballMaterials[kind]);
      mesh.scale.setScalar(spec.radius);
      mesh.castShadow = true;
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      const glow = new THREE.Mesh(glowPlane, glowMaterials[kind]);
      glow.rotation.x = -Math.PI / 2;
      glow.scale.setScalar(spec.radius * 4.2);
      glow.renderOrder = 1;
      scene.add(mesh, glow);
      return {
        kind,
        mesh,
        glow,
        radius: spec.radius,
        mass: spec.mass,
        accel: spec.accel,
        phase: Math.random() * Math.PI * 2,
        x,
        y,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        state: y > spec.radius ? "dropping" : "grounded",
      };
    };

    const events = new AbortController();
    const { signal } = events;
    const keys = new Set<string>();
    const stick = { id: -1, startX: 0, startY: 0, x: 0, z: 0 };
    const rollAxis = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3(0, 7, 30);
    const cameraLook = new THREE.Vector3(0, 1.5, 0);
    const wantPosition = new THREE.Vector3();
    const wantLook = new THREE.Vector3();
    const audio = createAudio();

    let balls: Ball[] = [];
    let player: Ball | null = null;
    let mode: "idle" | "playing" | "over" = "idle";
    let wave = 0;
    let score = 0;
    let best = 0;
    let arenaRadius = ARENA_RADIUS;
    let targetRadius = ARENA_RADIUS;
    let dashCooldown = 0;
    let dashPower = 0;
    let dashQueued = false;
    let waveDelay = 0;
    let bannerTime = 0;
    let shake = 0;
    let time = 0;
    let previous = 0;
    let frame = 0;
    let trailTimer = 0;

    try {
      best = Number(localStorage.getItem("bumper-brawl-best")) || 0;
    } catch {
      best = 0;
    }
    bestLabel.textContent = String(best);

    const showBanner = (text: string) => {
      banner.textContent = text;
      banner.dataset.visible = "true";
      bannerTime = 1.6;
    };

    const removeBall = (ball: Ball) => {
      scene.remove(ball.mesh, ball.glow);
    };

    const clearBalls = () => {
      for (const ball of balls) removeBall(ball);
      balls = [];
      player = null;
    };

    const spawnDemo = () => {
      const lineup: Kind[] = ["grunt", "swift", "heavy", "grunt", "swift"];
      lineup.forEach((kind, index) => {
        const angle = (index / lineup.length) * Math.PI * 2;
        const ball = makeBall(kind, Math.cos(angle) * 6, Math.sin(angle) * 6, KINDS[kind].radius);
        ball.phase = angle;
        balls.push(ball);
      });
    };

    const spawnWave = () => {
      wave += 1;
      waveLabel.textContent = String(wave);
      targetRadius = Math.max(9, ARENA_RADIUS - 0.4 * (wave - 1));
      const count = Math.min(2 + wave, 12);
      const offset = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        let kind: Kind = "grunt";
        if (wave >= 2 && i % 3 === 1) kind = "swift";
        if (wave >= 3 && i % 4 === 3) kind = "heavy";
        const angle = offset + (i / count) * Math.PI * 2;
        const distance = targetRadius * (0.55 + Math.random() * 0.25);
        balls.push(makeBall(kind, Math.cos(angle) * distance, Math.sin(angle) * distance, 9 + i * 1.2));
      }
      showBanner(`Wave ${wave}`);
      status.textContent = `Wave ${wave}: ${count} rivals incoming.`;
      audio.setWave(wave, true);
      if (wave > 1) audio.chime([72, 76, 79, 84]);
    };

    const start = () => {
      audio.start();
      clearBalls();
      player = makeBall("player", 0, 0, KINDS.player.radius);
      balls.push(player);
      wave = 0;
      score = 0;
      scoreLabel.textContent = "0";
      arenaRadius = ARENA_RADIUS;
      targetRadius = ARENA_RADIUS;
      dashCooldown = 0;
      dashPower = 0;
      dashQueued = false;
      waveDelay = 0;
      mode = "playing";
      overlay.hidden = true;
      spawnWave();
      canvas.focus({ preventScroll: true });
    };

    const finish = () => {
      mode = "over";
      audio.setWave(wave, false);
      audio.chime([67, 64, 60, 55]);
      if (score > best) {
        best = score;
        bestLabel.textContent = String(best);
        try {
          localStorage.setItem("bumper-brawl-best", String(best));
        } catch {
          void 0;
        }
      }
      overlayTitle.textContent = "Knocked out!";
      overlayText.textContent = `You reached wave ${wave} and bumped ${score} rival${score === 1 ? "" : "s"} off the arena.`;
      startButton.textContent = "Play again";
      overlay.hidden = false;
      status.textContent = `Game over. ${score} knockouts.`;
      startButton.focus({ preventScroll: true });
    };

    const inputDirection = () => {
      let x =
        (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
      let z = (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0);
      if (stick.id !== -1) {
        x += stick.x;
        z += stick.z;
      }
      const length = Math.hypot(x, z);
      if (length > 1) {
        x /= length;
        z /= length;
      }
      return { x, z };
    };

    const step = (dt: number) => {
      time += dt;
      arenaRadius += (targetRadius - arenaRadius) * Math.min(1, dt * 2);
      const scale = arenaRadius / ARENA_RADIUS;
      arena.scale.set(scale, 1, scale);
      dashCooldown = Math.max(0, dashCooldown - dt);
      dashPower = Math.max(0, dashPower - dt);
      trailTimer -= dt;
      const trail = trailTimer <= 0;
      if (trail) trailTimer = 0.025;

      const hero = player;
      if (mode === "playing" && hero && hero.state === "grounded") {
        const input = inputDirection();
        hero.vx += input.x * hero.accel * dt;
        hero.vz += input.z * hero.accel * dt;
        if (dashQueued && dashCooldown === 0) {
          let dx = input.x;
          let dz = input.z;
          if (Math.hypot(dx, dz) < 0.1) {
            dx = hero.vx;
            dz = hero.vz;
          }
          const length = Math.hypot(dx, dz);
          if (length > 0.05) {
            hero.vx += (dx / length) * 13;
            hero.vz += (dz / length) * 13;
            dashCooldown = DASH_COOLDOWN;
            dashPower = 0.35;
            burst(hero.x, 0.3, hero.z, 16, 5, kindColors.player);
            shockwave(hero.x, hero.z, kindColors.player, 3.2, 0.35);
            audio.thump(6, 520);
          }
        }
      }
      dashQueued = false;

      for (const ball of balls) {
        if (ball.kind !== "player" && ball.state === "grounded") {
          let tx = 0;
          let tz = 0;
          if (mode === "playing" && hero && hero.state !== "falling") {
            tx = hero.x + hero.vx * 0.25 - ball.x;
            tz = hero.z + hero.vz * 0.25 - ball.z;
          } else {
            const angle = time * 0.7 + ball.phase;
            tx = Math.cos(angle) * 5.5 - ball.x;
            tz = Math.sin(angle) * 5.5 - ball.z;
          }
          const length = Math.hypot(tx, tz) || 1;
          let ax = tx / length;
          let az = tz / length;
          const fromCenter = Math.hypot(ball.x, ball.z);
          const margin = ball.kind === "heavy" ? 1.2 : 2.6;
          if (fromCenter > arenaRadius - margin) {
            ax -= (ball.x / fromCenter) * 1.3;
            az -= (ball.z / fromCenter) * 1.3;
          }
          const boost = 1 + Math.min(wave, 10) * 0.035;
          ball.vx += ax * ball.accel * boost * dt;
          ball.vz += az * ball.accel * boost * dt;
        }

        if (ball.state === "grounded") {
          const damping = Math.exp(-DRAG * dt);
          ball.vx *= damping;
          ball.vz *= damping;
        } else {
          ball.vy -= GRAVITY * dt;
          ball.y += ball.vy * dt;
          if (ball.state === "dropping" && ball.y <= ball.radius) {
            ball.y = ball.radius;
            ball.vy = 0;
            ball.state = "grounded";
            burst(ball.x, 0.2, ball.z, 12, 4, kindColors[ball.kind]);
            shockwave(ball.x, ball.z, kindColors[ball.kind], ball.radius * 3.4);
            audio.thump(3, 150);
          }
        }
        ball.x += ball.vx * dt;
        ball.z += ball.vz * dt;

        if (ball.state === "grounded" && Math.hypot(ball.x, ball.z) > arenaRadius + ball.radius * 0.25) {
          ball.state = "falling";
          burst(ball.x, 0.4, ball.z, 26, 7, kindColors[ball.kind]);
          shockwave(ball.x, ball.z, kindColors[ball.kind], 5, 0.6);
          scenery.flashRim(ball.kind === "player" ? 1 : 0.7);
          if (ball.kind === "player") {
            status.textContent = "You fell off the arena.";
            audio.thump(10, 220);
          } else if (mode === "playing") {
            score += 1;
            scoreLabel.textContent = String(score);
            audio.thump(8, 660);
            audio.chime([84, 91]);
          }
        }

        if (trail) {
          const color = kindColors[ball.kind];
          if (ball.state === "falling" && ball.y > -24) {
            emit(ball.x, ball.y, ball.z, 0, 2, 0, color, 0.7, 0, 1.3);
          } else if (ball.kind === "player" && ball.state === "grounded") {
            const speed = Math.hypot(ball.vx, ball.vz);
            if (dashPower > 0 || speed > 7) {
              emit(
                ball.x + (Math.random() - 0.5) * 0.5,
                0.25 + Math.random() * 0.7,
                ball.z + (Math.random() - 0.5) * 0.5,
                -ball.vx * 0.1,
                0.6,
                -ball.vz * 0.1,
                color,
                dashPower > 0 ? 0.55 : 0.3,
                0,
                dashPower > 0 ? 1.8 : 0.7,
              );
            }
          }
        }
      }

      for (let i = 0; i < balls.length; i++) {
        const a = balls[i]!;
        if (a.state !== "grounded") continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j]!;
          if (b.state !== "grounded") continue;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const distance = Math.hypot(dx, dz);
          const reach = a.radius + b.radius;
          if (distance >= reach || distance === 0) continue;
          const nx = dx / distance;
          const nz = dz / distance;
          const massA = a.mass * (a.kind === "player" && dashPower > 0 ? 3 : 1);
          const massB = b.mass * (b.kind === "player" && dashPower > 0 ? 3 : 1);
          const total = massA + massB;
          const overlap = reach - distance;
          a.x -= nx * overlap * (massB / total);
          a.z -= nz * overlap * (massB / total);
          b.x += nx * overlap * (massA / total);
          b.z += nz * overlap * (massA / total);
          const relative = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (relative >= 0) continue;
          const impulse = (-1.95 * relative) / (1 / massA + 1 / massB);
          a.vx -= (impulse / massA) * nx;
          a.vz -= (impulse / massA) * nz;
          b.vx += (impulse / massB) * nx;
          b.vz += (impulse / massB) * nz;
          const force = -relative;
          if (force > 3) {
            const hitX = a.x + nx * a.radius;
            const hitZ = a.z + nz * a.radius;
            burst(hitX, 0.8, hitZ, Math.min(22, Math.round(force * 1.4)), force * 0.5, white);
            if (force > 7) shockwave(hitX, hitZ, white, Math.min(4.5, force * 0.3));
            if (mode !== "idle") audio.thump(force, 240 + Math.random() * 80);
            if (a.kind === "player" || b.kind === "player") shake = Math.min(0.7, shake + force * 0.03);
          }
        }
      }

      balls = balls.filter((ball) => {
        if (ball.state === "falling" && ball.y < -30 && ball.kind !== "player") {
          removeBall(ball);
          return false;
        }
        return true;
      });

      for (const ball of balls) {
        ball.mesh.position.set(ball.x, ball.y, ball.z);
        ball.glow.position.set(ball.x, 0.04, ball.z);
        ball.glow.visible = ball.state === "grounded";
        const speed = Math.hypot(ball.vx, ball.vz);
        if (speed > 0.01) {
          rollAxis.set(ball.vz / speed, 0, -ball.vx / speed);
          ball.mesh.rotateOnWorldAxis(rollAxis, (speed * dt) / ball.radius);
        }
      }

      if (hero) {
        playerLight.position.set(hero.x, hero.y + 1.4, hero.z);
        playerLight.intensity = hero.state === "falling" ? 0 : 5 + (dashPower > 0 ? 16 : 0);
      } else {
        playerLight.intensity = 0;
      }

      if (mode === "playing") {
        if (hero && hero.state === "falling" && hero.y < -10) {
          finish();
        } else if (hero && hero.state !== "falling" && !balls.some((ball) => ball.kind !== "player")) {
          if (waveDelay === 0) {
            waveDelay = 1.2;
            showBanner("Arena cleared!");
          } else {
            waveDelay = Math.max(0, waveDelay - dt);
            if (waveDelay === 0) spawnWave();
          }
        }
      }

      for (let i = 0; i < PARTICLES; i++) {
        if (particleLife[i]! <= 0) continue;
        particleLife[i]! -= dt;
        if (particleLife[i]! <= 0) {
          particlePositions[i * 3 + 1] = -999;
          continue;
        }
        const fade = particleLife[i]! / particleSpan[i]!;
        particleVelocities[i * 3 + 1]! -= particleGravity[i]! * dt;
        for (let axis = 0; axis < 3; axis++) {
          particlePositions[i * 3 + axis]! += particleVelocities[i * 3 + axis]! * dt;
          particleColors[i * 3 + axis] = particleBase[i * 3 + axis]! * fade;
        }
      }
      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;

      for (const ring of rings) {
        if (ring.life <= 0) continue;
        ring.life -= dt;
        if (ring.life <= 0) {
          ring.mesh.visible = false;
          continue;
        }
        const progress = 1 - ring.life / ring.span;
        ring.mesh.scale.setScalar(0.4 + (1 - (1 - progress) ** 3) * ring.size);
        ring.mesh.material.opacity = (1 - progress) * 0.9;
      }

      if (bannerTime > 0) {
        bannerTime -= dt;
        if (bannerTime <= 0) banner.dataset.visible = "false";
      }
      dashMeter.style.transform = `scaleX(${1 - dashCooldown / DASH_COOLDOWN})`;
      scenery.update(time, dt);
    };

    const render = (dt: number) => {
      const portrait = camera.aspect < 1 ? 1.55 : 1;
      if (mode === "idle") {
        const angle = time * 0.13 + 0.5;
        wantPosition.set(Math.sin(angle) * 27 * portrait, 6.5 * portrait, Math.cos(angle) * 27 * portrait);
        wantLook.set(0, 1.5, 0);
      } else {
        const follow = player && player.state !== "falling" ? 0.15 : 0;
        const focusX = (player?.x ?? 0) * follow;
        const focusZ = (player?.z ?? 0) * follow;
        wantPosition.set(focusX, 18.5 * portrait, focusZ + 23 * portrait);
        wantLook.set(focusX, 0, focusZ - 1.5);
      }
      const ease = 1 - Math.exp(-dt * 3.2);
      cameraPosition.lerp(wantPosition, ease);
      cameraLook.lerp(wantLook, ease);
      shake = Math.max(0, shake - dt * 2);
      camera.position.set(
        cameraPosition.x + (Math.random() - 0.5) * shake,
        cameraPosition.y + (Math.random() - 0.5) * shake,
        cameraPosition.z,
      );
      camera.lookAt(cameraLook);
      composer.render();
    };

    const tick = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      previous = now;
      if (!document.hidden && dt > 0) step(dt);
      render(dt);
      frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const toggleMute = () => {
      const muted = audio.toggleMute();
      muteButton.setAttribute("aria-pressed", String(muted));
      muteButton.textContent = muted ? "Sound off" : "Sound on";
    };

    const GAME_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.target instanceof HTMLButtonElement && (event.code === "Space" || event.code === "Enter")) return;
        if (mode === "playing" && GAME_KEYS.has(event.code)) event.preventDefault();
        if (event.repeat) return;
        keys.add(event.code);
        if (event.code === "Space" && mode === "playing") dashQueued = true;
        if (event.code === "KeyM") toggleMute();
        if ((event.code === "Enter" || event.code === "KeyR") && mode !== "playing") start();
        else if (event.code === "KeyR") start();
      },
      { signal },
    );
    window.addEventListener("keyup", (event) => keys.delete(event.code), { signal });
    window.addEventListener("blur", () => keys.clear(), { signal });

    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (mode !== "playing" || stick.id !== -1) return;
        stick.id = event.pointerId;
        stick.startX = event.clientX;
        stick.startY = event.clientY;
        stick.x = 0;
        stick.z = 0;
        canvas.setPointerCapture(event.pointerId);
      },
      { signal },
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== stick.id) return;
        const dx = (event.clientX - stick.startX) / 50;
        const dz = (event.clientY - stick.startY) / 50;
        const length = Math.hypot(dx, dz);
        stick.x = length > 1 ? dx / length : dx;
        stick.z = length > 1 ? dz / length : dz;
      },
      { signal },
    );
    const release = (event: PointerEvent) => {
      if (event.pointerId === stick.id) stick.id = -1;
    };
    canvas.addEventListener("pointerup", release, { signal });
    canvas.addEventListener("pointercancel", release, { signal });

    startButton.addEventListener("click", start, { signal });
    muteButton.addEventListener("click", toggleMute, { signal });
    dashButton.addEventListener(
      "pointerdown",
      (event) => {
        event.preventDefault();
        if (mode === "playing") dashQueued = true;
      },
      { signal },
    );

    spawnDemo();
    frame = requestAnimationFrame(tick);

    this.cleanup = () => {
      cancelAnimationFrame(frame);
      events.abort();
      observer.disconnect();
      clearBalls();
      audio.dispose();
      sphere.dispose();
      glowPlane.dispose();
      sprite.dispose();
      for (const kind of kinds) {
        ballMaterials[kind].map?.dispose();
        ballMaterials[kind].emissiveMap?.dispose();
        ballMaterials[kind].dispose();
        glowMaterials[kind].dispose();
      }
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const material = object.material as THREE.Material | THREE.Material[];
          for (const entry of Array.isArray(material) ? material : [material]) entry.dispose();
        }
      });
      scenery.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }

  disconnectedCallback() {
    this.cleanup();
    this.cleanup = () => {};
  }
}

if (!customElements.get("bumper-brawl")) customElements.define("bumper-brawl", BumperBrawl);
