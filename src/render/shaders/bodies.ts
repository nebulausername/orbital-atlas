import { NOISE } from './common';

const LOG_V = /* glsl */ `#include <common>
#include <logdepthbuf_pars_vertex>`;
const LOG_F = /* glsl */ `#include <common>
#include <logdepthbuf_pars_fragment>`;

/** Atmosphere halo: back faces of a slightly larger sphere, additive. */
export const ATMO_VERT = /* glsl */ `
${LOG_V}
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;
export const ATMO_FRAG = /* glsl */ `
${LOG_F}
uniform vec3 uColor;
uniform float uStrength;
uniform vec3 uSunPos;
uniform vec3 uCenter;
uniform float uInner;   // planet radius / shell radius
uniform float uCut;
uniform vec3 uCutAxis;
uniform vec3 uCutA;
uniform float uCutAngle;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  #include <logdepthbuf_fragment>
  vec3 rel = vWorld - uCenter;
  if (uCut > 0.5) {
    vec3 q = rel - dot(rel, uCutAxis) * uCutAxis;
    float ang = atan(dot(cross(uCutA, q), uCutAxis), dot(uCutA, q));
    if (ang > -0.05 && ang < uCutAngle + 0.05) discard;
  }
  vec3 V = normalize(-vWorld);
  vec3 C = uCenter;
  // impact parameter of the view ray, in units of the shell radius
  float shellR = length(rel);
  vec3 d = -V;
  float tca = dot(C, d);
  float b = sqrt(max(dot(C, C) - tca * tca, 0.0)) / shellR;
  // thin glow just outside the limb, fading to the shell edge
  float x = clamp((b - uInner) / (1.0 - uInner), 0.0, 1.0);
  float glow = pow(1.0 - x, 2.2) * step(uInner * 0.985, b);
  vec3 L = normalize(uSunPos - C);
  vec3 limbDir = normalize(rel);
  float lit = smoothstep(-0.35, 0.5, dot(limbDir, L));
  gl_FragColor = vec4(uColor * glow * lit * uStrength, 1.0);
}
`;

/** Planetary rings: radial profile texture (rgb colour, a = opacity from optical depth). */
export const RING_VERT = /* glsl */ `
${LOG_V}
varying vec3 vWorld;
varying float vR;
uniform float uInnerFrac;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vR = (length(position.xy) - uInnerFrac) / (1.0 - uInnerFrac);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;
export const RING_FRAG = /* glsl */ `
${LOG_F}
uniform sampler2D uTex;
uniform vec3 uSunPos;
uniform vec3 uCenter;
uniform float uPlanetR;
uniform vec3 uNormal;
uniform float uBright;
uniform float uExposure;
varying vec3 vWorld;
varying float vR;
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  if (vR < 0.0 || vR > 1.0) discard;
  vec4 t = texture2D(uTex, vec2(vR, 0.5));
  if (t.a < 0.003) discard;
  vec3 L = normalize(uSunPos - vWorld);
  vec3 V = normalize(-vWorld);
  // planet shadow: does the ray toward the Sun hit the planet?
  vec3 oc = vWorld - uCenter;
  float bq = dot(oc, L);
  float cq = dot(oc, oc) - uPlanetR * uPlanetR;
  float disc = bq * bq - cq;
  float shadow = (disc > 0.0 && -bq - sqrt(disc) > 0.0) ? 0.06 : 1.0;
  // lit face vs unlit face: from the dark side the ring glows by forward scattering
  float sideL = dot(uNormal, L);
  float sideV = dot(uNormal, V);
  float sameSide = step(0.0, sideL * sideV);
  float phase = 0.5 + 0.5 * dot(-L, V);
  float lit = mix(0.25 + 0.75 * pow(phase, 3.0) * (1.0 - t.a), 1.0, sameSide);
  float sunElev = abs(sideL);
  vec3 col = t.rgb * lit * (0.35 + 0.65 * sqrt(sunElev)) * shadow * uBright;
  gl_FragColor = vec4(col * uExposure, t.a);
}
`;

