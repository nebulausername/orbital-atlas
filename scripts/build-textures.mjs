// Turns the downloaded mission maps in quellen/roh/ into the web textures in
// public/textures/. Every source is listed in src/data/sources.ts.
//
//   node scripts/build-textures.mjs
//
// Conventions: equirectangular, east-positive longitude. Most products span
// −180°…+180° (0° at the image centre); the New Horizons mosaics of Pluto and Charon
// span 0°…360°. The app stores that per texture (texLon0 in src/data/bodies.ts).
//
// Gaps in the data are never painted over silently:
//  - Pluto/Charon: unimaged polar night → alpha 0, the shader hatches it (terra incognita).
//  - Hubble OPAL gas giants: only the measured latitude colour profile is kept.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

sharp.cache(false);
const RAW = new URL('../quellen/roh/', import.meta.url).pathname;
const OUT = new URL('../public/textures/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

// Optional section filter: node scripts/build-textures.mjs earth opal
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);

const open = (f) => sharp(RAW + f, { limitInputPixels: false });
const webp = (img, name, q = 86) => img.webp({ quality: q, effort: 5 }).toFile(OUT + name).then(() => console.log('  ✓', name));

async function sizes(src, base, { big = 4096, small = 2048, q } = {}) {
  await webp(src().resize(big, big / 2, { fit: 'fill', kernel: 'lanczos3' }), `${base}_4k.webp`, q);
  await webp(src().resize(small, small / 2, { fit: 'fill', kernel: 'lanczos3' }), `${base}_2k.webp`, q);
}

async function rawOf(img, w, h, channels) {
  let p = img.resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
  p = channels === 1 ? p.toColourspace('b-w') : p.removeAlpha();
  const { data, info } = await p.raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== channels) throw new Error(`expected ${channels} channels, got ${info.channels}`);
  return data;
}

if (want('earth')) {
// --- Earth --------------------------------------------------------------------
console.log('Earth');
await sizes(() => open('earth_bmng_200407_5400.jpg'), 'earth_day');
await sizes(() => open('earth_night_2012_3600.jpg').modulate({ saturation: 0.6 }), 'earth_night', { q: 80 });
await webp(open('earth_clouds_2048.jpg').toColourspace('b-w'), 'earth_clouds_2k.webp', 80);
{
  // Ocean mask for specular glint: Blue Marble oceans are dark and blue-dominant.
  const W = 2048, H = 1024;
  const px = await rawOf(open('earth_bmng_200407_5400.jpg'), W, H, 3);
  const mask = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
    const water = b > r + 8 && b >= g - 6 && r + g + b < 330;
    mask[i] = water ? 255 : 0;
  }
  await webp(sharp(mask, { raw: { width: W, height: H, channels: 1 } }).blur(0.8), 'earth_ocean_2k.webp', 85);
}
}

if (want('moon')) {
// --- Moon, Mars, Jupiter --------------------------------------------------------
console.log('Moon / Mars / Jupiter');
await sizes(() => open('moon_lroc_color_4k.tif'), 'moon');
await sizes(() => open('usgs_mars_viking_925m.tif'), 'mars');
await sizes(() => open('cassini_jupiter_PIA07782.jpg').modulate({ saturation: 1.08 }), 'jupiter');
}

if (want('mercury')) {
// --- Mercury: MESSENGER enhanced colour → near-true colour + false-colour layer ---
console.log('Mercury');
await sizes(() => open('usgs_mercury_enhanced_665m.tif').modulate({ saturation: 0.12, brightness: 1.05 }).tint({ r: 196, g: 182, b: 166 }), 'mercury', { q: 78 });
await webp(open('usgs_mercury_enhanced_665m.tif').resize(2048, 1024, { fit: 'fill' }), 'mercury_falsecolour_2k.webp', 82);
}

