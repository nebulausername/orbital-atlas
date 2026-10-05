// Captures the README images and the social preview from a running build.
//   node scripts/pruef/aufnahmen.mjs [base-url]
import { chromium, devices } from 'playwright';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://127.0.0.1:5191/orbital-atlas/';
const out = new URL('../../docs/', import.meta.url).pathname;
const pub = new URL('../../public/', import.meta.url).pathname;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function shot(name, { viewport, mobile = false, lang = 'en', steps }) {
  const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => (window.__atlasProbe = true));
  await page.goto(`${base}?lang=${lang}`);
  await page.waitForSelector('.intro .enter.ready', { timeout: 120000 });
  await page.evaluate(() => window.__atlas.finishIntro());
  await page.waitForTimeout(1500);
  await steps(page);
  await page.evaluate(() => document.querySelector('.toast')?.classList.remove('show'));
  const buf = await page.screenshot({ timeout: 240000 });
  await sharp(buf).webp({ quality: 86 }).toFile(`${out}${name}.webp`);
  if (name === 'og') await sharp(buf).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toFile(`${pub}og.jpg`);
  console.log('✓', name);
  await ctx.close();
}

const jump = (k, l, y, p) => async (page) => {
  await page.evaluate(([k, l, y, p]) => {
    window.__atlas.jump(k, l, y, p);
    if (k !== 'sun' || l < 0) window.__atlas.select(k);
  }, [k, l, y, p]);
  await page.waitForTimeout(6000);
};

await shot('og', { viewport: { width: 1200, height: 630 }, steps: async (p) => {
  await jump('earth')(p);
  await p.evaluate(() => window.__atlas.store.set({ cutaway: 'earth' }));
  await p.waitForTimeout(9000);
} });
await shot('earth-section', { viewport: { width: 1600, height: 1000 }, steps: async (p) => {
  await jump('earth')(p);
  await p.evaluate(() => window.__atlas.store.set({ cutaway: 'earth' }));
  await p.waitForTimeout(9000);
} });
await shot('milky-way', { viewport: { width: 1600, height: 1000 }, steps: jump('sun', 9.75, -1.6, 0.55) });
await shot('inner-system', { viewport: { width: 1600, height: 1000 }, steps: jump('sun', 0.55, -0.6, 0.42) });
await shot('saturn', { viewport: { width: 1600, height: 1000 }, steps: jump('saturn') });
await shot('halley-1986', { viewport: { width: 1600, height: 1000 }, steps: async (p) => {
  await p.evaluate(() => window.__atlas.seek('1986-02-20'));
  await p.waitForFunction(() => window.__atlas.store.get().seeking === null, null, { timeout: 120000 });
  await jump('halley', -0.4)(p);
} });
await shot('mobile-jupiter', { mobile: true, lang: 'de', steps: jump('jupiter') });
await browser.close();
