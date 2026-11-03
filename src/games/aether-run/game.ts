import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { COURSE_LENGTH, GAPS, SECTORS, center, elevation, heading, movingX } from "./course";
import { Flight, formatTime, rank, type Input, type Mode, type Phase } from "./simulation";
import { createWorld } from "./world";
import { FlightAudio } from "./audio";

type RecordEntry = { score: number; time: number; rank: string };
type Records = Partial<Record<Mode, RecordEntry>>;
const STORAGE_KEY = "aether-run-expedition-v2";
function readRecords(): Records {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const result: Records = {};
    for (const mode of ["expedition", "trial"] as const) {
      const r = raw[mode];
      if (
        r &&
        Number.isFinite(r.score) &&
        r.score >= 0 &&
        Number.isFinite(r.time) &&
        r.time > 0 &&
        typeof r.rank === "string"
      )
        result[mode] = { score: r.score, time: r.time, rank: r.rank.slice(0, 1) };
    }
    return result;
  } catch {
    return {};
  }
}
class AetherRun extends HTMLElement {
  private cleanup?: () => void;
  connectedCallback() {
    if (this.cleanup) return;
    const $ = <T extends HTMLElement = HTMLElement>(selector: string) => this.querySelector<T>(selector)!;
    const canvas = $<HTMLCanvasElement>("canvas.world");
    const panel = $("[data-panel]");
    const panelTitle = $("[data-panel-title]");
    const panelText = $("[data-panel-text]");
    const start = $<HTMLButtonElement>("[data-start]");
    const status = $("[data-status]"),
      result = $("[data-results]"),
      briefing = $("[data-briefing]"),
      modePicker = $("[data-modes]");
    const scoreEl = $("[data-score]"),
      hullEl = $("[data-hull]"),
      timeEl = $("[data-time]"),
      speedEl = $("[data-speed]"),
      energyEl = $("[data-energy]"),
      progressEl = $("[data-progress]"),
      comboEl = $("[data-combo]"),
      sectorEl = $("[data-sector]");
    const pauseButton = $<HTMLButtonElement>("[data-pause]"),
      soundButton = $<HTMLButtonElement>("[data-sound]"),
      qualityButton = $<HTMLButtonElement>("[data-quality]");
    const toast = $("[data-toast]"),
      banner = $("[data-banner]"),
      warning = $("[data-warning]"),
      countdown = $("[data-countdown]");
    const flight = new Flight(),
      audio = new FlightAudio(),
      input: Input = { steer: 0, boost: false, brake: false, targetX: null };
    const abort = new AbortController(),
      opts = { signal: abort.signal };
    const records = readRecords();
    let mode: Mode = "expedition",
      quality = window.innerWidth > 700;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch {
      panelText.textContent = "This flight needs WebGL. Please enable hardware acceleration or try another browser.";
      start.disabled = true;
      modePicker.hidden = true;
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality ? 1.75 : 1.25));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
    const world = createWorld(scene, flight.features);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.55, 1.15);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    let frame = 0,
      last = performance.now(),
      accumulator = 0,
      visualTime = 0,
      toastTime = 0,
      bannerTime = 0,
      shake = 0,
      lastPhase: Phase = "ready",
      pausedFrom: Phase = "running";
    let cameraReady = false,
      done = false,
      lastSecond = -1,
      exhaustTime = 0;
    const keys = new Set<string>(),
      heldPointers = new Map<number, string>();
    const cameraTarget = new THREE.Vector3(),
      cameraLook = new THREE.Vector3(),
      desiredLook = new THREE.Vector3(),
      effectPosition = new THREE.Vector3();
    function announce(text: string) {
      status.textContent = text;
    }
    function notice(text: string) {
      toast.textContent = text;
      toastTime = 1.9;
      toast.classList.add("show");
    }
    function sectorBanner() {
      banner.querySelector("span")!.textContent = `SECTOR 0${flight.sector + 1} / 03`;
      banner.querySelector("strong")!.textContent = SECTORS[flight.sector]!.name;
      banner.querySelector("small")!.textContent = SECTORS[flight.sector]!.subtitle;
      bannerTime = 4.2;
      banner.classList.add("show");
      announce(SECTORS[flight.sector]!.name);
    }
    function updateBest() {
      const best = records[mode];
      $("[data-best]").textContent = best
        ? `${best.score.toLocaleString()} pts · ${formatTime(best.time)}`
        : "Your first flight awaits";
    }
    function clearInput() {
      keys.clear();
      heldPointers.clear();
      input.steer = 0;
      input.boost = false;
      input.brake = false;
      input.targetX = null;
      thisElement.querySelectorAll("[data-hold]").forEach((el) => el.classList.remove("held"));
    }
    const thisElement = this;
    function begin() {
      clearInput();
      flight.reset(mode);
      world.reset();
      done = false;
      cameraReady = false;
      last = performance.now();
      accumulator = 0;
      shake = 0;
      toastTime = 0;
      toast.classList.remove("show");
      banner.classList.remove("show");
      bannerTime = 0;
      panel.hidden = true;
      pauseButton.disabled = false;
      pauseButton.textContent = "Ⅱ Pause";
      countdown.hidden = false;
      lastSecond = -1;
      void audio.unlock();
      announce("Flight countdown. Get ready.");
    }
    function pause() {
      if (flight.phase === "running" || flight.phase === "countdown") {
        pausedFrom = flight.phase;
        flight.phase = "paused";
        clearInput();
        panel.hidden = false;
        briefing.hidden = true;
        modePicker.hidden = true;
        result.hidden = true;
        panelTitle.textContent = "Take a breath.";
        panelText.textContent = "Your flight is paused. The sky can wait.";
        start.textContent = "Resume flight ↗";
        $("[data-panel-kicker]").textContent = "HOLDING PATTERN";
        pauseButton.textContent = "▶ Resume";
        countdown.hidden = true;
        announce("Flight paused.");
      } else if (flight.phase === "paused") {
        flight.phase = pausedFrom;
        panel.hidden = true;
        last = performance.now();
        accumulator = 0;
        pauseButton.textContent = "Ⅱ Pause";
        canvas.focus();
        void audio.unlock();
        announce("Flight resumed.");
      }
    }
    function results() {
      if (done) return;
      done = true;
      clearInput();
      const won = flight.phase === "won";
      const grade = won ? rank(flight.score) : "—";
      let personalBest = false;
      if (won) {
        const old = records[mode];
        personalBest = !old || flight.score > old.score;
        records[mode] = {
          score: Math.max(old?.score ?? 0, flight.score),
          time: Math.min(old?.time ?? Infinity, flight.elapsed),
          rank: personalBest ? grade : old!.rank,
        };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch {
          /* Flight remains playable without storage. */
        }
      }
      panel.hidden = false;
      briefing.hidden = true;
      modePicker.hidden = true;
      result.hidden = false;
      panelTitle.textContent = won ? "You found the sun." : "The sky is calling.";
      panelText.textContent = won
        ? personalBest
          ? "A new personal best. Take the long way home again."
          : "Expedition complete. There is always a cleaner line."
        : "Your recovery drone brought you home. Brake before tight turns, and follow the crystal trails.";
      $("[data-panel-kicker]").textContent = won ? "EXPEDITION COMPLETE" : "FLIGHT RECOVERED";
      $("[data-r-rank]").textContent = grade;
      $("[data-r-score]").textContent = flight.score.toLocaleString();
      $("[data-r-time]").textContent = formatTime(flight.elapsed);
      $("[data-r-crystals]").textContent = String(flight.crystals);
      $("[data-r-rings]").textContent = `${flight.rings} / ${flight.features.filter((f) => f.kind === "ring").length}`;
      $("[data-r-chain]").textContent = `${flight.maxCombo} chain`;
      start.textContent = "Fly again ↗";
      $("[data-change]").hidden = false;
      pauseButton.disabled = true;
      countdown.hidden = true;
      warning.hidden = true;
      updateBest();
      announce(
        won
          ? `Flight complete. Rank ${grade}. ${flight.score} points.`
          : `Flight ended. ${flight.score} points. Try again.`,
      );
      start.focus({ preventScroll: true });
    }
    function showBriefing() {
      clearInput();
      flight.reset(mode);
      flight.phase = "ready";
      world.reset();
      flight.s = 0;
      flight.x = 0;
      flight.height = 0;
      flight.speed = 0;
      world.ship.visible = true;
      panel.hidden = false;
      briefing.hidden = false;
      modePicker.hidden = false;
      result.hidden = true;
      $("[data-change]").hidden = true;
      panelTitle.textContent = "Take the skyway.";
      panelText.textContent = "A hovercraft. Three forgotten worlds. One luminous line through the clouds.";
      $("[data-panel-kicker]").textContent = "AETHER EXPEDITION / AE—01";
      start.textContent = "Begin expedition ↗";
      pauseButton.disabled = true;
      updateBest();
    }
    start.addEventListener(
      "click",
      () => {
        if (flight.phase === "paused") pause();
        else begin();
      },
      opts,
    );
    $("[data-change]").addEventListener("click", showBriefing, opts);
    this.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) =>
      button.addEventListener(
        "click",
        () => {
          mode = button.dataset.mode as Mode;
          this.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
          $("[data-mode-help]").textContent =
            mode === "expedition"
              ? "5 hull · automatic gap jumps · learn the route"
              : "3 hull · manual jumps · chase a perfect run";
          flight.mode = mode;
          flight.hull = flight.maxHull;
          updateBest();
        },
        opts,
      ),
    );
    pauseButton.addEventListener("click", pause, opts);
    $("[data-touch-pause]").addEventListener("click", pause, opts);
    $("[data-exit-fullscreen]").addEventListener(
      "click",
      () => {
        if (document.fullscreenElement) void document.exitFullscreen();
      },
      opts,
    );
    $("[data-restart]").addEventListener("click", begin, opts);
    soundButton.addEventListener(
      "click",
      () => {
        audio.enabled = !audio.enabled;
        soundButton.setAttribute("aria-pressed", String(audio.enabled));
        soundButton.textContent = `Sound ${audio.enabled ? "on" : "off"}`;
        if (audio.enabled) void audio.unlock();
      },
      opts,
    );
    qualityButton.textContent = `Detail ${quality ? "high" : "low"}`;
    qualityButton.addEventListener(
      "click",
      () => {
        quality = !quality;
        renderer.setPixelRatio(Math.min(devicePixelRatio, quality ? 1.75 : 1.25));
        qualityButton.textContent = `Detail ${quality ? "high" : "low"}`;
        resize();
      },
      opts,
    );
    const viewport = $("[data-viewport]");
    $("[data-fullscreen]").addEventListener(
      "click",
      () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else if (viewport.requestFullscreen)
          void viewport.requestFullscreen().catch(() => notice("Fullscreen is unavailable"));
        else notice("Fullscreen is unavailable");
      },
      opts,
    );
    const controlKeys = [
      "arrowleft",
      "arrowright",
      "arrowup",
      "arrowdown",
      "a",
      "d",
      "w",
      "s",
      "shift",
      " ",
      "p",
      "escape",
      "r",
    ];
    this.addEventListener(
      "keydown",
      (event) => {
        const key = event.key.toLowerCase();
        if (!controlKeys.includes(key)) return;
        if (event.target instanceof HTMLButtonElement && key === " ") return;
        event.preventDefault();
        if (event.repeat) return;
        if (key === "p" || key === "escape") {
          pause();
          return;
        }
        if (key === "r") {
          begin();
          return;
        }
        if (key === " ") {
          if (flight.phase === "ready" || flight.phase === "won" || flight.phase === "lost") begin();
          else if (flight.phase === "paused") pause();
          else flight.jump();
          return;
        }
        keys.add(key);
      },
      opts,
    );
    window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()), opts);
    window.addEventListener(
      "blur",
      () => {
        if (flight.phase === "running" || flight.phase === "countdown") pause();
        clearInput();
      },
      opts,
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden && (flight.phase === "running" || flight.phase === "countdown")) pause();
        last = performance.now();
      },
      opts,
    );
    this.querySelectorAll<HTMLButtonElement>("[data-hold]").forEach((button) => {
      button.addEventListener(
        "pointerdown",
        (event) => {
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          heldPointers.set(event.pointerId, button.dataset.hold!);
          button.classList.add("held");
        },
        opts,
      );
      const release = (event: PointerEvent) => {
        heldPointers.delete(event.pointerId);
        button.classList.remove("held");
      };
      button.addEventListener("pointerup", release, opts);
      button.addEventListener("pointercancel", release, opts);
      button.addEventListener("lostpointercapture", release, opts);
    });
    $("[data-jump]").addEventListener(
      "pointerdown",
      (event) => {
        event.preventDefault();
        flight.jump();
      },
      opts,
    );
    $("[data-jump]").addEventListener(
      "click",
      (event) => {
        if (event.detail === 0) flight.jump();
      },
      opts,
    );
    let dragPointer: number | null = null;
    const setTarget = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      input.targetX = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width - 0.5) * 13, -5.4, 5.4);
    };
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (flight.phase !== "running") return;
        canvas.focus();
        dragPointer = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
        setTarget(event);
      },
      opts,
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId === dragPointer) setTarget(event);
      },
      opts,
    );
    const releaseDrag = (event: PointerEvent) => {
      if (event.pointerId === dragPointer) {
        dragPointer = null;
        input.targetX = null;
      }
    };
    canvas.addEventListener("pointerup", releaseDrag, opts);
    canvas.addEventListener("pointercancel", releaseDrag, opts);
    canvas.addEventListener("lostpointercapture", releaseDrag, opts);
    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    function processEvents() {
      for (const event of flight.events) {
        if (event.feature) {
          const f = event.feature;
          effectPosition.set(center(f.s) + movingX(f, flight.elapsed), elevation(f.s) + f.y, -f.s);
        } else effectPosition.copy(world.ship.position);
        if (event.kind === "crystal") {
          world.emit(effectPosition, 0x85ffdc, 9, 3);
          audio.cue("crystal", flight.combo);
        } else if (event.kind === "ring") {
          world.emit(effectPosition, 0xffd99b, 45, 8);
          audio.cue("ring");
          notice(`GATE +${200 * flight.multiplier} · ENERGY +30`);
        } else if (event.kind === "near") {
          notice(`CLOSE CALL +${75 * flight.multiplier}`);
        } else if (event.kind === "hit") {
          shake = 1;
          world.emit(effectPosition, 0xff9b71, 55, 10);
          audio.cue("hit");
          notice(event.text!);
          announce(event.text!);
        } else if (event.kind === "jump") {
          audio.cue("jump");
          world.emit(effectPosition, 0xa1ffe8, 18, 5);
        } else if (event.kind === "repair") {
          audio.cue("repair");
          world.emit(effectPosition, 0xbaffb3, 35, 6);
          notice("REPAIR DRONE · HULL +1");
          announce("Repair drone collected. Hull restored.");
        } else if (event.kind === "pad") {
          notice("SLIPSTREAM · FREE BOOST");
        } else if (event.kind === "sector") {
          audio.cue("sector");
          sectorBanner();
        } else if (event.kind === "finish") {
          audio.cue("finish");
          world.emit(effectPosition, 0xffe5ad, 100, 14);
        }
      }
      flight.events = [];
    }
    function updateHUD() {
      scoreEl.textContent = flight.score.toLocaleString().padStart(5, "0");
      timeEl.textContent = formatTime(flight.elapsed);
      speedEl.textContent = String(Math.round(flight.speed * 6));
      energyEl.style.transform = `scaleX(${flight.energy / 100})`;
      energyEl.parentElement!.setAttribute("aria-valuenow", String(Math.round(flight.energy)));
      hullEl.textContent = "● ".repeat(flight.hull) + "○ ".repeat(flight.maxHull - flight.hull);
      hullEl.setAttribute("aria-label", `${flight.hull} of ${flight.maxHull} hull`);
      progressEl.style.transform = `scaleX(${flight.s / COURSE_LENGTH})`;
      sectorEl.textContent = `0${flight.sector + 1} / ${SECTORS[flight.sector]!.short}`;
      comboEl.textContent = flight.combo > 1 ? `×${flight.multiplier} · ${flight.combo} CHAIN` : "";
      $<HTMLElement>("[data-distance]").textContent =
        `${Math.max(0, (COURSE_LENGTH - flight.s) / 1000).toFixed(1)} km to sunward`;
      thisElement.classList.toggle("boosting", flight.boosting && !reducedMotion);
      thisElement.classList.toggle("damaged", shake > 0.5);
      const gap = GAPS.find((g) => g.start > flight.s - 2 && g.start < flight.s + 80);
      warning.hidden = !(gap && flight.phase === "running");
      if (gap) {
        warning.textContent = `${mode === "expedition" ? "AUTO JUMP" : "JUMP AT EDGE"} · ${Math.max(0, Math.round(gap.start - flight.s))} m`;
        warning.classList.toggle("urgent", gap.start - flight.s < 22);
      }
      if (flight.phase === "countdown") {
        const second = Math.ceil(flight.countdown);
        countdown.hidden = false;
        if (lastSecond !== second) {
          countdown.textContent = String(second);
          lastSecond = second;
          audio.cue("crystal", second);
        }
      } else if (lastPhase === "countdown" && flight.phase === "running") {
        countdown.hidden = true;
        sectorBanner();
        notice("FOLLOW THE CRYSTALS");
      }
    }
    function animate(now: number) {
      frame = requestAnimationFrame(animate);
      const dt = document.hidden ? 0 : Math.min((now - last) / 1000, 0.08);
      last = now;
      visualTime += dt;
      const holds = [...heldPointers.values()];
      input.steer =
        (keys.has("arrowright") || keys.has("d") || holds.includes("right") ? 1 : 0) -
        (keys.has("arrowleft") || keys.has("a") || holds.includes("left") ? 1 : 0);
      input.boost = keys.has("shift") || keys.has("w") || keys.has("arrowup") || holds.includes("boost");
      input.brake = keys.has("s") || keys.has("arrowdown") || holds.includes("brake");
      const before = flight.phase;
      accumulator += dt;
      while (accumulator >= 1 / 120) {
        flight.step(1 / 120, input);
        accumulator -= 1 / 120;
      }
      processEvents();
      if ((flight.phase === "won" || flight.phase === "lost") && !done) results();
      const isActive = flight.phase === "running";
      const s = flight.s,
        ship = world.ship;
      ship.position.set(center(s) + flight.x, elevation(s) + 0.85 + flight.height, -s);
      ship.rotation.y = heading(s) - flight.vx * 0.015;
      ship.rotation.z = THREE.MathUtils.damp(ship.rotation.z, -flight.vx * 0.035, 8, dt);
      ship.rotation.x = THREE.MathUtils.damp(
        ship.rotation.x,
        (elevation(s + 1) - elevation(s - 1)) * 0.5 + flight.vy * 0.01,
        5,
        dt,
      );
      ship.visible = flight.invincible <= 0 || Math.floor(flight.invincible * 12) % 2 === 0;
      world.shield.visible = flight.invincible > 0;
      if (flight.phase === "ready") {
        ship.position.y += Math.sin(visualTime * 1.8) * 0.09;
        ship.rotation.z = Math.sin(visualTime) * 0.025;
      }
      shake = Math.max(0, shake - dt * 1.6);
      const bob = reducedMotion ? 0 : Math.sin(visualTime * 2) * 0.035;
      const portrait = camera.aspect < 0.85;
      const followDistance = portrait ? 18 : 11.5;
      cameraTarget.set(
        center(s - followDistance) + flight.x * 0.48,
        elevation(s) + (portrait ? 7.3 : 5.6) + Math.max(0, flight.height) * 0.35 + bob,
        -s + followDistance + (flight.boosting ? 1.5 : 0),
      );
      desiredLook.set(center(s + 20) + flight.x * 0.2, elevation(s + 15) + 1.1, -s - 23);
      if (!cameraReady) {
        camera.position.copy(cameraTarget);
        cameraLook.copy(desiredLook);
        cameraReady = true;
      } else {
        camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 5));
        cameraLook.lerp(desiredLook, 1 - Math.exp(-dt * 6));
      }
      if (shake > 0 && !reducedMotion) {
        camera.position.x += Math.sin(visualTime * 83) * shake * 0.1;
        camera.position.y += Math.cos(visualTime * 67) * shake * 0.07;
      }
      camera.lookAt(cameraLook);
      const desiredFov = reducedMotion ? 62 : flight.boosting ? 72 : 62;
      camera.fov = THREE.MathUtils.damp(camera.fov, desiredFov, 3, dt);
      camera.updateProjectionMatrix();
      world.update(s, flight.elapsed + visualTime * 0.05, dt, flight.boosting, flight.height, quality);
      for (const view of world.views) {
        if (view.feature.kind === "sweeper")
          view.root.position.x = center(view.feature.s) + movingX(view.feature, flight.elapsed);
        view.root.userData.collected =
          flight.consumed.has(view.feature.id) && !["block", "sweeper", "pad"].includes(view.feature.kind);
        if (view.root.userData.collected) view.root.visible = false;
      }
      exhaustTime += dt;
      if (isActive && exhaustTime > 0.035) {
        exhaustTime = 0;
        effectPosition.copy(ship.position).add(new THREE.Vector3(0, -0.05, 1.7));
        world.emit(effectPosition, flight.boosting ? 0xffd7a1 : 0x6dffe3, flight.boosting ? 5 : 2, 0.3);
      }
      toastTime -= dt;
      if (toastTime <= 0) toast.classList.remove("show");
      bannerTime -= dt;
      if (bannerTime <= 0) banner.classList.remove("show");
      lastPhase = before;
      updateHUD();
      audio.update(isActive, flight.speed, flight.boosting);
      if (quality) composer.render();
      else renderer.render(scene, camera);
    }
    showBriefing();
    frame = requestAnimationFrame(animate);
    this.cleanup = () => {
      abort.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      audio.dispose();
      world.dispose();
      composer.dispose();
      for (const pass of composer.passes) pass.dispose();
      renderer.dispose();
      this.cleanup = undefined;
    };
  }
  disconnectedCallback() {
    this.cleanup?.();
  }
}
if (!customElements.get("aether-run")) customElements.define("aether-run", AetherRun);
