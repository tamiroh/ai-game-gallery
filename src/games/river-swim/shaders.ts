// GLSL snippets injected into MeshStandardMaterial to paint procedural surfaces.
export type ShaderPatch = {
  vertexHead?: string;
  afterBegin?: string;
  afterProject?: string;
  fragmentHead?: string;
  afterMap?: string;
  afterRoughness?: string;
  afterNormal?: string;
};

const varyings = /* glsl */ `
varying vec3 vRsWorld;
varying vec3 vRsLocal;
varying vec3 vRsWorldNormal;
varying vec3 vRsLocalNormal;
`;

const passVaryings = /* glsl */ `
vec4 rsPosition = vec4(transformed, 1.0);
mat3 rsNormalMatrix = mat3(modelMatrix);
#ifdef USE_INSTANCING
  rsPosition = instanceMatrix * rsPosition;
  rsNormalMatrix = rsNormalMatrix * mat3(instanceMatrix);
#endif
vRsWorld = (modelMatrix * rsPosition).xyz;
vRsLocal = transformed;
vRsWorldNormal = normalize(rsNormalMatrix * objectNormal);
vRsLocalNormal = objectNormal;
`;

const noiseLibrary = /* glsl */ `
float rsHash2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 rsHash22(vec2 p) {
  vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65));
  a += dot(a, a + 34.45);
  return fract(vec2(a.x * a.y, a.y * a.z));
}
float rsNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rsHash2(i), rsHash2(i + vec2(1.0, 0.0)), u.x), mix(rsHash2(i + vec2(0.0, 1.0)), rsHash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float rsFbm2(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * rsNoise2(p);
    p = p * 2.03 + 17.1;
    amplitude *= 0.5;
  }
  return value;
}
float rsHash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1) * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float rsNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(rsHash3(i), rsHash3(i + vec3(1, 0, 0)), f.x), mix(rsHash3(i + vec3(0, 1, 0)), rsHash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(rsHash3(i + vec3(0, 0, 1)), rsHash3(i + vec3(1, 0, 1)), f.x), mix(rsHash3(i + vec3(0, 1, 1)), rsHash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float rsFbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * rsNoise3(p);
    p = p * 2.02 + 11.7;
    amplitude *= 0.5;
  }
  return value;
}
// x: distance to the nearest cell point, y: that cell's random id, z: distance to the cell border.
vec3 rsVoronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + rsHash22(n + g) - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = rsHash2(n + g);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(sqrt(d1), id, sqrt(d2) - sqrt(d1));
}
// Perturbs a view-space normal with a procedural height (in world units) via screen-space derivatives.
vec3 rsBump(vec3 surfacePosition, vec3 surfaceNormal, float height, float faceDirection) {
  vec3 sigmaX = dFdx(surfacePosition);
  vec3 sigmaY = dFdy(surfacePosition);
  vec3 r1 = cross(sigmaY, surfaceNormal);
  vec3 r2 = cross(surfaceNormal, sigmaX);
  float det = dot(sigmaX, r1) * faceDirection;
  vec3 gradient = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(det) * surfaceNormal - gradient);
}
`;

const surface = (fragment: Pick<ShaderPatch, 'afterMap' | 'afterRoughness'>, extraVertexHead = '', afterBegin = ''): ShaderPatch => ({
  vertexHead: varyings + extraVertexHead,
  afterBegin,
  afterProject: passVaryings,
  fragmentHead: varyings + noiseLibrary + extraVertexHead.replace(/attribute float \w+;\n?/g, ''),
  ...fragment,
  afterNormal: 'normal = rsBump(-vViewPosition, normal, rsHeight, faceDirection);',
});

// Gravel near the water fading into meadow, blended by the per-vertex shore weight.
export const groundShader = surface({
  afterMap: /* glsl */ `
    vec2 rsWp = vRsWorld.xz;
    float rsPixel = max(length(fwidth(rsWp)), 1e-4);
    float rsShore = clamp(vShore, 0.0, 1.0);
    float rsGf = rsNoise2(rsWp * 5.0);
    vec3 rsGrass = mix(vec3(0.20, 0.30, 0.08), vec3(0.38, 0.44, 0.16), rsFbm2(rsWp * 0.35));
    rsGrass = mix(rsGrass, vec3(0.50, 0.46, 0.27), smoothstep(0.55, 0.78, rsFbm2(rsWp * 0.06 + 3.0)) * 0.7);
    rsGrass *= mix(0.75 + 0.5 * rsGf, 1.0, smoothstep(0.03, 0.15, rsPixel));
    vec3 rsV = rsVoronoi(rsWp * 8.0 + (vec2(rsFbm2(rsWp * 2.3), rsFbm2(rsWp * 2.3 + 9.0)) - 0.5) * 0.9);
    vec3 rsV2 = rsVoronoi(rsWp * 26.0 + 7.0);
    float rsFar = smoothstep(0.006, 0.03, rsPixel);
    float rsStone = smoothstep(0.02, 0.13, rsV.z);
    float rsSmall = smoothstep(0.02, 0.12, rsV2.z);
    vec3 rsTone = mix(vec3(0.42, 0.41, 0.39), vec3(0.63, 0.61, 0.57), rsV.y);
    rsTone = mix(rsTone, vec3(0.50, 0.45, 0.38), step(0.7, fract(rsV.y * 7.13)) * 0.7);
    rsTone = mix(rsTone, vec3(0.29, 0.30, 0.31), step(0.86, fract(rsV.y * 13.7)) * 0.8);
    rsTone *= 0.9 + 0.2 * rsNoise2(rsWp * 45.0);
    vec3 rsGap = mix(vec3(0.27, 0.25, 0.22), mix(vec3(0.45, 0.43, 0.39), vec3(0.58, 0.55, 0.5), rsV2.y), rsSmall);
    float rsDome = 1.0 - smoothstep(0.0, 0.62, rsV.x);
    vec3 rsPebble = mix(rsGap, rsTone * mix(0.55, 1.05, rsDome), rsStone);
    vec3 rsCoarse = rsVoronoi(rsWp * 1.6);
    vec3 rsDistant = vec3(0.47, 0.45, 0.41) * (0.8 + 0.35 * rsCoarse.y) * (0.85 + 0.3 * rsNoise2(rsWp * 3.0));
    rsPebble = mix(rsPebble, rsDistant, rsFar);
    rsPebble *= 0.88 + 0.24 * rsFbm2(rsWp * 0.8);
    vec3 rsAlbedo = mix(rsGrass, rsPebble, rsShore);
    float rsWet = 1.0 - smoothstep(-0.02, 0.22, vRsWorld.y);
    rsAlbedo *= mix(1.0, 0.6, rsWet);
    diffuseColor.rgb = pow(rsAlbedo, vec3(2.2));
    float rsHeight = rsShore * (rsStone * (0.006 + sqrt(rsDome) * 0.02) + rsSmall * 0.004 * (1.0 - rsStone)) * (1.0 - rsFar) + (1.0 - rsShore) * rsGf * 0.012;
  `,
  afterRoughness: 'roughnessFactor = mix(roughnessFactor, 0.35, rsWet * rsShore);',
}, 'attribute float shore;\nvarying float vShore;\n', 'vShore = shore;');

