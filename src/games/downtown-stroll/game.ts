import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import hdrUrl from "./assets/sky-light.hdr?url";
import { createAudio, type CityAudio } from "./audio";
import { createCity, type Rect } from "./city";
import { loadSurfaces, skyUrl } from "./materials";
import { createPedestrians } from "./pedestrians";
import { createProps, type Circle } from "./props";
import { createTraffic } from "./traffic";
import {
  BLOCK,
  CURB_HEIGHT,
  SPAWN,
  WALK_LIMIT,
  blockCenter,
  districtName,
  isPark,
  locationName,
  nearestBlock,
  onBlock,
} from "./layout";

const EYE_HEIGHT = 1.68;
const WALK_SPEED = 1.7;
const RUN_SPEED = 4.4;
const RADIUS = 0.3;
const LOOK_SENSITIVITY = 0.0021;
const QUALITY_KEY = "downtown-stroll-quality";

type Quality = "high" | "low";

function readQuality(): Quality {
  try {
    const stored = localStorage.getItem(QUALITY_KEY);
    if (stored === "high" || stored === "low") return stored;
  } catch {
    // Storage may be blocked; fall back to a device-based default.
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

/** Prepares the HDR sky for lighting: finds the sun, tames it (the directional light takes over), and replaces the mirrored lower half with ground bounce. */
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
  const limit = 14;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (y > height / 2 + 1) {
        const fade = Math.min(1, (y - height / 2) / (height * 0.04));
        data[i] = THREE.MathUtils.lerp(data[i]!, 0.32, fade);
        data[i + 1] = THREE.MathUtils.lerp(data[i + 1]!, 0.3, fade);
        data[i + 2] = THREE.MathUtils.lerp(data[i + 2]!, 0.28, fade);
      }
      const peak = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
      if (peak > limit) for (let k = 0; k < 3; k++) data[i + k] = (data[i + k]! * limit) / peak;
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
  const street = $<HTMLElement>("[data-street]");
  const district = $<HTMLElement>("[data-district]");
  const walked = $<HTMLElement>("[data-walked]");
  const clock = $<HTMLElement>("[data-clock]");
  const soundButton = $<HTMLButtonElement>("[data-sound]");
  const qualityButton = $<HTMLButtonElement>("[data-quality]");
  const resetButton = $<HTMLButtonElement>("[data-reset]");
  const status = $<HTMLElement>("[data-status]");
  const minimap = $<HTMLCanvasElement>("canvas.minimap");
  const stick = $<HTMLElement>("[data-stick]");
  const knob = $<HTMLElement>("[data-stick] span");
  const events = new AbortController();
  const signal = events.signal;
  const touchDevice = matchMedia("(pointer: coarse)").matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color().setRGB(0.62, 0.66, 0.72, THREE.SRGBColorSpace);
  scene.fog = new THREE.FogExp2(fogColor, 0.0017);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 2600);
  camera.rotation.order = "YXZ";

  const sun = new THREE.DirectionalLight(0xfff0dc, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const SHADOW_EXTENT = 110;
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_EXTENT,
    right: SHADOW_EXTENT,
    top: SHADOW_EXTENT,
    bottom: -SHADOW_EXTENT,
    near: 1,
    far: 900,
  });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const sunDirection = new THREE.Vector3(0.5, 0.7, 0.3).normalize();

  const manager = new THREE.LoadingManager();
  let loaded = false;
  manager.onProgress = (_url, done, total) => {
    progress.style.width = `${Math.round((done / total) * 100)}%`;
  };
  const surfaces = loadSurfaces(manager, anisotropy);
  const pmrem = new THREE.PMREMGenerator(renderer);
  new HDRLoader(manager).setDataType(THREE.FloatType).load(hdrUrl, (texture) => {
    sunDirection.copy(prepareSkyLight(texture));
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(texture).texture;
    scene.environmentIntensity = 1.0;
    texture.dispose();
  });
  // Local reflections: a low-res cube captured around the walker lights and reflects the real street.
  const cubeTarget = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cubeCamera = new THREE.CubeCamera(0.3, 1800, cubeTarget);
  let cubeReady = false;
  let nextCube = 0;
  new THREE.TextureLoader(manager).load(skyUrl(), (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    scene.background = texture;
  });

  const city = createCity(surfaces);
  scene.add(city.group);
  const props = createProps();
  scene.add(props.group);
  const traffic = createTraffic();
  scene.add(traffic.group);
  const pedestrians = createPedestrians(touchDevice ? 110 : 190);
  scene.add(pedestrians.group);

  // Post-processing: ambient occlusion for contact shadows, a touch of bloom on sun glints.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 8 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
  // Ambient occlusion is soft, so it runs at half resolution and is blended onto the full-size frame.
  // Reuse the main pass depth (normals are reconstructed from it) instead of rendering the scene twice.
  ao.setGBuffer(target.depthTexture!);
  const setAOSize = ao.setSize.bind(ao);
  ao.setSize = (width, height) => setAOSize(Math.ceil(width / 2), Math.ceil(height / 2));
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.5, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let quality = readQuality();
  const applyQuality = () => {
    ao.enabled = quality === "high";
    bloom.enabled = quality === "high";
    sun.shadow.mapSize.setScalar(quality === "high" ? 4096 : 2048);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    qualityButton.textContent = quality === "high" ? "Graphics: High" : "Graphics: Low";
    resize();
  };

  const resize = () => {
    const width = root.clientWidth;
    const height = root.clientHeight;
    const ratio = Math.min(devicePixelRatio, quality === "high" ? 1.25 : 1);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    const mapSize = minimap.clientWidth * devicePixelRatio;
    minimap.width = minimap.height = Math.round(mapSize);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);

  // Walker state.
  const player = {
    pos: new THREE.Vector2(SPAWN.x, SPAWN.z),
    vel: new THREE.Vector2(),
    y: CURB_HEIGHT,
    yaw: SPAWN.yaw,
    pitch: 0.02,
    phase: 0,
    walked: 0,
  };
  const keys = new Set<string>();
  const stickInput = new THREE.Vector2();
  let playing = false;
  let audio: CityAudio | null = null;
  let soundOn = true;

  const solids: Rect[] = city.solids;
  const circles: Circle[] = [...props.circles, ...city.circles];
  const resolve = (p: THREE.Vector2) => {
    for (const r of solids) {
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
    for (const c of circles) {
      const dx = p.x - c.x,
        dz = p.y - c.z;
      const reach = c.r + RADIUS;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const d = Math.hypot(dx, dz);
      if (d < reach && d > 1e-5) p.set(c.x + (dx / d) * reach, c.z + (dz / d) * reach);
    }
    traffic.collide(p, RADIUS);
    pedestrians.collide(p, RADIUS);
    p.x = THREE.MathUtils.clamp(p.x, -WALK_LIMIT, WALK_LIMIT);
    p.y = THREE.MathUtils.clamp(p.y, -WALK_LIMIT, WALK_LIMIT);
  };

  const onGrass = (x: number, z: number) => {
    const bx = nearestBlock(x),
      bz = nearestBlock(z);
    if (!isPark(bx, bz)) return false;
    const lx = Math.abs(x - blockCenter(bx)),
      lz = Math.abs(z - blockCenter(bz));
    const inner = BLOCK / 2 - 5;
    return lx < inner && lz < inner && lx > 2.5 && lz > 2.5;
  };
  const groundAt = (x: number, z: number) => (onGrass(x, z) ? CURB_HEIGHT + 0.08 : onBlock(x, z) ? CURB_HEIGHT : 0);

  const resetPlayer = () => {
    player.pos.set(SPAWN.x, SPAWN.z);
    player.vel.set(0, 0);
    player.yaw = SPAWN.yaw;
    player.pitch = 0.02;
    player.walked = 0;
    player.y = CURB_HEIGHT;
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
    if (!audio) {
      try {
        audio = createAudio();
      } catch {
        audio = null;
      }
    }
    audio?.setEnabled(soundOn);
    if (!touchDevice) void canvas.requestPointerLock?.()?.catch?.(() => undefined);
    canvas.focus();
    status.textContent = "Walking. Press Escape to pause.";
  };

  const pause = () => {
    if (!playing) return;
    playing = false;
    keys.clear();
    audio?.setEnabled(false);
    setPanel("Paused", "The city will wait for you.", "Keep walking");
    status.textContent = "Paused.";
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
      player.yaw -= event.movementX * LOOK_SENSITIVITY;
      player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * LOOK_SENSITIVITY, -1.35, 1.35);
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

  soundButton.addEventListener(
    "click",
    () => {
      soundOn = !soundOn;
      soundButton.textContent = soundOn ? "Sound: On" : "Sound: Off";
      soundButton.setAttribute("aria-pressed", String(soundOn));
      audio?.setEnabled(soundOn && playing);
    },
    { signal },
  );
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
      status.textContent = "Back at the starting corner.";
    },
    { signal },
  );

  // Touch: left thumbstick to walk, drag anywhere else to look.
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

  // Sun shadow follows the walker, snapped to shadow texels to avoid shimmering.
  const lightBasis = { right: new THREE.Vector3(), up: new THREE.Vector3() };
  const updateSun = () => {
    lightBasis.right.crossVectors(sunDirection, new THREE.Vector3(0, 1, 0)).normalize();
    lightBasis.up.crossVectors(lightBasis.right, sunDirection).normalize();
    const texel = (SHADOW_EXTENT * 2) / sun.shadow.mapSize.x;
    const center = new THREE.Vector3(player.pos.x, 0, player.pos.y);
    const a = Math.round(center.dot(lightBasis.right) / texel) * texel;
    const b = Math.round(center.dot(lightBasis.up) / texel) * texel;
    const c = center.dot(sunDirection);
    const snapped = new THREE.Vector3()
      .addScaledVector(lightBasis.right, a)
      .addScaledVector(lightBasis.up, b)
      .addScaledVector(sunDirection, c);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(sunDirection, 400);
    sun.target.updateMatrixWorld();
  };

  // GTA-style radar.
  const mapContext = minimap.getContext("2d")!;
  const drawMinimap = () => {
    const size = minimap.width;
    if (!size) return;
    const scale = size / 2 / 110;
    const ctx = mapContext;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#23272b";
    ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.rotate(player.yaw);
    ctx.scale(scale, scale);
    ctx.translate(-player.pos.x, -player.pos.y);
    const near = (x: number, z: number, pad: number) =>
      Math.abs(x - player.pos.x) < 160 + pad && Math.abs(z - player.pos.y) < 160 + pad;
    ctx.fillStyle = "#4b5157";
    for (let bx = -5; bx <= 5; bx++) {
      for (let bz = -5; bz <= 5; bz++) {
        const cx = blockCenter(bx),
          cz = blockCenter(bz);
        if (!near(cx, cz, BLOCK)) continue;
        ctx.fillStyle = isPark(bx, bz) ? "#4d6b45" : "#4b5157";
        ctx.fillRect(cx - BLOCK / 2, cz - BLOCK / 2, BLOCK, BLOCK);
      }
    }
    ctx.fillStyle = "#6c737a";
    for (const r of solids)
      if (near(r.x0, r.z0, 40)) ctx.fillRect(r.x0 + 0.6, r.z0 + 0.6, r.x1 - r.x0 - 1.2, r.z1 - r.z0 - 1.2);
    for (const car of traffic.cars) {
      if (!near(car.pos.x, car.pos.y, 10)) continue;
      ctx.save();
      ctx.translate(car.pos.x, car.pos.y);
      ctx.rotate(Math.atan2(car.fwd.y, car.fwd.x));
      ctx.fillStyle = "#d9dde0";
      ctx.fillRect(-2.4, -1, 4.8, 2);
      ctx.restore();
    }
    ctx.restore();
    // Player arrow and north marker.
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.fillStyle = "#f4f1e8";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = size / 110;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.055);
    ctx.lineTo(size * 0.04, size * 0.04);
    ctx.lineTo(0, size * 0.018);
    ctx.lineTo(-size * 0.04, size * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const r = size / 2 - size * 0.08;
    ctx.fillStyle = "#f4f1e8";
    ctx.font = `600 ${Math.round(size * 0.075)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", Math.sin(player.yaw) * r, -Math.cos(player.yaw) * r);
    ctx.restore();
  };

  let lastLocation = "";
  const updateHud = () => {
    const location = locationName(player.pos.x, player.pos.y);
    if (location !== lastLocation) {
      lastLocation = location;
      street.textContent = location;
      district.textContent = districtName(player.pos.x, player.pos.y);
    }
    walked.textContent =
      player.walked < 1000 ? `${Math.round(player.walked)} m walked` : `${(player.walked / 1000).toFixed(2)} km walked`;
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  // Main loop.
  let frame = 0;
  let last = performance.now();
  let time = 0;
  let nextChirp = 3;
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
      player.yaw += turn * 1.9 * dt;
      const tilt = (keys.has("PageUp") ? 1 : 0) - (keys.has("PageDown") ? 1 : 0);
      player.pitch = THREE.MathUtils.clamp(player.pitch + tilt * 1.2 * dt, -1.35, 1.35);
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
      wish.multiplyScalar(running ? RUN_SPEED : WALK_SPEED);
      player.vel.lerp(wish, 1 - Math.exp(-dt * 7));
    } else {
      player.vel.multiplyScalar(Math.exp(-dt * 8));
    }
    const before = player.pos.clone();
    player.pos.addScaledVector(player.vel, dt);
    resolve(player.pos);
    const moved = player.pos.distanceTo(before);
    player.walked += moved;
    const speed = moved / Math.max(dt, 1e-4);
    const previousPhase = player.phase;
    player.phase += moved * (Math.PI / (speed > 3 ? 0.95 : 0.72));
    if (Math.floor(previousPhase / Math.PI) !== Math.floor(player.phase / Math.PI)) {
      audio?.step(
        speed > 3,
        onGrass(player.pos.x, player.pos.y) ? "grass" : onBlock(player.pos.x, player.pos.y) ? "stone" : "asphalt",
      );
    }
    player.y += (groundAt(player.pos.x, player.pos.y) - player.y) * (1 - Math.exp(-dt * 14));
    const bob = Math.min(1, speed / WALK_SPEED);
    const bobY = (Math.abs(Math.cos(player.phase)) - 0.6) * 0.045 * bob * (speed > 3 ? 1.6 : 1);
    const bobX = Math.sin(player.phase) * 0.022 * bob;
    camera.position.set(
      player.pos.x + Math.cos(player.yaw) * bobX,
      player.y + EYE_HEIGHT + bobY,
      player.pos.y - Math.sin(player.yaw) * bobX,
    );
    camera.rotation.set(player.pitch, player.yaw, Math.sin(player.phase) * 0.004 * bob);

    traffic.update(dt, time, player.pos);
    pedestrians.update(dt, player.pos);
    props.updateSignals(time);
    updateSun();
    if (time >= nextCube) {
      cubeCamera.position.set(player.pos.x, 2.2, player.pos.y);
      cubeCamera.update(renderer, scene);
      if (!cubeReady) {
        cubeReady = true;
        scene.environment = cubeTarget.texture;
        scene.environmentIntensity = 3.1;
      }
      nextCube = time + (quality === "high" ? 0.4 : 1);
    }

    if (audio && playing) {
      let level = 0,
        rumble = 0,
        brightness = 0;
      for (const car of traffic.nearby(player.pos)) {
        const falloff = 1 / (1 + (car.distance / 9) ** 2);
        level += falloff * Math.min(1, car.speed / 10);
        rumble += falloff * (car.bus ? 1.2 : 0.35) * (0.4 + Math.min(1, car.speed / 10));
        brightness = Math.max(brightness, (falloff * car.speed) / 12);
      }
      audio.setTraffic(Math.min(1, level), Math.min(1, rumble * 0.5), Math.min(1, brightness));
      if (time > nextChirp) {
        const bx = nearestBlock(player.pos.x),
          bz = nearestBlock(player.pos.y);
        const parkDistance = isPark(bx, bz)
          ? 0
          : Math.min(
              ...[
                [-1, 1],
                [2, -2],
              ].map(([x, z]) => Math.hypot(player.pos.x - blockCenter(x!), player.pos.y - blockCenter(z!))),
            );
        if (parkDistance < 90 && Math.random() < 0.7) audio.chirp();
        nextChirp = time + 1.5 + Math.random() * 5;
      }
    }

    const depth = composer.readBuffer.depthTexture;
    ao.gtaoMaterial.uniforms.tDepth!.value = depth;
    ao.pdMaterial.uniforms.tDepth!.value = depth;
    composer.render(dt);
    if (frame % 2 === 0) drawMinimap();
    if (frame % 10 === 0) updateHud();
  };

  applyQuality();
  resetPlayer();
  camera.position.set(player.pos.x, CURB_HEIGHT + EYE_HEIGHT, player.pos.y);
  updateHud();

  manager.onLoad = async () => {
    updateSun();
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      // Compilation will happen lazily on the first frame instead.
    }
    loaded = true;
    root.classList.add("ready");
    startButton.disabled = false;
    startButton.textContent = "Start walking";
    panelText.textContent = "An afternoon downtown. No missions, no destination. Just the city.";
    status.textContent = "The city is ready.";
  };
  manager.onError = (url) => {
    panelText.textContent = `Couldn't load part of the city (${url.split("/").pop()}). Try reloading.`;
  };
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    events.abort();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    audio?.dispose();
    composer.dispose();
    cubeTarget.dispose();
    pmrem.dispose();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) =>
          material.dispose(),
        );
      }
    });
    renderer.dispose();
  };
}

class DowntownStroll extends HTMLElement {
  private stop: (() => void) | null = null;
  connectedCallback() {
    this.stop = start(this);
  }
  disconnectedCallback() {
    this.stop?.();
    this.stop = null;
  }
}

if (!customElements.get("downtown-stroll")) customElements.define("downtown-stroll", DowntownStroll);
