/**
 * Hit-testing primitives: nearest-feature queries over the model geometry,
 * for canvas applications (pointer picking, pen strokes sweeping channels).
 *
 * All inputs are INTERNAL coordinates (see types.ts); convert display-space
 * points with `fromDisplay` and tolerances with `scaleDistance` from
 * coords.ts. Channel segments are axis-aligned lattice segments of length 2
 * and lattice points are integers, so squared distances and the projection
 * parameter t = k/2 are exact dyadic rationals — comparisons involve no
 * float error. Ties break deterministically by canonical key, so repeated
 * queries over the same geometry always return the same feature.
 */
import { Pt } from './types.js';
import { DotGrid } from './grid.js';
import { GateSystem, flanks, nodeKey } from './gates.js';

/** The channel segment of a node: the lattice line between its two flanking positions. */
export function channelSegment(node: Pt): [Pt, Pt] {
  return flanks(node);
}

/** Squared distance from p to the closest point on segment [a, b]. */
export function squaredDistPointSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return apx * apx + apy * apy;
  const t = Math.max(0, Math.min(1, (abx * apx + aby * apy) / len2));
  const dx = apx - t * abx;
  const dy = apy - t * aby;
  return dx * dx + dy * dy;
}

/** Nearest dot within maxDist (internal units), or null. */
export function pickDot(grid: DotGrid, p: Pt, maxDist: number): Pt | null {
  let best: Pt | null = null;
  let bestD2 = Infinity;
  for (const d of grid.dots) {
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= maxDist * maxDist && (best === null || d2 < bestD2)) {
      best = d;
      bestD2 = d2;
    }
  }
  return best;
}

export interface GateHit {
  /** Channel midpoint (the gate node). */
  node: Pt;
  /** Flanking lattice positions (the channel segment endpoints). */
  a: Pt;
  b: Pt;
  /** True if both flanks are dotted: an interior gate carrying one bit. */
  interior: boolean;
}

/** Nearest channel (interior or boundary node) within maxDist of p, or null. */
export function pickGate(sys: GateSystem, p: Pt, maxDist: number): GateHit | null {
  const interiorKeys = new Set(sys.interior.map((g) => nodeKey(g.node)));
  const maxD2 = maxDist * maxDist;
  let best: GateHit | null = null;
  let bestD2 = 0;
  let bestKey = '';
  for (const node of sys.nodes) {
    const [f0, f1] = flanks(node);
    const d2 = squaredDistPointSegment(p, f0, f1);
    if (d2 > maxD2) continue;
    const key = nodeKey(node);
    if (best === null || d2 < bestD2 || (d2 === bestD2 && key < bestKey)) {
      best = { node, a: f0, b: f1, interior: interiorKeys.has(key) };
      bestD2 = d2;
      bestKey = key;
    }
  }
  return best;
}
