import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import brickUrl from "./assets/brick-Diffuse.jpg?url";
import asphaltUrl from "./assets/asphalt-Diffuse.jpg?url";
import asphaltNormalUrl from "./assets/asphalt-nor_gl.jpg?url";

export type Obstacle = { x: number; z: number; w: number; d: number };
let seed = 7521;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
function surfaceTexture(kind: "road" | "stone") {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = kind === "road" ? "#555957" : "#aaa79d";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 48000; i++) {
      const value = Math.floor(70 + random() * 130);
      ctx.fillStyle = `rgba(${value},${value},${value},${random() * 0.23})`;
      ctx.fillRect(random() * 512, random() * 512, 1 + random() * 2, 1 + random() * 2);
    }
    if (kind === "stone") {
      ctx.strokeStyle = "#787a7460";
      ctx.lineWidth = 2;
      for (let i = 0; i <= 512; i += 128) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "#252f302a";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        let x = random() * 512;
        let y = random() * 512;
        ctx.moveTo(x, y);
        for (let j = 0; j < 8; j++) {
          x += random() * 34 - 17;
          y += 12;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  });
}
function facade(color: string, floors: number, brick: boolean, brickImage: HTMLImageElement) {
  return canvasTexture(512, floors * 128, (ctx) => {
    const height = floors * 128;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, height);
    if (brick) {
      for (let y = 0; y < height; y += 128)
        for (let x = 0; x < 512; x += 128) ctx.drawImage(brickImage, x, y, 128, 128);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 512, height);
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = "#363e382c";
      ctx.lineWidth = 1;
      for (let y = 0; y < height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }
    }
    for (let row = 0; row < floors; row++)
      for (let col = 0; col < 4; col++) {
        const x = col * 128 + 29,
          y = row * 128 + 21;
        ctx.fillStyle = "#1b2426";
        ctx.fillRect(x - 4, y - 4, 78, 92);
        ctx.fillStyle = "#b0a28b";
        ctx.fillRect(x - 6, y + 87, 82, 5);
        const glass = ctx.createLinearGradient(x, y, x + 68, y + 80);
        glass.addColorStop(0, "#7d9194");
        glass.addColorStop(0.45, "#485d65");
        glass.addColorStop(1, "#26353b");
        ctx.fillStyle = glass;
        ctx.fillRect(x, y, 68, 82);
        for (let reflection = 0; reflection < 5; reflection++) {
          ctx.fillStyle = `rgba(15,30,37,${0.08 + random() * 0.23})`;
          ctx.fillRect(x + reflection * 14, y + 23 + random() * 25, 13, 36);
        }
        ctx.fillStyle = "#e8e0c218";
        ctx.fillRect(x + 4, y + 2, 6, 76);
        if (random() < 0.65) {
          ctx.fillStyle = random() > 0.2 ? "#b7b2a2" : "#d1bd91";
          ctx.fillRect(x + 2, y + 1, 64, 8 + random() * 45);
        }
        if (random() < 0.3) {
          ctx.fillStyle = "#ddba7666";
          ctx.fillRect(x + 3, y + 38, 27, 42);
        }
        ctx.fillStyle = "#343f3e";
        ctx.fillRect(x + 32, y, 3, 82);
        ctx.fillRect(x, y + 41, 68, 3);
        ctx.fillStyle = "#e4dbca66";
        ctx.fillRect(x, y, 1, 82);
      }
    for (let i = 0; i < 18000; i++) {
      ctx.fillStyle = `rgba(15,20,22,${random() * 0.08})`;
      ctx.fillRect(random() * 512, random() * height, 1, random() * 6);
    }
  });
}

