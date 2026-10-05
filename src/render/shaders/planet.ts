import { HATCH, NOISE, SPHERE_UV } from './common';

/**
 * Planet surface. Works in "render space": camera at the origin, units = AU × s.
 * Local object space: +Y north pole, +X prime meridian (set by the mesh's basis matrix).
 */
export const PLANET_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
void main() {
  vLocal = normalize(position);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

export const PLANET_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform sampler2D uOcean;
uniform sampler2D uAlt;
uniform sampler2D uRingTex;
uniform float uHasDay, uHasNight, uHasClouds, uHasOcean, uAltMix, uZonal;
uniform float uLon0;
uniform int uProc;          // 0 none · 1 Venus cloud deck · 2 rock
uniform vec3 uBase;         // base colour for procedural surfaces
uniform vec3 uSunPos;       // render space
uniform vec3 uCenter;       // render space
uniform float uRadius;      // render units
uniform float uTime;        // days since J2000 (for animated clouds)
uniform vec3 uAtmo;
uniform float uAtmoStrength;
uniform float uLimb;        // limb darkening (gas giants)
uniform float uHasRings;
uniform vec3 uRingNormal;
uniform vec2 uRingRadii;    // render units
uniform float uCut;
uniform vec3 uCutAxis;
uniform vec3 uCutA;
uniform float uCutAngle;
uniform float uHighlight;   // selection glow 0..1
uniform float uExposure;
uniform mat3 uInvRot;     // world → local rotation
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
${NOISE}
${SPHERE_UV}
${HATCH}

float ringShadow(vec3 p, vec3 L) {
  if (uHasRings < 0.5) return 1.0;
  float den = dot(L, uRingNormal);
  if (abs(den) < 1e-5) return 1.0;
  float t = dot(uCenter - p, uRingNormal) / den;
  if (t <= 0.0) return 1.0;
  float r = length(p + L * t - uCenter);
  float x = (r - uRingRadii.x) / (uRingRadii.y - uRingRadii.x);
  if (x < 0.0 || x > 1.0) return 1.0;
  return 1.0 - 0.85 * texture2D(uRingTex, vec2(x, 0.5)).a;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 rel = vWorld - uCenter;
  if (uCut > 0.5) {
    vec3 q = rel - dot(rel, uCutAxis) * uCutAxis;
    float ang = atan(dot(cross(uCutA, q), uCutAxis), dot(uCutA, q));
    if (ang > 0.0 && ang < uCutAngle) discard;
  }
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(uSunPos - vWorld);
  vec3 V = normalize(-vWorld);
  float ndl = dot(N, L);
  vec3 n = vLocal;

  // --- albedo ---------------------------------------------------------------
  vec3 albedo = uBase;
  float known = 1.0;
  if (uHasDay > 0.5) {
    vec2 uv = sphereUv(n, uLon0);
    if (uZonal > 0.5) {
      // zonal profile from Hubble OPAL + illustrative turbulence
      float w = fbm(n * vec3(3.0, 18.0, 3.0) + vec3(uTime * 0.002, 0.0, 0.0)) - 0.5;
      uv.y += w * 0.012;
      vec3 c = texture2D(uDay, uv).rgb;
      c *= 0.94 + 0.12 * fbm(n * vec3(10.0, 60.0, 10.0));
      albedo = c;
    } else {
      vec4 tex = texture2D(uDay, uv);
      albedo = tex.rgb;
      known = tex.a;
    }
    if (uAltMix > 0.0) albedo = mix(albedo, texture2D(uAlt, uv).rgb, uAltMix);
  }
  if (uProc == 1) {
    // Venus: featureless in visible light; faint UV-like chevrons drift with the
    // ~4-day super-rotation of the cloud tops (illustrative pattern, real period).
    float lonShift = uTime / 4.0 * 6.28318;
    float c = cos(lonShift), s = sin(lonShift);
    vec3 m = vec3(c * n.x - s * n.z, n.y, s * n.x + c * n.z);
    float bands = fbm(m * vec3(2.0, 9.0, 2.0) + vec3(0.0, abs(m.y) * 3.0, 0.0));
    albedo = uBase * (0.9 + 0.18 * bands);
  } else if (uProc == 2) {
    float cr = fbm(n * 6.0);
    float pits = smoothstep(0.62, 0.7, vnoise(n * 22.0));
    albedo = uBase * (0.75 + 0.4 * cr - 0.25 * pits);
  }

  // --- lighting ---------------------------------------------------------------
  float shadow = ringShadow(vWorld, L);
  float diff = max(ndl, 0.0);
  if (uLimb > 0.0) diff *= pow(max(dot(N, V), 0.0), uLimb * 0.35);
  float clouds = 0.0;
  if (uHasClouds > 0.5) {
    vec2 uv = sphereUv(n, uLon0);
    clouds = texture2D(uClouds, uv).r;
    // cloud shadows: the cloud layer seen from this point toward the Sun
    vec3 toSun = uInvRot * normalize(L - dot(L, N) * N);
    float cs = texture2D(uClouds, sphereUv(normalize(n + 0.005 * toSun), uLon0)).r;
    albedo *= 1.0 - 0.4 * cs * smoothstep(0.0, 0.3, ndl);
    albedo = mix(albedo, vec3(0.97), clouds * 0.92);
  }
  vec3 color = albedo * diff * shadow;

  // unmapped terrain: neutral ink with paper hatching, still lit
  if (known < 0.5) {
    float h = hatch(n, 26.0);
    color = mix(vec3(0.07, 0.08, 0.11), vec3(0.62, 0.58, 0.52), h * 0.55) * (0.25 + 0.75 * diff);
  }

  // ocean glint
  if (uHasOcean > 0.5) {
    float water = texture2D(uOcean, sphereUv(n, uLon0)).r * (1.0 - clouds);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 90.0);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    color += vec3(1.0, 0.92, 0.8) * spec * water * (0.55 + fres) * shadow * step(0.0, ndl);
  }
  // night side lights
  if (uHasNight > 0.5) {
    vec3 lights = texture2D(uNight, sphereUv(n, uLon0)).rgb;
    float night = smoothstep(0.05, -0.18, ndl);
    color += pow(lights, vec3(1.6)) * vec3(1.0, 0.78, 0.5) * 1.6 * night * (1.0 - clouds * 0.85);
  }
  // atmosphere: forward-scattered rim and twilight tint
  if (uAtmoStrength > 0.0) {
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    float lit = smoothstep(-0.25, 0.4, ndl);
    color += uAtmo * rim * lit * uAtmoStrength * 0.9;
    color = mix(color, color + uAtmo * 0.18 * diff, uAtmoStrength * 0.35);
  }
  // selection: a faint vermilion rim, like an ink outline on a plate
  if (uHighlight > 0.0) {
    float rim = pow(1.0 - max(dot(N, V), 0.0), 6.0);
    color += vec3(1.0, 0.33, 0.18) * rim * uHighlight * 0.35;
  }
  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <colorspace_fragment>
}
`;
