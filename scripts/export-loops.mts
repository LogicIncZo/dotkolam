/**
 * Export per-configuration loop counts for small grids as differential
 * cross-check data for the independent Z3/Python model (formal/z3/verify.py).
 * Run: npx tsx scripts/export-loops.mts
 */
import { buildGrid } from '../src/core/grid.js';
import { buildGates, decodeIndex } from '../src/core/gates.js';
import { physicalLoops } from '../src/core/trace.js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('formal/z3/data', { recursive: true });

const grids: Record<string, { kind: string; [k: string]: unknown }> = {
  'square-2x2': { kind: 'rectangle', cols: 2, rows: 2 },
  'diamond-3': { kind: 'diamond', rows: 3 },
  'rect-2x3': { kind: 'rectangle', cols: 3, rows: 2 },
  'srivatsa-1331': { kind: 'rows', widths: [1, 3, 3, 1] },
  'diamond-5': { kind: 'diamond', rows: 5 },
};

const out: Record<string, { spec: unknown; gateCount: number; loops: number[] }> = {};
for (const [name, spec] of Object.entries(grids)) {
  const sys = buildGates(buildGrid(spec as never), 'all-closed');
  const n = sys.interior.length;
  if (n > 16) continue;
  const loops: number[] = [];
  for (let i = 1; i <= 2 ** n; i++) {
    decodeIndex(sys, BigInt(i));
    loops.push(physicalLoops(sys).length);
  }
  out[name] = { spec, gateCount: n, loops };
  console.log(name, 'gates', n, 'configs', loops.length);
}
writeFileSync('formal/z3/data/loops.json', JSON.stringify(out));
console.log('written formal/z3/data/loops.json');