/** The Sun's photosphere: granulation, supergranulation and limb darkening. */
export const SUN_VERT = ATMO_VERT.replace('varying vec3 vNormalW;', 'varying vec3 vNormalW;\nvarying vec3 vLocal;').replace(
  'vec4 w = modelMatrix',
  'vLocal = normalize(position);\n  vec4 w = modelMatrix',
);
export const SUN_FRAG = /* glsl */ `
${LOG_F}
uniform float uTime;
uniform float uCut;
uniform vec3 uCutAxis;
uniform vec3 uCutA;
uniform float uCutAngle;
uniform vec3 uCenter;
uniform float uIntensity;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  vec3 rel = vWorld - uCenter;
  if (uCut > 0.5) {
    vec3 q = rel - dot(rel, uCutAxis) * uCutAxis;
    float ang = atan(dot(cross(uCutA, q), uCutAxis), dot(uCutA, q));
    if (ang > 0.0 && ang < uCutAngle) discard;
  }
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(-vWorld);
  float mu = max(dot(N, V), 0.0);
  float t = uTime;
  float gran = fbm(vLocal * 55.0 + vec3(t * 0.9, t * 0.6, -t * 0.7));
  float sup = fbm(vLocal * 9.0 - vec3(t * 0.05));
  float spots = smoothstep(0.78, 0.86, fbm(vLocal * 4.0 + 3.1)) * smoothstep(0.55, 0.15, abs(vLocal.y));
  // limb darkening (quadratic law, visible band)
  float limb = 1.0 - 0.6 * (1.0 - mu) - 0.15 * (1.0 - mu) * (1.0 - mu);
  vec3 hot = vec3(1.0, 0.96, 0.86);
  vec3 warm = vec3(1.0, 0.62, 0.25);
  vec3 col = mix(warm, hot, pow(limb, 1.4));
  col *= 0.82 + 0.3 * gran + 0.12 * sup;
  col *= 1.0 - 0.6 * spots;
  gl_FragColor = vec4(col * limb * uIntensity, 1.0);
}
`;

