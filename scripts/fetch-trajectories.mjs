// Historic trajectories of the three spacecraft (heliocentric, ecliptic J2000, AU) from
// launch to the epoch, sampled every 10 days, from NASA/JPL Horizons.
//
//   node scripts/fetch-trajectories.mjs
import { writeFile } from 'node:fs/promises';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const CRAFT = [
  { key: 'voyager1', cmd: '-31', start: '1977-09-08' },
  { key: 'voyager2', cmd: '-32', start: '1977-08-23' },
  { key: 'newhorizons', cmd: '-98', start: '2006-01-21' },
];
const END = '2026-01-01';

async function vectors(cmd, start) {
  const p = { format: 'json', COMMAND: cmd, OBJ_DATA: 'NO', MAKE_EPHEM: 'YES', EPHEM_TYPE: 'VECTORS', CENTER: '500@10', START_TIME: start, STOP_TIME: END, STEP_SIZE: '10d', VEC_TABLE: '1', OUT_UNITS: 'AU-D', REF_PLANE: 'ECLIPTIC', REF_SYSTEM: 'ICRF', CSV_FORMAT: 'YES' };
  const url = `${API}?${Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(k === 'format' ? v : `'${v}'`)}`).join('&')}`;
  const json = await (await fetch(url)).json();
  if (json.error) throw new Error(json.error);
  const text = json.result;
  const rows = text.slice(text.indexOf('$$SOE') + 5, text.indexOf('$$EOE')).trim().split('\n');
  return rows.map((l) => {
    const c = l.split(',').map((s) => s.trim());
    return [Number(c[0]), Number(Number(c[2]).toFixed(5)), Number(Number(c[3]).toFixed(5)), Number(Number(c[4]).toFixed(5))];
  });
}

const out = { source: 'NASA/JPL Horizons API, heliocentric (Sun centre), ecliptic J2000, AU; [JD, x, y, z]', fetched: new Date().toISOString(), craft: {} };
for (const c of CRAFT) {
  out.craft[c.key] = await vectors(c.cmd, c.start);
  console.log(c.key, out.craft[c.key].length);
}
await writeFile(new URL('../src/data/generated/horizons-trajectories.json', import.meta.url), JSON.stringify(out));
