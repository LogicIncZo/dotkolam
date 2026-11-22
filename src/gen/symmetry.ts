/**
 * Symmetry groups on the internal lattice, acting about the grid's bounding
 * box center (an even lattice point for all supported grids). Orbits of the
 * interior gates under the group let the generator assign one bit per orbit,
 * guaranteeing a symmetric pattern by construction.
 */
import { Pt, pt, ptEq } from '../core/types.js';
import { GateSystem } from '../core/gates.js';

export type SymGroup = 'none' | 'D1' | 'D2' | 'C4' | 'D4';

export type PointMap = (p: Pt) => Pt;

export function groupMaps(group: SymGroup, center: Pt): PointMap[] {
  const c = center;
  const T = (p: Pt): Pt => pt(p.x - c.x, p.y - c.y);
  const back = (p: Pt): Pt => pt(p.x + c.x, p.y + c.y);
  const id: PointMap = (p) => p;
  const r90: PointMap = (p) => back(pt(-T(p).y, T(p).x));
  const r180: PointMap = (p) => back(pt(-T(p).x, -T(p).y));
  const r270: PointMap = (p) => back(pt(T(p).y, -T(p).x));
  const fx: PointMap = (p) => back(pt(-T(p).x, T(p).y)); // mirror across the y axis
  const fy: PointMap = (p) => back(pt(T(p).x, -T(p).y)); // mirror across the x axis
  const fd: PointMap = (p) => back(pt(T(p).y, T(p).x)); // main diagonal
  const fa: PointMap = (p) => back(pt(-T(p).y, -T(p).x)); // anti-diagonal
  switch (group) {
    case 'none':
      return [id];
    case 'D1':
      return [id, fx];
    case 'D2':
      return [id, r180, fx, fy];
    case 'C4':
      return [id, r90, r180, r270];
    case 'D4':
      return [id, r90, r180, r270, fx, fy, fd, fa];
  }
}

/** Exact bounding-box center (integer: dot coords are even, so min+max is even). */
export function gridCenter(sys: GateSystem): Pt {
  const xs = sys.grid.dots.map((d) => d.x);
  const ys = sys.grid.dots.map((d) => d.y);
  return pt((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
}

export interface OrbitSet {
  orbits: Pt[][]; // node keys as points (gate nodes), canonical order
  /** node key -> orbit index */
  orbitOf: Map<string, number>;
  center: Pt;
}

/** Partition interior gates into symmetry orbits. */
export function gateOrbits(sys: GateSystem, group: SymGroup): OrbitSet {
  const center = gridCenter(sys);
  const maps = groupMaps(group, center);
  const seen = new Set<string>();
  const orbits: Pt[][] = [];
  const orbitOf = new Map<string, number>();
  for (const g of sys.interior) {
    const k = `${g.node.x},${g.node.y}`;
    if (seen.has(k)) continue;
    const orbit: Pt[] = [];
    for (const m of maps) {
      const q = m(g.node);
      const qk = `${q.x},${q.y}`;
      if (!seen.has(qk)) {
        seen.add(qk);
        orbit.push(q);
      }
    }
    const idx = orbits.length;
    orbits.push(orbit);
    for (const q of orbit) orbitOf.set(`${q.x},${q.y}`, idx);
  }
  orbits.sort((a, b) => {
    const ka = a[0]!, kb = b[0]!;
    return ka.y - kb.y || ka.x - kb.x;
  });
  orbits.forEach((o, i) => o.forEach((q) => orbitOf.set(`${q.x},${q.y}`, i)));
  return { orbits, orbitOf, center };
}

/** Verify the current gate assignment is invariant under the group. */
export function symmetryHolds(sys: GateSystem, group: SymGroup): boolean {
  if (group === 'none') return true;
  const center = gridCenter(sys);
  const maps = groupMaps(group, center).slice(1);
  for (const g of sys.interior) {
    const s = sys.states.get(`${g.node.x},${g.node.y}`);
    for (const m of maps) {
      const q = m(g.node);
      const qs = sys.states.get(`${q.x},${q.y}`);
      if (qs === undefined) {
        // mapped node outside the grid: the orbit was clipped; the grid itself
        // is not symmetric under this group -> pattern cannot be either.
        return false;
      }
      if (s !== qs) return false;
    }
  }
  return true;
}

/** Geometric symmetry of the dot set itself (ignores gate states). */
export function gridSupportsGroup(sys: GateSystem, group: SymGroup): boolean {
  if (group === 'none') return true;
  const center = gridCenter(sys);
  const maps = groupMaps(group, center).slice(1);
  for (const d of sys.grid.dots) {
    for (const m of maps) {
      const q = m(d);
      if (!sys.grid.dotsSet.has(`${q.x},${q.y}`)) return false;
    }
  }
  return true;
}

const _unusedPtEq = ptEq; // keep import used
void _unusedPtEq;
