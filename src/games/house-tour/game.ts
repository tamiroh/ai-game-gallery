import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import hdrUrl from "./assets/sky-light.hdr?url";
import { Kit, type Solid } from "./kit";
import { createMaterials, shadowFlags, skyUrl } from "./materials";
import { buildHouse } from "./house";
import { buildOpenings } from "./openings";
import { buildFurniture, releaseShapes, type Fixture } from "./furniture";
import { buildDetails } from "./details";
import { buildClutter } from "./clutter";
import { releaseSoft } from "./soft";
import { buildSite, SITE } from "./site";
import { drawPlan, roomAt } from "./hud";
import { GROUNDS, SPAWN, STAIR, stairHeight } from "./plan";

const EYE = 1.58;
const WALK = 1.3;
const RUN = 2.7;
const RADIUS = 0.2;
const STEP = 0.36;
const LOOK = 0.0021;
const QUALITY_KEY = "house-tour-quality";

type Quality = "high" | "low";

function readQuality(): Quality {
  try {
    const stored = localStorage.getItem(QUALITY_KEY);
    if (stored === "high" || stored === "low") return stored;
  } catch {
    // Storage can be blocked; fall back to a device default.
  }
  return matchMedia("(pointer: coarse)").matches ? "low" : "high";
}

function saveQuality(quality: Quality) {
  try {
    localStorage.setItem(QUALITY_KEY, quality);
  } catch {
    // Not persisting is fine.
  }
}

/** Finds the sun in the HDR sky, tames it for the directional light, and fills the lower half with ground bounce. */
function prepareSkyLight(texture: THREE.DataTexture) {
  const { width, height } = texture.image;
  const data = texture.image.data as Float32Array;
  let best = 0;
  let sunIndex = 0;
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luminance = data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722;
      if (luminance > best) {
        best = luminance;
        sunIndex = y * width + x;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (y > height / 2 + 1) {
        const fade = Math.min(1, (y - height / 2) / (height * 0.04));
        data[i] = THREE.MathUtils.lerp(data[i]!, 0.3, fade);
        data[i + 1] = THREE.MathUtils.lerp(data[i + 1]!, 0.29, fade);
        data[i + 2] = THREE.MathUtils.lerp(data[i + 2]!, 0.25, fade);
      }
      const peak = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
      if (peak > 12) for (let k = 0; k < 3; k++) data[i + k] = (data[i + k]! * 12) / peak;
    }
  }
  texture.needsUpdate = true;
  const u = ((sunIndex % width) + 0.5) / width;
  const v = 1 - (Math.floor(sunIndex / width) + 0.5) / height;
  const elevation = (v - 0.5) * Math.PI;
  const azimuth = (u - 0.5) * Math.PI * 2;
  return new THREE.Vector3(
    Math.cos(elevation) * Math.cos(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(azimuth),
  ).normalize();
}