export async function createCity(renderer: THREE.WebGLRenderer) {
  const brickImage = new Image();
  brickImage.src = brickUrl;
  const loader = new THREE.TextureLoader();
  const [asphaltPhoto, asphaltNormal] = await Promise.all([
    loader.loadAsync(asphaltUrl),
    loader.loadAsync(asphaltNormalUrl),
    brickImage.decode(),
  ]);
  seed = 7521;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#bdc8c9");
  scene.fog = new THREE.FogExp2("#bdc8c9", 0.0025);
  const sky = new Sky();
  sky.scale.setScalar(2000);
  sky.material.uniforms.turbidity!.value = 3.8;
  sky.material.uniforms.rayleigh!.value = 1.3;
  sky.material.uniforms.mieCoefficient!.value = 0.004;
  sky.material.uniforms.mieDirectionalG!.value = 0.82;
  const sunDirection = new THREE.Vector3(-0.65, 0.8, 0.45).normalize();
  sky.material.uniforms.sunPosition!.value.copy(sunDirection);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(scene, 0.035);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.12;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#d5e6f2", "#75614c", 0.5));
  const sun = new THREE.DirectionalLight("#ffe0b2", 3.7);
  sun.position.copy(sunDirection).multiplyScalar(100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -65;
  sun.shadow.camera.right = 65;
  sun.shadow.camera.top = 65;
  sun.shadow.camera.bottom = -65;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 230;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const obstacles: Obstacle[] = [];
  const batches = new Map<THREE.Material, THREE.Matrix4[]>();
  const dummy = new THREE.Object3D();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const geometries = new Set<THREE.BufferGeometry>();
  const material = (color: string, roughness = 0.85, metalness = 0) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(mat);
    return mat;
  };
  const textured = (texture: THREE.Texture, roughness = 0.85) => {
    textures.add(texture);
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness });
    materials.add(mat);
    return mat;
  };
  function box(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, rotation = 0) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat)!.push(dummy.matrix.clone());
  }
  const asphaltTex = asphaltPhoto;
  asphaltTex.colorSpace = THREE.SRGBColorSpace;
  asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
  asphaltTex.repeat.set(160, 160);
  const asphalt = textured(asphaltTex, 0.94);
  asphaltNormal.wrapS = asphaltNormal.wrapT = THREE.RepeatWrapping;
  asphaltNormal.repeat.copy(asphaltTex.repeat);
  asphalt.normalMap = asphaltNormal;
  asphalt.normalScale.set(0.5, 0.5);
  textures.add(asphaltNormal);
  box(0, -0.13, 0, 650, 0.2, 650, asphalt);
  const pavingTex = surfaceTexture("stone");
  pavingTex.wrapS = pavingTex.wrapT = THREE.RepeatWrapping;
  pavingTex.repeat.set(9, 9);
  const paving = textured(pavingTex);
  paving.bumpMap = pavingTex;
  paving.bumpScale = 0.018;
  const curb = material("#b6b3a7"),
    trim = material("#8f8a7b"),
    dark = material("#293234", 0.55, 0.5);
  const paint = material("#d5caa7"),
    white = material("#d9d5c8"),
    soil = material("#4b4838");
  const glass = textured(
    canvasTexture(512, 512, (ctx) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, "#53666c");
      gradient.addColorStop(0.45, "#2b3c3e");
      gradient.addColorStop(1, "#19272a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 512);
      for (let shelf = 0; shelf < 3; shelf++) {
        ctx.fillStyle = "#ae956044";
        ctx.fillRect(35, 260 + shelf * 68, 440, 5);
        for (let item = 0; item < 17; item++) {
          ctx.fillStyle = ["#ab9c7544", "#c5b08b33", "#65796d66"][item % 3]!;
          ctx.fillRect(40 + item * 25, 224 + shelf * 68, 12 + random() * 8, 35);
        }
      }
      ctx.fillStyle = "#b9c6c215";
      ctx.fillRect(0, 0, 190, 512);
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 3; col++) {
          ctx.fillStyle = "#bfd0cb19";
          ctx.fillRect(40 + col * 160, 20 + row * 105, 70, 65);
        }
      ctx.fillStyle = "#e9dec344";
      ctx.fillRect(80, 22, 140, 5);
      ctx.fillRect(300, 22, 140, 5);
    }),
    0.22,
  );
  glass.metalness = 0.28;
  const carGlass = material("#293d46", 0.15, 0.65),
    roof = material("#747b77");
  const warmWindow = new THREE.MeshStandardMaterial({
    color: "#c7b08a",
    emissive: "#db9b4e",
    emissiveIntensity: 0.3,
    roughness: 0.4,
  });
  materials.add(warmWindow);
  const buildingMats = ["#948775", "#a59d8b", "#826450", "#b8b5a6", "#736e64", "#9b745b"].map((c, i) =>
    textured(facade(c, 6, i % 3 !== 0, brickImage)),
  );
  const leafTexture = canvasTexture(256, 256, (ctx) => {
    for (let i = 0; i < 420; i++) {
      const angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * 112;
      const x = 128 + Math.cos(angle) * r,
        y = 128 + Math.sin(angle) * r;
      ctx.strokeStyle = "#605c36";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(128, 148);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = ["#6e783d", "#89904d", "#4b622f", "#a0a163"][i % 4]!;
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + random() * 4, 1.5 + random() * 2, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  textures.add(leafTexture);
  const leaves = ["#c0c399", "#a7b28b", "#d5ce9a"].map((color) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      map: leafTexture,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 1,
    });
    materials.add(mat);
    return mat;
  });
  const foliageMatrices: THREE.Matrix4[][] = [[], [], []];
  function tree(x: number, z: number) {
    box(x, 0.22, z, 2.3, 0.1, 2.3, soil);
    box(x, 2.4, z, 0.23, 4.8, 0.23, materialTrunk);
    for (let i = 0; i < 36; i++) {
      dummy.position.set(x + (random() - 0.5) * 3.9, 4.2 + random() * 2.7, z + (random() - 0.5) * 3.9);
      dummy.rotation.set(random(), random(), random());
      dummy.scale.set(2.3 + random(), 2.3 + random(), 1);
      dummy.updateMatrix();
      foliageMatrices[i % 3]!.push(dummy.matrix.clone());
    }
    obstacles.push({ x, z, w: 0.6, d: 0.6 });
  }
  const materialTrunk = material("#625747");
  const shopNames = [
    "CORNER COFFEE",
    "WEST & SONS",
    "THE BOOK ROOM",
    "STUDIO 04",
    "DAILY GOODS",
    "BOTANICA",
    "NEIGHBORHOOD",
    "BAKERY & DELI",
  ];
  const shopSigns = shopNames.map((name, i) =>
    textured(
      canvasTexture(1024, 128, (ctx) => {
        ctx.fillStyle = ["#294642", "#333a3b", "#6b5140", "#d0c3a8"][i % 4]!;
        ctx.fillRect(0, 0, 1024, 128);
        ctx.fillStyle = i % 4 === 3 ? "#323d3a" : "#e8dfc9";
        ctx.font = "500 44px Georgia";
        ctx.textAlign = "center";
        ctx.fillText(name, 512, 78);
        ctx.strokeStyle = "#e0d8c544";
        ctx.strokeRect(12, 12, 1000, 104);
      }),
    ),
  );
  const awnings = [material("#39554e"), material("#68594b"), material("#b4a58a")];
  const wood = material("#877054");
  const streetSign = textured(
    canvasTexture(512, 96, (ctx) => {
      ctx.fillStyle = "#27473e";
      ctx.fillRect(0, 0, 512, 96);
      ctx.strokeStyle = "#e1dfcb";
      ctx.strokeRect(5, 5, 502, 86);
      ctx.font = "30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#e1dfcb";
      ctx.fillText("WESTHAVEN AVE", 256, 59);
    }),
  );
  let buildingIndex = 0;
  for (let bx = -2; bx < 2; bx++)
    for (let bz = -2; bz < 2; bz++) {
      const cx = bx * 44 + 22,
        cz = bz * 44 + 22;
      box(cx, 0.045, cz, 32, 0.25, 32, curb);
      box(cx, 0.18, cz, 31.6, 0.08, 31.6, paving);
      for (const dx of [-7.4, 7.4])
        for (const dz of [-7.4, 7.4]) {
          const x = cx + dx,
            z = cz + dz,
            w = 12.2 + random(),
            d = 12.4 + random();
          const h = 18.5 + Math.floor(random() * 5) * 3.1;
          box(x, h / 2 + 3.4, z, w, h, d, buildingMats[buildingIndex % buildingMats.length]!);
          box(x, 1.8, z, w, 3.3, d, trim);
          box(x, h + 3.5, z, w + 0.5, 0.32, d + 0.5, trim);
          box(x, h + 3.72, z, w - 0.4, 0.12, d - 0.4, roof);
          box(x + 2, h + 4.3, z + 2, 2.4, 1.2, 2, roof);
          // Real geometry catches light along cornices, floors, and recessed shop fronts.
          for (let floor = 0; floor < 6; floor++) box(x, 3.4 + (floor * h) / 6, z, w + 0.16, 0.14, d + 0.16, trim);
          for (let face = 0; face < 4; face++) {
            const angle = (face * Math.PI) / 2;
            const width = face % 2 === 0 ? w : d;
            const depth = face % 2 === 0 ? d : w;
            function frontPart(
              dx: number,
              y: number,
              offset: number,
              pw: number,
              ph: number,
              pd: number,
              mat: THREE.Material,
            ) {
              const outward = depth / 2 + offset;
              box(
                x + dx * Math.cos(angle) + outward * Math.sin(angle),
                y,
                z - dx * Math.sin(angle) + outward * Math.cos(angle),
                pw,
                ph,
                pd,
                mat,
                angle,
              );
            }
            for (let floor = 0; floor < 6; floor++)
              for (let column = 0; column < 4; column++) {
                frontPart(
                  ((column + 0.49) * width) / 4 - width / 2,
                  3.4 + ((floor + 0.19) * h) / 6,
                  0.13,
                  width * 0.158,
                  0.12,
                  0.3,
                  trim,
                );
              }
            for (let j = -1; j <= 1; j++) {
              frontPart(j * 3.8, 1.65, 0.035, 3.3, 2.8, 0.09, glass);
              frontPart(j * 3.8, 1.62, 0.09, 0.06, 2.8, 0.06, dark);
              frontPart(j * 3.8, 0.54, 0.09, 3.3, 0.07, 0.06, dark);
              frontPart(j * 3.8 + 1.65, 1.65, 0.1, 0.09, 2.8, 0.09, dark);
              if (j === 0) frontPart(0.55, 1.35, 0.15, 0.04, 0.36, 0.07, trim);
            }
            frontPart(0, 3.05, 0.14, width - 0.5, 0.63, 0.16, shopSigns[buildingIndex % shopSigns.length]!);
            frontPart(0, 2.69, 0.64, width - 0.5, 0.12, 1.25, awnings[buildingIndex % 3]!);
            frontPart(0, 2.53, 1.23, width - 0.5, 0.28, 0.08, awnings[buildingIndex % 3]!);
          }
          if (buildingIndex % 3 === 0) {
            const side = x + w / 2 + 0.4;
            for (let floor = 1; floor < 5; floor++) {
              const y = 3.4 + (floor * h) / 6;
              box(side, y, z, 0.9, 0.1, 3.4, dark);
              for (const zz of [-1.6, 1.6]) box(side + 0.4, y + 0.5, z + zz, 0.06, 1, 0.06, dark);
              box(side + 0.4, y + 1, z, 0.06, 0.06, 3.4, dark);
              box(side + 0.45, y + h / 12, z + 1.1, 0.07, h / 6, 0.07, dark);
            }
          }
          obstacles.push({ x, z, w: w + 0.2, d: d + 0.2 });
          buildingIndex++;
        }
      for (const offset of [-10, 10]) {
        tree(cx + offset, cz - 14.6);
        tree(cx + offset, cz + 14.6);
        lamp(cx - 14.5, cz + offset);
        lamp(cx + 14.5, cz + offset);
      }
      box(cx - 14.8, 1.05, cz - 13.4, 0.6, 1.6, 0.6, dark);
      box(cx - 14.8, 1.9, cz - 13.4, 0.67, 0.1, 0.67, roof);
      box(cx + 14.6, 1.6, cz - 14.6, 0.075, 2.9, 0.075, dark);
      box(cx + 14.6, 2.8, cz - 14.6, 1.6, 0.32, 0.06, streetSign);
      bench(cx, cz - 14.2);
      bench(cx, cz + 14.2);
    }
  function lamp(x: number, z: number) {
    box(x, 2.8, z, 0.12, 5.4, 0.12, dark);
    box(x, 0.4, z, 0.3, 0.5, 0.3, dark);
    box(x + 0.5, 5.48, z, 1.12, 0.09, 0.12, dark);
    box(x + 0.95, 5.4, z, 0.5, 0.12, 0.3, warmWindow);
  }
  function bench(x: number, z: number) {
    for (let i = 0; i < 4; i++) box(x, 0.72, z + i * 0.14, 1.8, 0.07, 0.11, wood);
    for (let i = 0; i < 3; i++) box(x, 0.94 + i * 0.14, z + 0.5, 1.8, 0.09, 0.07, wood);
    for (const side of [-0.7, 0.7]) box(x + side, 0.42, z + 0.2, 0.07, 0.62, 0.48, dark);
    obstacles.push({ x, z: z + 0.2, w: 1.9, d: 0.7 });
  }
  // Painted lane dividers, stop bars, crosswalks and iron drains.
  for (let road = -88; road <= 88; road += 44) {
    for (let p = -106; p < 106; p += 5) {
      if (Math.abs(p - Math.round(p / 44) * 44) < 9) continue;
      for (const delta of [-0.12, 0.12]) {
        box(road + delta, -0.019, p, 0.08, 0.015, 2.5, paint);
        box(p, -0.019, road + delta, 2.5, 0.015, 0.08, paint);
      }
    }
    for (let crossing = -88; crossing <= 88; crossing += 44)
      for (const side of [-1, 1]) {
        for (let stripe = -4; stripe <= 4; stripe += 1.4) {
          box(road + stripe, -0.01, crossing + side * 8, 0.65, 0.02, 2.6, white);
          box(road + side * 8, -0.01, crossing + stripe, 2.6, 0.02, 0.65, white);
        }
        box(road + 3, -0.005, crossing + side * 10.3, 4.4, 0.015, 0.25, white);
        box(road + side * 5.6, 0.003, crossing + 13, 0.5, 0.03, 0.9, dark);
      }
  }
  const carPaints = ["#b9b7ad", "#283a44", "#787d76", "#633f36", "#d7d1bb"].map((c) => material(c, 0.29, 0.65));
  const tire = material("#242627", 0.96);
  const wheels: THREE.Matrix4[] = [];
  const hubs: THREE.Matrix4[] = [];
  function car(x: number, z: number, rotation: number, index: number) {
    function part(dx: number, y: number, dz: number, w: number, h: number, d: number, mat: THREE.Material) {
      box(
        x + dx * Math.cos(rotation) + dz * Math.sin(rotation),
        y,
        z - dx * Math.sin(rotation) + dz * Math.cos(rotation),
        w,
        h,
        d,
        mat,
        rotation,
      );
    }
    part(0, 0.62, 0, 1.8, 0.65, 4.4, carPaints[index % 5]!);
    part(0, 1.11, -0.12, 1.53, 0.61, 2.3, carGlass);
    part(0, 1.44, -0.12, 1.33, 0.1, 1.7, carPaints[index % 5]!);
    part(0, 1.13, -0.1, 1.61, 0.67, 0.09, carPaints[index % 5]!);
    part(0, 0.4, 2.21, 1.6, 0.12, 0.06, dark);
    part(0, 0.4, -2.21, 1.6, 0.12, 0.06, dark);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const dx = side * 0.87,
          dz = end * 1.35;
        dummy.position.set(
          x + dx * Math.cos(rotation) + dz * Math.sin(rotation),
          0.36,
          z - dx * Math.sin(rotation) + dz * Math.cos(rotation),
        );
        dummy.rotation.set(0, rotation, Math.PI / 2);
        dummy.scale.set(0.34, 0.22, 0.34);
        dummy.updateMatrix();
        wheels.push(dummy.matrix.clone());
        dummy.scale.set(0.21, 0.235, 0.21);
        dummy.updateMatrix();
        hubs.push(dummy.matrix.clone());
      }
      part(side * 0.6, 0.76, -2.22, 0.42, 0.16, 0.04, white);
      part(side * 0.6, 0.76, 2.22, 0.4, 0.13, 0.04, tailLight);
      part(side * 0.98, 1.05, -0.9, 0.22, 0.14, 0.23, dark);
    }
    obstacles.push({ x, z, w: rotation === 0 ? 2 : 4.6, d: rotation === 0 ? 4.6 : 2 });
  }
  const tailLight = material("#853d31", 0.35);
  for (let road = -88; road <= 88; road += 44)
    for (let block = -2; block < 2; block++) {
      car(road + 4.4, block * 44 + 18, 0, Math.abs(road + block));
      car(block * 44 + 27, road - 4.4, Math.PI / 2, Math.abs(road - block));
    }
  // Layered skyline beyond the walkable neighborhood.
  for (let i = 0; i < 90; i++) {
    const angle = random() * Math.PI * 2,
      radius = 145 + random() * 110,
      h = 25 + random() * 95;
    box(
      Math.cos(angle) * radius,
      h / 2,
      Math.sin(angle) * radius,
      12 + random() * 15,
      h,
      12 + random() * 15,
      buildingMats[i % 6]!,
    );
  }
  const cube = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(cube);
  const rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
  geometries.add(rounded);
  const cabin = new THREE.BoxGeometry(1, 1, 1);
  const cabinPositions = cabin.attributes.position!;
  for (let i = 0; i < cabinPositions.count; i++) {
    if (cabinPositions.getY(i) > 0) {
      cabinPositions.setX(i, cabinPositions.getX(i) * 0.85);
      cabinPositions.setZ(i, cabinPositions.getZ(i) * 0.73);
    }
  }
  cabin.computeVertexNormals();
  geometries.add(cabin);
  for (const [mat, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(
      mat === carGlass ? cabin : carPaints.includes(mat as THREE.MeshStandardMaterial) ? rounded : cube,
      mat,
      matrices.length,
    );
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = mat !== asphalt && mat !== paving;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  const wheelGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
  geometries.add(wheelGeometry);
  for (const [mat, matrices] of [
    [tire, wheels],
    [trim, hubs],
  ] as const) {
    const mesh = new THREE.InstancedMesh(wheelGeometry, mat, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  const leafGeometry = new THREE.PlaneGeometry(1, 1);
  geometries.add(leafGeometry);
  foliageMatrices.forEach((matrices, index) => {
    const mesh = new THREE.InstancedMesh(leafGeometry, leaves[index]!, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  });
  let shadowX = Infinity,
    shadowZ = Infinity;
  renderer.shadowMap.autoUpdate = false;
  return {
    scene,
    obstacles,
    updateSun(x: number, z: number) {
      const sx = Math.round(x / 4) * 4,
        sz = Math.round(z / 4) * 4;
      if (sx === shadowX && sz === shadowZ) return;
      shadowX = sx;
      shadowZ = sz;
      sun.target.position.set(sx, 0, sz);
      sun.position.copy(sunDirection).multiplyScalar(100).add(sun.target.position);
      renderer.shadowMap.needsUpdate = true;
    },
    dispose() {
      scene.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      environment.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      sun.shadow.dispose();
    },
  };
}
