// Fetches barycentric state vectors (ecliptic J2000, AU and AU/day, TDB) from the
// NASA/JPL Horizons API and writes them to src/data/generated/.
//
//   node scripts/fetch-horizons.mjs
//
// Output:
//   horizons-epoch.json       initial conditions for the N-body integrator
//   horizons-validation.json  the same bodies at other dates, used by the tests
//   horizons-moons.json       osculating elements of major moons relative to their planet
//
// Source: https://ssd.jpl.nasa.gov/horizons/ (ephemeris DE441).
import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const OUT = new URL('../src/data/generated/', import.meta.url);

export const EPOCH = '2026-01-01';
const VALIDATION_DATES = ['2016-01-01', '2036-01-01', '2076-01-01'];

// id = Horizons COMMAND. Planet systems use their barycentre (1-9) except where the
// moon is integrated separately (Earth 399 + Moon 301).
const BODIES = [
  { key: 'sun', cmd: '10' },
  { key: 'mercury', cmd: '199' },
  { key: 'venus', cmd: '299' },
  { key: 'earth', cmd: '399' },
  { key: 'moon', cmd: '301' },
  { key: 'mars', cmd: '4' },
  { key: 'jupiter', cmd: '5' },
  { key: 'saturn', cmd: '6' },
  { key: 'uranus', cmd: '7' },
  { key: 'neptune', cmd: '8' },
  { key: 'pluto', cmd: '9' },
  { key: 'ceres', cmd: '1;' },
  { key: 'halley', cmd: 'DES=1P;CAP;NOFRAG' },
  // Spacecraft: massless test particles, only at the epoch (their published
  // trajectories are predictions, so they are not used for validation).
  { key: 'voyager1', cmd: '-31', epochOnly: true },
  { key: 'voyager2', cmd: '-32', epochOnly: true },
  { key: 'newhorizons', cmd: '-98', epochOnly: true },
];

const MOONS = [
  { key: 'phobos', cmd: '401', center: '499' },
  { key: 'deimos', cmd: '402', center: '499' },
  { key: 'io', cmd: '501', center: '599' },
  { key: 'europa', cmd: '502', center: '599' },
  { key: 'ganymede', cmd: '503', center: '599' },
  { key: 'callisto', cmd: '504', center: '599' },
  { key: 'enceladus', cmd: '602', center: '699' },
  { key: 'rhea', cmd: '605', center: '699' },
  { key: 'titan', cmd: '606', center: '699' },
  { key: 'titania', cmd: '703', center: '799' },
  { key: 'oberon', cmd: '704', center: '799' },
  { key: 'triton', cmd: '801', center: '899' },
  { key: 'charon', cmd: '901', center: '999' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function horizons(params) {
  const q = new URLSearchParams({ format: 'json', OBJ_DATA: 'NO', MAKE_EPHEM: 'YES', CSV_FORMAT: 'YES', ...params });
  // Horizons wants its values quoted.
  const url = `${API}?${[...q].map(([k, v]) => `${k}=${encodeURIComponent(k === 'format' ? v : `'${v}'`)}`).join('&')}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json.error) throw new Error(`${params.COMMAND}: ${json.error}`);
      return json.result;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`Horizons failed for ${params.COMMAND}`);
}

function rowsBetweenMarkers(text) {
  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start < 0 || end < 0) throw new Error(`no $$SOE block:\n${text.slice(0, 1500)}`);
  return text
    .slice(start + 5, end)
    .trim()
    .split('\n')
    .map((l) => l.split(',').map((s) => s.trim()));
}

function nextDay(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function stateAt(cmd, date, center = '500@0') {
  const text = await horizons({
    COMMAND: cmd,
    EPHEM_TYPE: 'VECTORS',
    CENTER: center,
    START_TIME: date,
    STOP_TIME: nextDay(date),
    STEP_SIZE: '1d',
    VEC_TABLE: '2',
    OUT_UNITS: 'AU-D',
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    TIME_TYPE: 'TDB',
  });
  const [row] = rowsBetweenMarkers(text);
  // JDTDB, Calendar, X, Y, Z, VX, VY, VZ
  const [jd, , x, y, z, vx, vy, vz] = row;
  const name = /Target body name:\s*(.+?)\s{2,}/.exec(text)?.[1] ?? cmd;
  return { jd: Number(jd), name, r: [x, y, z].map(Number), v: [vx, vy, vz].map(Number) };
}

async function elementsAt(cmd, center, date) {
  const text = await horizons({
    COMMAND: cmd,
    EPHEM_TYPE: 'ELEMENTS',
    CENTER: `500@${center}`,
    START_TIME: date,
    STOP_TIME: nextDay(date),
    STEP_SIZE: '1d',
    OUT_UNITS: 'KM-S',
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    TIME_TYPE: 'TDB',
  });
  const [row] = rowsBetweenMarkers(text);
  // JDTDB, Calendar, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
  const [jd, , ec, , inc, om, w, , n, ma, , a, , pr] = row;
  const name = /Target body name:\s*(.+?)\s{2,}/.exec(text)?.[1] ?? cmd;
  return {
    jd: Number(jd),
    name,
    e: Number(ec),
    iDeg: Number(inc),
    nodeDeg: Number(om),
    periDeg: Number(w),
    meanMotionDegPerSec: Number(n),
    meanAnomalyDeg: Number(ma),
    aKm: Number(a),
    periodSec: Number(pr),
  };
}

await mkdir(OUT, { recursive: true });

const epoch = { source: 'NASA/JPL Horizons API (DE441), barycentric, ecliptic J2000, AU & AU/day, TDB', fetched: new Date().toISOString(), date: EPOCH, bodies: {} };
for (const b of BODIES) {
  epoch.bodies[b.key] = { cmd: b.cmd, ...(await stateAt(b.cmd, EPOCH)) };
  console.log('epoch', b.key, epoch.bodies[b.key].name);
  await sleep(250);
}
epoch.jd = epoch.bodies.sun.jd;
await writeFile(new URL('horizons-epoch.json', OUT), JSON.stringify(epoch, null, 1));

const validation = { source: epoch.source, fetched: epoch.fetched, dates: {} };
for (const date of VALIDATION_DATES) {
  validation.dates[date] = {};
  for (const b of BODIES.filter((x) => !x.epochOnly)) {
    validation.dates[date][b.key] = await stateAt(b.cmd, date);
    await sleep(250);
  }
  console.log('validation', date);
}
await writeFile(new URL('horizons-validation.json', OUT), JSON.stringify(validation, null, 1));

const moons = { source: 'NASA/JPL Horizons API, osculating elements relative to the planet centre, ecliptic J2000', fetched: epoch.fetched, date: EPOCH, moons: {} };
for (const m of MOONS) {
  moons.moons[m.key] = { cmd: m.cmd, center: m.center, ...(await elementsAt(m.cmd, m.center, EPOCH)) };
  console.log('moon', m.key, moons.moons[m.key].name, moons.moons[m.key].aKm);
  await sleep(250);
}
await writeFile(new URL('horizons-moons.json', OUT), JSON.stringify(moons, null, 1));
console.log('done');
