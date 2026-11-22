/**
 * Renderer smoke tests:
 *  - renderSysSVG default (lattice) matches renderSVG over docFromSys output
 *  - renderSysSVG mode:'smooth' re-traces with tangent geometry: valid path
 *    structure, same number of curves, different geometry from lattice
 *  - smooth arcs have radius sqrt(2)/4 display units (rendering-only view;
 *    NOT Kolam-JSON-serializable, which fixes arc radius at 0.5)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/core/grid.js';
import { buildGates } from '../src/core/gates.js';
import { traceCurves } from '../src/core/trace.js';
import { docFromSys } from '../src/core/doc.js';
import { renderSVG, renderSysSVG, curveToPath } from '../src/render/svg.js';

const grid = buildGrid({ kind: 'square', size: 2 });
const sys = buildGates(grid, 'all-open'); // classic 2x2 weave: 2 loops

test('lattice renderSysSVG equals renderSVG over docFromSys', () => {
  const doc = docFromSys(sys, { includeCurves: true, includeAnalysis: false });
  assert.equal(renderSysSVG(sys), renderSVG(doc));
});

test('smooth mode renders the same curve count with different geometry', () => {
  const lattice = renderSysSVG(sys);
  const smooth = renderSysSVG(sys, { mode: 'smooth' });
  const paths = (svg: string): number => (svg.match(/<path /g) ?? []).length;
  assert.equal(paths(smooth), paths(lattice));
  assert.notEqual(smooth, lattice);
  assert.ok(smooth.includes('data-length='));
});

test('smooth arcs carry radius sqrt(2)/4 display units', () => {
  const { curves } = traceCurves(sys, 'smooth');
  const arcs = curves.flatMap((c) => c.strokes).filter((s) => s.kind === 'arc');
  assert.ok(arcs.length > 0);
  const expected = Math.sqrt(2) / 4;
  for (const s of arcs) {
    if (s.kind === 'arc') assert.ok(Math.abs(s.r - expected) < 1e-9, `arc r ${s.r} != ${expected}`);
  }
  // and the path data renders (no NaNs, arcs reference the radius)
  const d = curves.map(curveToPath).join(' ');
  assert.ok(!d.includes('NaN'));
});

test('smooth rendering of a single-dot circle still closes', () => {
  const g = buildGrid({ kind: 'custom', dots: [[0, 0]] });
  const s = buildGates(g, 'all-closed');
  const { curves } = traceCurves(s, 'smooth');
  assert.equal(curves.length, 1);
  assert.equal(curves[0]!.strokes.length, 1);
  const s0 = curves[0]!.strokes[0]!;
  assert.equal(s0.kind, 'arc');
  if (s0.kind === 'arc') assert.ok(Math.abs(Math.abs(s0.a1 - s0.a0) - 2 * Math.PI) < 1e-9); // full circle
  const svg = renderSysSVG(s, { mode: 'smooth' });
  assert.ok(svg.includes('A 0.354 0.354')); // full circle split into two semicircle arcs, r = sqrt(2)/4
  assert.ok(!svg.includes('NaN'));
});
