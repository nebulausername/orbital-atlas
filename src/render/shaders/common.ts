/** Shared GLSL snippets. All noise here is our own hash-based value noise. */

export const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i);
  float b = hash13(i + vec3(1, 0, 0));
  float c = hash13(i + vec3(0, 1, 0));
  float d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1));
  float g = hash13(i + vec3(1, 0, 1));
  float h = hash13(i + vec3(0, 1, 1));
  float k = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

/**
 * Equirectangular lookup from an object-space unit vector (local +Y = north pole,
 * +X = longitude 0, −Z = longitude +90° E). Seam-free mip selection after Tarini 2012.
 */
export const SPHERE_UV = /* glsl */ `
vec2 sphereUv(vec3 n, float lon0Turns) {
  float lon = atan(-n.z, n.x) / 6.28318530718;      // east longitude in turns, 0 at +X
  float lat = asin(clamp(n.y, -1.0, 1.0)) / 3.14159265359;
  float u = lon - lon0Turns;
  float u1 = fract(u);
  float u2 = fract(u + 0.5) - 0.5;
  float uu = fwidth(u1) <= fwidth(u2) + 1e-6 ? u1 : u2;
  return vec2(uu, 0.5 + lat);
}
`;

/** Diagonal hatching in object space, used for unmapped terrain and illustrative areas. */
export const HATCH = /* glsl */ `
float hatch(vec3 n, float density) {
  float lon = atan(-n.z, n.x);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float k = (lon * cos(lat) + lat) * density;
  float d = abs(fract(k) - 0.5);
  float w = fwidth(k) * 1.2;
  return 1.0 - smoothstep(0.06, 0.06 + w, d);
}
`;
