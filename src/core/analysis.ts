/**
 * Analysis: loop counts, one-stroke certificate, primitive classification.
 *
 * One-stroke certificate: the trace permutation's orbits partition ALL valid
 * directed states; oneStroke <=> exactly one orbit <=> the traced segment
 * count equals the total number of valid states (equivalent to the npj-2026
 * certificate N_p = N_px = 4 * N_S on full grids).
 *
 * Primitives (Sivakumar & Sivakumar 2026, Fig. 6; names from Gopalan):
 * per dot, by its open interior gates: 0 = circle (island), 1 = drop,
 * 2 adjacent = door, 2 opposite = eye, 3 = fan, 4 = diamond.
 */
import { Pt, pt, ptKey, Primitive } from './types.js';
import { GateSystem, nodeKey } from './gates.js';
import { traceAll, allStates } from './trace.js';
import { Analysis } from './types.js';

export function analyze(sys: GateSystem): Analysis {
  // Orbits come in forward/reverse orientation pairs (the state space traces
  // each physical curve in both directions): physical loops = orbits / 2.
  const orbits = traceAll(sys).length;
  const total = allStates(sys).length / 2;
  const primitiveCounts: Record<Primitive, number> = {
    circle: 0,
    drop: 0,
    door: 0,
    eye: 0,
    fan: 0,
    diamond: 0,
  };
  for (const d of sys.grid.dots) {
    const prim = classifyDot(sys, d);
    primitiveCounts[prim] += 1;
  }
  return {
    dotCount: sys.grid.dots.length,
    gateCount: sys.interior.length,
    loopCount: orbits / 2,
    isOneStroke: orbits === 2,
    totalSegments: total,
    primitiveCounts,
  };
}

/** Side labels for a dot's channels. */
function openSides(sys: GateSystem, d: Pt): { n: boolean; e: boolean; s: boolean; w: boolean } {
  const sides: [string, Pt][] = [
    ['n', pt(d.x, d.y + 1)],
    ['e', pt(d.x + 1, d.y)],
    ['s', pt(d.x, d.y - 1)],
    ['w', pt(d.x - 1, d.y)],
  ];
  const out = { n: false, e: false, s: false, w: false };
  for (const [k, node] of sides) {
    if (sys.states.get(nodeKey(node)) === 'open') out[k as keyof typeof out] = true;
  }
  return out;
}

export function classifyDot(sys: GateSystem, d: Pt): Primitive {
  const { n, e, s, w } = openSides(sys, d);
  const count = [n, e, s, w].filter(Boolean).length;
  switch (count) {
    case 0:
      return 'circle';
    case 1:
      return 'drop';
    case 2:
      if ((n && s) || (e && w)) return 'eye';
      return 'door';
    case 3:
      return 'fan';
    default:
      return 'diamond';
  }
}

/** Verify the trace covers every valid state exactly once (P1/P2 certificate). */
export function coverageOK(sys: GateSystem): boolean {
  const total = allStates(sys).length;
  const traced = traceAll(sys).reduce((acc, o) => acc + o.states.length, 0);
  return traced === total;
}

/** Minimum distance from any dot to any stroke geometry (P3 check helper). */
export function minDotDistance(sys: GateSystem, strokes: { kind: string; from?: [number, number]; to?: [number, number]; center?: [number, number]; a0?: number; a1?: number; sweep?: string }[]): number {
  let min = Infinity;
  const dots: [number, number][] = sys.grid.dots.map((d) => [d.x / 2, d.y / 2]);
  for (const st of strokes) {
    for (const [dx, dy] of dots) {
      if (st.kind === 'line' && st.from && st.to) {
        min = Math.min(min, pointSegDist(dx, dy, st.from, st.to));
      } else if (st.kind === 'arc' && st.center) {
        // sample the arc
        const r = 0.5;
        const c = st.center;
        // parametrize short way according to sweep
        let a0 = st.a0 ?? 0;
        let a1 = st.a1 ?? 0;
        let delta = a1 - a0;
        if (st.sweep === 'cw') while (delta > 0) delta -= 2 * Math.PI;
        if (st.sweep === 'ccw') while (delta < 0) delta += 2 * Math.PI;
        const steps = Math.max(2, Math.ceil(Math.abs(delta) / (Math.PI / 16)));
        for (let i = 0; i <= steps; i++) {
          const a = a0 + (delta * i) / steps;
          const px = c[0] + r * Math.cos(a);
          const py = c[1] + r * Math.sin(a);
          min = Math.min(min, Math.hypot(px - dx, py - dy));
        }
      }
    }
  }
  return min;
}

function pointSegDist(px: number, py: number, a: [number, number], b: [number, number]): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = px - a[0];
  const wy = py - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
}
