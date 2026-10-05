// Fetches the star data used by the sky and the stellar-neighbourhood layer.
//
//   node scripts/fetch-stars.mjs
//
// 1. Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991) via VizieR V/50:
//    every naked-eye star with J2000 position, V magnitude and B-V colour.
//    Packed as Float32 [ra, dec, vmag, bv] into public/data/bsc5.bin.
// 2. The nearest star systems and a few bright landmarks via the SIMBAD TAP service:
//    position, parallax, spectral type → src/data/generated/nearby-stars.json.
import { writeFile, mkdir } from 'node:fs/promises';

const OUT_GEN = new URL('../src/data/generated/', import.meta.url);
const OUT_PUB = new URL('../public/data/', import.meta.url);
await mkdir(OUT_GEN, { recursive: true });
await mkdir(OUT_PUB, { recursive: true });

// --- 1. Bright Star Catalogue -------------------------------------------------
const bscUrl =
  'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=V/50/catalog&-out=HR&-out=_RA.icrs&-out=_DE.icrs&-out=Vmag&-out=B-V&-out.max=unlimited&-oc.form=d';
const bscText = await (await fetch(bscUrl)).text();
const rows = bscText
  .split('\n')
  .filter((l) => /^\s*\d+\t/.test(l))
  .map((l) => l.split('\t').map((s) => s.trim()));
const stars = [];
for (const [hr, ra, de, v, bv] of rows) {
  if (!ra || !de || !v) continue; // a handful of entries are novae/non-stellar without data
  stars.push([Number(hr), Number(ra), Number(de), Number(v), bv === '' ? 0.6 : Number(bv)]);
}
const buf = new Float32Array(stars.length * 5);
stars.forEach((s, i) => buf.set(s, i * 5));
await writeFile(new URL('bsc5.bin', OUT_PUB), Buffer.from(buf.buffer));
console.log('BSC5 stars:', stars.length);

// --- 2. Nearby stars ---------------------------------------------------------
// Primary identifiers as SIMBAD knows them. Companions in the same system are listed
// separately where they are visually distinct at the neighbourhood scale.
const NEARBY = [
  ['alf Cen A', 'Alpha Centauri A'],
  ['alf Cen B', 'Alpha Centauri B'],
  ['Proxima Centauri', 'Proxima Centauri'],
  ["Barnard's star", "Barnard's Star"],
  ['Wolf 359', 'Wolf 359'],
  ['HD 95735', 'Lalande 21185'],
  ['Sirius', 'Sirius'],
  ['BL Cet', 'Luyten 726-8 (BL Ceti)'],
  ['Ross 154', 'Ross 154'],
  ['Ross 248', 'Ross 248'],
  ['eps Eri', 'Epsilon Eridani'],
  ['Lacaille 9352', 'Lacaille 9352'],
  ['Ross 128', 'Ross 128'],
  ['EZ Aqr', 'EZ Aquarii'],
  ['Procyon', 'Procyon'],
  ['61 Cyg A', '61 Cygni'],
  ['HD 173739', 'Struve 2398'],
  ['GX And', 'Groombridge 34'],
  ['eps Ind', 'Epsilon Indi'],
  ['DX Cnc', 'DX Cancri'],
  ['tau Cet', 'Tau Ceti'],
  ['GJ 1061', 'Gliese 1061'],
  ['YZ Cet', 'YZ Ceti'],
  ["Luyten's star", "Luyten's Star"],
  ["Teegarden's Star", "Teegarden's Star"],
  ["Kapteyn's star", "Kapteyn's Star"],
  ['Lacaille 8760', 'Lacaille 8760'],
  ['BD+56 2783', 'Kruger 60'],
  ['Altair', 'Altair'],
  ['Vega', 'Vega'],
  ['Fomalhaut', 'Fomalhaut'],
  ['Arcturus', 'Arcturus'],
  ['Pollux', 'Pollux'],
  ['Capella', 'Capella'],
  ['Aldebaran', 'Aldebaran'],
  ['Regulus', 'Regulus'],
  ['TRAPPIST-1', 'TRAPPIST-1'],
];

const quote = (s) => `'${s.replace(/'/g, "''")}'`;
// SIMBAD stores identifiers with a catalogue prefix ("* alf Cen A", "NAME Sirius", "V* EZ Aqr").
const PREFIXES = ['', '* ', '** ', 'NAME ', 'V* '];
const variants = (id) => PREFIXES.map((p) => p + id);
const bare = (s) => s.replace(/^(\*\*|\*|NAME|V\*)\s+/, '').replace(/\s+/g, ' ').toLowerCase();
const adql = `
SELECT i.id AS query_id, b.main_id, b.ra, b.dec, b.plx_value, b.sp_type, f.V
FROM ident AS i
JOIN basic AS b ON i.oidref = b.oid
LEFT JOIN allfluxes AS f ON f.oidref = b.oid
WHERE i.id IN (${NEARBY.flatMap(([id]) => variants(id).map(quote)).join(',')})`;
const tap = await fetch('https://simbad.cds.unistra.fr/simbad/sim-tap/sync', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ request: 'doQuery', lang: 'adql', format: 'json', query: adql }),
});
const tapJson = await tap.json();
const cols = tapJson.metadata.map((m) => m.name);
const byId = new Map();
for (const row of tapJson.data) {
  const o = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
  const key = bare(o.query_id);
  // Prefer the entry with a parallax if an identifier matches more than one object.
  if (!byId.has(key) || (!byId.get(key).plx_value && o.plx_value)) byId.set(key, o);
}
const LY_PER_PC = 3.261563777;
const nearby = [];
for (const [id, label] of NEARBY) {
  const o = byId.get(bare(id));
  if (!o || !o.plx_value) {
    console.warn('missing in SIMBAD:', id);
    continue;
  }
  nearby.push({
    id,
    label,
    simbad: o.main_id,
    raDeg: o.ra,
    decDeg: o.dec,
    parallaxMas: o.plx_value,
    distanceLy: Number(((1000 / o.plx_value) * LY_PER_PC).toFixed(3)),
    spType: o.sp_type,
    vmag: o.V,
  });
}
nearby.sort((a, b) => a.distanceLy - b.distanceLy);
await writeFile(
  new URL('nearby-stars.json', OUT_GEN),
  JSON.stringify({ source: 'SIMBAD astronomical database (CDS, Strasbourg), TAP service', fetched: new Date().toISOString(), stars: nearby }, null, 1),
);
console.log('nearby stars:', nearby.length);
for (const s of nearby) console.log(`  ${s.label.padEnd(26)} ${s.distanceLy.toFixed(2).padStart(7)} ly  ${s.spType ?? ''}`);
