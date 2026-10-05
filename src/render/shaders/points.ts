import { NOISE } from './common';

const LOG_V = /* glsl */ `#include <common>
#include <logdepthbuf_pars_vertex>`;
const LOG_F = /* glsl */ `#include <common>
#include <logdepthbuf_pars_fragment>`;

/**
 * Background sky from the Bright Star Catalogue. Directions at infinity: positions are
 * unit vectors, drawn first without depth. Size and brightness from V magnitude,
 * colour from B−V.
 */
export const SKY_VERT = /* glsl */ `
attribute float aMag;
attribute vec3 aColor;
uniform float uPx;        // device pixel ratio
uniform float uLimit;     // faintest magnitude shown
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 dir = mat3(viewMatrix) * position;
  gl_Position = projectionMatrix * vec4(dir * 10.0, 1.0);
  float flux = pow(10.0, -0.4 * (aMag - 1.0));
  float size = clamp(1.6 + 2.6 * sqrt(flux), 1.4, 9.0);
  vAlpha = clamp(0.25 + 0.75 * sqrt(flux) , 0.0, 1.0) * smoothstep(uLimit + 0.5, uLimit - 0.8, aMag) * uOpacity;
  vColor = aColor;
  gl_PointSize = size * uPx;
}
`;
export const SKY_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 5.0);
  float spike = max(0.0, 1.0 - abs(p.x) * 14.0) * (1.0 - abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 14.0) * (1.0 - abs(p.x));
  float a = (core + spike * 0.25 * step(0.6, vAlpha)) * vAlpha;
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

/**
 * A faint band along the galactic plane in the sky (illustrative glow; the stars in front
 * of it are real). Rendered on a camera-centred sphere.
 */
export const BAND_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec3 dir = mat3(viewMatrix) * position;
  gl_Position = projectionMatrix * vec4(dir * 10.0, 1.0);
}
`;
export const BAND_FRAG = /* glsl */ `
uniform vec3 uGalX;
uniform vec3 uGalY;
uniform vec3 uGalZ;
uniform float uOpacity;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float b = asin(clamp(dot(d, uGalZ), -1.0, 1.0));
  float l = atan(dot(d, uGalY), dot(d, uGalX));
  float bulge = exp(-pow(l / 0.55, 2.0)) * exp(-pow(b / 0.22, 2.0));
  float disc = exp(-pow(b / (0.09 + 0.05 * (1.0 - cos(l)) * 0.5), 2.0));
  float n = fbm(vec3(l * 4.0, b * 18.0, 0.0));
  float dust = smoothstep(0.45, 0.75, fbm(vec3(l * 7.0, b * 40.0, 3.0))) * exp(-pow(b / 0.04, 2.0));
  float i = (disc * (0.45 + 0.8 * n) + bulge * 1.2) * (1.0 - 0.7 * dust);
  vec3 col = mix(vec3(0.55, 0.62, 0.8), vec3(1.0, 0.82, 0.6), clamp(bulge * 1.5 + 0.2, 0.0, 1.0));
  gl_FragColor = vec4(col * i * 0.055 * uOpacity, 1.0);
}
`;

/** Generic camera-relative point cloud with per-point colour and size (galaxy, Oort, neighbours). */
export const CLOUD_VERT = /* glsl */ `
${LOG_V}
attribute vec3 aColor;
attribute float aSize;
uniform float uPx;
uniform float uSizeScale;
uniform float uOpacity;
uniform float uMinPx;
uniform float uFixed;   // 1 = aSize is a size in px, independent of distance
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = uFixed > 0.5 ? aSize : aSize * uSizeScale / max(-mv.z, 1e-9);
  float px = max(s, uMinPx);
  // points smaller than their minimum size fade instead of shrinking
  vAlpha = uOpacity * clamp(s / uMinPx, 0.15, 1.0);
  vColor = aColor;
  gl_PointSize = min(px, 96.0) * uPx;
  #include <logdepthbuf_vertex>
}
`;
export const CLOUD_FRAG = /* glsl */ `
${LOG_F}
uniform float uDark;   // 1 = absorbing dust (normal blending)
varying vec3 vColor;
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.5) * vAlpha;
  if (uDark > 0.5) gl_FragColor = vec4(vColor, a * 0.32);
  else gl_FragColor = vec4(vColor * a, 1.0);
}
`;

/**
 * Small bodies: each vertex carries osculating heliocentric elements; the vertex shader
 * solves Kepler's equation for the current date (two-body around the Sun).
 */
export const SMALL_VERT = /* glsl */ `
${LOG_V}
attribute vec4 aEl0;    // a (AU), e, i, node (rad)
attribute vec4 aEl1;    // peri (rad), M0 (rad), epoch (days since J2000), class
uniform float uDays;    // days since J2000 (TDB)
uniform vec3 uSunR;     // Sun in render space
uniform float uScale;   // render units per AU
uniform float uPx;
uniform float uOpacity;
uniform vec3 uColors[6];
uniform float uMask[6];
varying vec3 vColor;
varying float vAlpha;
const float K = 0.01720209895;  // Gaussian gravitational constant (rad/day, AU, M☉)
void main() {
  float a = aEl0.x, e = aEl0.y, inc = aEl0.z, node = aEl0.w;
  float peri = aEl1.x, M0 = aEl1.y, ep = aEl1.z;
  int cls = int(aEl1.w + 0.5);
  float n = K / (a * sqrt(a));
  float M = mod(M0 + n * (uDays - ep), 6.28318530718);
  float E = M + e * sin(M);
  for (int k = 0; k < 8; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float x = a * (cos(E) - e);
  float y = a * sqrt(1.0 - e * e) * sin(E);
  float cO = cos(node), sO = sin(node), cw = cos(peri), sw = sin(peri), ci = cos(inc), si = sin(inc);
  vec3 ecl = vec3(
    (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y,
    (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y,
    sw * si * x + cw * si * y);
  vec3 scene = vec3(ecl.x, ecl.z, -ecl.y);
  vec4 mv = viewMatrix * vec4(uSunR + scene * uScale, 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = uColors[cls];
  vAlpha = uOpacity * uMask[cls];
  gl_PointSize = (cls == 1 ? 1.5 : 1.8) * uPx;
  #include <logdepthbuf_vertex>
}
`;
export const SMALL_FRAG = /* glsl */ `
${LOG_F}
varying vec3 vColor;
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  if (vAlpha < 0.01) discard;
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vColor * vAlpha * (1.0 - r2 * 0.6), 1.0);
}
`;

/** Final grade: vignette, film grain, gentle ink tone. */
export const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uVignette;
uniform vec2 uRes;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float v = smoothstep(0.95, 0.25, length(q));
  c.rgb *= mix(1.0, v, uVignette);
  // lift the blacks toward the atlas ink
  c.rgb = max(c.rgb, vec3(0.0)) + vec3(0.0035, 0.0045, 0.009) * (1.0 - c.rgb);
  c.rgb += (h(vUv * uRes + uTime) - 0.5) * 0.012;
  gl_FragColor = c;
}
`;
