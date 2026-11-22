/**
 * KolamDoc validation: structural + semantic invariants (the machine-checkable
 * counterpart of the traditional rules; see SPEC.md).
 */
import { KolamDoc, Stroke } from './types.js';
import { buildGrid } from './grid.js';
import { buildGates, findGateByDots, encodeIndex } from './gates.js';
import { traceCurves } from './trace.js';
import { analyze, minDotDistance } from './analysis.js';
import { canonicalJSON } from './doc.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  level: 'L1' | 'L2' | 'L3'; // curves-only / +pattern / full
  issues: ValidationIssue[];
}

const CHANNEL_DIST = Math.SQRT2 / 4; // min distance of strokes to dots

export function validateDoc(doc: KolamDoc): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (doc.kolamVersion !== '1.0') add('kolamVersion', `unsupported kolamVersion ${JSON.stringify(doc.kolamVersion)}`);
  if (!doc.grid || !doc.grid.spec) {
    add('grid', 'grid.spec is required');
    return { valid: false, level: 'L1', issues };
  }

  // --- grid builds ---
  let sys: ReturnType<typeof buildGates> | null = null;
  try {
    const grid = buildGrid(doc.grid.spec);
    sys = buildGates(grid, 'all-closed');
  } catch (e) {
    add('grid.spec', `invalid grid: ${(e as Error).message}`);
    return { valid: false, level: 'L1', issues };
  }

  // --- pattern ---
  let hasPattern = false;
  if (doc.pattern) {
    hasPattern = true;
    const seen = new Set<string>();
    for (const [i, g] of doc.pattern.gates.entries()) {
      const node = findGateByDots(sys, g.a, g.b);
      if (!node) {
        add(`pattern.gates[${i}]`, 'not a channel between two adjacent dots of the grid');
        continue;
      }
      const key = `${node.x},${node.y}`;
      if (seen.has(key)) add(`pattern.gates[${i}]`, 'duplicate gate');
      seen.add(key);
      if (g.state !== 'open' && g.state !== 'closed') {
        add(`pattern.gates[${i}].state`, `state must be 'open'|'closed', got ${JSON.stringify(g.state)}`);
      }
    }
    if (doc.pattern.index !== undefined) {
      for (const g of doc.pattern.gates) {
        const node = findGateByDots(sys, g.a, g.b);
        if (node) sys.states.set(`${node.x},${node.y}`, g.state);
      }
      if (encodeIndex(sys).toString() !== doc.pattern.index) {
        add('pattern.index', 'prastāra index does not match gates');
      }
    }
    if (sys.interior.length !== seen.size && issues.length === 0) {
      // gates optional (partial) is allowed at L2? No: pattern must be complete.
      add('pattern.gates', `expected ${sys.interior.length} gates, found ${seen.size}`);
    }
  }

  // --- curves ---
  const docCurves = doc.curves ?? [];
  let hasCurves = docCurves.length > 0;
  if (hasCurves) {
    const dots: [number, number][] = sys.grid.dots.map((d) => [d.x / 2, d.y / 2]);
    const allStrokes: Stroke[] = [];
    for (const [ci, c] of docCurves.entries()) {
      if (c.closed !== true) add(`curves[${ci}].closed`, 'sikku kolam curves must be closed');
      if (!c.id) add(`curves[${ci}].id`, 'id required');
      if (!Array.isArray(c.strokes) || c.strokes.length === 0) {
        add(`curves[${ci}].strokes`, 'non-empty strokes required');
        continue;
      }
      allStrokes.push(...c.strokes);
      // chain continuity: each stroke starts where the previous ended
      for (let si = 1; si < c.strokes.length; si++) {
        const prevEnd = strokeEnd(c.strokes[si - 1]!);
        const curStart = strokeStart(c.strokes[si]!);
        if (!near(prevEnd, curStart)) {
          add(`curves[${ci}].strokes[${si}]`, `stroke chain broken: ${fmt(prevEnd)} -> ${fmt(curStart)}`);
        }
      }
      // loop closure
      if (!near(strokeEnd(c.strokes[c.strokes.length - 1]!), strokeStart(c.strokes[0]!))) {
        add(`curves[${ci}]`, 'curve does not close back to its start');
      }
      for (const [si, st] of c.strokes.entries()) {
        if (st.kind === 'arc') {
          if (Math.abs(st.r - 0.5) > 1e-9) add(`curves[${ci}].strokes[${si}].r`, 'arc radius must be 0.5 (half dot spacing)');
          const onDot = dots.some((d) => Math.hypot(d[0] - st.center[0], d[1] - st.center[1]) < 1e-9);
          if (!onDot) add(`curves[${ci}].strokes[${si}].center`, 'arc center must be a dot');
          // endpoints at distance r from center
          const s0 = arcStart(st);
          const s1 = arcEnd(st);
          if (Math.abs(Math.hypot(s0[0] - st.center[0], s0[1] - st.center[1]) - 0.5) > 1e-9)
            add(`curves[${ci}].strokes[${si}]`, 'arc start not on the arc circle');
          if (Math.abs(Math.hypot(s1[0] - st.center[0], s1[1] - st.center[1]) - 0.5) > 1e-9)
            add(`curves[${ci}].strokes[${si}]`, 'arc end not on the arc circle');
        }
      }
    }
    // P3: dot safety (dots are never touched; min distance is the channel distance)
    const dmin = minDotDistance(sys, allStrokes);
    if (dmin < CHANNEL_DIST - 1e-9) {
      add('curves', `stroke passes too close to a dot: min distance ${dmin} < ${CHANNEL_DIST}`);
    }
  }

  // --- L3: curves must equal the deterministic trace of pattern ---
  if (hasPattern && hasCurves) {
    const grid = buildGrid(doc.grid.spec);
    const sys2 = buildGates(grid, 'all-closed');
    for (const g of doc.pattern!.gates) {
      const node = findGateByDots(sys2, g.a, g.b);
      if (node) sys2.states.set(`${node.x},${node.y}`, g.state);
    }
    const { curves } = traceCurves(sys2);
    const got = canonicalJSON(doc.curves);
    const want = canonicalJSON(curves);
    if (got !== want) add('curves', 'curves do not equal the deterministic trace of pattern.gates');
    // analysis consistency
    if (doc.analysis) {
      const a = analyze(sys2);
      if (canonicalJSON(doc.analysis) !== canonicalJSON(a)) add('analysis', 'analysis does not match recomputation');
    }
  }

  const level: 'L1' | 'L2' | 'L3' = hasCurves ? (hasPattern ? (doc.analysis ? 'L3' : 'L2') : 'L1') : 'L2';
  return { valid: issues.length === 0, level, issues };
}

// --- helpers ---

function strokeStart(s: Stroke): [number, number] {
  return s.kind === 'line' ? s.from : arcStart(s);
}
function strokeEnd(s: Stroke): [number, number] {
  return s.kind === 'line' ? s.to : arcEnd(s);
}
function arcStart(a: Extract<Stroke, { kind: 'arc' }>): [number, number] {
  return [a.center[0] + a.r * Math.cos(a.a0), a.center[1] + a.r * Math.sin(a.a0)];
}
function arcEnd(a: Extract<Stroke, { kind: 'arc' }>): [number, number] {
  return [a.center[0] + a.r * Math.cos(a.a1), a.center[1] + a.r * Math.sin(a.a1)];
}
const near = (a: [number, number], b: [number, number]): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
const fmt = (p: [number, number]): string => `(${p[0].toFixed(3)}, ${p[1].toFixed(3)})`;