// Weathered granite with lichen, moss on the upward faces and a dark wet band at the waterline.
export const rockShader = surface({
  afterMap: /* glsl */ `
    vec3 rsP = vRsLocal * 1.4;
    float rsN = rsFbm3(rsP * 1.5);
    float rsF = rsNoise3(rsP * 14.0);
    vec3 rsRock = mix(vec3(0.34, 0.33, 0.31), vec3(0.58, 0.56, 0.52), smoothstep(0.3, 0.7, rsN));
    rsRock *= (0.82 + 0.3 * rsF) * (0.92 + 0.08 * sin(rsP.y * 16.0 + rsN * 8.0));
    rsRock = mix(rsRock, vec3(0.70, 0.68, 0.55), smoothstep(0.62, 0.7, rsNoise3(rsP * 4.0 + 5.0)) * 0.5);
    float rsMoss = smoothstep(0.35, 0.75, normalize(vRsWorldNormal).y + (rsFbm3(rsP * 2.5 + 2.0) - 0.5) * 0.9);
    rsMoss *= smoothstep(0.05, 0.3, vRsWorld.y);
    rsRock = mix(rsRock, vec3(0.19, 0.27, 0.08) * (0.8 + 0.4 * rsF), rsMoss * 0.9);
    float rsWet = 1.0 - smoothstep(-0.05, 0.25, vRsWorld.y);
    rsRock *= mix(1.0, 0.55, rsWet);
    diffuseColor.rgb = pow(rsRock, vec3(2.2));
    float rsHeight = rsN * 0.06 + rsF * 0.008;
  `,
  afterRoughness: 'roughnessFactor = mix(roughnessFactor, 0.3, rsWet);',
});

// Sun-bleached driftwood running along the local x axis, with growth rings on the cut ends.
export const barkShader = surface({
  afterMap: /* glsl */ `
    vec3 rsP = vRsLocal;
    float rsA = atan(rsP.z, rsP.y);
    float rsRidge = rsNoise2(vec2(rsA * 5.0, rsP.x * 1.2)) * 0.6 + rsNoise2(vec2(rsA * 14.0, rsP.x * 3.0)) * 0.4;
    float rsGrain = rsNoise2(vec2(rsA * 40.0, rsP.x * 0.8));
    vec3 rsWood = mix(vec3(0.30, 0.26, 0.22), vec3(0.60, 0.56, 0.49), rsRidge) * (0.85 + 0.25 * rsGrain);
    float rsCap = smoothstep(0.8, 0.95, abs(vRsLocalNormal.x));
    float rsRing = 0.5 + 0.5 * sin(length(rsP.yz) * 90.0 + rsNoise2(rsP.yz * 8.0) * 3.0);
    rsWood = mix(rsWood, mix(vec3(0.55, 0.45, 0.33), vec3(0.68, 0.58, 0.44), rsRing), rsCap);
    float rsWet = 1.0 - smoothstep(-0.05, 0.2, vRsWorld.y);
    rsWood *= mix(1.0, 0.5, rsWet);
    diffuseColor.rgb = pow(rsWood, vec3(2.2));
    float rsHeight = (rsRidge * 0.025 + rsGrain * 0.004) * (1.0 - rsCap);
  `,
  afterRoughness: 'roughnessFactor = mix(roughnessFactor, 0.4, rsWet);',
});

// Sways grass blades in a gusty breeze; blade tips move the most.
export const grassWindShader: ShaderPatch = {
  vertexHead: 'uniform float uTime;',
  afterBegin: /* glsl */ `
    #ifdef USE_INSTANCING
      vec3 rsBase = instanceMatrix[3].xyz;
    #else
      vec3 rsBase = vec3(0.0);
    #endif
    float rsSway = sin(uTime * 1.6 + rsBase.x * 0.35 + rsBase.z * 0.21) + 0.4 * sin(uTime * 3.7 + rsBase.x * 1.3 + rsBase.z);
    float rsBend = position.y * position.y * 6.0;
    transformed.x += rsSway * 0.05 * rsBend;
    transformed.z += rsSway * 0.03 * rsBend;
  `,
};