if (want('pluto')) {
// --- Pluto & Charon: greyscale New Horizons mosaics, colour-mapped, gaps in alpha --
async function colourMapped(file, base, stops) {
  for (const [W, tag] of [[4096, '4k'], [2048, '2k']]) {
    const H = W / 2;
    const g = await rawOf(open(file), W, H, 1);
    const out = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const v = g[i] / 255;
      let k = 0;
      while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
      const [a, ca] = stops[k], [b, cb] = stops[k + 1];
      const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(ca[c] + (cb[c] - ca[c]) * t);
      out[i * 4 + 3] = 255;
    }
    // No data = near-black pixels connected to the unimaged (southern) edge. Dark terrain
    // inside the imaged area (e.g. Cthulhu Macula) must stay opaque, so flood-fill.
    const stack = [];
    for (let x = 0; x < W; x++) stack.push((H - 1) * W + x);
    const seen = new Uint8Array(W * H);
    while (stack.length) {
      const i = stack.pop();
      if (seen[i] || g[i] > 3) continue;
      seen[i] = 1;
      out[i * 4 + 3] = 0; // → transparent → hatched in the shader (terra incognita)
      const x = i % W, y = (i - x) / W;
      if (y > 0) stack.push(i - W);
      if (y < H - 1) stack.push(i + W);
      stack.push(y * W + ((x + 1) % W), y * W + ((x - 1 + W) % W));
    }
    await webp(sharp(out, { raw: { width: W, height: H, channels: 4 } }), `${base}_${tag}.webp`, 84);
  }
}
console.log('Pluto / Charon');
const plutoStops = [
  [0.0, [34, 18, 13]],
  [0.3, [92, 52, 32]],
  [0.55, [168, 122, 86]],
  [0.8, [226, 204, 178]],
  [1.0, [248, 240, 228]],
];
await colourMapped('usgs_pluto_nh_300m.tif', 'pluto', plutoStops);
await colourMapped('usgs_charon_nh_300m.tif', 'charon', [
  [0.0, [40, 32, 30]],
  [0.25, [88, 64, 52]],
  [0.6, [158, 150, 146]],
  [1.0, [236, 232, 228]],
]);
}

