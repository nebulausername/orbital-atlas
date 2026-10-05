// Runs vitest with its own TMPDIR inside the project and removes it afterwards.
// Background: on this host /tmp is a RAM tmpfs and vitest leaves an ssr/ directory
// per run that it never cleans up (see operating notes).
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const tmp = join(process.cwd(), '.tmp-vitest', String(process.pid));
mkdirSync(tmp, { recursive: true });
const res = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp },
});
rmSync(tmp, { recursive: true, force: true });
process.exit(res.status ?? 1);
