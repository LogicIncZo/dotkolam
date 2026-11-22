/**
 * The trace: kolam line(s) as orbits of a permutation on directed states.
 *
 * A directed state (m, d) means: a strand arrives at node m having travelled
 * the diagonal segment (m - d) -> m with heading d. The state is VALID iff
 * the lattice cell containing that segment holds a dot:
 *    H-node (x odd):  cell = (m.x - d.x, m.y)
 *    V-node (x even): cell = (m.x, m.y - d.y)
 *
 * Transition (one gate):
 *    open   -> continue straight:  d' = d
 *    closed -> reflect in the channel: H-node: d' = (-d.x, d.y);  V-node: d' = (d.x, -d.y)
 *    next node: m' = m + d'
 *
 * The map (m, d) -> (m', d') is a permutation of the finite set of valid
 * directed states, so every orbit is a CLOSED cycle: closed curves only, no
 * loose ends, no retracing (P1; see docs/verification.md).
 *
 * Rendering (per-piece rule, verified against the classic 1-dot circle and
 * 2-dot figure-eight): the piece LEAVING node m (towards m' = m + d_out) is
 *  - a straight chord, if the gate at m is open (the strand crosses m);
 *  - a quarter-arc of radius 1 around the piece's flanking dot
 *    c = arrivalCell(m', d'), if the gate at m is closed (the strand turns).
 * Consecutive collinear chords merge into one line stroke; consecutive arcs
 * around the same dot merge into one arc (semicircles for U-turns, a full
 * circle for an isolated dot).
 */
import { Pt, pt, ptKey, Heading, HEADINGS, DState, dstateKey, Stroke, Curve } from './types.js';
import { GateSystem, nodeKey } from './gates.js';

/** The dotted cell a segment travelling with heading d arrives through at node m. */
export function arrivalCell(m: Pt, d: Heading): Pt {
  return m.x % 2 !== 0 ? pt(m.x - d.x, m.y) : pt(m.x, m.y - d.y);
}

export function isValidState(sys: GateSystem, m: Pt, d: Heading): boolean {
  return sys.grid.dotsSet.has(ptKey(arrivalCell(m, d)));
}

/** Enumerate all valid directed states in canonical order. */
export function allStates(sys: GateSystem): DState[] {
  const out: DState[] = [];
  for (const m of sys.nodes) {
    for (const d of HEADINGS) {
      if (isValidState(sys, m, d)) out.push({ m, d });
    }
  }
  return out;
}

/** Heading leaving node m: straight through an open gate, else reflected. */
export function outHeading(sys: GateSystem, m: Pt, d: Heading): Heading {
  if (sys.states.get(nodeKey(m)) === 'open') return d;
  return m.x % 2 !== 0 ? pt(-d.x, d.y) : pt(d.x, -d.y);
}

/** One step of the permutation. */
export function step(sys: GateSystem, s: DState): DState {
  const d = outHeading(sys, s.m, s.d);
  return { m: pt(s.m.x + d.x, s.m.y + d.y), d };
}

export interface Orbit {
  states: DState[]; // each state = one lattice segment (m-d -> m); orbit is a closed cycle
}

/** Trace all orbits (closed curves) of the gate system. */
export function traceAll(sys: GateSystem): Orbit[] {
  const visited = new Set<string>();
  const orbits: Orbit[] = [];
  for (const start of allStates(sys)) {
    if (visited.has(dstateKey(start))) continue;
    const states: DState[] = [];
    let cur = start;
    while (!visited.has(dstateKey(cur))) {
      visited.add(dstateKey(cur));
      states.push(cur);
      cur = step(sys, cur);
    }
    orbits.push({ states });
  }
  return orbits;
}

interface Piece {
  from: Pt;
  to: Pt;
  kind: 'line' | 'arc';
  center?: Pt; // arc only
}