if (want('opal')) {
// --- Hubble OPAL giants: zonal colour profile --------------------------------------
// The OPAL maps of Saturn, Uranus and Neptune have large gaps (ring occultation,
// unobserved hemisphere) and colour fringes at the limb. What they measure reliably is
// the colour of each latitude band, so we keep exactly that: a per-latitude median over
// clean pixels. Longitudinal detail is added by the shader and labelled illustrative.
//
// OPAL composites are not colour calibrated (narrow-band filters as RGB), so the mean
// colour is balanced to a published true-colour estimate and the band contrast kept.
async function opalZonal(file, base, W, target) {
  const H = W / 2;
  const px = await rawOf(open(file), W, H, 3);
  const ok = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    ok[i] = r + g + b > 60 && (mx - mn) / mx < 0.62 ? 1 : 0;
  }
  // erode by R px so limb fringes and stitching seams drop out
  const R = Math.max(3, Math.round(W / 120));
  const clean = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let all = 1;
      for (let d = -R; d <= R && all; d++) {
        if (!ok[y * W + ((x + d + W) % W)]) all = 0;
        const yy = y + d;
        if (yy >= 0 && yy < H && !ok[yy * W + x]) all = 0;
      }
      clean[y * W + x] = all;
    }
  const profile = new Array(H).fill(null);
  const lum = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    const ch = [[], [], []];
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (clean[i]) for (let c = 0; c < 3; c++) ch[c].push(px[i * 3 + c]);
    }
    if (ch[0].length < W * 0.1) continue;
    profile[y] = ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
    lum[y] = profile[y][0] * 0.3 + profile[y][1] * 0.59 + profile[y][2] * 0.11;
  }
  // Rows far darker than their surroundings are ring shadow / occultation, not cloud.
  const win = Math.round(H / 12);
  for (let y = 0; y < H; y++) {
    if (!profile[y]) continue;
    let mx = 0;
    for (let k = Math.max(0, y - win); k < Math.min(H, y + win); k++) mx = Math.max(mx, lum[k]);
    if (lum[y] < 0.72 * mx) profile[y] = null;
  }
  for (let y = 0; y < H; y++) {
    if (profile[y]) continue;
    let up = y - 1; while (up >= 0 && !profile[up]) up--;
    let dn = y + 1; while (dn < H && !profile[dn]) dn++;
    if (up >= 0 && dn < H) {
      const t = (y - up) / (dn - up);
      profile[y] = profile[up].map((v, c) => v + (profile[dn][c] - v) * t);
    }
  }
  // Beyond the last measured row: mirror the other hemisphere (bands are roughly symmetric).
  for (let y = 0; y < H; y++) if (!profile[y]) profile[y] = profile[H - 1 - y] ?? profile.find(Boolean);
  // light vertical smoothing
  const sm = profile.map((_, y) => [0, 1, 2].map((c) => {
    let acc = 0, wsum = 0;
    for (let k = -3; k <= 3; k++) {
      const yy = Math.min(H - 1, Math.max(0, y + k)), w = Math.exp(-(k * k) / 4);
      acc += profile[yy][c] * w; wsum += w;
    }
    return acc / wsum;
  }));
  const mean = [0, 1, 2].map((c) => sm.reduce((a, p) => a + p[c], 0) / H);
  const meanLum = (mean[0] + mean[1] + mean[2]) / 3;
  for (const p of sm) {
    const l = (p[0] + p[1] + p[2]) / 3;
    for (let c = 0; c < 3; c++) {
      // brightness variation kept in full, hue variation damped to 40 %
      const hueDev = p[c] / Math.max(1, l) - mean[c] / meanLum;
      p[c] = Math.min(255, Math.max(0, target[c] * (l / meanLum) * (1 + 0.4 * hueDev)));
    }
  }
  const OW = 1024, OH = 512;
  const out = Buffer.alloc(OW * OH * 3);
  for (let y = 0; y < OH; y++) {
    const p = sm[Math.min(H - 1, Math.floor((y / OH) * H))];
    for (let x = 0; x < OW; x++) for (let c = 0; c < 3; c++) out[(y * OW + x) * 3 + c] = Math.round(p[c]);
  }
  await webp(sharp(out, { raw: { width: OW, height: OH, channels: 3 } }), `${base}_zonal.webp`, 90);
}
console.log('Saturn / Uranus / Neptune (Hubble OPAL zonal profiles)');
// Targets: Saturn pale butterscotch (Cassini true-colour mosaics); Uranus and Neptune
// pale greenish blue, Neptune slightly bluer (Irwin et al. 2024, MNRAS 527, 11521).
await opalZonal('opal_saturn_2023a.tif', 'saturn', 1800, [206, 184, 140]);
await opalZonal('opal_uranus_2021a.tif', 'uranus', 720, [172, 214, 220]);
await opalZonal('opal_neptune_2023a.tif', 'neptune', 720, [146, 186, 214]);
}

if (want('moons')) {
// --- Venus (Magellan radar, for the "surface" layer) and the moons ----------------
console.log('Venus radar + moons');
await webp(open('nasa3d_venus.jpg').resize(2048, 1024, { fit: 'fill' }), 'venus_radar_2k.webp', 84);
for (const [file, base] of [
  ['nasa3d_jupiter_io_a.jpg', 'io'],
  ['nasa3d_jupiter_europa.jpg', 'europa'],
  ['nasa3d_jupiter_ganymede.jpg', 'ganymede'],
  ['nasa3d_jupiter_callisto.jpg', 'callisto'],
  ['nasa3d_saturn_titan.jpg', 'titan'],
  ['nasa3d_saturn_enceladus.jpg', 'enceladus'],
  ['nasa3d_saturn_rhea.jpg', 'rhea'],
  ['nasa3d_uranus_titania.jpg', 'titania'],
  ['nasa3d_uranus_oberon.jpg', 'oberon'],
  ['nasa3d_neptune_triton.jpg', 'triton'],
  ['nasa3d_mars_phobos.jpg', 'phobos'],
  ['nasa3d_mars_deimos.jpg', 'deimos'],
]) {
  await webp(open(file).resize(1024, 512, { fit: 'fill' }), `${base}_1k.webp`, 84);
}
}

console.log('done');
