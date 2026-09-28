import * as THREE from "three";
import type { SolidIndex } from "./city";
import type { Course } from "./course";
import { floorAt } from "./layout";

export interface Gate {
  s: number;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  radius: number;
  state: "ahead" | "hit" | "missed";
  fade: number;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

const GOLD = new THREE.Color(2.8, 1.75, 0.45);
const CYAN = new THREE.Color(0.35, 1.5, 2.2);
const RED = new THREE.Color(2.2, 0.25, 0.18);
const WHITE = new THREE.Color(2.4, 2.4, 2.3);

function bannerTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const cell = 32;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 1024; x += cell) {
      ctx.fillStyle = (x / cell + y / cell) % 2 ? "#111" : "#f4f2ee";
      ctx.fillRect(x, y, cell, cell);
    }
  }
  ctx.fillStyle = "#111";
  ctx.fillRect(64, 48, 896, 160);
  ctx.fillStyle = "#ffd27a";
  ctx.font = "700 120px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 132);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGates(course: Course, solids: SolidIndex) {
  const group = new THREE.Group();
  const gates: Gate[] = [];
  const disposables: { dispose(): void }[] = [];
  const zAxis = new THREE.Vector3(0, 0, 1);
  const finishS = course.length - 36;

  const clearance = (p: THREE.Vector3) => Math.min(solids.nearest(p, 14), p.y - floorAt(p.z));
  const geometries = new Map<number, [THREE.TorusGeometry, THREE.TorusGeometry]>();
  const geometryFor = (radius: number) => {
    const key = Math.round(radius * 4) / 4;
    let pair = geometries.get(key);
    if (!pair) {
      pair = [new THREE.TorusGeometry(key, 0.3, 10, 72), new THREE.TorusGeometry(key, 1.1, 8, 72)];
      disposables.push(...pair);
      geometries.set(key, pair);
    }
    return pair;
  };
  const addGate = (s: number, radius: number) => {
    const center = course.at(s);
    const normal = course.tangentAt(s);
    const [ringGeometry, haloGeometry] = geometryFor(radius);
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: CYAN, fog: true }));
    const halo = new THREE.Mesh(
      haloGeometry,
      new THREE.MeshBasicMaterial({
        color: CYAN,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    disposables.push(ring.material, halo.material);
    for (const mesh of [ring, halo]) {
      mesh.position.copy(center);
      mesh.quaternion.setFromUnitVectors(zAxis, normal);
      group.add(mesh);
    }
    gates.push({ s, center, normal, radius, state: "ahead", fade: 1, ring, halo });
  };

  for (let s = 250; s < finishS - 60; s += 85) {
    for (const offset of [0, 10, -10, 20, -20, 30]) {
      const p = course.at(s + offset);
      const radius = Math.min(8, clearance(p) - 1.2);
      if (radius >= 4) {
        addGate(s + offset, radius);
        break;
      }
    }
  }
  addGate(finishS, Math.min(14, clearance(course.at(finishS)) - 1));
  const finish = gates[gates.length - 1]!;

  // Checkered banner above the finish ring.
  const bannerMap = bannerTexture("FINISH");
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(finish.radius * 2.2, finish.radius * 0.55),
    new THREE.MeshBasicMaterial({ map: bannerMap, side: THREE.DoubleSide, color: new THREE.Color(1.3, 1.3, 1.3) }),
  );
  disposables.push(bannerMap, banner.geometry, banner.material);
  banner.position.copy(finish.center).add(new THREE.Vector3(0, finish.radius + 3.2, 0));
  banner.lookAt(banner.position.clone().sub(new THREE.Vector3(finish.normal.x, 0, finish.normal.z)));
  group.add(banner);

  // Guide dots tracing the line ahead of the player.
  const dots: number[] = [];
  const along: number[] = [];
  for (let s = 0; s < course.length; s += 9) {
    const p = course.at(s);
    dots.push(p.x, p.y, p.z);
    along.push(s);
  }
  const dotGeometry = new THREE.BufferGeometry();
  dotGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
  dotGeometry.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  const progress = { value: 0 };
  const dotMaterial = new THREE.ShaderMaterial({
    uniforms: { uProgress: progress, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float along;
      uniform float uProgress;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float ahead = along - uProgress;
        vAlpha = smoothstep(10.0, 40.0, ahead) * (1.0 - smoothstep(260.0, 520.0, ahead));
        gl_PointSize = clamp(0.9 * uScale / max(1.0, -mv.z), 1.5, 14.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float a = exp(-dot(p, p) * 3.5) * vAlpha;
        gl_FragColor = vec4(vec3(0.5, 1.6, 2.2) * a * 0.7, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  disposables.push(dotGeometry, dotMaterial);
  const guide = new THREE.Points(dotGeometry, dotMaterial);
  guide.frustumCulled = false;
  group.add(guide);

  return {
    group,
    gates,
    finish,
    guideScale: dotMaterial.uniforms.uScale!,
    reset() {
      for (const gate of gates) {
        gate.state = "ahead";
        gate.fade = 1;
      }
    },
    /** Updates colors: the next gate glows gold, the rest of the line cyan, and passed gates fade away. */
    update(time: number, s: number, next: number, dt: number) {
      progress.value = s;
      gates.forEach((gate, i) => {
        const isFinish = gate === finish;
        const ahead = gate.s - s;
        if (gate.state !== "ahead") gate.fade = Math.max(0, gate.fade - dt * (gate.state === "hit" ? 3.2 : 1.6));
        const visible = gate.state === "ahead" ? (ahead < 1400 ? 1 : 0) : gate.fade;
        gate.ring.visible = gate.halo.visible = visible > 0.01;
        if (!gate.ring.visible) return;
        let color = CYAN;
        let intensity = 0.55;
        let halo = 0.08;
        if (gate.state === "hit") {
          color = GOLD;
          intensity = gate.fade;
          halo = gate.fade * 0.15;
        } else if (gate.state === "missed") {
          color = RED;
          intensity = gate.fade;
          halo = gate.fade * 0.2;
        } else if (i === next) {
          color = isFinish ? WHITE : GOLD;
          intensity = 1 + Math.sin(time * 6) * 0.18;
          halo = 0.3 + Math.sin(time * 6) * 0.08;
        } else if (i <= next + 3) {
          intensity = 0.85;
          halo = 0.14;
        }
        if (isFinish && gate.state === "ahead") color = WHITE;
        gate.ring.material.color.copy(color).multiplyScalar(intensity);
        gate.halo.material.color.copy(color);
        gate.halo.material.opacity = halo;
      });
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}