/** Split an orbit into renderable pieces. */
function orbitPieces(sys: GateSystem, orbit: Orbit): Piece[] {
  const pieces: Piece[] = [];
  for (const s of orbit.states) {
    const dOut = outHeading(sys, s.m, s.d);
    const to = pt(s.m.x + dOut.x, s.m.y + dOut.y);
    if (sys.states.get(nodeKey(s.m)) === 'open') {
      pieces.push({ from: s.m, to, kind: 'line' });
    } else {
      pieces.push({ from: s.m, to, kind: 'arc', center: arrivalCell(to, dOut) });
    }
  }
  return pieces;
}

const ptsEq = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

/** Merge pieces into strokes (cyclically: the loop may close mid-stroke). */
function mergePieces(pieces: Piece[], disp: (p: Pt) => [number, number]): Stroke[] {
  const n = pieces.length;
  if (n === 0) return [];
  // find a stroke boundary to start from (piece i starts a new stroke if it is
  // not continuable with piece i-1): prefer starting at a line->arc or arc->line
  // or arc center change or direction change boundary; if the whole loop is one
  // kind (e.g. all arcs around one dot = circle), start at 0.
  let start = 0;
  for (let i = 0; i < n; i++) {
    const prev = pieces[(i - 1 + n) % n]!;
    const cur = pieces[i]!;
    if (!continuable(prev, cur)) {
      start = i;
      break;
    }
  }
  const strokes: Stroke[] = [];
  let curLine: { from: Pt; to: Pt } | null = null;
  let curArc: { center: Pt; a0: number } | null = null;
  let curArcTotal = 0; // signed radians accumulated (ccw positive)
  const flushLine = () => {
    if (curLine && !ptsEq(curLine.from, curLine.to)) {
      strokes.push({ kind: 'line', from: disp(curLine.from), to: disp(curLine.to) });
    }
    curLine = null;
  };
  const flushArc = () => {
    if (curArc) {
      // a1 keeps the accumulated winding: quarter arcs around the same dot
      // merge into 90/180/270/360-degree strokes without collapsing to the
      // short way between endpoints.
      strokes.push({
        kind: 'arc',
        center: disp(curArc.center),
        r: 0.5,
        a0: curArc.a0,
        a1: curArc.a0 + curArcTotal,
        sweep: curArcTotal >= 0 ? 'ccw' : 'cw',
      });
    }
    curArc = null;
    curArcTotal = 0;
  };
  for (let k = 0; k < n; k++) {
    const p = pieces[(start + k) % n]!;
    if (p.kind === 'line') {
      if (curArc) flushArc();
      if (!curLine) curLine = { from: p.from, to: p.to };
      else curLine.to = p.to;
    } else {
      if (curLine) flushLine();
      const sense = sweepSense(p.from, p.to, p.center!);
      const delta = (sense === 'ccw' ? 1 : -1) * (Math.PI / 2);
      if (!curArc) {
        curArc = { center: p.center!, a0: angleOf(p.from, p.center!) };
        curArcTotal = delta;
      } else if (
        ptsEq(curArc.center, p.center!) &&
        Math.sign(delta) === Math.sign(curArcTotal)
      ) {
        curArcTotal += delta;
      } else {
        flushArc();
        curArc = { center: p.center!, a0: angleOf(p.from, p.center!) };
        curArcTotal = delta;
      }
    }
  }
  // The loop was started at a run boundary, so a plain flush is correct:
  // runs that wrap the cyclic start were already accumulated in order, and a
  // fully-uniform loop (e.g. a circle) flushes from==to as a full-circle arc.
  flushLine();
  flushArc();
  return strokes;
}

function continuable(prev: Piece, cur: Piece): boolean {
  if (!ptsEq(prev.to, cur.from)) return false;
  if (prev.kind !== cur.kind) return false;
  if (prev.kind === 'line') {
    // collinear continuation (same direction)
    const d1 = pt(prev.to.x - prev.from.x, prev.to.y - prev.from.y);
    const d2 = pt(cur.to.x - cur.from.x, cur.to.y - cur.from.y);
    return d1.x === d2.x && d1.y === d2.y;
  }
  return prev.center !== undefined && cur.center !== undefined && ptsEq(prev.center, cur.center);
}

