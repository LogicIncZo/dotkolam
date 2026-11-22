#!/usr/bin/env node
/**
 * npm run verify = Tier A (npm test) + Z3 formal checks (if python3+z3 present).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tests = spawnSync(npm, ['test'], { stdio: 'inherit' });
if (tests.status !== 0) process.exit(tests.status ?? 1);

if (!existsSync('formal/z3/data/loops.json')) {
  console.log('\n[formal] exporting differential data (npx tsx scripts/export-loops.mts)');
  const exp = spawnSync('npx', ['tsx', 'scripts/export-loops.mts'], { stdio: 'inherit', shell: true });
  if (exp.status !== 0) process.exit(exp.status ?? 1);
}

console.log('\n[formal] Z3 verification (python3 formal/z3/verify.py)');
const py = spawnSync('python3', ['formal/z3/verify.py'], { stdio: 'inherit' });
if (py.status === 0) {
  console.log('\nVERIFY: all tiers green');
} else if (py.status !== null && py.stderr?.toString().includes('No module named z3')) {
  console.log('\nVERIFY: Tier A green; Z3 unavailable (pip install z3-solver to enable)');
} else {
  process.exit(py.status ?? 1);
}