function start(root: HTMLElement) {
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = $<HTMLCanvasElement>("canvas.world");
  const panel = $<HTMLElement>("[data-panel]");
  const panelTitle = $<HTMLElement>("[data-panel-title]");
  const panelText = $<HTMLElement>("[data-panel-text]");
  const startButton = $<HTMLButtonElement>("[data-start]");
  const progress = $<HTMLElement>("[data-progress]");
  const roomName = $<HTMLElement>("[data-room]");
  const roomInfo = $<HTMLElement>("[data-room-info]");
  const planCanvas = $<HTMLCanvasElement>("canvas.plan");
  const planBox = $<HTMLElement>("[data-plan]");
  const lightsButton = $<HTMLButtonElement>("[data-lights]");
  const planButton = $<HTMLButtonElement>("[data-plan-toggle]");
  const qualityButton = $<HTMLButtonElement>("[data-quality]");
  const resetButton = $<HTMLButtonElement>("[data-reset]");
  const status = $<HTMLElement>("[data-status]");
  const stick = $<HTMLElement>("[data-stick]");
  const knob = $<HTMLElement>("[data-stick] span");
  const events = new AbortController();
  const signal = events.signal;
  const touchDevice = matchMedia("(pointer: coarse)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.7, 0.74, 0.79, THREE.SRGBColorSpace), 0.006);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);
  camera.rotation.order = "YXZ";

  // The sun comes from the south-west, low enough to reach deep into the rooms.
  const desiredSun = new THREE.Vector3(-0.55, 0, 0.83).normalize();
  const sunDirection = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
  const sun = new THREE.DirectionalLight(0xfff1de, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 80 });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const placeSun = () => {
    sun.target.position.set(5, 1.5, 5);
    sun.position.copy(sun.target.position).addScaledVector(sunDirection, 40);
    sun.target.updateMatrixWorld();
  };
  placeSun();
  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x7a6f60, 0.35);
  scene.add(hemi);

  const manager = new THREE.LoadingManager();
  let loaded = false;
  manager.onProgress = (_url, done, total) => {
    progress.style.width = `${Math.round((done / total) * 100)}%`;
  };
  const materials = createMaterials(manager, anisotropy);
  const pmrem = new THREE.PMREMGenerator(renderer);
  new HDRLoader(manager).setDataType(THREE.FloatType).load(hdrUrl, (texture) => {
    const found = prepareSkyLight(texture);
    const turn = Math.atan2(found.z, found.x) - Math.atan2(desiredSun.z, desiredSun.x);
    scene.backgroundRotation.set(0, turn, 0);
    scene.environmentRotation.set(0, turn, 0);
    const flat = Math.hypot(found.x, found.z);
    const elevation = Math.min(0.72, Math.atan2(found.y, flat));
    sunDirection
      .set(desiredSun.x * Math.cos(elevation), Math.sin(elevation), desiredSun.z * Math.cos(elevation))
      .normalize();
    placeSun();
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(texture).texture;
    texture.dispose();
  });
  new THREE.TextureLoader(manager).load(skyUrl(), (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
  });

  // Build everything into merged meshes, one per material.
  const kit = new Kit();
  kit.bevel = 0.004;
  const house = buildHouse(kit);
  buildOpenings(kit);
  const fixtures: Fixture[] = buildFurniture(kit);
  kit.withBevel(0, () => buildSite(kit));
  buildDetails(kit);
  buildClutter(kit);
  releaseShapes();
  releaseSoft();
  const world = kit.build(materials, shadowFlags);
  scene.add(world);
  const solids: Solid[] = [...house.solids, ...kit.solids];

  // Ceiling lights: a small pool of shadowed point lights follows you between rooms.
  const POOL = 2;
  const pool = Array.from({ length: POOL + 1 }, () => {
    const light = new THREE.PointLight(0xffe6c8, 0, 9, 2);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.006;
    light.shadow.normalBias = 0.06;
    light.shadow.radius = 3;
    light.shadow.camera.near = 0.08;
    scene.add(light);
    return { light, fixture: null as Fixture | null, level: 0 };
  });
  let lightsOn = true;

  // Local reflections and bounce light: a small cube map captured where you stand.
  const cubeTarget = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cubeCamera = new THREE.CubeCamera(0.05, 400, cubeTarget);
  let cubeReady = false;
  let nextCube = 0;

  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 0.6, scale: 1.25, samples: 12 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 10 });
  ao.setGBuffer(target.depthTexture!);
  const setAOSize = ao.setSize.bind(ao);
  ao.setSize = (width, height) => setAOSize(Math.ceil(width / 2), Math.ceil(height / 2));
  ao.blendIntensity = 1;
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.45, 1.1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let quality = readQuality();
  const resize = () => {
    const width = root.clientWidth;
    const height = root.clientHeight;
    const ratio = Math.min(devicePixelRatio, quality === "high" ? 1.5 : 1);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    planCanvas.width = Math.round(planCanvas.clientWidth * devicePixelRatio);
    planCanvas.height = Math.round(planCanvas.clientHeight * devicePixelRatio);
  };
  const applyQuality = () => {
    ao.enabled = quality === "high";
    bloom.enabled = quality === "high";
    for (const { light } of pool) light.castShadow = quality === "high";
    qualityButton.textContent = quality === "high" ? "Graphics: High" : "Graphics: Low";
    renderer.shadowMap.needsUpdate = true;
    resize();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);

  // Walker.
  const player = {
    pos: new THREE.Vector2(SPAWN.x, SPAWN.z),
    vel: new THREE.Vector2(),
    y: 0,
    yaw: SPAWN.yaw,
    pitch: -0.02,
    phase: 0,
  };
  const keys = new Set<string>();
  const stickInput = new THREE.Vector2();
  let playing = false;

  const groundAt = (x: number, z: number, y: number) => {
    let best = -Infinity;
    const consider = (h: number) => {
      if (h <= y + STEP && h > best) best = h;
    };
    const room = roomAt(x, z, y + STEP);
    if (room) consider(room.y);
    if (x >= STAIR.x0 && x <= STAIR.x1 && z >= STAIR.z0 && z <= STAIR.z1) consider(stairHeight(x));
    for (const g of GROUNDS) if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) consider(g.y);
    consider(SITE.groundAt(x, z));
    return best === -Infinity ? 0 : best;
  };

  const resolve = (p: THREE.Vector2) => {
    const feet = player.y + STEP,
      head = player.y + 1.7;
    for (let pass = 0; pass < 2; pass++) {
      for (const r of solids) {
        if (r.y1 <= feet || r.y0 >= head) continue;
        if (p.x < r.x0 - RADIUS || p.x > r.x1 + RADIUS || p.y < r.z0 - RADIUS || p.y > r.z1 + RADIUS) continue;
        const left = p.x - (r.x0 - RADIUS),
          right = r.x1 + RADIUS - p.x,
          top = p.y - (r.z0 - RADIUS),
          bottom = r.z1 + RADIUS - p.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) p.x = r.x0 - RADIUS;
        else if (min === right) p.x = r.x1 + RADIUS;
        else if (min === top) p.y = r.z0 - RADIUS;
        else p.y = r.z1 + RADIUS;
      }
    }
    p.x = THREE.MathUtils.clamp(p.x, SITE.x0, SITE.x1);
    p.y = THREE.MathUtils.clamp(p.y, SITE.z0, SITE.z1);
  };

  const resetPlayer = () => {
    player.pos.set(SPAWN.x, SPAWN.z);
    player.vel.set(0, 0);
    player.yaw = SPAWN.yaw;
    player.pitch = -0.02;
    player.y = groundAt(SPAWN.x, SPAWN.z, 0);
  };

  const setPanel = (title: string, text: string, button: string) => {
    panelTitle.textContent = title;
    panelText.textContent = text;
    startButton.textContent = button;
    panel.hidden = false;
    root.classList.remove("playing");
  };

  const play = () => {
    if (!loaded) return;
    panel.hidden = true;
    playing = true;
    root.classList.add("playing");
    if (!touchDevice) void canvas.requestPointerLock?.()?.catch?.(() => undefined);
    canvas.focus();
    status.textContent = "Touring. Press Escape to pause.";
  };

  const pause = () => {
    if (!playing) return;
    playing = false;
    keys.clear();
    setPanel("Paused", "Take your time. The house is not going anywhere.", "Continue the tour");
    status.textContent = "Paused.";
  };

  const setLights = (on: boolean) => {
    lightsOn = on;
    lightsButton.textContent = on ? "Lights: On" : "Lights: Off";
    lightsButton.setAttribute("aria-pressed", String(on));
    (materials.lamp as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2.2 : 0.02;
  };
  const togglePlan = () => {
    const hidden = planBox.classList.toggle("hidden");
    planButton.setAttribute("aria-pressed", String(!hidden));
  };

  startButton.addEventListener("click", play, { signal });
  canvas.addEventListener(
    "click",
    () => {
      if (playing && !touchDevice && document.pointerLockElement !== canvas)
        void canvas.requestPointerLock?.()?.catch?.(() => undefined);
    },
    { signal },
  );
  document.addEventListener(
    "pointerlockchange",
    () => {
      if (document.pointerLockElement !== canvas && playing && !touchDevice) pause();
    },
    { signal },
  );
  document.addEventListener(
    "mousemove",
    (event) => {
      if (!playing || document.pointerLockElement !== canvas) return;
      player.yaw -= event.movementX * LOOK;
      player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * LOOK, -1.4, 1.4);
    },
    { signal },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.target instanceof HTMLButtonElement && (event.code === "Space" || event.code === "Enter")) return;
      if (event.code === "Escape") {
        pause();
        return;
      }
      if (!playing) {
        if (event.code === "Enter" && !panel.hidden) play();
        return;
      }
      if (event.code === "KeyR") resetPlayer();
      if (event.code === "KeyL") setLights(!lightsOn);
      if (event.code === "KeyM") togglePlan();
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "ShiftLeft",
          "ShiftRight",
          "KeyQ",
          "KeyE",
          "PageUp",
          "PageDown",
        ].includes(event.code)
      ) {
        keys.add(event.code);
        event.preventDefault();
      }
    },
    { signal },
  );
  window.addEventListener("keyup", (event) => keys.delete(event.code), { signal });
  window.addEventListener("blur", () => keys.clear(), { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) pause();
    },
    { signal },
  );

  lightsButton.addEventListener("click", () => setLights(!lightsOn), { signal });
  planButton.addEventListener("click", togglePlan, { signal });
  qualityButton.addEventListener(
    "click",
    () => {
      quality = quality === "high" ? "low" : "high";
      saveQuality(quality);
      applyQuality();
    },
    { signal },
  );
  resetButton.addEventListener(
    "click",
    () => {
      resetPlayer();
      status.textContent = "Back at the front gate.";
    },
    { signal },
  );

  // Touch: left thumbstick walks, drag anywhere else to look.
  let stickId: number | null = null;
  let lookId: number | null = null;
  const lookLast = new THREE.Vector2();
  stick.addEventListener(
    "pointerdown",
    (event) => {
      stickId = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    { signal },
  );
  stick.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerId !== stickId) return;
      const rect = stick.getBoundingClientRect();
      const radius = rect.width / 2;
      stickInput.set((event.clientX - rect.left - radius) / radius, (event.clientY - rect.top - radius) / radius);
      if (stickInput.length() > 1) stickInput.normalize();
      knob.style.transform = `translate(${stickInput.x * radius * 0.6}px, ${stickInput.y * radius * 0.6}px)`;
    },
    { signal },
  );
  const releaseStick = (event: PointerEvent) => {
    if (event.pointerId !== stickId) return;
    stickId = null;
    stickInput.set(0, 0);
    knob.style.transform = "";
  };
  stick.addEventListener("pointerup", releaseStick, { signal });
  stick.addEventListener("pointercancel", releaseStick, { signal });
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "mouse" || !playing) return;
      lookId = event.pointerId;
      lookLast.set(event.clientX, event.clientY);
      canvas.setPointerCapture(event.pointerId);
    },
    { signal },
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerId !== lookId) return;
      player.yaw -= (event.clientX - lookLast.x) * 0.005;
      player.pitch = THREE.MathUtils.clamp(player.pitch - (event.clientY - lookLast.y) * 0.005, -1.3, 1.3);
      lookLast.set(event.clientX, event.clientY);
    },
    { signal },
  );
  const releaseLook = (event: PointerEvent) => {
    if (event.pointerId === lookId) lookId = null;
  };
  canvas.addEventListener("pointerup", releaseLook, { signal });
  canvas.addEventListener("pointercancel", releaseLook, { signal });

  const updateLights = (dt: number) => {
    const here = new THREE.Vector3(player.pos.x, player.y + EYE, player.pos.y);
    const floor = player.y > 2.6 ? 2 : 1;
    const wanted = lightsOn
      ? fixtures
          .map((f) => ({ f, score: here.distanceTo(f.position) + (f.floor === floor ? 0 : 6) }))
          .sort((a, b) => a.score - b.score)
          .slice(0, POOL)
          .map(({ f }) => f)
      : [];
    let moved = false;
    for (const slot of pool) {
      const keep = slot.fixture && wanted.includes(slot.fixture);
      slot.level = keep ? Math.min(1, slot.level + dt * 2.5) : Math.max(0, slot.level - dt * 2.5);
      if (!keep && slot.level === 0) slot.fixture = null;
    }
    for (const f of wanted) {
      if (pool.some((slot) => slot.fixture === f)) continue;
      const free = pool.find((slot) => !slot.fixture);
      if (!free) break;
      free.fixture = f;
      free.level = 0;
      free.light.position.copy(f.position);
      free.light.distance = f.range;
      moved = true;
    }
    for (const slot of pool) {
      slot.light.intensity = (slot.fixture?.intensity ?? 0) * slot.level;
      slot.light.visible = slot.fixture !== null;
    }
    if (moved) renderer.shadowMap.needsUpdate = true;
  };

  let lastRoom = "";
  const updateHud = () => {
    const room = roomAt(player.pos.x, player.pos.y, player.y + 0.4);
    const label = room
      ? room.id
      : `outside-${GROUNDS.findIndex((g) => player.pos.x >= g.x0 && player.pos.x <= g.x1 && player.pos.y >= g.z0 && player.pos.y <= g.z1)}-${player.pos.y > 13.2}`;
    if (label !== lastRoom) {
      lastRoom = label;
      if (room) {
        const area = (room.x1 - room.x0) * (room.z1 - room.z0);
        roomName.textContent = room.name;
        roomInfo.textContent = `${room.floor === 1 ? "1F" : "2F"} · ${(area / 1.62).toFixed(1)} jō · ${area.toFixed(1)} m²`;
      } else {
        const ground = GROUNDS.find(
          (g) =>
            player.pos.x >= g.x0 &&
            player.pos.x <= g.x1 &&
            player.pos.y >= g.z0 &&
            player.pos.y <= g.z1 &&
            Math.abs(g.y - player.y) < 0.3,
        );
        roomName.textContent = ground?.name ?? (player.pos.y > 13.2 ? "Street" : "Garden");
        roomInfo.textContent = "Outside";
      }
    }
  };

  let frame = 0;
  let last = performance.now();
  let time = 0;
  const forward = new THREE.Vector2();
  const right = new THREE.Vector2();
  const wish = new THREE.Vector2();
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!loaded) return;
    time += dt;

    if (playing) {
      const turn =
        (keys.has("ArrowLeft") ? 1 : 0) -
        (keys.has("ArrowRight") ? 1 : 0) +
        (keys.has("KeyQ") ? 1 : 0) -
        (keys.has("KeyE") ? 1 : 0);
      player.yaw += turn * 1.8 * dt;
      const tilt = (keys.has("PageUp") ? 1 : 0) - (keys.has("PageDown") ? 1 : 0);
      player.pitch = THREE.MathUtils.clamp(player.pitch + tilt * 1.2 * dt, -1.4, 1.4);
      forward.set(-Math.sin(player.yaw), -Math.cos(player.yaw));
      right.set(Math.cos(player.yaw), -Math.sin(player.yaw));
      const ahead =
        (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
        (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
        stickInput.y;
      const side = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + stickInput.x;
      wish.set(0, 0).addScaledVector(forward, ahead).addScaledVector(right, side);
      if (wish.length() > 1) wish.normalize();
      const running = keys.has("ShiftLeft") || keys.has("ShiftRight") || stickInput.length() > 0.95;
      wish.multiplyScalar(running ? RUN : WALK);
      player.vel.lerp(wish, 1 - Math.exp(-dt * 8));
    } else {
      player.vel.multiplyScalar(Math.exp(-dt * 8));
    }
    const before = player.pos.clone();
    player.pos.addScaledVector(player.vel, dt);
    resolve(player.pos);
    const moved = player.pos.distanceTo(before);
    const speed = moved / Math.max(dt, 1e-4);
    player.phase += moved * (Math.PI / (speed > 2 ? 0.85 : 0.65));
    const ground = groundAt(player.pos.x, player.pos.y, player.y);
    player.y += (ground - player.y) * (1 - Math.exp(-dt * (ground < player.y - 0.5 ? 9 : 16)));
    const bob = Math.min(1, speed / WALK);
    const bobY = (Math.abs(Math.cos(player.phase)) - 0.6) * 0.03 * bob;
    const bobX = Math.sin(player.phase) * 0.015 * bob;
    camera.position.set(
      player.pos.x + Math.cos(player.yaw) * bobX,
      player.y + EYE + bobY,
      player.pos.y - Math.sin(player.yaw) * bobX,
    );
    camera.rotation.set(player.pitch, player.yaw, Math.sin(player.phase) * 0.003 * bob);

    updateLights(dt);
    if (time >= nextCube) {
      cubeCamera.position.copy(camera.position);
      cubeCamera.update(renderer, scene);
      if (!cubeReady) {
        cubeReady = true;
        scene.environment = cubeTarget.texture;
        scene.environmentIntensity = 0.72;
        scene.environmentRotation.set(0, 0, 0);
      }
      nextCube = time + (quality === "high" ? 0.25 : 0.6);
    }

    const depth = composer.readBuffer.depthTexture;
    ao.gtaoMaterial.uniforms.tDepth!.value = depth;
    ao.pdMaterial.uniforms.tDepth!.value = depth;
    composer.render(dt);
    if (frame % 3 === 0 && !planBox.classList.contains("hidden"))
      drawPlan(planCanvas, player.pos.x, player.pos.y, player.y, player.yaw);
    if (frame % 6 === 0) updateHud();
  };

  applyQuality();
  setLights(true);
  resetPlayer();

  manager.onLoad = async () => {
    renderer.shadowMap.needsUpdate = true;
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      // Compiles lazily on the first frame instead.
    }
    loaded = true;
    root.classList.add("ready");
    startButton.disabled = false;
    startButton.textContent = "Step inside";
    panelText.textContent =
      "A two-storey family home in a quiet Japanese suburb: tatami room, open-plan LDK, three bedrooms and a balcony. Walk around at your own pace.";
    status.textContent = "The house is ready to view.";
  };
  manager.onError = (url) => {
    panelText.textContent = `Couldn't load part of the house (${url.split("/").pop()}). Try reloading.`;
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    events.abort();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    composer.dispose();
    target.dispose();
    cubeTarget.dispose();
    pmrem.dispose();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    for (const material of Object.values(materials)) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
    renderer.dispose();
  };
}

class HouseTour extends HTMLElement {
  private stop: (() => void) | null = null;
  connectedCallback() {
    this.stop = start(this);
  }
  disconnectedCallback() {
    this.stop?.();
    this.stop = null;
  }
}

if (!customElements.get("house-tour")) customElements.define("house-tour", HouseTour);