function angleOf(p: Pt, c: Pt): number {
  return Math.atan2(p.y - c.y, p.x - c.x);
}

/** Quarter-arc sweep sense via cross product (short way, 90 degrees). */
function sweepSense(from: Pt, to: Pt, c: Pt): 'cw' | 'ccw' {
  const ax = from.x - c.x;
  const ay = from.y - c.y;
  const bx = to.x - c.x;
  const by = to.y - c.y;
  return ax * by - ay * bx > 0 ? 'ccw' : 'cw';
}

const dispHalf = (p: Pt): [number, number] => [p.x / 2, p.y / 2];

/** Convert an orbit into a Kolam-JSON curve (display units). */
export function orbitToCurve(sys: GateSystem, orbit: Orbit, id: string, mode: 'lattice' | 'smooth' = 'lattice'): Curve {
  const pieces = orbitPieces(sys, orbit);
  if (mode === 'lattice') {
    return { id, closed: true, strokes: mergePieces(pieces, dispHalf) };
  }
  return { id, closed: true, strokes: smoothPieces(pieces, dispHalf) };
}

/**
 * Smooth (tangent) geometry: every 90-degree corner at a closed node is
 * rounded by the circle of radius rho = sqrt(2)/2 (internal units) centered
 * on the corner's flanking dot; the two 45-degree chord lines through the
 * corner node are each at distance rho from that dot, so the circle is
 * exactly tangent to both. Each lattice segment is trimmed by the tangent
 * length T = sqrt(2)/2 at each turning end (segments between two turns
 * around the same dot shrink to nothing and their arcs merge). The result is
 * G1-continuous and everywhere at distance sqrt(2)/4 (display units) from
 * the dots it weaves around: the traditional smooth kambi look.
 */
interface Elem {
  kind: 'line' | 'arc';
  a: Pt; // start point
  b: Pt; // end point
  center?: Pt; // arc only
}

