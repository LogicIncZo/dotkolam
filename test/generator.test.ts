/**
 * Generator tests: one-stroke FTS search converges (certificate exact),
 * symmetry holds, determinism per seed, known one-stroke counts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../src/gen/generator.js';
import { canonicalJSON } from '../src/core/doc.js';
import { validateDoc } from '../src/core/validate.js';
import { buildGrid } from '../src/core/grid.js';
import { buildGates } from '../src/core/gates.js';
import { physicalLoops } from '../src/core/trace.js';

test('FTS reaches one stroke on classic diamonds with symmetry', () => {
  for (const rows of [3, 5, 7, 9]) {
    for (const symmetry of ['C4', 'D4', 'D2'] as const) {
      const r = generate({ grid: { kind: 'diamond', rows }, symmetry, seed: `pongal-${rows}` });
      assert.equal(r.achieved.isOneStroke, true, `diamond ${rows} ${symmetry} seed pongal-${rows}`);
      assert.equal(r.achieved.symmetryHolds, true);
      assert.equal(r.achieved.loops, 1);
      // requested group is preserved or relaxed along D4>C4>D2>D1>none
      const ladder = ['D4', 'C4', 'D2', 'D1', 'none'];
      assert.ok(
        ladder.indexOf(r.doc.pattern!.symmetry!.group) >= ladder.indexOf(symmetry),
        `relaxed too far: requested ${symmetry}, got ${r.doc.pattern!.symmetry!.group}`,
      );
      const v = validateDoc(r.doc);
      assert.equal(v.valid, true, JSON.stringify(v.issues));
    }
  }
});

test('FTS reaches one stroke on squares and rectangles', () => {
  const cases = [
    { grid: { kind: 'square', size: 5 }, symmetry: 'D4' },
    { grid: { kind: 'square', size: 7 }, symmetry: 'C4' },
    { grid: { kind: 'rectangle', cols: 4, rows: 6 }, symmetry: 'D1' },
    { grid: { kind: 'rows', widths: [1, 3, 3, 1] }, symmetry: 'none' },
  ] as const;
  for (const c of cases) {
    const r = generate({ grid: c.grid, symmetry: c.symmetry, seed: 'margazhi' });
    assert.equal(r.achieved.isOneStroke, true, JSON.stringify(c));
    assert.equal(r.achieved.symmetryHolds, true);
  }
});

test('same seed is byte-identical; different seeds differ', () => {
  const a = generate({ grid: { kind: 'diamond', rows: 7 }, symmetry: 'C4', seed: 'x' });
  const b = generate({ grid: { kind: 'diamond', rows: 7 }, symmetry: 'C4', seed: 'x' });
  assert.equal(canonicalJSON(a.doc), canonicalJSON(b.doc));
  const c = generate({ grid: { kind: 'diamond', rows: 7 }, symmetry: 'C4', seed: 'y' });
  assert.notEqual(canonicalJSON(a.doc), canonicalJSON(c.doc));
});

test('density parameter shifts the open-gate ratio', () => {
  const mid = generate({ grid: { kind: 'diamond', rows: 9 }, symmetry: 'C4', density: 0.5, seed: 'd', strokes: 'any' });
  assert.ok(mid.achieved.openRatio > 0.2 && mid.achieved.openRatio < 0.8);
  const hi = generate({ grid: { kind: 'diamond', rows: 9 }, symmetry: 'C4', density: 0.95, seed: 'd', strokes: 'any' });
  const lo = generate({ grid: { kind: 'diamond', rows: 9 }, symmetry: 'C4', density: 0.05, seed: 'd', strokes: 'any' });
  assert.ok(hi.achieved.openRatio > mid.achieved.openRatio);
  assert.ok(lo.achieved.openRatio < mid.achieved.openRatio);
});

test('known one-stroke count: 1-5-1 has 240 one-stroke of 65536 (Yanagisawa-Nagata)', () => {
  // exhaustive over all 2^16 gate matrices of the 1-5-1 diamond
  const grid = buildGrid({ kind: 'diamond', rows: 5 });
  const sys = buildGates(grid, 'all-closed');
  assert.equal(sys.interior.length, 16);
  let count = 0;
  const n = 1n << 16n;
  for (let idx = 0n; idx < n; idx++) {
    for (let i = 0; i < 16; i++) {
      const open = ((idx >> BigInt(i)) & 1n) === 1n;
      const g = sys.interior[i]!;
      sys.states.set(`${g.node.x},${g.node.y}`, open ? 'open' : 'closed');
    }
    if (physicalLoops(sys).length === 1) count++;
  }
  assert.equal(count, 240);
});
