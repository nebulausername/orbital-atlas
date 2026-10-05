// Fetches osculating heliocentric elements of real small bodies from the JPL Small-Body
// Database Query API and packs them for the GPU propagator.
//
//   node scripts/fetch-small-bodies.mjs
//
// Selection: the 14,000 intrinsically brightest numbered asteroids (lowest H) of every
// class, plus all Jupiter trojans with H < 14 and all trans-Neptunian objects and
// centaurs, and the 3,000 brightest near-Earth asteroids. Duplicates are merged.
//
// Output public/data/small-bodies.bin: Float32 records
//   [a (AU), e, i, Ω, ω, M (deg), epoch (JD − 2451545), class id]
// and src/data/generated/small-bodies-meta.json with counts and the class table.
import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api';
const FIELDS = 'spkid,full_name,a,e,i,om,w,ma,epoch,H,class';
const CLASSES = ['MBA', 'IMB', 'OMB', 'MCA', 'APO', 'ATE', 'AMO', 'IEO', 'TJN', 'CEN', 'TNO', 'PAA', 'HYA', 'AST'];

async function query(params) {
  const url = `${API}?${new URLSearchParams({ fields: FIELDS, ...params })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const json = await res.json();
  console.log(`  ${JSON.stringify(params)} → ${json.data?.length ?? 0} of ${json.count}`);
  return json.data ?? [];
}

const rows = new Map();
const add = (list) => {
  for (const r of list) rows.set(r[0], r);
};

add(await query({ 'sb-kind': 'a', 'sb-ns': 'n', sort: 'H', limit: '14000' }));
add(await query({ 'sb-class': 'TJN', 'sb-cdata': JSON.stringify({ AND: ['H|LT|14'] }), limit: '6000' }));
add(await query({ 'sb-class': 'TNO', limit: '6000' }));
add(await query({ 'sb-class': 'CEN', limit: '2000' }));
add(await query({ 'sb-group': 'neo', 'sb-kind': 'a', sort: 'H', limit: '3000' }));

const records = [];
const counts = {};
for (const [, name, a, e, i, om, w, ma, epoch, , cls] of rows.values()) {
  const A = Number(a), E = Number(e);
  if (!(A > 0) || !(E >= 0) || E >= 0.98 || [i, om, w, ma, epoch].some((v) => v === null)) continue;
  const id = Math.max(0, CLASSES.indexOf(cls));
  counts[cls] = (counts[cls] ?? 0) + 1;
  records.push([A, E, Number(i), Number(om), Number(w), Number(ma), Number(epoch) - 2451545.0, id]);
}
const buf = new Float32Array(records.length * 8);
records.forEach((r, k) => buf.set(r, k * 8));

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data/small-bodies.bin', import.meta.url), Buffer.from(buf.buffer));
await writeFile(
  new URL('../src/data/generated/small-bodies-meta.json', import.meta.url),
  JSON.stringify({ source: 'NASA/JPL Small-Body Database Query API', fetched: new Date().toISOString(), total: records.length, classes: CLASSES, counts }, null, 1),
);
console.log('small bodies:', records.length, counts);
