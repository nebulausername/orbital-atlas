// Browser probe: loads the atlas in headless Chromium (software WebGL), records console
// errors, and takes screenshots of a scripted tour.
//   node scripts/pruef/schau.mjs [url] [--mobile] [--tour=intro|skip|body:jupiter|cut:earth]
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5190/orbital-atlas/';
const mobile = args.includes('--mobile');
const tours = args.filter((a) => a.startsWith('--tour=')).map((a) => a.slice(7));
const outDir = new URL('../../pruef-ausgabe/', import.meta.url).pathname;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const small = args.includes('--small');
const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport: small ? { width: 1100, height: 690 } : { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const tag = mobile ? 'm' : 'd';
const shot = async (name) => {
  const t0 = Date.now();
  await page.screenshot({ path: `${outDir}${tag}-${name}.png`, timeout: 180000 });
  const fps = await page.evaluate(() => window.__atlas?.fps?.() ?? null).catch(() => null);
  console.log('shot', name, `${Date.now() - t0} ms`, fps === null ? '' : `fps=${fps.toFixed(1)}`);
};
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await shot('00-frontispiece');
await page.waitForSelector('.intro .enter.ready', { timeout: 60000 }).catch(() => console.log('enter never ready'));
await shot('01-ready');
for (const tour of tours.length ? tours : ['skip']) {
  if (tour === 'intro') {
    await page.click('.intro .enter');
    for (const [i, ms] of [[2, 1500], [3, 2500], [4, 2500], [5, 2500], [6, 2500]]) {
      await page.waitForTimeout(ms);
      await shot(`0${i}-dive`);
    }
  } else if (tour === 'skip') {
    await page.click('.intro .skip').catch(() => {});
    await page.waitForTimeout(3000);
    await shot('10-inner');
  } else if (tour.startsWith('body:')) {
    const key = tour.slice(5);
    await page.keyboard.press('Escape');
    await page.evaluate((k) => {
      const b = [...document.querySelectorAll('.index button')].find((x) => x.textContent?.toLowerCase().includes(k));
      b?.click();
    }, key);
    await page.waitForTimeout(6500);
    await shot(`20-${key}`);
  } else if (tour.startsWith('jump:')) {
    const [, key, logD, yaw, pitch] = tour.split(':');
    await page.evaluate(([k, l, y, p]) => {
      window.__atlas.jump(k, l ? Number(l) : undefined, y ? Number(y) : undefined, p ? Number(p) : undefined);
      window.__atlas.select(k);
    }, [key, logD, yaw, pitch]);
    await page.waitForTimeout(5000);
    await shot(`20-${key}${logD ? `-${logD}` : ''}`);
  } else if (tour.startsWith('pan:')) {
    const [, key, logD, yaw, pitch] = tour.split(':');
    await page.evaluate(([k, l, y, p]) => {
      window.__atlas.jump(k, Number(l), Number(y), Number(p));
      window.__atlas.select(null);
    }, [key, logD, yaw, pitch]);
    await page.waitForTimeout(4000);
    await shot(`25-view-${key}-${logD}`);
  } else if (tour.startsWith('cut:')) {
    await page.keyboard.press('i');
    await page.waitForTimeout(9000);
    await shot(`30-cut-${tour.slice(4)}`);
  } else if (tour.startsWith('zoom:')) {
    const n = Number(tour.slice(5));
    await page.mouse.move(720, 450);
    for (let i = 0; i < Math.abs(n); i++) {
      await page.mouse.wheel(0, Math.sign(n) * 240);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(2500);
    await shot(`40-zoom${n}`);
  } else if (tour.startsWith('key:')) {
    await page.keyboard.press(tour.slice(4));
    await page.waitForTimeout(1500);
    await shot(`50-key-${tour.slice(4)}`);
  }
}
console.log('console errors/warnings:', errors.length);
for (const e of errors.slice(0, 30)) console.log('  ', e.slice(0, 400));
await browser.close();