function smoothPieces(pieces: Piece[], disp: (p: Pt) => [number, number]): Stroke[] {
  const n = pieces.length;
  if (n === 0) return [];
  const T = Math.SQRT1_2; // tangent length == tangent-circle radius (internal)

  const turnAt = (i: number): boolean => pieces[i]!.kind === 'arc';
  const dirOf = (p: Piece): Pt => {
    const l = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y);
    return pt((p.to.x - p.from.x) / l, (p.to.y - p.from.y) / l);
  };

  // Elementary strokes in curve order: for each piece i, the corner arc at
  // piece i's departure node (if it turns), then piece i's trimmed interval.
  const ordered: Elem[] = [];
  for (let i = 0; i < n; i++) {
    if (turnAt(i)) {
      const p = pieces[i]!;
      const prev = pieces[(i - 1 + n) % n]!;
      const u = dirOf(p);
      const up = dirOf(prev);
      ordered.push({
        kind: 'arc',
        a: pt(p.from.x - up.x * T, p.from.y - up.y * T),
        b: pt(p.from.x + u.x * T, p.from.y + u.y * T),
        center: p.center!, // arc pieces always carry their center
      });
    }
    const p = pieces[i]!;
    const u = dirOf(p);
    const trimStart = turnAt(i) ? T : 0;
    const trimEnd = turnAt((i + 1) % n) ? T : 0;
    const a = pt(p.from.x + u.x * trimStart, p.from.y + u.y * trimStart);
    const b = pt(p.to.x - u.x * trimEnd, p.to.y - u.y * trimEnd);
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) {
      ordered.push({ kind: 'line', a, b });
    }
  }

  // Merge chained elements cyclically (collinear lines; same-center arcs),
  // accumulating arc winding in quarter multiples of the corner sense.
  const m = ordered.length;
  if (m === 0) return [];
  let start = 0;
  for (let i = 0; i < m; i++) {
    const prev = ordered[(i - 1 + m) % m]!;
    const cur = ordered[i]!;
    if (!chainable(prev, cur)) {
      start = i;
      break;
    }
  }
  const strokes: Stroke[] = [];
  let line: { a: Pt; b: Pt } | null = null;
  let arc: { c: Pt; a0: number; total: number } | null = null;
  const flushLine = () => {
    if (line && !ptsEq(line.a, line.b)) strokes.push({ kind: 'line', from: disp(line.a), to: disp(line.b) });
    line = null;
  };
  const flushArc = () => {
    if (arc && Math.abs(arc.total) > 1e-9) {
      strokes.push({
        kind: 'arc',
        center: disp(arc.c),
        r: T / 2,
        a0: arc.a0,
        a1: arc.a0 + arc.total,
        sweep: arc.total >= 0 ? 'ccw' : 'cw',
      });
    }
    arc = null;
  };
  for (let k = 0; k < m; k++) {
    const e = ordered[(start + k) % m]!;
    if (e.kind === 'line') {
      if (arc) flushArc();
      if (!line) line = { a: e.a, b: e.b };
      else line.b = e.b;
    } else {
      if (line) flushLine();
      const sense = sweepSense(e.a, e.b, e.center!);
      const delta = (sense === 'ccw' ? 1 : -1) * (Math.PI / 2);
      if (arc && ptsEq(arc.c, e.center!) && Math.sign(delta) === Math.sign(arc.total)) {
        arc.total += delta;
      } else {
        if (arc) flushArc();
        arc = { c: e.center!, a0: Math.atan2(e.a.y - e.center!.y, e.a.x - e.center!.x), total: delta };
      }
    }
  }
  flushLine();
  flushArc();
  return strokes;

  function chainable(prev: Elem, cur: Elem): boolean {
    if (!ptsEq(prev.b, cur.a)) return false;
    if (prev.kind !== cur.kind) return false;
    if (prev.kind === 'line') {
      const d1 = dirOf({ from: prev.a, to: prev.b, kind: 'line' } as Piece);
      const d2 = dirOf({ from: cur.a, to: cur.b, kind: 'line' } as Piece);
      return Math.abs(d1.x - d2.x) < 1e-9 && Math.abs(d1.y - d2.y) < 1e-9;
    }
    return !!prev.center && !!cur.center && ptsEq(prev.center, cur.center);
  }
}

/**
 * Undirected-edge signature of an orbit: the multiset of lattice edges, each
 * normalised "minNode-maxNode". The forward and reverse orientations of a
 * physical curve share the same signature, which identifies orientation pairs.
 */
export function orbitSignature(orbit: Orbit): string {
  const edges = orbit.states.map((s) => {
    const p1 = `${s.m.x - s.d.x},${s.m.y - s.d.y}`;
    const p2 = `${s.m.x},${s.m.y}`;
    return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
  });
  edges.sort();
  return edges.join(';');
}

/**
 * Physical loops: one per orientation pair. The directed state space contains
 * each curve twice (drawn forwards and backwards); orbits pair up by signature.
 */
export function physicalLoops(sys: GateSystem): Orbit[] {
  const seen = new Set<string>();
  const out: Orbit[] = [];
  for (const o of traceAll(sys)) {
    const sig = orbitSignature(o);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(o);
  }
  return out;
}

/** Trace and convert every physical loop; canonical ordering, with drawing order. */
export function traceCurves(
  sys: GateSystem,
  mode: 'lattice' | 'smooth' = 'lattice',
): { curves: Curve[]; drawingOrder: string[] } {
  const orbits = physicalLoops(sys);
  orbits.sort((a, b) => {
    const ka = dstateKey(a.states[0]!);
    const kb = dstateKey(b.states[0]!);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const curves = orbits.map((o, i) => orbitToCurve(sys, o, `c${i + 1}`, mode));
  return { curves, drawingOrder: curves.map((c) => c.id) };
}
