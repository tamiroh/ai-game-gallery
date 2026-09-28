import * as THREE from 'three';
import { createCity } from './world';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

class CityWalk extends HTMLElement {
  private cleanup?: () => void;
  connectedCallback() {
    // Let the loading UI paint before generating the neighborhood.
    const frame = requestAnimationFrame(() => {
      if (!this.isConnected) return;
      void this.initialize().catch(error => {
        console.error('City initialization failed', error);
        this.querySelector<HTMLElement>('[data-message]')!.textContent = `The city could not load: ${error instanceof Error ? error.message : 'unknown error'}. Reload to try again.`;
      });
    });
    this.cleanup = () => cancelAnimationFrame(frame);
  }
  disconnectedCallback() { this.cleanup?.(); }
  private async initialize() {
    const canvas = this.querySelector<HTMLCanvasElement>('.world')!;
    const panel = this.querySelector<HTMLElement>('[data-panel]')!;
    const start = this.querySelector<HTMLButtonElement>('[data-start]')!;
    const message = this.querySelector<HTMLElement>('[data-message]')!;
    const autoButton = this.querySelector<HTMLButtonElement>('[data-auto]')!;
    const pauseButton = this.querySelector<HTMLButtonElement>('[data-pause]')!;
    const reticle = this.querySelector<HTMLElement>('[data-reticle]')!;
    const distanceLabel = this.querySelector<HTMLElement>('[data-distance]')!;
    const headingLabel = this.querySelector<HTMLElement>('[data-heading]')!;
    const streetLabel = this.querySelector<HTMLElement>('[data-street]')!;
    const soundButton = this.querySelector<HTMLButtonElement>('[data-sound]')!;
    const stick = this.querySelector<HTMLElement>('[data-stick]')!;
    const stickKnob = stick.querySelector<HTMLElement>('span')!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch { message.textContent = 'This walk needs WebGL. Please try a browser with hardware acceleration enabled.'; start.textContent = '3D unavailable'; return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .94;
    const city = await createCity(renderer);
    if (!this.isConnected) { city.dispose(); renderer.dispose(); return; }
    const camera = new THREE.PerspectiveCamera(65, 1, .08, 850);
    camera.rotation.order = 'YXZ';
    const signalController = new AbortController();
    const { signal } = signalController;
    const keys = new Set<string>();
    const coarse = matchMedia('(pointer: coarse)').matches;
    const composer = coarse ? null : new EffectComposer(renderer);
    const occlusion = composer ? new SSAOPass(city.scene, camera, 512, 512, 16) : null;
    const output = composer ? new OutputPass() : null;
    if (composer && occlusion && output) {
      composer.setPixelRatio(1); composer.renderTarget1.samples = 4; composer.renderTarget2.samples = 4;
      occlusion.kernelRadius = 10; occlusion.minDistance = .0005; occlusion.maxDistance = .025;
      composer.addPass(new RenderPass(city.scene, camera)); composer.addPass(occlusion); composer.addPass(output);
    }
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let autoWalk = false;
    let playing = false, yaw = -.18, pitch = -.025, x = -6.8, z = 35;
    let groundHeight = .22;
    let walked = 0, stride = 0, lastStep = 0, previous = performance.now(), animation = 0;
    let moveX = 0, moveY = 0, lookPointer: number | null = null, stickPointer: number | null = null;
    let lastLookX = 0, lastLookY = 0, sound = false;
    let audio: AudioContext | undefined;
    let ambience: GainNode | undefined;
    let noiseBuffer: AudioBuffer | undefined;
    let ambienceSource: AudioBufferSourceNode | undefined;
    function audioSetup() {
      if (audio) { void audio.resume(); return; }
      audio = new AudioContext();
      noiseBuffer = audio.createBuffer(1, audio.sampleRate * 3, audio.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < samples.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .025) / 1.025; samples[i] = brown * 4; }
      ambienceSource = audio.createBufferSource(); ambienceSource.buffer = noiseBuffer; ambienceSource.loop = true;
      const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 360;
      ambience = audio.createGain(); ambience.gain.value = .035;
      ambienceSource.connect(filter).connect(ambience).connect(audio.destination); ambienceSource.start();
    }
    function step() {
      if (!sound || !audio || !noiseBuffer) return;
      const source = audio.createBufferSource(); source.buffer = noiseBuffer;
      const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 750 + Math.random() * 400;
      const gain = audio.createGain(); gain.gain.setValueAtTime(.001, audio.currentTime); gain.gain.linearRampToValueAtTime(.18, audio.currentTime + .012); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .13);
      source.connect(filter).connect(gain).connect(audio.destination); source.start(0, Math.random(), .15);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    }
    function clearInput() { autoWalk = false; autoButton.setAttribute('aria-pressed', 'false'); autoButton.textContent = 'Auto walk'; keys.clear(); moveX = moveY = 0; stickPointer = lookPointer = null; stickKnob.style.transform = ''; }
    const setPlaying = (value: boolean) => {
      playing = value; panel.hidden = value; pauseButton.hidden = !value; autoButton.hidden = !value; reticle.hidden = !value;
      this.classList.toggle('playing', value); clearInput();
      if (ambience && audio) ambience.gain.setTargetAtTime(value && sound ? .035 : 0, audio.currentTime, .2);
      if (!value) {
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        start.innerHTML = 'Continue walking <span>↗</span>';
      }
    };
    function reset() { x = -6.8; z = 35; yaw = -.18; pitch = -.025; walked = stride = lastStep = 0; groundHeight = .22; clearInput(); distanceLabel.textContent = '0 m wandered'; headingLabel.textContent = 'N'; streetLabel.textContent = 'Westhaven'; }
    function look(dx: number, dy: number) { yaw -= dx * .0025; pitch = THREE.MathUtils.clamp(pitch - dy * .0025, -1.25, 1.25); }
    function blocked(nx: number, nz: number) {
      return city.obstacles.some(o => Math.abs(nx - o.x) < o.w / 2 + .28 && Math.abs(nz - o.z) < o.d / 2 + .28);
    }
    start.disabled = false; start.innerHTML = 'Begin your walk <span>↗</span>';
    start.addEventListener('click', () => {
      setPlaying(true); canvas.focus();
      if (sound) audioSetup();
      if (!coarse) {
        try { void canvas.requestPointerLock()?.catch(() => { message.textContent = 'Mouse capture is unavailable. Drag the view to look around.'; }); }
        catch { message.textContent = 'Drag the view to look around.'; }
      }
    }, { signal });
    const toggleAutoWalk = () => { autoWalk = !autoWalk; autoButton.setAttribute('aria-pressed', String(autoWalk)); autoButton.textContent = autoWalk ? 'Stop walking' : 'Auto walk'; };
    autoButton.addEventListener('click', toggleAutoWalk, { signal });
    pauseButton.addEventListener('click', () => setPlaying(false), { signal });
    this.querySelector('[data-reset]')!.addEventListener('click', reset, { signal });
    soundButton.addEventListener('click', () => {
      sound = !sound; soundButton.textContent = sound ? 'Sound on' : 'Sound off'; soundButton.setAttribute('aria-pressed', String(sound));
      if (sound) audioSetup();
      if (audio && ambience) ambience.gain.setTargetAtTime(sound && playing ? .035 : 0, audio.currentTime, .2);
    }, { signal });
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && playing) setPlaying(false); }, { signal });
    document.addEventListener('mousemove', event => { if (playing && document.pointerLockElement === canvas) look(event.movementX, event.movementY); }, { signal });
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape' && playing) setPlaying(false);
      if (!playing) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
      if (event.code === 'KeyR') reset();
      if (event.code === 'KeyF' && !event.repeat) toggleAutoWalk();
    }, { signal });
    window.addEventListener('keyup', event => keys.delete(event.code), { signal });
    window.addEventListener('blur', () => { if (playing) setPlaying(false); }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden && playing) setPlaying(false); }, { signal });
    canvas.addEventListener('pointerdown', event => {
      if (!playing || document.pointerLockElement === canvas) return;
      lookPointer = event.pointerId; lastLookX = event.clientX; lastLookY = event.clientY; canvas.setPointerCapture(event.pointerId);
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      if (event.pointerId !== lookPointer || !playing) return;
      look(event.clientX - lastLookX, event.clientY - lastLookY); lastLookX = event.clientX; lastLookY = event.clientY;
    }, { signal });
    const endLook = (event: PointerEvent) => { if (lookPointer === event.pointerId) lookPointer = null; };
    canvas.addEventListener('pointerup', endLook, { signal }); canvas.addEventListener('pointercancel', endLook, { signal });
    function updateStick(event: PointerEvent) {
      const rect = stick.getBoundingClientRect();
      moveX = (event.clientX - rect.left - rect.width / 2) / 36;
      moveY = (event.clientY - rect.top - rect.height / 2) / 36;
      const length = Math.hypot(moveX, moveY); if (length > 1) { moveX /= length; moveY /= length; }
      stickKnob.style.transform = `translate(${moveX * 30}px, ${moveY * 30}px)`;
    }
    stick.addEventListener('pointerdown', event => { if (!playing) return; event.preventDefault(); stickPointer = event.pointerId; stick.setPointerCapture(event.pointerId); updateStick(event); }, { signal });
    stick.addEventListener('pointermove', event => { if (stickPointer === event.pointerId) updateStick(event); }, { signal });
    const endStick = (event: PointerEvent) => { if (stickPointer === event.pointerId) { stickPointer = null; moveX = moveY = 0; stickKnob.style.transform = ''; } };
    stick.addEventListener('pointerup', endStick, { signal }); stick.addEventListener('pointercancel', endStick, { signal });
    const resize = new ResizeObserver(() => {
      const { width, height } = canvas.getBoundingClientRect();
      renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); composer?.setSize(width, height);
    }); resize.observe(canvas);
    function frame(now: number) {
      animation = requestAnimationFrame(frame);
      const dt = Math.min((now - previous) / 1000, .05); previous = now;
      if (document.hidden) return;
      const onSidewalk = Math.abs(x - Math.round(x / 44) * 44) > 6 && Math.abs(z - Math.round(z / 44) * 44) > 6 && Math.abs(x) < 88 && Math.abs(z) < 88;
      groundHeight += ((onSidewalk ? .22 : 0) - groundHeight) * Math.min(dt * 12, 1);
      if (playing) {
        let forward = Number(autoWalk || keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - moveY;
        let side = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + moveX;
        if (keys.has('ArrowLeft')) yaw += dt * 1.3;
        if (keys.has('ArrowRight')) yaw -= dt * 1.3;
        const length = Math.hypot(forward, side); if (length > 1) { forward /= length; side /= length; }
        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.4 : 1.75;
        const dx = (side * Math.cos(yaw) - forward * Math.sin(yaw)) * dt * speed;
        const dz = (-forward * Math.cos(yaw) - side * Math.sin(yaw)) * dt * speed;
        const oldX = x, oldZ = z;
        const nx = THREE.MathUtils.clamp(x + dx, -105, 105), nz = THREE.MathUtils.clamp(z + dz, -105, 105);
        if (!blocked(nx, z)) x = nx;
        if (!blocked(x, nz)) z = nz;
        const travelled = Math.hypot(x - oldX, z - oldZ); walked += travelled; stride += travelled * 7.3;
        if (autoWalk && travelled < .001) { autoWalk = false; autoButton.textContent = 'Auto walk'; autoButton.setAttribute('aria-pressed', 'false'); }
        if (walked - lastStep > .74) { step(); lastStep = walked; }
        distanceLabel.textContent = `${Math.floor(walked)} m wandered`;
        headingLabel.textContent = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE'][((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8]!;
        streetLabel.textContent = Math.abs(x) < 9 ? 'Westhaven Avenue' : Math.abs(z) < 9 ? 'Market Street' : x < -35 ? 'The Garden Quarter' : x > 35 ? 'East Village' : 'Westhaven';
        camera.position.y = 1.72 + groundHeight + (!reducedMotion && travelled > .001 ? Math.sin(stride) * .024 : 0);
      } else camera.position.y = 1.72 + groundHeight;
      camera.position.x = x; camera.position.z = z; camera.rotation.set(pitch, yaw, 0);
      city.updateSun(x, z);
      if (composer) composer.render(); else renderer.render(city.scene, camera);
    }
    animation = requestAnimationFrame(frame);
    const cleanup = () => {
      cancelAnimationFrame(animation); signalController.abort(); resize.disconnect();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      ambienceSource?.stop(); if (audio) void audio.close(); occlusion?.dispose(); output?.dispose(); composer?.dispose(); city.dispose(); renderer.dispose();
    };
    window.addEventListener('pagehide', event => { if (event.persisted) setPlaying(false); else cleanup(); }, { signal });
    this.cleanup = cleanup;
  }
}
if (!customElements.get('city-walk')) customElements.define('city-walk', CityWalk);