/** Corona / glare billboard around the Sun (additive, screen-aligned quad). */
export const GLOW_VERT = /* glsl */ `
${LOG_V}
varying vec2 vUv;
uniform vec3 uCenterR;
uniform float uSize;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mv = viewMatrix * vec4(uCenterR, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;
export const GLOW_FRAG = /* glsl */ `
${LOG_F}
varying vec2 vUv;
uniform float uIntensity;
uniform float uCore;   // photosphere radius as a fraction of the quad
uniform float uTime;
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vUv);
  if (r > 1.0) discard;
  float x = max(r - uCore, 0.0) / (1.0 - uCore);
  float a = atan(vUv.y, vUv.x);
  float streak = 0.75 + 0.5 * fbm(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 0.03 + x * 0.5));
  float corona = exp(-x * 9.0) * 1.2 + exp(-x * 2.6) * 0.18 * streak;
  float glare = 0.022 / (x + 0.02) * (1.0 - smoothstep(0.6, 1.0, r));
  float i = (corona + glare * 0.4) * uIntensity * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * i, 1.0);
}
`;

/** Cut faces of the cutaway: colour by radius from the layer table, hairline borders. */
export const CUT_VERT = /* glsl */ `
${LOG_V}
varying vec3 vWorld;
varying vec2 vP;
void main() {
  vP = position.xy;  // x = along the cut radius (0..1), y = along the axis (−1..1)
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;
export const CUT_FRAG = /* glsl */ `
${LOG_F}
#define MAX_LAYERS 6
uniform float uRadii[MAX_LAYERS];   // outer radius fractions, ascending
uniform vec3 uColors[MAX_LAYERS];
uniform float uPhase[MAX_LAYERS];   // 0 solid · 1 liquid · 2 partial · 3 fluid · 4 plasma · 5 gas
uniform int uCount;
uniform float uOpen;                // 0..1 reveal
uniform vec3 uSunPos;
uniform vec3 uNormal;
uniform float uExposure;
uniform float uHover;               // index of the highlighted layer, −1 none
varying vec3 vWorld;
varying vec2 vP;
${NOISE}

// engraving: each state of matter gets its own stroke, like a printed section
float lines(float x, float width) {
  float d = abs(fract(x) - 0.5);
  float w = fwidth(x) * width;
  return 1.0 - smoothstep(0.5 - w - 0.12, 0.5 - 0.12, d);
}
float pattern(float phase, vec2 p, float r) {
  if (phase < 0.5) return lines((p.x + p.y) * 46.0, 1.2);                       // solid: hatching
  if (phase < 1.5) return lines(r * 70.0 + 0.35 * sin(atan(p.y, p.x) * 18.0), 1.0); // liquid: flowing rings
  if (phase < 2.5) {                                                               // partial melt: dots
    vec2 g = fract(p * 40.0) - 0.5;
    return 1.0 - smoothstep(0.16, 0.16 + fwidth(p.x) * 40.0, length(g));
  }
  if (phase < 3.5) return lines(p.y * 55.0 + 0.6 * sin(p.x * 30.0), 1.0);        // fluid: waves
  if (phase < 4.5) return lines(atan(p.y, p.x) * 34.0, 1.0) * 0.8 + step(0.985, hash13(vec3(floor(p * 220.0), 1.0))); // plasma: rays + sparks
  return step(0.94, hash13(vec3(floor(p * 160.0), 2.0)));                         // gas: stipple
}

void main() {
  #include <logdepthbuf_fragment>
  float r = length(vP);
  if (r > 1.0) discard;
  if (r > uOpen * 1.02) discard;
  int idx = uCount - 1;
  for (int i = MAX_LAYERS - 1; i >= 0; i--) {
    if (i < uCount && r <= uRadii[i]) idx = i;
  }
  vec3 c = uColors[idx];
  vec3 ink = vec3(0.035, 0.045, 0.07);
  vec3 paper = vec3(0.93, 0.89, 0.82);
  vec3 base = mix(c, ink, 0.42) * (1.12 - 0.3 * r);
  vec3 stroke = mix(c, paper, 0.4);
  float pat = pattern(uPhase[idx], vP, r);
  vec3 col = mix(base, stroke, pat * 0.75);
  col *= 0.92 + 0.12 * fbm(vec3(vP * 30.0, 4.0));
  // hairline at each boundary and at the rim
  float w = fwidth(r) * 1.3;
  float line = 1.0 - smoothstep(0.0, w, abs(r - 1.0));
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= uCount) break;
    line = max(line, 1.0 - smoothstep(0.0, w, abs(r - uRadii[i])));
  }
  // the axis line, like the meridian of a globe
  line = max(line, (1.0 - smoothstep(0.0, fwidth(vP.x) * 1.2, abs(vP.x))) * 0.6);
  col = mix(col, paper, line * 0.9);
  if (float(idx) == uHover) col = mix(col, vec3(1.0, 0.42, 0.24), 0.28);
  vec3 L = normalize(uSunPos - vWorld);
  float d = 0.7 + 0.3 * abs(dot(uNormal, L));
  gl_FragColor = vec4(col * d * uExposure, 1.0);
}
`;

/**
 * Comet tail: a camera-facing ribbon pointing away from the Sun. Length grows with
 * 1/r² of the heliocentric distance (activity is driven by sunlight); the ion tail is
 * straight and blue, the dust tail curves back along the orbit and is cream.
 */
export const TAIL_VERT = /* glsl */ `
${LOG_V}
uniform vec3 uHead;     // render space
uniform vec3 uAxis;     // anti-sunward unit vector
uniform vec3 uLag;      // unit vector opposite to the motion (dust tail bends this way)
uniform float uLength;  // render units
uniform float uCurve;   // 0 = ion tail, 1 = dust tail
varying vec2 vT;
void main() {
  float x = position.x;          // 0..1 along the tail
  float y = position.y;          // −1..1 across
  vec3 dir = normalize(uAxis + uLag * uCurve * x * 0.6);
  vec3 p = uHead + dir * x * uLength;
  vec3 view = normalize(p);
  vec3 side = normalize(cross(dir, view));
  float w = uLength * (0.02 + 0.09 * x) * (1.0 + uCurve * 1.4);
  p += side * y * w;
  vT = vec2(x, y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;
export const TAIL_FRAG = /* glsl */ `
${LOG_F}
uniform float uCurve;
uniform float uIntensity;
varying vec2 vT;
void main() {
  #include <logdepthbuf_fragment>
  float fall = pow(1.0 - vT.x, 1.6) * smoothstep(0.0, 0.03, vT.x + 0.01);
  float across = exp(-vT.y * vT.y * (uCurve > 0.5 ? 2.5 : 6.0));
  vec3 col = uCurve > 0.5 ? vec3(1.0, 0.9, 0.72) : vec3(0.55, 0.75, 1.0);
  gl_FragColor = vec4(col * fall * across * uIntensity, 1.0);
}
`;
