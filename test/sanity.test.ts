/**
 * Model sanity tests — hand-verified ground truths:
 *  - single dot -> a circle (one loop, 4 segments -> one full-circle stroke)
 *  - two adjacent dots, open gate -> the classic single-loop figure-eight
 *    (one orbit of 8 segments, crossing once; gcd(1,2)=1 single curve)
 *  - two adjacent dots, closed gate -> two separate loops (gcd-like split)
 *  - 1x3 line of dots, all open -> gcd(1,3)=1 -> one loop
 *  - 2x2 square, all open -> gcd(2,2)=2 -> two loops (the classic 2x2 weave)
 *  - diamond rows=3 (1-3-1): 5 dots; plain open weave -> one stroke
 *    (Sivakumar & Sivakumar 2026: N_px = 2(ND^2+1) = 20 segments for ND=3)
 *  - diamond rows=5 (1-3-5-3-1): 13 dots, 16 interior gates (2^16 space)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/core/grid.js';
import { buildGates, encodeIndex, decodeIndex } from '../src/core/gates.js';
import { traceAll, traceCurves, allStates, physicalLoops } from '../src/core/trace.js';
import { analyze, coverageOK, minDotDistance } from '../src/core/analysis.js';

test('single dot renders a circle', () => {
  const grid = buildGrid({ kind: 'custom', dots: [[0, 0]] });
  const sys = buildGates(grid, 'all-open');
  const orbits = physicalLoops(sys);
  assert.equal(orbits.length, 1);
  assert.equal(orbits[0]!.states.length, 4);
  const { curves } = traceCurves(sys);
  const strokes = curves[0]!.strokes;
  assert.equal(strokes.length, 1);
  assert.equal(strokes[0]!.kind, 'arc');
  assert.equal(analyze(sys).isOneStroke, true);
  assert.ok(coverageOK(sys));
});

test('two dots, open gate: single-loop figure-eight', () => {
  const grid = buildGrid({ kind: 'custom', dots: [[0, 0], [1, 0]] });
  const sys = buildGates(grid, 'all-open');
  assert.equal(sys.interior.length, 1);
  const orbits = physicalLoops(sys);
  assert.equal(orbits.length, 1);
  assert.equal(orbits[0]!.states.length, 8);
  const a = analyze(sys);
  assert.equal(a.isOneStroke, true);
  assert.equal(a.loopCount, 1);
  assert.ok(coverageOK(sys));
  // curve geometry: two diagonal lines + two semicircle arcs (quarter-arcs
  // around the same dot merge into one stroke)
  const { curves } = traceCurves(sys);
  const c = curves[0]!;
  const lines = c.strokes.filter((s) => s.kind === 'line');
  const arcs = c.strokes.filter((s) => s.kind === 'arc');
  assert.equal(lines.length, 2);
  assert.equal(arcs.length, 2);
  // min distance to dots: lines pass at sqrt(2)/4, arcs graze at 0.5
  const d = minDotDistance(sys, c.strokes);
  assert.ok(Math.abs(d - Math.SQRT2 / 4) < 1e-9, `min dot distance ${d}`);
});

test('two dots, closed gate: two loops', () => {
  const grid = buildGrid({ kind: 'custom', dots: [[0, 0], [1, 0]] });
  const sys = buildGates(grid, 'all-closed');
  const orbits = physicalLoops(sys);
  assert.equal(orbits.length, 2);
  assert.equal(analyze(sys).isOneStroke, false);
  assert.ok(coverageOK(sys));
});

test('gcd behaviour of the plain weave (Gerdes/Jablan)', () => {
  const loops = (cols: number, rows: number) => {
    const grid = buildGrid({ kind: 'rectangle', cols, rows });
    const sys = buildGates(grid, 'all-open');
    assert.ok(coverageOK(sys));
    return physicalLoops(sys).length;
  };
  assert.equal(loops(1, 2), 1); // coprime
  assert.equal(loops(1, 3), 1);
  assert.equal(loops(2, 2), 2); // gcd 2
  assert.equal(loops(2, 4), 2);
  assert.equal(loops(3, 3), 3);
  assert.equal(loops(2, 3), 1);
  assert.equal(loops(3, 4), 1);
  assert.equal(loops(4, 4), 4);
});

test('diamond 1-3-1 (rows=3): 5 dots, plain weave is one stroke of 20 segments', () => {
  const grid = buildGrid({ kind: 'diamond', rows: 3 });
  assert.equal(grid.dots.length, 5);
  const sys = buildGates(grid, 'all-open');
  assert.equal(sys.interior.length, 4); // (ND-1)^2 = 4
  const orbits = physicalLoops(sys);
  assert.equal(orbits.length, 1);
  assert.equal(orbits[0]!.states.length, 20); // N_px = 2(ND^2+1) = 20
  assert.ok(coverageOK(sys));
});

test('diamond 1-5-1 (rows=5): 13 dots, 16 gates', () => {
  const grid = buildGrid({ kind: 'diamond', rows: 5 });
  assert.equal(grid.dots.length, 13); // (1+25)/2
  const sys = buildGates(grid, 'all-open');
  assert.equal(sys.interior.length, 16); // (ND-1)^2, 2^16 space (Yanagisawa-Nagata)
  assert.ok(coverageOK(sys));
  const a = analyze(sys);
  assert.ok(a.loopCount >= 1);
  assert.equal(a.dotCount, 13);
});

test('index round-trip on diamond 1-5-1', () => {
  const grid = buildGrid({ kind: 'diamond', rows: 5 });
  const sys = buildGates(grid, 'all-closed');
  const n = sys.interior.length;
  assert.equal(encodeIndex(sys), 1n);
  for (const g of sys.interior) sys.states.set(`${g.node.x},${g.node.y}`, 'open');
  assert.equal(encodeIndex(sys), 1n << BigInt(n));
  for (const idx of [1n, 2n, 12345n, (1n << BigInt(n)) - 7n, 1n << BigInt(n)]) {
    decodeIndex(sys, idx);
    assert.equal(encodeIndex(sys), idx);
  }
});

test('row widths of diamond', () => {
  assert.deepEqual(
    buildGrid({ kind: 'diamond', rows: 5 }).dots
      .map((d) => d.y)
      .reduce<Record<number, number>>((acc, y) => ((acc[y] = (acc[y] ?? 0) + 1), acc), {}),
    { '-4': 1, '-2': 3, '0': 5, '2': 3, '4': 1 },
  );
});
