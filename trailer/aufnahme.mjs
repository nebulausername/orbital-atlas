// Records the trailer's footage from the real app, frame by frame with a fixed step.
//   node trailer/aufnahme.mjs [--preview] [--only=shot] [--lang=en]
// Output: trailer/public/aufnahmen/<shot>/%04d.jpg + <shot>.json (per-frame metadata)
import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const args = process.argv.slice(2);
const preview = args.includes('--preview');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const base = args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5190/orbital-atlas/';
const FPS = 30;
const W = preview ? 540 : 1080;
const H = preview ? 960 : 1920;
const OUT = new URL(`./public/aufnahmen${preview ? '-vorschau' : ''}/`, import.meta.url).pathname;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const seg = (t, a, b) => clamp01((t - a) / (b - a));

/** Shots: camera as a function of time; `sim` moves the clock (days per frame) or follows a schedule. */
const SHOTS = [
  {
    name: 's1-zoomout',
    dur: 7.0,
    ui: 'clean',
    setup: { focus: 'earth' },
    cam: (t, c0) => {
      // hold on the planet, then a powers-of-ten pull-back to the Galaxy
      const z = seg(t, 2.6, 7.0);
      const k = z < 0.5 ? 2 * z * z : 1 - (-2 * z + 2) ** 2 / 2;
      return { key: 'earth', logD: lerp(-3.55, 9.85, k) - 0.07 * seg(t, 0, 2.6), yaw: c0.yaw + 0.08 * t + 1.2 * k, pitch: lerp(c0.pitch, 0.9, k) };
    },
    days: 0.0008,
  },
  {
    name: 's2-galaxy',
    dur: 1.6,
    ui: 'labels',
    cam: (t, c0) => ({ key: 'earth', logD: lerp(9.85, 9.72, t / 1.6), yaw: c0.yaw + 0.1 * t, pitch: 0.9 }),
    days: 0,
  },
  {
    name: 's3-saturn',
    dur: 4.0,
    ui: 'clean',
    setup: { focus: 'saturn' },
    cam: (t, c0) => {
      const k = easeOut(seg(t, 0, 2.6));
      return { key: 'saturn', logD: lerp(-0.7, -2.5, k) - 0.06 * seg(t, 2.6, 4), yaw: c0.yaw - 1.1 + 1.0 * k + 0.1 * t, pitch: lerp(0.6, 0.3, k) };
    },
    days: 0.01,
  },
  {
    name: 's4-cut',
    dur: 3.6,
    ui: 'clean',
    setup: { focus: 'earth', cutAt: 0.35, shift: [0, 300] },
    cam: (t, c0) => ({ key: 'earth', logD: -3.6 + 0.03 * Math.sin(t), yaw: c0.yaw + 0.05 * t, pitch: c0.pitch }),
    days: 0.0005,
  },
  {
    name: 's5-rewind',
    dur: 5.0,
    ui: 'labels',
    setup: { sunView: [0.45, -0.8, 0.6] },
    cam: (t) => {
      const k = ease(seg(t, 3.6, 5.0));
      return { key: k > 0 ? 'halley' : 'sun', logD: lerp(0.45, -0.3, k), yaw: -0.8 + 0.06 * t, pitch: lerp(0.6, 0.42, k) };
    },
    // forty years backwards to Halley's 1986 perihelion, decelerating on arrival
    schedule: { toIso: '1986-02-14', over: [0.0, 3.6] },
  },
  {
    name: 's6-orrery',
    dur: 2.4,
    ui: 'labels',
    setup: { date: 'now', sunView: [0.32, -0.3, 1.05] },
    cam: (t) => ({ key: 'sun', logD: 0.32 - 0.03 * t, yaw: -0.3 + 0.1 * t, pitch: 1.05 }),
    days: 3,
  },
  {
    name: 's7-end',
    dur: 3.4,
    ui: 'clean',
    setup: { sunView: [9.95, -1.9, 0.75] },
    cam: (t) => ({ key: 'sun', logD: 9.95, yaw: -1.9 + 0.05 * t, pitch: 0.75 }),
    days: 0,
  },
];


const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?record=1&lang=en`);
await page.waitForSelector('.intro .enter.ready', { timeout: 180000 });
await page.evaluate(() => {
  window.__atlas.finishIntro();
  window.__atlas.store.set({ paused: true, sound: false });
  window.__atlas.fov(58);
});
await page.evaluate(() => window.__atlas.step(0.5));

for (const shot of SHOTS) {
  if (only && !shot.name.includes(only)) continue;
  const dir = `${OUT}${shot.name}/`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  // --- setup ---
  await page.evaluate(async (s) => {
    const a = window.__atlas;
    a.ui(s.ui);
    a.select(null);
    a.store.set({ cutaway: null, paused: true });
    a.shift(...(s.setup?.shift ?? [0, 0]));
    if (s.setup?.date === 'now') await a.seekJd(Date.now() / 86400000 + 2440587.5 + 69.184 / 86400);
    if (s.setup?.focus) a.jump(s.setup.focus);
    if (s.setup?.sunView) a.jump('sun', ...s.setup.sunView);
    a.engine.lines.resetTrails();
    for (let k = 0; k < 4; k++) a.step(1 / 30);
  }, { ui: shot.ui, setup: shot.setup ?? null });
  const c0 = await page.evaluate(() => window.__atlas.camState());
  const n = Math.round(shot.dur * FPS);
  const meta = [];
  let jdFrom = null;
  if (shot.schedule) jdFrom = await page.evaluate(() => window.__atlas.sim.jd);
  const jdTo = shot.schedule ? Date.UTC(...shot.schedule.toIso.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))), 12) / 86400000 + 2440587.5 : null;
  const stepEvery = preview ? 6 : 1;
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    const cam = shot.cam(t, c0);
    let days = shot.days ?? 0;
    if (shot.schedule) {
      const [a, b] = shot.schedule.over;
      const k = ease(seg(t, a, b));
      const kPrev = ease(seg(t - 1 / FPS, a, b));
      days = (jdTo - jdFrom) * (k - kPrev) + (t > b ? 0.08 : 0);
    }
    const m = await page.evaluate(
      ({ cam, days, cutNow }) => {
        const a = window.__atlas;
        if (days) a.advanceDays(days);
        if (cutNow) a.store.set({ cutaway: 'earth' });
        a.jump(cam.key, cam.logD, cam.yaw, cam.pitch);
        a.step(1 / 30);
        return { jd: a.sim.jd, logD: a.engine.frame.logD };
      },
      { cam, days, cutNow: shot.setup?.cutAt !== undefined && Math.abs(t - shot.setup.cutAt) < 0.5 / FPS },
    );
    meta.push({ i, t: Number(t.toFixed(4)), ...m });
    if (i % stepEvery === 0) {
      await page.screenshot({ path: `${dir}${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: preview ? 80 : 93, timeout: 240000 });
    }
    if (i % 30 === 0) console.log(shot.name, `${i}/${n}`);
  }
  await writeFile(`${OUT}${shot.name}.json`, JSON.stringify(meta));
  console.log('✓', shot.name);
}
await browser.close();
