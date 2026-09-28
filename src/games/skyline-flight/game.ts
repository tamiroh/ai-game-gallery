import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { createAudio, type FlightAudio } from "./audio";
import { SolidIndex, createCity } from "./city";
import { COURSE_RADIUS, createCourse, sectionName } from "./course";
import { createGates } from "./gates";
import { RIVER, floorAt, overRiver } from "./layout";
import { createAircraft, createTrails, glowTexture } from "./plane";
import { FOG_COLOR, FOG_DENSITY, SUN_DIRECTION, createWorld } from "./world";

const BASE_SPEED = 50;
const BOOST_SPEED = 76;
const MAX_ROLL = 1.05;
const TURN_RATE = 1.45;
const MAX_PITCH = 0.62;
const HIT_RADIUS = 1.6;
const CLOSE_CALL = 6;
const OFF_COURSE_LIMIT = 3;
const MISS_PENALTY = 2;
const BEST_KEY = "skyline-flight-best";
const QUALITY_KEY = "skyline-flight-quality";
const INVERT_KEY = "skyline-flight-invert";

type State = "loading" | "ready" | "countdown" | "flying" | "crashed" | "finished" | "paused";
type Quality = "high" | "low";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisting is fine.
  }
}

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, "0")}`;
};

function start(root: HTMLElement) {
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = $<HTMLCanvasElement>("canvas.world");
  const panel = $<HTMLElement>("[data-panel]");
  const kicker = $<HTMLElement>("[data-kicker]");
  const panelTitle = $<HTMLElement>("[data-panel-title]");
  const panelText = $<HTMLElement>("[data-panel-text]");
  const results = $<HTMLElement>("[data-results]");
  const startButton = $<HTMLButtonElement>("[data-start]");
  const loadBar = $<HTMLElement>("[data-load]");
  const timeLabel = $<HTMLElement>("[data-time]");
  const bestLabel = $<HTMLElement>("[data-best]");
  const progressBar = $<HTMLElement>("[data-progress]");
  const gatesLabel = $<HTMLElement>("[data-gates]");
  const speedLabel = $<HTMLElement>("[data-speed]");
  const altitudeLabel = $<HTMLElement>("[data-alt]");
  const sectionLabel = $<HTMLElement>("[data-section]");
  const callout = $<HTMLElement>("[data-callout]");
  const warning = $<HTMLElement>("[data-warning]");
  const danger = $<HTMLElement>("[data-danger]");
  const pointer = $<HTMLElement>("[data-pointer]");
  const map = $<HTMLCanvasElement>("canvas.map");
  const soundButton = $<HTMLButtonElement>("[data-sound]");
  const qualityButton = $<HTMLButtonElement>("[data-quality]");
  const invertButton = $<HTMLButtonElement>("[data-invert]");
  const restartButton = $<HTMLButtonElement>("[data-restart]");
  const stick = $<HTMLElement>("[data-stick]");
  const knob = $<HTMLElement>("[data-stick] span");
  const boostButton = $<HTMLButtonElement>("[data-boost]");
  const status = $<HTMLElement>("[data-status]");
  const events = new AbortController();
  const signal = events.signal;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch {
    panelTitle.textContent = "WebGL unavailable";
    panelText.textContent = "This game needs WebGL, which is not available in this browser.";
    startButton.textContent = "Unavailable";
    return () => undefined;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.5, 26000);
  scene.add(camera);

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.4, 1.4);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let quality: Quality =
    read(QUALITY_KEY) === "low"
      ? "low"
      : read(QUALITY_KEY) === "high"
        ? "high"
        : matchMedia("(pointer: coarse)").matches
          ? "low"
          : "high";
  let invert = read(INVERT_KEY) === "1";
  let best = Number(read(BEST_KEY)) || 0;

  const course = createCourse();
  let world: ReturnType<typeof createWorld> | null = null;
  let city: ReturnType<typeof createCity> | null = null;
  let gates: ReturnType<typeof createGates> | null = null;
  let solids: SolidIndex | null = null;
  let envTarget: THREE.WebGLRenderTarget | null = null;
  const aircraft = createAircraft();
  scene.add(aircraft.group);
  const trails = createTrails();
  scene.add(trails.mesh);

  // Explosion: an expanding fireball and a flash of light.
  const fireballTexture = glowTexture();
  const fireballMaterial = new THREE.SpriteMaterial({
    color: new THREE.Color(4, 1.8, 0.6),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: fireballTexture,
  });
  const fireball = new THREE.Sprite(fireballMaterial);
  fireball.visible = false;
  const smokeMaterial = new THREE.SpriteMaterial({
    color: 0x3a3430,
    transparent: true,
    depthWrite: false,
    map: fireballTexture,
  });
  const smoke = new THREE.Sprite(smokeMaterial);
  smoke.visible = false;
  const flash = new THREE.PointLight(0xffa050, 0, 200, 1.4);
  scene.add(smoke, fireball, flash);

  // Speed streaks around the camera when boosting or skimming walls.
  const STREAKS = 90;
  const streakPositions = new Float32Array(STREAKS * 6);
  const streakSeeds = Array.from({ length: STREAKS }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: 3 + Math.random() * 9,
    z: -Math.random() * 90,
  }));
  const streakGeometry = new THREE.BufferGeometry();
  streakGeometry.setAttribute("position", new THREE.BufferAttribute(streakPositions, 3));
  const streakMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const streaks = new THREE.LineSegments(streakGeometry, streakMaterial);
  streaks.frustumCulled = false;
  camera.add(streaks);

  // Flight state.
  const plane = {
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: BASE_SPEED,
    boost: 0,
  };
  const forward = new THREE.Vector3();
  let state: State = "loading";
  let pausedFrom: State = "flying";
  let autopilotS = 0;
  let countdown = 0;
  let elapsed = 0;
  let offCourse = 0;
  let pathIndex = 0;
  let progressS = 0;
  let nextGate = 0;
  let hits = 0;
  let missed = 0;
  let closeCalls = 0;
  let closeCooldown = 0;
  let proximity = 0;
  let shake = 0;
  let endTimer = 0;
  let calloutTimer = 0;
  let warnBeep = 0;
  let orbit = 0;
  let failReason = "";
  const keys = new Set<string>();
  const stickInput = new THREE.Vector2();
  let touchBoost = false;
  let audio: FlightAudio | null = null;
  let soundOn = true;

  const setOrientation = (tangent: THREE.Vector3) => {
    plane.yaw = Math.atan2(-tangent.x, -tangent.z);
    plane.pitch = Math.asin(THREE.MathUtils.clamp(tangent.y, -1, 1));
  };
  const updateForward = () =>
    forward.set(
      -Math.sin(plane.yaw) * Math.cos(plane.pitch),
      Math.sin(plane.pitch),
      -Math.cos(plane.yaw) * Math.cos(plane.pitch),
    );
  const placeAircraft = () => {
    aircraft.group.position.copy(plane.pos);
    aircraft.group.rotation.set(plane.pitch, plane.yaw, -plane.roll, "YXZ");
  };

  const showCallout = (text: string, seconds = 1.1, tone = "") => {
    callout.textContent = text;
    callout.dataset.tone = tone;
    callout.classList.remove("pop");
    void callout.offsetWidth;
    callout.classList.add("pop");
    calloutTimer = seconds;
  };

  const setPanel = (options: { kicker: string; title: string; text: string; button: string; results?: boolean }) => {
    kicker.textContent = options.kicker;
    panelTitle.textContent = options.title;
    panelText.textContent = options.text;
    startButton.textContent = options.button;
    results.hidden = !options.results;
    panel.hidden = false;
    root.classList.remove("playing");
    startButton.focus({ preventScroll: true });
  };

  const snapCamera = () => {
    updateForward();
    camera.position
      .copy(plane.pos)
      .addScaledVector(forward, -14)
      .add(new THREE.Vector3(0, 4, 0));
    camera.lookAt(plane.pos.clone().addScaledVector(forward, 25));
  };

  const resetFlight = () => {
    course.at(0, plane.pos);
    setOrientation(course.tangentAt(0));
    plane.roll = 0;
    plane.speed = BASE_SPEED;
    plane.boost = 0;
    autopilotS = 0;
    elapsed = 0;
    offCourse = 0;
    pathIndex = 0;
    progressS = 0;
    nextGate = 0;
    hits = missed = closeCalls = 0;
    closeCooldown = 0;
    endTimer = 0;
    aircraft.group.visible = true;
    fireball.visible = smoke.visible = false;
    flash.intensity = 0;
    gates?.reset();
    trails.reset();
    placeAircraft();
    snapCamera();
  };

  const ensureAudio = () => {
    if (!audio) {
      try {
        audio = createAudio();
      } catch {
        audio = null;
      }
    }
    audio?.resume();
    audio?.setEnabled(soundOn);
  };

  const launch = () => {
    if (state === "loading") return;
    ensureAudio();
    resetFlight();
    state = "countdown";
    countdown = 3;
    panel.hidden = true;
    root.classList.add("playing");
    canvas.focus({ preventScroll: true });
    showCallout("3", 1);
    audio?.beep();
    status.textContent = "Get ready. Three, two, one.";
  };

  const pause = () => {
    if (state !== "flying" && state !== "countdown") return;
    pausedFrom = state;
    state = "paused";
    keys.clear();
    audio?.setFlight(false, 0, 0, 0);
    setPanel({
      kicker: "Holding pattern",
      title: "Paused",
      text: "The sun will wait. Press Resume, Enter or Escape to continue.",
      button: "Resume",
    });
    status.textContent = "Paused.";
  };

  const resume = () => {
    if (state !== "paused") return;
    state = pausedFrom;
    panel.hidden = true;
    root.classList.add("playing");
    canvas.focus({ preventScroll: true });
    status.textContent = "Resumed.";
  };

  const fail = (reason: "crash" | "offcourse") => {
    state = "crashed";
    failReason = reason;
    endTimer = 0;
    warning.hidden = true;
    danger.style.opacity = "0";
    if (reason === "crash") {
      aircraft.group.visible = false;
      fireball.position.copy(plane.pos);
      fireball.visible = true;
      smoke.position.copy(plane.pos);
      smoke.visible = true;
      flash.position.copy(plane.pos);
      flash.intensity = 4000;
      shake = 1.4;
      audio?.crash();
      showCallout("Crashed", 1.8, "bad");
    } else {
      audio?.miss();
      showCallout("Off course", 1.8, "bad");
    }
    status.textContent = reason === "crash" ? "You crashed." : "You left the course.";
  };

  const finish = () => {
    state = "finished";
    endTimer = 0;
    orbit = 0;
    warning.hidden = true;
    danger.style.opacity = "0";
    const total = elapsed + missed * MISS_PENALTY;
    const record = !best || total < best;
    if (record) {
      best = total;
      write(BEST_KEY, String(best));
    }
    audio?.gate(true);
    showCallout(record ? "New record!" : "Finish!", 2.4, "good");
    $<HTMLElement>("[data-r-time]").textContent = formatTime(total);
    $<HTMLElement>("[data-r-gates]").textContent =
      `${hits} / ${gates!.gates.length - 1}${missed ? ` (+${missed * MISS_PENALTY}s)` : ""}`;
    $<HTMLElement>("[data-r-close]").textContent = String(closeCalls);
    $<HTMLElement>("[data-r-best]").textContent = formatTime(best);
    status.textContent = `Finished in ${formatTime(total)}.`;
  };

  // Input.
  const control = (event: KeyboardEvent) =>
    [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "KeyA",
      "KeyD",
      "KeyW",
      "KeyS",
      "Space",
      "ShiftLeft",
      "ShiftRight",
    ].includes(event.code);
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.target instanceof HTMLButtonElement && (event.code === "Space" || event.code === "Enter")) return;
      if (event.code === "Escape" || event.code === "KeyP") {
        if (state === "paused") resume();
        else pause();
        event.preventDefault();
        return;
      }
      if (event.code === "KeyR" && state !== "loading") {
        launch();
        return;
      }
      if (event.code === "Enter" && !panel.hidden) {
        startButton.click();
        event.preventDefault();
        return;
      }
      if (control(event)) {
        keys.add(event.code);
        event.preventDefault();
      }
    },
    { signal },
  );
  window.addEventListener("keyup", (event) => keys.delete(event.code), { signal });
  window.addEventListener(
    "blur",
    () => {
      keys.clear();
      pause();
    },
    { signal },
  );
  document.addEventListener("visibilitychange", () => document.hidden && pause(), { signal });

  startButton.addEventListener(
    "click",
    () => {
      if (state === "paused") resume();
      else launch();
    },
    { signal },
  );
  restartButton.addEventListener("click", launch, { signal });
  soundButton.addEventListener(
    "click",
    () => {
      soundOn = !soundOn;
      soundButton.textContent = soundOn ? "Sound: On" : "Sound: Off";
      soundButton.setAttribute("aria-pressed", String(soundOn));
      audio?.setEnabled(soundOn);
    },
    { signal },
  );
  invertButton.addEventListener(
    "click",
    () => {
      invert = !invert;
      write(INVERT_KEY, invert ? "1" : "0");
      invertButton.textContent = invert ? "Pitch: Inverted" : "Pitch: Normal";
      invertButton.setAttribute("aria-pressed", String(invert));
    },
    { signal },
  );
  invertButton.textContent = invert ? "Pitch: Inverted" : "Pitch: Normal";
  invertButton.setAttribute("aria-pressed", String(invert));

  // Touch: a thumb stick on the left, a boost button on the right.
  let stickPointer: number | null = null;
  const moveStick = (event: PointerEvent) => {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width / 2;
    stickInput.set((event.clientX - rect.left - radius) / radius, (event.clientY - rect.top - radius) / radius);
    if (stickInput.length() > 1) stickInput.normalize();
    knob.style.transform = `translate(${stickInput.x * radius * 0.6}px, ${stickInput.y * radius * 0.6}px)`;
  };
  const releaseStick = (event: PointerEvent) => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    stickInput.set(0, 0);
    knob.style.transform = "";
  };
  stick.addEventListener(
    "pointerdown",
    (event) => {
      stickPointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      moveStick(event);
      event.preventDefault();
    },
    { signal },
  );
  stick.addEventListener("pointermove", (event) => event.pointerId === stickPointer && moveStick(event), { signal });
  stick.addEventListener("pointerup", releaseStick, { signal });
  stick.addEventListener("pointercancel", releaseStick, { signal });
  const setBoost = (on: boolean) => () => {
    touchBoost = on;
    boostButton.classList.toggle("active", on);
  };
  boostButton.addEventListener("pointerdown", setBoost(true), { signal });
  boostButton.addEventListener("pointerup", setBoost(false), { signal });
  boostButton.addEventListener("pointercancel", setBoost(false), { signal });
  boostButton.addEventListener("pointerleave", setBoost(false), { signal });

  // Quality and sizing.
  let glowScale = 600;
  const resize = () => {
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    const ratio = Math.min(devicePixelRatio, quality === "high" ? 1.5 : 1);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    glowScale = (height * ratio) / 2;
    const size = Math.round(map.clientWidth * devicePixelRatio);
    map.width = map.height = size;
    mapBase = null;
  };
  const applyQuality = () => {
    bloom.enabled = true;
    bloom.strength = quality === "high" ? 0.24 : 0.2;
    if (world) {
      world.sun.castShadow = quality === "high";
      world.sun.shadow.mapSize.setScalar(4096);
    }
    qualityButton.textContent = quality === "high" ? "Graphics: High" : "Graphics: Low";
    resize();
  };
  qualityButton.addEventListener(
    "click",
    () => {
      quality = quality === "high" ? "low" : "high";
      write(QUALITY_KEY, quality);
      applyQuality();
    },
    { signal },
  );
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);

  // Course map: the whole line in plan view, drawn once, with the plane on top.
  let mapBase: HTMLCanvasElement | null = null;
  const bounds = course.points.reduce(
    (b, p) => ({
      x0: Math.min(b.x0, p.x),
      x1: Math.max(b.x1, p.x),
      z0: Math.min(b.z0, p.z),
      z1: Math.max(b.z1, p.z),
    }),
    { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
  );
  const toMap = (x: number, z: number, size: number) => {
    const span = Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) * 1.12;
    const scale = size / span;
    return [
      size / 2 + (x - (bounds.x0 + bounds.x1) / 2) * scale,
      size / 2 + (z - (bounds.z0 + bounds.z1) / 2) * scale,
    ] as const;
  };
  const drawMap = () => {
    const size = map.width;
    if (!size) return;
    const ctx = map.getContext("2d")!;
    if (!mapBase) {
      mapBase = document.createElement("canvas");
      mapBase.width = mapBase.height = size;
      const base = mapBase.getContext("2d")!;
      base.lineCap = base.lineJoin = "round";
      // The river, for orientation.
      const [, r0] = toMap(0, RIVER.z0, size);
      const [, r1] = toMap(0, RIVER.z1, size);
      base.fillStyle = "rgba(90, 150, 170, 0.35)";
      base.fillRect(0, r0, size, r1 - r0);
      base.strokeStyle = "rgba(255, 255, 255, 0.28)";
      base.lineWidth = size / 40;
      base.beginPath();
      course.points.forEach((p, i) => {
        const [x, y] = toMap(p.x, p.z, size);
        if (i % 6 === 0) base[i ? "lineTo" : "moveTo"](x, y);
      });
      base.stroke();
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(mapBase, 0, 0);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffcf75";
    ctx.lineWidth = size / 40;
    ctx.beginPath();
    for (let i = 0; i <= pathIndex; i += 6) {
      const p = course.points[i]!;
      const [x, y] = toMap(p.x, p.z, size);
      ctx[i ? "lineTo" : "moveTo"](x, y);
    }
    ctx.stroke();
    const finishPoint = gates?.finish.center;
    if (finishPoint) {
      const [fx, fy] = toMap(finishPoint.x, finishPoint.z, size);
      ctx.fillStyle = "#f4f2ee";
      ctx.beginPath();
      ctx.arc(fx, fy, size / 28, 0, Math.PI * 2);
      ctx.fill();
    }
    const [px, py] = toMap(plane.pos.x, plane.pos.z, size);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-plane.yaw);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#101418";
    ctx.lineWidth = size / 90;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.05);
    ctx.lineTo(size * 0.035, size * 0.035);
    ctx.lineTo(0, size * 0.015);
    ctx.lineTo(-size * 0.035, size * 0.035);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  // Main loop.
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const cameraGoal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let lastSection = "";
  let frame = 0;
  let last = performance.now();
  let time = 0;
  let tickCount = 0;

  const autopilot = (dt: number, speed: number, loopAt = Infinity) => {
    autopilotS += speed * dt;
    if (autopilotS > loopAt) autopilotS = 0;
    const tangent = course.tangentAt(autopilotS);
    course.at(autopilotS, plane.pos);
    const previousYaw = plane.yaw;
    setOrientation(tangent);
    const yawRate =
      Math.atan2(Math.sin(plane.yaw - previousYaw), Math.cos(plane.yaw - previousYaw)) / Math.max(dt, 1e-3);
    plane.roll +=
      (THREE.MathUtils.clamp(-yawRate / TURN_RATE, -MAX_ROLL, MAX_ROLL) - plane.roll) * (1 - Math.exp(-dt * 4));
    plane.speed = speed;
  };

  const fly = (dt: number) => {
    const left = keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0;
    const right = keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0;
    const upKey = keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0;
    const downKey = keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0;
    const turn = THREE.MathUtils.clamp(right - left + stickInput.x * 1.15, -1, 1);
    const climb = THREE.MathUtils.clamp((upKey - downKey - stickInput.y * 1.15) * (invert ? -1 : 1), -1, 1);
    const boosting = keys.has("Space") || keys.has("ShiftLeft") || keys.has("ShiftRight") || touchBoost;
    plane.roll += (turn * MAX_ROLL - plane.roll) * (1 - Math.exp(-dt * 5));
    plane.yaw -= plane.roll * TURN_RATE * dt;
    // With the stick centered, the nose settles onto the slope of the course instead of the horizon.
    const courseSlope = Math.asin(THREE.MathUtils.clamp(course.tangents[pathIndex]!.y, -1, 1));
    const pitchTarget = climb * MAX_PITCH + (1 - Math.abs(climb)) * courseSlope * 0.9;
    plane.pitch += (pitchTarget - plane.pitch) * (1 - Math.exp(-dt * 3.2));
    plane.boost += ((boosting ? 1 : 0) - plane.boost) * (1 - Math.exp(-dt * 3));
    const targetSpeed = boosting ? BOOST_SPEED : BASE_SPEED;
    plane.speed += (targetSpeed - plane.speed) * (1 - Math.exp(-dt * 1.6));
    updateForward();
    plane.pos.addScaledVector(forward, plane.speed * dt);
  };

  const checkCourse = (dt: number) => {
    if (!gates || !solids) return;
    pathIndex = course.nearest(plane.pos, pathIndex);
    const previousS = progressS;
    progressS = Math.max(progressS, course.distances[pathIndex]!);
    const away = plane.pos.distanceTo(course.points[pathIndex]!);
    const wrongWay = forward.dot(course.tangents[pathIndex]!) < 0.05;
    if (away > COURSE_RADIUS || wrongWay) offCourse += dt;
    else offCourse = Math.max(0, offCourse - dt * 2);

    // Gates are judged as the course line passes them.
    while (nextGate < gates.gates.length && gates.gates[nextGate]!.s <= progressS) {
      const gate = gates.gates[nextGate]!;
      if (gate === gates.finish) {
        if (previousS < gate.s && away <= COURSE_RADIUS) {
          gate.state = "hit";
          nextGate++;
          finish();
        }
        return;
      }
      tmp.subVectors(plane.pos, gate.center);
      tmp.addScaledVector(gate.normal, -tmp.dot(gate.normal));
      if (tmp.length() <= gate.radius + 0.6) {
        gate.state = "hit";
        hits++;
        audio?.gate();
      } else {
        gate.state = "missed";
        missed++;
        audio?.miss();
        showCallout(`Missed gate +${MISS_PENALTY}s`, 1, "bad");
      }
      nextGate++;
    }

    // Collisions: the ground or water, the river walls and every solid in the city.
    const floor = floorAt(plane.pos.z);
    const riverWall =
      overRiver(plane.pos.z) && plane.pos.y < 0.5 ? Math.min(plane.pos.z - RIVER.z0, RIVER.z1 - plane.pos.z) : Infinity;
    const nearest = solids.nearest(plane.pos, 10);
    const clearance = Math.min(nearest, riverWall, plane.pos.y - floor);
    if (clearance < HIT_RADIUS) {
      fail("crash");
      return;
    }
    proximity = THREE.MathUtils.clamp(1 - (clearance - HIT_RADIUS) / (9 - HIT_RADIUS), 0, 1);
    closeCooldown -= dt;
    if (Math.min(nearest, riverWall) < CLOSE_CALL && closeCooldown <= 0 && state === "flying") {
      closeCalls++;
      closeCooldown = 1.4;
      audio?.closeCall();
      showCallout("Close call!", 0.9, "good");
    }
    if (offCourse > OFF_COURSE_LIMIT) fail("offcourse");
  };

  const updateCamera = (dt: number) => {
    updateForward();
    if (state === "crashed" && failReason === "crash") {
      // Back away along the flight path, which is known to be clear, and watch the wreck.
      cameraGoal.copy(smoke.position).addScaledVector(forward, -34).addScaledVector(up, 7);
      camera.position.lerp(cameraGoal, 1 - Math.exp(-dt * 1.2));
      camera.lookAt(smoke.position);
      if (shake > 0.01) camera.position.add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(shake));
      return;
    }
    if (state === "finished") {
      orbit += dt * 0.25;
      cameraGoal.set(
        plane.pos.x + Math.sin(plane.yaw + 2.2 + orbit) * 22,
        plane.pos.y + 5,
        plane.pos.z + Math.cos(plane.yaw + 2.2 + orbit) * 22,
      );
      camera.position.lerp(cameraGoal, 1 - Math.exp(-dt * 1.5));
      camera.lookAt(plane.pos);
      return;
    }
    if (state === "ready") {
      // Title screen: a slow, low side angle on the jet cruising in over the bay.
      orbit += dt * 0.05;
      cameraGoal
        .copy(plane.pos)
        .addScaledVector(forward, -9 - Math.sin(orbit) * 4)
        .add(tmp.set(Math.cos(plane.yaw) * 11, 2.2, -Math.sin(plane.yaw) * 11));
      camera.position.lerp(cameraGoal, 1 - Math.exp(-dt * 3));
      lookTarget.copy(plane.pos).addScaledVector(forward, 30);
      camera.lookAt(lookTarget);
      camera.fov = 55;
      camera.updateProjectionMatrix();
      return;
    }
    const back = 12.5 + plane.boost * 3;
    cameraGoal.copy(plane.pos).addScaledVector(forward, -back).addScaledVector(up, 3.4);
    camera.position.lerp(cameraGoal, 1 - Math.exp(-dt * 7));
    lookTarget.copy(plane.pos).addScaledVector(forward, 22);
    camera.lookAt(lookTarget);
    camera.rotateZ(-plane.roll * 0.32);
    const jitter = shake * 0.4 + proximity * 0.18 + plane.boost * 0.05;
    if (jitter > 0.001) {
      camera.position.add(tmp.set((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, 0));
    }
    // Portrait screens get a taller view so the jet does not fill the frame.
    const portrait = Math.max(0, 1 - camera.aspect) * 28;
    const fov = 66 + portrait + ((plane.speed - BASE_SPEED) / (BOOST_SPEED - BASE_SPEED)) * 14 + proximity * 4;
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
  };

  const updateStreaks = (dt: number) => {
    const strength = state === "flying" || state === "countdown" ? Math.max(plane.boost * 0.5, proximity * 0.6) : 0;
    streakMaterial.opacity += (strength - streakMaterial.opacity) * (1 - Math.exp(-dt * 6));
    streaks.visible = streakMaterial.opacity > 0.01;
    if (!streaks.visible) return;
    const length = plane.speed * 0.05;
    streakSeeds.forEach((seed, i) => {
      seed.z += plane.speed * dt * 1.4;
      if (seed.z > 0) {
        seed.z = -90;
        seed.angle = Math.random() * Math.PI * 2;
        seed.radius = 3 + Math.random() * 9;
      }
      const x = Math.cos(seed.angle) * seed.radius,
        y = Math.sin(seed.angle) * seed.radius;
      streakPositions.set([x, y, seed.z, x, y, seed.z - length], i * 6);
    });
    streakGeometry.attributes.position!.needsUpdate = true;
  };

  const updatePointer = () => {
    const gate = gates?.gates[nextGate];
    if (!gate || (state !== "flying" && state !== "countdown")) {
      pointer.hidden = true;
      return;
    }
    tmp.copy(gate.center).project(camera);
    const behind = tmp2.subVectors(gate.center, camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) < 0;
    const onScreen = !behind && Math.abs(tmp.x) < 0.92 && Math.abs(tmp.y) < 0.88;
    pointer.hidden = onScreen;
    if (onScreen) return;
    let x = tmp.x,
      y = tmp.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const angle = Math.atan2(y, x);
    const edge = 0.82 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
    pointer.style.left = `${50 + Math.cos(angle) * edge * 50}%`;
    pointer.style.top = `${50 - Math.sin(angle) * edge * 50}%`;
    pointer.style.transform = `translate(-50%, -50%) rotate(${-angle}rad)`;
  };

  const updateHud = () => {
    const shown = state === "finished" ? elapsed + missed * MISS_PENALTY : elapsed;
    timeLabel.textContent = formatTime(shown);
    bestLabel.textContent = best ? `Best ${formatTime(best)}` : "Best —";
    progressBar.style.width = `${Math.min(100, (progressS / (gates?.finish.s ?? course.length)) * 100)}%`;
    const total = gates ? gates.gates.length - 1 : 0;
    gatesLabel.textContent = `${hits} / ${total} gates`;
    speedLabel.textContent = `${Math.round(plane.speed * 3.6)}`;
    altitudeLabel.textContent = `${Math.round(plane.pos.y - floorAt(plane.pos.z))}`;
    const section = sectionName(course.points[pathIndex]!);
    if (section !== lastSection) {
      lastSection = section;
      sectionLabel.textContent = section;
    }
    if (state === "flying" && offCourse > 0.05) {
      warning.hidden = false;
      warning.textContent = `Return to the course · ${Math.max(0, OFF_COURSE_LIMIT - offCourse).toFixed(1)}`;
    } else warning.hidden = true;
    danger.style.opacity = String(state === "flying" ? Math.min(1, offCourse / OFF_COURSE_LIMIT) * 0.9 : 0);
  };

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!world || !gates) return;
    time += dt;
    tickCount++;

    switch (state) {
      case "ready":
        autopilot(dt, 42, 700);
        break;
      case "countdown": {
        autopilot(dt, BASE_SPEED);
        const before = Math.ceil(countdown);
        countdown -= dt;
        const after = Math.ceil(countdown);
        if (after !== before && after > 0) {
          showCallout(String(after), 1);
          audio?.beep();
        }
        if (countdown <= 0) {
          state = "flying";
          pathIndex = course.nearest(plane.pos, Math.max(0, Math.round(autopilotS) - 20));
          showCallout("Go!", 0.9, "good");
          audio?.beep(true);
          status.textContent = "Go! Stay on the line of rings.";
        }
        break;
      }
      case "flying":
        elapsed += dt;
        fly(dt);
        checkCourse(dt);
        if (offCourse > 0.3 && state === "flying") {
          warnBeep -= dt;
          if (warnBeep <= 0) {
            audio?.warning();
            warnBeep = 0.5;
          }
        }
        break;
      case "finished":
        // Coast on, climbing gently out of the park.
        plane.roll *= Math.exp(-dt * 2);
        plane.pitch += (0.12 - plane.pitch) * (1 - Math.exp(-dt));
        plane.speed += (40 - plane.speed) * (1 - Math.exp(-dt));
        updateForward();
        plane.pos.addScaledVector(forward, plane.speed * dt);
        break;
      case "crashed":
        if (failReason === "offcourse") {
          updateForward();
          plane.pos.addScaledVector(forward, plane.speed * dt);
        }
        break;
      default:
        break;
    }

    if (state === "crashed" || state === "finished") {
      endTimer += dt;
      const wait = state === "finished" ? 2.6 : 1.9;
      if (endTimer > wait && panel.hidden) {
        if (state === "finished") {
          setPanel({
            kicker: "Course complete",
            title: formatTime(elapsed + missed * MISS_PENALTY),
            text: "Each missed gate adds two seconds. Boost on the straights and stay tight through the turns.",
            button: "Fly again",
            results: true,
          });
        } else {
          const percent = Math.round((progressS / gates.finish.s) * 100);
          setPanel({
            kicker: failReason === "crash" ? "Crashed" : "Off course",
            title: failReason === "crash" ? "Too close" : "Lost the line",
            text:
              failReason === "crash"
                ? `You made it ${percent}% of the way. Ease off the boost before the turns.`
                : `You made it ${percent}% of the way. Follow the rings; you have three seconds to get back when you stray.`,
            button: "Try again",
          });
        }
      }
    }

    if (smoke.visible) {
      const age = endTimer;
      fireball.scale.setScalar(4 + age * 22);
      fireballMaterial.opacity = Math.max(0, 1 - age / 0.9);
      fireball.visible = age < 0.9;
      smoke.scale.setScalar(6 + age * 14);
      smoke.position.y += dt * 4;
      smokeMaterial.opacity = Math.min(1, age * 4) * Math.max(0, 0.75 - age * 0.12);
    }
    flash.intensity *= Math.exp(-dt * 5);
    shake *= Math.exp(-dt * 3);
    if (calloutTimer > 0) {
      calloutTimer -= dt;
      if (calloutTimer <= 0) callout.classList.remove("pop");
    }

    placeAircraft();
    aircraft.update(time, plane.boost);
    if (aircraft.group.visible && state !== "paused") {
      aircraft.group.updateMatrixWorld();
      const left = aircraft.group.localToWorld(tmp.copy(aircraft.tips[0]));
      const right = aircraft.group.localToWorld(tmp2.copy(aircraft.tips[1]));
      trails.push(left, right, 0.08 + Math.abs(plane.roll) * 0.35 + plane.boost * 0.12 + proximity * 0.2);
    }

    if (state !== "paused") {
      updateCamera(dt);
      world.update(time, dt);
    }
    trails.update(camera);
    updateStreaks(state === "paused" ? 0 : dt);

    // Keep the shadow map centered just ahead of the plane, snapped to texels to avoid shimmer.
    const texel = (260 * 2) / 4096;
    world.sun.target.position.set(
      Math.round((plane.pos.x + forward.x * 110) / texel) * texel,
      0,
      Math.round((plane.pos.z + forward.z * 110) / texel) * texel,
    );
    world.sun.position.copy(world.sun.target.position).addScaledVector(SUN_DIRECTION, 1200);

    const pixelsPerRadian = glowScale / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    world.glowUniforms.uScale.value = pixelsPerRadian;
    gates.guideScale.value = pixelsPerRadian;
    gates.update(time, progressS, nextGate, dt);

    if (audio) {
      const flying = state === "flying" || state === "countdown";
      audio.setFlight(flying, (plane.speed - 30) / (BOOST_SPEED - 30), plane.boost, proximity);
    }
    if (state !== "flying") proximity *= Math.exp(-dt * 4);

    composer.render(dt);
    updatePointer();
    if (tickCount % 3 === 0) drawMap();
    if (tickCount % 4 === 0 || state === "flying") updateHud();
  };

  let disposed = false;
  applyQuality();

  // Build the city after the loading panel has painted.
  const build = async () => {
    const steps: [string, () => void][] = [
      ["Surveying the streets…", () => undefined],
      [
        "Raising the towers…",
        () => {
          city = createCity(course);
          scene.add(city.group);
        },
      ],
      [
        "Lighting the evening…",
        () => {
          world = createWorld(city!.beacons);
          scene.add(world.group);
          solids = new SolidIndex([...city!.solids, ...world.bridgeSolids]);
          gates = createGates(course, solids);
          scene.add(gates.group);
          // Image-based lighting from a copy of the sky without its sun disc.
          const envSky = new Sky();
          envSky.scale.setScalar(20000);
          for (const [name, uniform] of Object.entries(world.sky.material.uniforms)) {
            const value = uniform.value as unknown;
            envSky.material.uniforms[name]!.value = value instanceof THREE.Vector3 ? value.clone() : value;
          }
          envSky.material.uniforms.showSunDisc!.value = 0;
          const envScene = new THREE.Scene();
          envScene.add(envSky);
          const pmrem = new THREE.PMREMGenerator(renderer);
          envTarget = pmrem.fromScene(envScene, 0.02, 1, 30000);
          scene.environment = envTarget.texture;
          scene.environmentIntensity = 0.9;
          pmrem.dispose();
          envSky.geometry.dispose();
          envSky.material.dispose();
          applyQuality();
          resetFlight();
        },
      ],
    ];
    for (const [index, [label, step]] of steps.entries()) {
      panelText.textContent = label;
      loadBar.style.width = `${((index + 0.5) / steps.length) * 100}%`;
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (disposed) return;
      step();
    }
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      // Compilation will happen lazily on the first frame instead.
    }
    if (disposed) return;
    loadBar.style.width = "100%";
    state = "ready";
    root.classList.add("ready");
    startButton.disabled = false;
    setPanel({
      kicker: "Golden hour · 4 km course",
      title: "Skyline Flight",
      text: "Race a jet through the city at sunset: down Harbor Avenue, under the bridges of the river gorge, through the Sky Gate and around the Crown Plaza towers. Thread the rings and never leave the line.",
      button: "Take off",
    });
    status.textContent = "The city is ready. Press Take off.";
  };
  build().catch((error: unknown) => {
    console.error(error);
    panelTitle.textContent = "Could not build the city";
    panelText.textContent = "Please reload the page to try again.";
  });
  frame = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    events.abort();
    audio?.dispose();
    composer.dispose();
    target.dispose();
    envTarget?.dispose();
    city?.dispose();
    world?.dispose();
    gates?.dispose();
    aircraft.dispose();
    trails.dispose();
    streakGeometry.dispose();
    streakMaterial.dispose();
    fireballMaterial.dispose();
    smokeMaterial.dispose();
    fireballTexture.dispose();
    renderer.dispose();
  };
}

class SkylineFlight extends HTMLElement {
  private stop: (() => void) | null = null;
  connectedCallback() {
    this.stop = start(this);
  }
  disconnectedCallback() {
    this.stop?.();
    this.stop = null;
  }
}

if (!customElements.get("skyline-flight")) customElements.define("skyline-flight", SkylineFlight);
