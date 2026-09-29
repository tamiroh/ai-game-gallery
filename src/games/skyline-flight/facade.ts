import * as THREE from "three";

/** Facade styles understood by the building shader. */
export const enum Style {
  Glass = 0,
  Grid = 1,
  Stone = 2,
  Ribbon = 3,
  Balcony = 4,
  Trim = 5,
}

const VERTEX_HEAD = /* glsl */ `
attribute vec4 aStyle;
attribute vec3 aTint;
varying vec3 vBPos;
varying vec3 vBNormal;
varying vec4 vBStyle;
varying vec3 vBTint;
varying vec3 vBSize;
varying vec2 vBCenter;
varying float vBBase;
`;

const VERTEX_BODY = /* glsl */ `
vBPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
vBNormal = normal;
vBStyle = aStyle;
vBTint = aTint;
vBSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vec4 bOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
vBBase = bOrigin.y;
vBCenter = bOrigin.xz;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uWindowGlow;
varying vec3 vBPos;
varying vec3 vBNormal;
varying vec4 vBStyle;
varying vec3 vBTint;
varying vec3 vBSize;
varying vec2 vBCenter;
varying float vBBase;

float bHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float bNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), f.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 glassTint(float h) {
  if (h < 0.25) return vec3(0.09, 0.15, 0.17);
  if (h < 0.5) return vec3(0.08, 0.11, 0.18);
  if (h < 0.75) return vec3(0.17, 0.13, 0.09);
  return vec3(0.12, 0.13, 0.14);
}

// Soft rectangle (x0, x1, y0, y1) and its gradient; the softness doubles as the bevel of the frame.
float rectMask(vec2 f, vec4 r, vec2 b) {
  float sx = smoothstep(r.x - b.x, r.x + b.x, f.x) - smoothstep(r.y - b.x, r.y + b.x, f.x);
  float sy = smoothstep(r.z - b.y, r.z + b.y, f.y) - smoothstep(r.w - b.y, r.w + b.y, f.y);
  return sx * sy;
}
float dStep(float e0, float e1, float x) {
  float w = e1 - e0;
  float t = clamp((x - e0) / w, 0.0, 1.0);
  return 6.0 * t * (1.0 - t) / w;
}
vec2 rectGrad(vec2 f, vec4 r, vec2 b) {
  float sx = smoothstep(r.x - b.x, r.x + b.x, f.x) - smoothstep(r.y - b.x, r.y + b.x, f.x);
  float sy = smoothstep(r.z - b.y, r.z + b.y, f.y) - smoothstep(r.w - b.y, r.w + b.y, f.y);
  float dx = dStep(r.x - b.x, r.x + b.x, f.x) - dStep(r.y - b.x, r.y + b.x, f.x);
  float dy = dStep(r.z - b.y, r.z + b.y, f.y) - dStep(r.w - b.y, r.w + b.y, f.y);
  return vec2(dx * sy, sx * dy);
}

// A box-shaped room behind each window, ray traced from the glass (interior mapping).
vec3 roomLight(vec2 g, vec2 cell, vec3 rd, vec2 id, float seed, float on, vec3 lamp, bool shop) {
  vec3 p = vec3(clamp(g, 0.002, 0.998) * cell, 0.0);
  float r1 = bHash(id * 1.7 + seed);
  float r2 = bHash(id * 2.3 + seed * 3.0);
  float depth = shop ? 7.0 : 3.5 + 3.0 * r1;
  vec3 t3 = vec3(
    rd.x > 0.0 ? (cell.x - p.x) / rd.x : -p.x / min(rd.x, -1e-4),
    rd.y > 0.0 ? (cell.y - p.y) / rd.y : -p.y / min(rd.y, -1e-4),
    depth / max(rd.z, 1e-4)
  );
  float t = min(t3.x, min(t3.y, t3.z));
  vec3 h = p + rd * t;
  vec3 wallColor = mix(vec3(0.66, 0.6, 0.52), vec3(0.46, 0.52, 0.56), r1) * (0.8 + 0.3 * r2);
  vec3 color;
  float light;
  bool ceiling = false;
  if (t == t3.z) {
    color = wallColor;
    // Furniture and shelving against the back wall.
    float furniture = step(h.y, 0.8 + 0.5 * r2) * step(0.2, fract(h.x / 2.3 + r1));
    float shelf = step(1.6, h.y) * step(h.y, 2.2) * step(fract(h.x / 3.1 + r2), 0.35);
    color = mix(color, vec3(0.1, 0.08, 0.07), max(furniture * 0.85, shelf * 0.6));
    light = 0.75;
  } else if (t == t3.y) {
    ceiling = rd.y > 0.0;
    color = ceiling ? vec3(0.85) : mix(vec3(0.32, 0.22, 0.14), vec3(0.34, 0.35, 0.37), step(0.5, r2));
    light = ceiling ? 0.9 : 0.55;
  } else {
    color = wallColor * 0.85;
    light = 0.6;
  }
  float falloff = 1.0 / (1.0 + h.z * 0.14);
  vec3 lit = color * lamp * light * falloff * 1.5;
  if (ceiling) {
    vec2 q = abs(fract(h.xz / 2.4) - 0.5);
    lit += lamp * step(max(q.x, q.y), 0.18) * 2.2;
  }
  // Unlit rooms still catch a little daylight near the glass.
  vec3 day = color * vec3(0.055, 0.052, 0.05) * (0.35 + 0.65 * exp(-h.z * 0.35));
  return mix(day, lit * uWindowGlow, on);
}
`;

