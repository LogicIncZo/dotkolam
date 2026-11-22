/**
 * KolamDoc <-> GateSystem serialization.
 */
import { KolamDoc, Gate, Symmetry } from './types.js';
import { buildGrid } from './grid.js';
import { GateSystem, buildGates, encodeIndex, findGateByDots } from './gates.js';
import { traceCurves } from './trace.js';
import { analyze } from './analysis.js';

/** Build a GateSystem from a KolamDoc (grid + pattern.gates). */
export function sysFromDoc(doc: KolamDoc): GateSystem {
  const grid = buildGrid(doc.grid.spec);
  const sys = buildGates(grid, 'all-closed');
  if (doc.pattern) {
    applyGates(sys, doc.pattern.gates);
  }
  return sys;
}

/** Apply display-unit gates onto a system; throws on unknown/non-adjacent pairs. */
export function applyGates(sys: GateSystem, gates: Gate[]): void {
  for (const g of gates) {
    const node = findGateByDots(sys, g.a, g.b);
    if (!node) {
      throw new Error(`gate between ${JSON.stringify(g.a)} and ${JSON.stringify(g.b)} is not an interior channel of the grid`);
    }
    sys.states.set(`${node.x},${node.y}`, g.state);
  }
}

export interface ToDocOptions {
  meta?: KolamDoc['meta'] | undefined;
  includeCurves?: boolean; // default true
  includeAnalysis?: boolean; // default true
  includeIndex?: boolean; // default false
  symmetry?: Symmetry | undefined;
  render?: KolamDoc['render'] | undefined;
}

/** Serialize a GateSystem to a KolamDoc (grid spec from the original grid). */
export function docFromSys(
  sys: GateSystem,
  opts: ToDocOptions = {},
): KolamDoc {
  const { curves, drawingOrder } = traceCurves(sys);
  const a = analyze(sys);
  const doc: KolamDoc = {
    kolamVersion: '1.0',
    grid: { spec: sys.grid.spec, spacing: 1 },
    pattern: {
      gates: sys.interior.map((g) => ({
        a: [g.a.x / 2 - 0, g.a.y / 2 - 0],
        b: [g.b.x / 2, g.b.y / 2],
        state: sys.states.get(`${g.node.x},${g.node.y}`)!,
      })),
      ...(opts.includeIndex ? { index: encodeIndex(sys).toString() } : {}),
      ...(opts.symmetry ? { symmetry: opts.symmetry } : {}),
    },
  };
  if (opts.meta) doc.meta = opts.meta;
  if (opts.includeCurves !== false) {
    doc.curves = curves;
    const s0 = curves[0]?.strokes[0];
    const start: [number, number] =
      s0 && s0.kind === 'line' ? s0.from : s0 && s0.kind === 'arc' ? arcStart(s0) : [0, 0];
    doc.drawingOrder = { start, direction: 'cw', sequence: drawingOrder };
  }
  if (opts.includeAnalysis !== false) doc.analysis = a;
  if (opts.render) doc.render = opts.render;
  return doc;
}

function arcStart(a: { center: [number, number]; r: number; a0: number }): [number, number] {
  return [a.center[0] + a.r * Math.cos(a.a0), a.center[1] + a.r * Math.sin(a.a0)];
}

/** Canonical JSON string (sorted keys, 4-space indent). */
export function canonicalJSON(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') {
      const entries = Object.entries(x as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sort(v)] as const);
      return Object.fromEntries(entries);
    }
    return x;
  };
  return JSON.stringify(sort(v), null, 2);
}
