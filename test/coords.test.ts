/**
 * Coordinate conversion tests — internal <-> display frames:
 *  - toDisplay/fromDisplay are exact mutual inverses on the lattice
 *  - display features land where the spec says: dots on integers,
 *    nodes on half-integers, arc radius 0.5 (internal 1)
 *  - scaleDistance doubles tolerances display -> internal
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pt } from '../src/core/types.js';
import { toDisplay, fromDisplay, scaleDistance } from '../src/core/coords.js';
import { buildGrid } from '../src/core/grid.js';
import { buildGates } from '../src/core/gates.js';

test('toDisplay/fromDisplay round-trip exactly on the integer lattice', () => {
  const pts = [pt(0, 0), pt(2, 4), pt(-3, 5), pt(-6, -2), pt(1, 7)];
  for (const p of pts) {
    assert.deepEqual(fromDisplay(toDisplay(p)), p);
    assert.deepEqual(toDisplay(fromDisplay(p)), p);
  }
});

test('display frame: dots on integers, nodes on half-integers', () => {
  // square 2x2: dots (0,0),(2,0),(0,2),(2,2) internal; H-node at (1,0), V-node at (0,1)
  const grid = buildGrid({ kind: 'square', size: 2 });
  const dotDisplays = grid.dots.map(toDisplay);
  for (const d of dotDisplays) {
    assert.equal(d.x % 1, 0, `dot x ${d.x} should be an integer`);
    assert.equal(d.y % 1, 0, `dot y ${d.y} should be an integer`);
  }
  const sys = buildGates(grid, 'all-closed');
  const nodes = sys.nodes.map(toDisplay);
  for (const n of nodes) {
    const half = (v: number): boolean => Math.abs(v * 2 - Math.round(v * 2)) < 1e-12 && Math.abs(v % 1) > 1e-12;
    assert.ok(half(n.x) !== half(n.y), `node (${n.x},${n.y}) must be half-integer in exactly one axis`);
  }
});

test('scaleDistance doubles display tolerances into internal units', () => {
  assert.equal(scaleDistance(0.5), 1);
  assert.equal(scaleDistance(0), 0);
});
