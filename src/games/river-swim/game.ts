import * as THREE from "three";
import { createWorld, GOAL, HALF_WIDTH, type Model, type World } from "./world";

type Rock = { x: number; z: number; r: number; mesh: THREE.Mesh };
type Log = { x: number; z: number; yaw: number; speed: number; phase: number; mesh: THREE.Mesh };
type State = "loading" | "ready" | "running" | "won" | "lost";

const SWIMMER_RADIUS = 0.35;
const SWIM_SPEED = 5;
const STRAFE_SPEED = 2.6;
const EYE_HEIGHT = 0.3;
const MAX_HEARTS = 3;
const LOG_HALF_LENGTH = 1.9;
const LOG_RADIUS = 0.42;
const FOAM_COUNT = 700;
const SPLASH_COUNT = 240;
const BEST_KEY = "river-swim-best";
const KEY_DIRECTIONS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  w: [0, 1],
  ArrowDown: [0, -1],
  s: [0, -1],
  ArrowLeft: [-1, 0],
  a: [-1, 0],
  ArrowRight: [1, 0],
  d: [1, 0],
};

const clamp = THREE.MathUtils.clamp;
const progressOf = (z: number) => clamp(-z / GOAL, 0, 1);

// Downstream speed (toward +z): fastest mid-river, and it picks up further upstream.
const currentAt = (x: number, z: number) => {
  const t = clamp(x / HALF_WIDTH, -1, 1);
  return (1.2 + 2.6 * (1 - t * t)) * (1 + 0.3 * progressOf(z));
};

function readBest() {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeBest(value: number) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage may be unavailable; the best time just won't persist.
  }
}

function dropletTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function createAudio() {
  const context = new AudioContext();
  const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < samples.length; i++) {
    last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
    samples[i] = last * 3.5;
  }
  const master = context.createGain();
  master.connect(context.destination);
  const river = context.createBufferSource();
  river.buffer = noise;
  river.loop = true;
  const riverFilter = context.createBiquadFilter();
  riverFilter.type = "lowpass";
  riverFilter.frequency.value = 900;
  const riverGain = context.createGain();
  riverGain.gain.value = 0.35;
  river.connect(riverFilter).connect(riverGain).connect(master);
  river.start();
  return {
    context,
    setMuted(muted: boolean) {
      master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.1);
    },
    splash(strength: number) {
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1400 + Math.random() * 900;
      filter.Q.value = 0.8;
      const gain = context.createGain();
      const now = context.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1.6 * strength, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      source.connect(filter).connect(gain).connect(master);
      source.start(now, Math.random());
      source.stop(now + 0.4);
    },
  };
}

