/**
 * Hit-testing tests on a 2x2 square grid (dots (0,0),(2,0),(0,2),(2,2)):
 *  - pickDot: exact hit, tolerance cutoff, deterministic tie-break by
 *    canonical dot order (sorted by y, then x)
 *  - pickGate: interior channels report interior=true, boundary nodes
 *    interior=false; distance is measured to the channel segment, not just
 *    the midpoint; ties break by canonical node key; maxDist cutoffs
 *  - channelSegment agrees with flanks; squaredDistPointSegment is exact
 *    (integer results on lattice inputs)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pt } from '../src/core/types.js';
import { buildGrid } from '../src/core/grid.js';
import { buildGates, flanks } from '../src/core/gates.js';
import { channelSegment, pickDot, pickGate, squaredDistPointSegment } from '../src/core/pick.js';

const grid = buildGrid({ kind: 'square', size: 2 });
const sys = buildGates(grid, 'all-closed');

test('pickDot hits the nearest dot within tolerance', () => {
  assert.deepEqual(pickDot(grid, pt(0, 0), 0.5), pt(0, 0));
  // closest point of (2,0), within reach
  assert.deepEqual(pickDot(grid, pt(1, 0), 1), pt(0, 0));
  assert.deepEqual(pickDot(grid, pt(1.6, 0), 0.5), pt(2, 0));
  assert.deepEqual(pickDot(grid, pt(1, 1), 0.7), null); // cell center: dist sqrt(2) to every dot
  assert.deepEqual(pickDot(grid, pt(10, 10), 1), null);
});

test('pickDot ties break by canonical order (y, then x)', () => {
  // equidistant between (0,0) and (2,0): canonical order picks (0,0)
  assert.deepEqual(pickDot(grid, pt(1, 0), 1), pt(0, 0));
});

test('pickGate distinguishes interior channels from boundary nodes', () => {
  const hit = pickGate(sys, pt(1, 0), 0.5);
  assert.ok(hit);
  assert.deepEqual(hit.node, pt(1, 0));
  assert.equal(hit.interior, true);
  assert.deepEqual(hit.a, pt(0, 0));
  assert.deepEqual(hit.b, pt(2, 0));

  const boundary = pickGate(sys, pt(-1, 0), 0.5);
  assert.ok(boundary);
  assert.deepEqual(boundary.node, pt(-1, 0));
  assert.equal(boundary.interior, false);
});

test('pickGate measures distance to the segment, not just the midpoint', () => {
  // over the middle of channel (0,0)-(2,0) but shifted up 0.75: still nearest that channel
  const hit = pickGate(sys, pt(1, 0.75), 1);
  assert.ok(hit);
  assert.deepEqual(hit.node, pt(1, 0));
  // but not within a tight tolerance
  assert.equal(pickGate(sys, pt(1, 0.75), 0.5), null);
});

test('pickGate ties break by canonical node key', () => {
  // cell center (1,1) is distance 1 from all four interior channels;
  // smallest node key "0,1" wins
  const hit = pickGate(sys, pt(1, 1), 1);
  assert.ok(hit);
  assert.deepEqual(hit.node, pt(0, 1));
});

test('channelSegment matches flanks', () => {
  for (const node of sys.nodes) {
    const [a, b] = channelSegment(node);
    const [f0, f1] = flanks(node);
    assert.deepEqual([a, b], [f0, f1]);
  }
});

test('squaredDistPointSegment is exact on lattice inputs', () => {
  // perpendicular distance to a horizontal segment
  assert.equal(squaredDistPointSegment(pt(1, 3), pt(0, 0), pt(2, 0)), 9);
  // projection clamps to endpoints
  assert.equal(squaredDistPointSegment(pt(-1, 1), pt(0, 0), pt(2, 0)), 2);
  assert.equal(squaredDistPointSegment(pt(3, 1), pt(0, 0), pt(2, 0)), 2);
  // on the segment
  assert.equal(squaredDistPointSegment(pt(1, 0), pt(0, 0), pt(2, 0)), 0);
  // degenerate segment
  assert.equal(squaredDistPointSegment(pt(1, 1), pt(0, 0), pt(0, 0)), 2);
});
