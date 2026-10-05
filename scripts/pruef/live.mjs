// Checks the live site: status codes, content types, headers, then a browser run that
// must find the WebGL canvas drawing and no console errors.
//   node scripts/pruef/live.mjs [base]
import { chromium } from 'playwright';
import sharp from 'sharp';

const base = process.argv[2] ?? 'https://kaufmeinewebsite.de/orbital-atlas/';
let fail = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fail++;
};

const head = async (url) => {
  const r = await fetch(url, { redirect: 'manual' });
  return { status: r.status, type: r.headers.get('content-type') ?? '', h: r.headers, text: r.status === 200 && (r.headers.get('content-type') ?? '').includes('html') ? await r.text() : '' };
};

const root = await head(base);
ok(root.status === 200, `GET ${base} → ${root.status}`);
ok(root.type.includes('text/html'), `index is text/html (${root.type})`);
ok(!!root.h.get('content-security-policy'), 'CSP header present');
ok(!!root.h.get('strict-transport-security'), 'HSTS header present');
const js = /\/orbital-atlas\/assets\/[^"]+\.js/.exec(root.text)?.[0];
ok(!!js, `index references a module script (${js})`);
if (js) {
  const r = await head(new URL(js, base).href);
  ok(r.status === 200 && r.type.includes('javascript'), `script → ${r.status} ${r.type}`);
  ok((r.h.get('cache-control') ?? '').includes('immutable'), 'hashed assets are immutable');
}
for (const [p, type] of [
  ['textures/earth_day_2k.webp', 'image/webp'],
  ['data/bsc5.bin', 'application/octet-stream'],
  ['data/small-bodies.bin', 'application/octet-stream'],
  ['og.jpg', 'image/jpeg'],
]) {
  const r = await head(new URL(p, base).href);
  ok(r.status === 200 && r.type.includes(type), `${p} → ${r.status} ${r.type}`);
}
const noSlash = await head(base.replace(/\/$/, ''));
ok(noSlash.status === 301, `/orbital-atlas → ${noSlash.status} (redirect to the slash)`);
const missing = await head(new URL('textures/gibt-es-nicht.webp', base).href);
ok(missing.status === 404, `missing file → ${missing.status}`);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
await page.addInitScript(() => (window.__atlasProbe = true));
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?lang=de`);
await page.waitForSelector('.intro .enter.ready', { timeout: 120000 });
await page.evaluate(() => window.__atlas.finishIntro());
await page.waitForTimeout(4000);
const lang = await page.evaluate(() => document.documentElement.lang);
ok(lang === 'de', `<html lang> = ${lang}`);
const plate = await page.textContent('.wordmark .plate');
ok(!!plate && plate.includes('Tafel'), `plate title: ${plate}`);
// WebGL canvases are not readable after compositing; measure the screenshot instead
const shot = await page.screenshot();
const { data, info } = await sharp(shot).extract({ left: 300, top: 150, width: 500, height: 350 }).resize(64, 40).raw().toBuffer({ resolveWithObject: true });
const buckets = new Set();
for (let i = 0; i < data.length; i += info.channels) buckets.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
const varied = buckets.size;
ok(varied > 20, `canvas draws something (${varied} colour buckets)`);
ok(errors.length === 0, `no console errors (${errors.length})${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(fail ? `\n${fail} check(s) failed` : '\nall checks green');
process.exit(fail ? 1 : 0);