class RiverSwim extends HTMLElement {
  connectedCallback() {
    const canvas = this.querySelector("canvas")!;
    const panel = this.querySelector<HTMLElement>("[data-panel]")!;
    const panelTitle = this.querySelector("[data-panel-title]")!;
    const panelText = this.querySelector("[data-panel-text]")!;
    const heartsLabel = this.querySelector("[data-hearts]")!;
    const distanceLabel = this.querySelector("[data-distance]")!;
    const progressBar = this.querySelector<HTMLElement>("[data-progress]")!;
    const timeLabel = this.querySelector("[data-time]")!;
    const bestLabel = this.querySelector("[data-best]")!;
    const status = this.querySelector('[role="status"]')!;
    const startButton = this.querySelector<HTMLButtonElement>("[data-start]")!;
    const soundButton = this.querySelector<HTMLButtonElement>("[data-sound]")!;
    const events = new AbortController();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch {
      panelTitle.textContent = "WebGL unavailable";
      panelText.textContent = "This game needs WebGL, which is not available in this browser.";
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 7000);

    const keys = new Set<string>();
    let world: World | null = null;
    let rocks: Rock[] = [];
    let logs: Log[] = [];
    let x = 0;
    let z = 0;
    let knockX = 0;
    let knockZ = 0;
    let hearts = MAX_HEARTS;
    let invulnerable = 0;
    let shake = 0;
    let elapsed = 0;
    let clock = 0;
    let stroke = 0;
    let steerView = 0;
    let logTimer = 0;
    let touch: { id: number; startX: number; steer: number } | null = null;
    let state: State = "loading";
    let best = readBest();
    let muted = false;
    let audio: ReturnType<typeof createAudio> | null = null;
    let previous = 0;
    let frame = 0;
    let disposed = false;

    const droplet = dropletTexture();
    const foamPositions = new Float32Array(FOAM_COUNT * 3);
    const foamGeometry = new THREE.BufferGeometry();
    foamGeometry.setAttribute("position", new THREE.BufferAttribute(foamPositions, 3));
    const foam = new THREE.Points(
      foamGeometry,
      new THREE.PointsMaterial({
        map: droplet,
        size: 0.05,
        color: "#eef6f4",
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    foam.frustumCulled = false;
    const splashPositions = new Float32Array(SPLASH_COUNT * 3).fill(-50);
    const splashVelocities = new Float32Array(SPLASH_COUNT * 3);
    const splashGeometry = new THREE.BufferGeometry();
    splashGeometry.setAttribute("position", new THREE.BufferAttribute(splashPositions, 3));
    const splashes = new THREE.Points(
      splashGeometry,
      new THREE.PointsMaterial({
        map: droplet,
        size: 0.02,
        color: "#ffffff",
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    splashes.frustumCulled = false;
    let splashCursor = 0;

    const placeFoam = (i: number, fromZ: number, spread: number) => {
      foamPositions[i * 3] = (Math.random() * 2 - 1) * (HALF_WIDTH - 0.3);
      foamPositions[i * 3 + 1] = 0.015;
      foamPositions[i * 3 + 2] = fromZ - Math.random() * spread;
    };
    for (let i = 0; i < FOAM_COUNT; i++) placeFoam(i, 6, 90);

    const splash = (side: number) => {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const originX = x + forward.x * 0.75 + right.x * side * 0.32;
      const originZ = z + forward.z * 0.75 + right.z * side * 0.32;
      for (let n = 0; n < 26; n++) {
        const i = splashCursor;
        splashCursor = (splashCursor + 1) % SPLASH_COUNT;
        splashPositions[i * 3] = originX + (Math.random() - 0.5) * 0.25;
        splashPositions[i * 3 + 1] = 0.02;
        splashPositions[i * 3 + 2] = originZ + (Math.random() - 0.5) * 0.25;
        splashVelocities[i * 3] = (Math.random() - 0.5) * 1.2 + right.x * side * 0.4;
        splashVelocities[i * 3 + 1] = 0.8 + Math.random() * 1.6;
        splashVelocities[i * 3 + 2] = (Math.random() - 0.5) * 1.2 + 0.6;
      }
      audio?.splash(0.5 + Math.random() * 0.3);
    };

    const placeRocks = (current: World) => {
      for (const rock of rocks) current.scene.remove(rock.mesh);
      rocks = [];
      for (let rz = -10; rz > -GOAL + 5; rz -= 6 + Math.random() * 6) {
        const count = rz < -GOAL / 2 && Math.random() < 0.55 ? 2 : 1;
        for (let n = 0; n < count; n++) {
          const model = current.rocks[Math.floor(Math.random() * current.rocks.length)]!;
          const scale = 0.6 + Math.random() * 0.6;
          const r = model.radius * scale * 0.85;
          const rx = (Math.random() * 2 - 1) * (HALF_WIDTH - 0.6);
          const pz = rz - Math.random() * 3;
          if (rocks.some((rock) => Math.hypot(rock.x - rx, rock.z - pz) < rock.r + r + 1.6)) continue;
          const mesh = new THREE.Mesh(model.geometry, model.material);
          mesh.scale.setScalar(scale);
          mesh.rotation.y = Math.random() * Math.PI * 2;
          mesh.position.set(rx, 0.05 - Math.random() * 0.2, pz);
          mesh.castShadow = mesh.receiveShadow = true;
          current.scene.add(mesh);
          rocks.push({ x: rx, z: pz, r, mesh });
        }
      }
    };

    const spawnLog = (current: World, trunk: Model) => {
      const lx = (Math.random() * 2 - 1) * (HALF_WIDTH - 2.2);
      const lz = z - 75 - Math.random() * 10;
      const mesh = new THREE.Mesh(trunk.geometry, trunk.material);
      mesh.castShadow = mesh.receiveShadow = true;
      current.scene.add(mesh);
      logs.push({
        x: lx,
        z: lz,
        yaw: (Math.random() - 0.5) * 0.7,
        speed: currentAt(lx, lz) * 1.15 + 0.4,
        phase: Math.random() * 10,
        mesh,
      });
    };

    const showBest = () => {
      bestLabel.textContent = best ? `${best.toFixed(1)} s` : "—";
    };
    const updateHud = () => {
      heartsLabel.textContent = "♥".repeat(hearts) + "♡".repeat(MAX_HEARTS - hearts);
      distanceLabel.textContent = String(Math.floor(progressOf(z) * GOAL));
      progressBar.style.width = `${progressOf(z) * 100}%`;
      timeLabel.textContent = elapsed.toFixed(1);
    };
    const showPanel = (title: string, text: string, label: string) => {
      panelTitle.textContent = title;
      panelText.textContent = text;
      startButton.textContent = label;
      panel.hidden = false;
      startButton.focus({ preventScroll: true });
    };

    const end = (result: "won" | "lost", title: string, text: string) => {
      state = result;
      keys.clear();
      touch = null;
      status.textContent = `${title} ${text}`;
      showPanel(title, text, result === "won" ? "Swim again" : "Try again");
    };

    const hit = (fromX: number, fromZ: number) => {
      if (invulnerable > 0) return;
      hearts--;
      invulnerable = 1.5;
      shake = 0.45;
      this.classList.remove("hurt");
      void this.offsetWidth;
      this.classList.add("hurt");
      const length = Math.hypot(x - fromX, z - fromZ) || 1;
      knockX = ((x - fromX) / length) * 2.5;
      knockZ = ((z - fromZ) / length) * 2 + 3;
      audio?.splash(1.4);
      updateHud();
      if (hearts <= 0) end("lost", "Swept away", `You made it ${Math.floor(progressOf(z) * GOAL)} m upstream.`);
    };

    const input = (): [number, number] => {
      if (touch) return [touch.steer, 1];
      let dx = 0;
      let forward = 0;
      for (const key of keys) {
        dx += KEY_DIRECTIONS[key]![0];
        forward += KEY_DIRECTIONS[key]![1];
      }
      return [clamp(dx, -1, 1), clamp(forward, -1, 1)];
    };

    const update = (current: World, dt: number) => {
      elapsed += dt;
      invulnerable = Math.max(0, invulnerable - dt);
      const [dx, forward] = input();
      const swimming = forward > 0;
      const previousStroke = stroke;
      stroke += dt * (swimming ? 5.2 : dx ? 3 : 0);
      if (Math.floor(stroke / Math.PI) !== Math.floor(previousStroke / Math.PI))
        splash(Math.floor(stroke / Math.PI) % 2 ? 1 : -1);
      const surge = swimming ? 0.7 + 0.6 * Math.abs(Math.sin(stroke)) : 0;
      const vx = dx * STRAFE_SPEED + knockX;
      const vz = -surge * SWIM_SPEED - Math.min(0, forward) * 0.8 + currentAt(x, z) + knockZ;
      const decay = Math.exp(-dt * 3);
      knockX *= decay;
      knockZ *= decay;
      x = clamp(x + vx * dt, -HALF_WIDTH + 0.45, HALF_WIDTH - 0.45);
      z = Math.min(8, z + vz * dt);
      steerView += (dx - steerView) * Math.min(1, dt * 4);

      logTimer -= dt;
      if (logTimer <= 0) {
        spawnLog(current, current.trunk);
        logTimer = (4.2 - progressOf(z) * 1.8) * (0.6 + Math.random() * 0.8);
      }
      logs = logs.filter((log) => {
        log.z += log.speed * dt;
        log.yaw += Math.sin(clock * 0.4 + log.phase) * 0.04 * dt;
        if (log.z < z + 10) return true;
        current.scene.remove(log.mesh);
        return false;
      });

      for (const rock of rocks) {
        if (Math.hypot(x - rock.x, z - rock.z) < rock.r + SWIMMER_RADIUS) hit(rock.x, rock.z);
      }
      for (const log of logs) {
        const cos = Math.cos(log.yaw);
        const sin = Math.sin(log.yaw);
        const along = clamp((x - log.x) * cos - (z - log.z) * sin, -LOG_HALF_LENGTH, LOG_HALF_LENGTH);
        const nearestX = log.x + along * cos;
        const nearestZ = log.z - along * sin;
        if (Math.hypot(x - nearestX, z - nearestZ) < LOG_RADIUS + SWIMMER_RADIUS) hit(nearestX, nearestZ);
      }

      if (state === "running" && z <= -GOAL) {
        const record = !best || elapsed < best;
        if (record) {
          best = elapsed;
          writeBest(elapsed);
          showBest();
        }
        end(
          "won",
          "You made it!",
          `${elapsed.toFixed(1)} seconds against the current${record ? " — a new best." : "."}`,
        );
      }
      updateHud();
    };

    const animate = (current: World, dt: number) => {
      current.finish.update(clock);
      current.update(clock);
      current.showPlantsNear(z);
      for (const log of logs) {
        log.mesh.position.set(log.x, 0.02 + Math.sin(clock * 1.3 + log.phase) * 0.04, log.z);
        log.mesh.rotation.set(Math.sin(clock * 0.9 + log.phase) * 0.05, log.yaw, 0);
      }
      for (let i = 0; i < FOAM_COUNT; i++) {
        foamPositions[i * 3 + 2] += currentAt(foamPositions[i * 3]!, foamPositions[i * 3 + 2]!) * dt;
        if (foamPositions[i * 3 + 2]! > z + 6) placeFoam(i, z - 70, 20);
      }
      foamGeometry.getAttribute("position").needsUpdate = true;
      for (let i = 0; i < SPLASH_COUNT; i++) {
        if (splashPositions[i * 3 + 1]! < -1) continue;
        splashVelocities[i * 3 + 1] -= 9.8 * dt;
        for (let axis = 0; axis < 3; axis++) splashPositions[i * 3 + axis] += splashVelocities[i * 3 + axis]! * dt;
        if (splashPositions[i * 3 + 1]! < 0) splashPositions[i * 3 + 1] = -50;
      }
      splashGeometry.getAttribute("position").needsUpdate = true;

      shake = Math.max(0, shake - dt);
      const bob = Math.sin(stroke * 2) * 0.035 + Math.sin(clock * 1.7) * 0.02;
      camera.position.set(
        x + (Math.random() - 0.5) * shake * 0.3,
        EYE_HEIGHT + bob + (Math.random() - 0.5) * shake * 0.2,
        z,
      );
      camera.rotation.set(
        -0.04 + Math.sin(stroke * 2) * 0.012,
        -steerView * 0.12,
        Math.sin(stroke) * 0.035 - steerView * 0.03,
        "YXZ",
      );
      current.sun.target.position.set(x, 0, z - 20);
      current.sun.position.copy(current.sun.target.position).addScaledVector(current.sunDirection, 100);
    };

    const render = () => {
      if (world) renderer.render(world.scene, camera);
    };

    const resize = () => {
      const width = this.clientWidth;
      const height = this.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 1 ? 82 : 68;
      camera.updateProjectionMatrix();
      render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(this);

    const tick = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
      previous = now;
      if (world && !document.hidden) {
        clock += dt;
        if (state === "running") update(world, dt);
        else stroke += dt * 0.6;
        animate(world, dt);
        render();
      }
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!world) return;
      if (!audio) {
        try {
          audio = createAudio();
          audio.setMuted(muted);
        } catch {
          soundButton.hidden = true;
        }
      }
      void audio?.context.resume();
      for (const log of logs) world.scene.remove(log.mesh);
      logs = [];
      placeRocks(world);
      keys.clear();
      touch = null;
      x = 0;
      z = 0;
      knockX = knockZ = 0;
      hearts = MAX_HEARTS;
      invulnerable = 0;
      elapsed = 0;
      logTimer = 2;
      state = "running";
      panel.hidden = true;
      status.textContent = "Swim! The current is pushing you back.";
      updateHud();
      canvas.focus({ preventScroll: true });
    };

    startButton.addEventListener("click", start, { signal: events.signal });
    soundButton.addEventListener(
      "click",
      () => {
        muted = !muted;
        soundButton.textContent = muted ? "Sound off" : "Sound on";
        soundButton.setAttribute("aria-pressed", String(!muted));
        audio?.setMuted(muted);
      },
      { signal: events.signal },
    );

    for (const type of ["keydown", "keyup"] as const) {
      window.addEventListener(
        type,
        (event) => {
          const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
          if (type === "keydown" && key === "m" && !event.repeat) soundButton.click();
          if (!(key in KEY_DIRECTIONS) || state !== "running") return;
          event.preventDefault();
          if (type === "keydown") keys.add(key);
          else keys.delete(key);
        },
        { signal: events.signal },
      );
    }
    window.addEventListener("blur", () => keys.clear(), { signal: events.signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        keys.clear();
        previous = 0;
      },
      { signal: events.signal },
    );

    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (state !== "running" || touch) return;
        canvas.setPointerCapture(event.pointerId);
        touch = { id: event.pointerId, startX: event.clientX, steer: 0 };
      },
      { signal: events.signal },
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (touch?.id === event.pointerId) touch.steer = clamp((event.clientX - touch.startX) / 70, -1, 1);
      },
      { signal: events.signal },
    );
    for (const type of ["pointerup", "pointercancel"] as const) {
      canvas.addEventListener(
        type,
        (event) => {
          if (touch?.id === event.pointerId) touch = null;
        },
        { signal: events.signal },
      );
    }

    this.cleanup = () => {
      disposed = true;
      events.abort();
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      void audio?.context.close();
      world?.dispose();
      droplet.dispose();
      renderer.dispose();
    };

    showBest();
    updateHud();
    createWorld(renderer, (ratio) => {
      panelText.textContent = `Loading the river… ${Math.round(ratio * 100)}%`;
    }).then(
      (created) => {
        if (disposed) {
          created.dispose();
          return;
        }
        world = created;
        world.scene.add(foam, splashes);
        placeRocks(world);
        state = "ready";
        startButton.disabled = false;
        showPanel(
          "River Swim",
          "Swim 200 m up an alpine river. The current is strongest mid-stream — hug the banks, dodge the rocks and the drifting logs.",
          "Start swimming",
        );
        resize();
      },
      (error: unknown) => {
        console.error(error);
        panelTitle.textContent = "Could not load the river";
        panelText.textContent = "Please reload the page to try again.";
      },
    );
    frame = requestAnimationFrame(tick);
  }

  private cleanup = () => {};

  disconnectedCallback() {
    this.cleanup();
  }
}

if (!customElements.get("river-swim")) customElements.define("river-swim", RiverSwim);