const SURFACE = /* glsl */ `
{
  vec3 bn = normalize(vBNormal);
  float seed = vBStyle.x;
  float style = vBStyle.y;
  float litRatio = vBStyle.z;
  vec3 glass = glassTint(vBStyle.w);
  float localY = vBPos.y - vBBase;
  vec3 viewW = normalize(cameraPosition - vBPos);
  vec3 up = vec3(0.0, 1.0, 0.0);
  float groundAO = mix(0.42, 1.0, smoothstep(-4.0, 40.0, vBPos.y));
  vec3 emit = vec3(0.0);
  vec3 nW = bn;
  vec3 base = vBTint;
  float rough = 0.85;
  float metal = 0.0;

  if (abs(bn.y) > 0.5) {
    vec2 rel = vBPos.xz - vBCenter;
    #ifdef ROUND
      float edge = vBSize.x * 0.5 - length(rel);
    #else
      float edge = min(vBSize.x * 0.5 - abs(rel.x), vBSize.z * 0.5 - abs(rel.y));
    #endif
    float kind = bHash(vec2(seed * 91.0, 3.0));
    float top = vBBase + vBSize.y;
    if (bn.y < 0.0) {
      base = vBTint * 0.32;
    } else if (style > 4.5) {
      base = vBTint * 0.85;
      rough = 0.6;
    } else {
      // Membrane roof with seams, grime and a lighter coping along the parapet.
      float grit = bNoise(vBPos.xz * 1.7) * 0.4 + bNoise(vBPos.xz * 0.21 + seed * 9.0) * 0.6;
      vec2 seam = abs(fract((vBPos.xz + seed * 20.0) / vec2(1.8, 9.0)) - 0.5);
      base = mix(vec3(0.27, 0.27, 0.27), vec3(0.43, 0.41, 0.38), grit) * (1.0 - 0.18 * step(0.47, seam.x));
      if (top < 48.0 && kind < 0.2) {
        base = mix(vec3(0.07, 0.13, 0.04), vec3(0.17, 0.23, 0.08), bNoise(vBPos.xz * 0.5));
        rough = 0.95;
      }
      if (top > 110.0 && kind > 0.7 && min(vBSize.x, vBSize.z) > 20.0) {
        float r = length(rel);
        float ring = 1.0 - smoothstep(0.25, 0.4, abs(r - 7.0));
        vec2 a = abs(rel);
        float letter = step(a.x, 2.6) * step(a.y, 3.6) * (step(1.9, a.x) + step(a.y, 0.4));
        base = mix(vec3(0.16, 0.17, 0.18), base, smoothstep(8.5, 9.0, r));
        base = mix(base, vec3(0.8, 0.78, 0.7), max(ring, min(letter, 1.0)));
      }
      base *= mix(0.62, 1.0, smoothstep(0.5, 2.2, edge));
      base = mix(vBTint * 0.9, base, smoothstep(0.35, 0.5, edge));
      rough = 0.9;
    }
  } else {
    vec3 tW = normalize(vec3(bn.z, 0.0, -bn.x));
    #ifdef ROUND
      vec2 rel = vBPos.xz - vBCenter;
      float u = -atan(rel.y, rel.x) * vBSize.x * 0.5;
    #else
      float u = dot(vBPos, tW);
    #endif
    u += seed * 53.0;
    // View direction in the wall's frame: x along the wall, y up, z out of the wall.
    vec3 vT = vec3(dot(viewW, tW), viewW.y, max(dot(viewW, bn), 0.06));

    bool shop = vBBase < 0.5 && localY < 5.6 && style < 4.5;
    vec2 cell = vec2(3.2, 3.4);
    vec4 win = vec4(0.3, 0.7, 0.24, 0.78);
    float depth = 0.24;
    float reflectivity = 0.35;
    if (shop) { cell = vec2(6.0, 5.6); win = vec4(0.05, 0.95, 0.06, 0.73); depth = 0.3; reflectivity = 0.2; }
    else if (style < 0.5) { cell = vec2(1.5, 3.9); win = vec4(0.04, 0.96, 0.25, 0.98); depth = 0.03; reflectivity = 0.6; }
    else if (style < 1.5) { cell = vec2(3.0, 3.9); win = vec4(0.19, 0.81, 0.27, 0.84); depth = 0.32; }
    else if (style < 2.5) { }
    else if (style < 3.5) { cell = vec2(1.8, 3.7); win = vec4(0.025, 0.975, 0.38, 0.88); depth = 0.3; reflectivity = 0.45; }
    else if (style < 4.5) { cell = vec2(4.2, 3.1); win = vec4(0.1, 0.9, 0.1, 0.93); depth = 1.2; reflectivity = 0.3; }
    else { cell = vec2(4.0, 0.6); win = vec4(-1.0); depth = 0.0; }

    vec2 c = vec2(u, localY) / cell;
    vec2 fw = max(fwidth(c), vec2(1e-4));
    float detail = 1.0 - smoothstep(0.12, 0.45, max(fw.x, fw.y));
    vec2 id = floor(c);
    vec2 f = fract(c);
    float solid = shop ? 0.0 : step(vBSize.y - 1.3, localY);
    if (!shop && style < 1.5 && vBSize.y > 90.0) solid = max(solid, step(15.0, mod(id.y, 16.0)));
    if (style > 4.5) solid = 1.0;
    float area = (win.y - win.x) * (win.w - win.z) * (1.0 - solid);

    vec2 bevel = max(vec2(0.07) / cell, fw * 0.75);
    float open = rectMask(f, win, bevel) * (1.0 - solid);
    vec2 slope = -depth * rectGrad(f, win, bevel) / cell * (1.0 - solid);

    // Relief that stands proud of the wall: piers, fins, sills, balcony slabs, rustication.
    float feature = 0.0;
    vec3 featureColor = vBTint;
    if (!shop && solid < 0.5) {
      if (style < 0.5 && seed > 0.45) {
        vec2 fin = vec2(fract(c.x * 0.5), f.y);
        vec4 r = vec4(0.47, 0.53, -1.0, 2.0);
        vec2 b = max(vec2(0.012, 0.1), fw);
        feature = rectMask(fin, r, b);
        slope += 0.12 * rectGrad(fin, r, b) / vec2(cell.x * 2.0, cell.y);
        featureColor = vBTint * 0.7;
      } else if (style > 0.5 && style < 1.5) {
        vec2 pier = vec2(fract(c.x + 0.5), f.y);
        vec4 r = vec4(0.4, 0.6, -1.0, 2.0);
        vec2 b = max(vec2(0.05 / cell.x, 0.1), fw);
        feature = rectMask(pier, r, b);
        slope += 0.18 * rectGrad(pier, r, b) / cell;
        featureColor = vBTint * 1.06;
      } else if (style > 1.5 && style < 2.5) {
        vec4 sill = vec4(0.26, 0.74, 0.18, 0.24);
        vec4 lintel = vec4(0.27, 0.73, 0.78, 0.85);
        vec2 b = max(vec2(0.04) / cell, fw);
        float s = rectMask(f, sill, b);
        float l = rectMask(f, lintel, b);
        feature = max(s, l);
        slope += 0.1 * (rectGrad(f, sill, b) + rectGrad(f, lintel, b)) / cell;
        featureColor = mix(vBTint, vec3(0.78, 0.74, 0.66), 0.75);
      } else if (style > 3.5) {
        vec4 slab = vec4(-1.0, 2.0, 0.0, 0.08);
        vec2 b = max(vec2(0.1, 0.03 / cell.y), fw);
        feature = rectMask(f, slab, b);
        slope += 1.2 * rectGrad(f, slab, b) / cell;
        featureColor = vec3(0.82, 0.8, 0.76);
      }
      // Rusticated base on masonry and framed buildings.
      if (vBBase < 0.5 && localY < 10.0 && style > 0.5 && style < 2.5) {
        float g = fract(localY / 0.75);
        slope.y += (dStep(0.0, 0.08, g) - dStep(0.08, 0.16, g)) * 0.015 / 0.75;
      }
    }
    slope *= detail;
    nW = normalize(bn - tW * slope.x - up * slope.y);

    // Parallax: find where the view ray meets the recessed glass. If it lands on the jamb instead, we see the reveal.
    vec2 g = f + (-vT.xy / vT.z) * depth / cell;
    float glassIn = rectMask(g, win, bevel);
    float reveal = open * (1.0 - glassIn) * detail;
    float pane = mix(area, open * mix(1.0, glassIn, detail), detail);
    vec3 revealNormal = g.x < win.x ? tW : g.x > win.y ? -tW : g.y < win.z ? up : -up;
    nW = normalize(mix(nW, revealNormal, reveal));

    // Lights: whole floors tend to be lit together; shops are always open.
    float h1 = bHash(id + seed * vec2(17.13, 5.71));
    float h2 = bHash(id.yx * 1.37 + seed * 3.1);
    float floorLit = bHash(vec2(id.y * 0.37, seed * 91.7));
    float on = shop ? 1.0 : step(h1, litRatio * (0.35 + 1.3 * floorLit * floorLit));
    vec3 lamp = mix(mix(vec3(1.0, 0.56, 0.24), vec3(1.0, 0.8, 0.52), h2), vec3(0.74, 0.85, 1.0), step(0.84, h2));
    lamp *= shop ? 1.25 : 0.45 + 0.8 * fract(h1 * 13.7);
    vec3 rd = vec3(-vT.x, -vT.y, vT.z);
    vec3 inside = roomLight(g, cell * vec2(1.0, shop ? 0.73 : 1.0), rd, id, seed, on, lamp, shop);
    // Blinds drawn part-way down some windows.
    float blindCut = win.w - (win.w - win.z) * bHash(id * 3.1 + seed) * 0.85;
    float blind = shop ? 0.0 : step(bHash(id * 5.3 + seed), 0.42) * step(blindCut, g.y);
    inside = mix(inside, vec3(0.72, 0.68, 0.6) * mix(vec3(0.05), lamp * 0.4 * uWindowGlow, on), blind);
    vec3 insideAverage = mix(vec3(0.02), vec3(0.9, 0.62, 0.34) * 0.6 * uWindowGlow, shop ? 1.0 : litRatio);
    inside = mix(insideAverage, inside, detail);

    // Wall surface: weathering streaks under the sills, darker grime near the street.
    float streak = bNoise(vec2(u * 1.3, localY * 0.05 + seed * 7.0));
    float underSill = step(f.y, win.z) * smoothstep(win.z - 0.25, win.z, f.y) * step(win.x, f.x) * step(f.x, win.y);
    vec3 wall = vBTint * (0.9 + 0.16 * bNoise(vec2(u * 0.35, localY * 0.35))) * (1.0 - 0.18 * underSill * streak * detail);
    if (style > 1.5 && style < 2.5) wall *= 0.88 + 0.22 * bHash(floor(vec2(u * 2.2, localY * 4.2)) + seed);
    if (style > 4.5) wall *= 1.0 - 0.25 * smoothstep(0.45, 0.5, abs(f.y - 0.5));
    wall = mix(wall, featureColor, feature);
    float wallRough = style < 0.5 ? 0.55 : style > 4.5 ? 0.6 : 0.82;
    float wallMetal = style < 0.5 ? 0.3 : 0.0;
    // Curtain walls hide their floor slabs behind opaque spandrel glass.
    if (style < 0.5 && !shop) {
      float spandrel = step(f.y, win.z) * step(win.x, f.x) * step(f.x, win.y) * (1.0 - solid);
      wall = mix(wall, glass * 0.7, spandrel);
      wallRough = mix(wallRough, 0.22, spandrel);
      wallMetal = mix(wallMetal, 0.6, spandrel);
    }
    vec3 revealColor = wall * 0.8;

    float panel = bHash(id * 0.71 + seed);
    base = mix(wall * groundAO, glass * 0.35, pane);
    base = mix(base, revealColor * groundAO, reveal);
    rough = mix(mix(wallRough, 0.05 + 0.09 * panel, pane), 0.8, reveal);
    metal = mix(mix(wallMetal, reflectivity, pane), 0.0, reveal);
    emit = inside * pane * (1.0 - reflectivity * 0.45);

    // Glass panes are never perfectly flat.
    vec3 wobble = (tW * (panel - 0.5) + up * (fract(panel * 7.3) - 0.5)) * 0.05 * pane * detail;
    nW = normalize(nW + wobble);

    if (shop) {
      float shopId = bHash(vec2(id.x, seed * 13.0));
      vec3 awning = shopId < 0.25 ? vec3(0.45, 0.08, 0.06) : shopId < 0.5 ? vec3(0.06, 0.2, 0.12) : shopId < 0.75 ? vec3(0.08, 0.1, 0.2) : vec3(0.75, 0.68, 0.55);
      float hasAwning = step(0.35, fract(shopId * 7.7));
      float awn = hasAwning * step(0.75, f.y) * step(f.y, 0.86) * step(0.04, f.x) * step(f.x, 0.96);
      float stripes = step(0.5, fract(f.x * 14.0));
      base = mix(base, awning * mix(1.0, 1.35, stripes * step(0.5, fract(shopId * 3.1))), awn);
      rough = mix(rough, 0.9, awn);
      metal = mix(metal, 0.0, awn);
      emit *= 1.0 - awn;
      nW = normalize(mix(nW, normalize(bn + up * 1.2), awn * detail));
      // Sign band with glowing lettering.
      float sign = step(0.86, f.y) * step(f.y, 0.98) * step(0.12, f.x) * step(f.x, 0.88);
      float letters = step(0.55, bNoise(vec2(u * 5.0, localY * 7.0))) * step(0.3, fract(f.x * 9.0));
      vec3 neon = mix(vec3(1.0, 0.45, 0.2), vec3(0.4, 0.9, 1.0), step(0.6, shopId)) * 1.6 * uWindowGlow;
      base = mix(base, vec3(0.05), sign);
      emit = mix(emit, neon * letters * detail + neon * 0.15 * (1.0 - detail), sign);
    }
  }
  diffuseColor.rgb = base;
  roughnessFactor = rough;
  metalnessFactor = metal;
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  totalEmissiveRadiance += emit;
}
`;

/** The building material: procedural facades with relief, reveals and lit interiors. */
export function facadeMaterial(glow: { value: number }, round = false) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  if (round) material.defines = { ROUND: "" };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindowGlow = glow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${SURFACE}`);
  };
  material.customProgramCacheKey = () => (round ? "skyline-facade-round" : "skyline-facade");
  return material;
}
