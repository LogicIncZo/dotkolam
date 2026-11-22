/**
 * SVG renderer: KolamDoc / GateSystem -> SVG string.
 *
 * Coordinates are emitted in the model frame directly (SVG's y-down axis
 * mirrors the picture vertically, which is irrelevant for kolam; sweep flags
 * are translated accordingly: math 'ccw' -> svg sweep 1, math 'cw' -> 0).
 * Each curve becomes one <path> carrying data-length for stroke-dashoffset
 * animation (Jake Archibald technique).
 */
import { KolamDoc, Curve, Stroke } from '../core/types.js';
import { GateSystem } from '../core/gates.js';
import { traceCurves } from '../core/trace.js';
import { docFromSys } from '../core/doc.js';

export interface RenderOptions {
  width?: number; // px (viewBox scaled)
  padding?: number; // display units
  showDots?: boolean;
  strokeColor?: string;
  strokeWidth?: number; // display units
  dotColor?: string;
  background?: string;
  animateClass?: string; // css class for <path>
  mode?: 'lattice' | 'smooth'; // renderSysSVG geometry style (default 'lattice');
  // ignored by renderSVG, which renders doc.curves as given. 'smooth' curves
  // are a rendering-only view (arcs of radius √2/4 display units), not
  // Kolam-JSON-serializable — the schema fixes arc radius at 0.5.
}

const DEFAULTS: Required<Omit<RenderOptions, 'animateClass' | 'mode'>> = {
  width: 640,
  padding: 1,
  showDots: true,
  strokeColor: '#1a1a1a',
  strokeWidth: 0.09,
  dotColor: '#8a6d3b',
  background: 'none',
};

export function renderSVG(doc: KolamDoc, opts: RenderOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const dots = dotList(doc);
  const curves = doc.curves ?? [];
  const xs = dots.map((d) => d[0]);
  const ys = dots.map((d) => d[1]);
  const minX = Math.min(...xs) - o.padding;
  const maxX = Math.max(...xs) + o.padding;
  const minY = Math.min(...ys) - o.padding;
  const maxY = Math.max(...ys) + o.padding;
  const w = maxX - minX;
  const h = maxY - minY;
  const f = (v: number): string => (Math.round(v * 1000) / 1000).toString();
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(minX)} ${f(minY)} ${f(w)} ${f(h)}" width="${o.width}" fill="none">`,
  );
  if (o.background !== 'none') {
    parts.push(`<rect x="${f(minX)}" y="${f(minY)}" width="${f(w)}" height="${f(h)}" fill="${o.background}"/>`);
  }
  for (const c of curves) {
    const d = curveToPath(c);
    const len = curveLength(c);
    parts.push(
      `<path class="${opts.animateClass ?? 'kolam-curve'}" data-length="${f(len)}" d="${d}" stroke="${o.strokeColor}" stroke-width="${f(o.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  if (o.showDots) {
    for (const [x, y] of dots) {
      parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(o.strokeWidth * 1.6)}" fill="${o.dotColor}"/>`);
    }
  }
  parts.push('</svg>');
  return parts.join('\n');
}

/** Render directly from a GateSystem (traces curves on the fly). */
export function renderSysSVG(sys: GateSystem, opts: RenderOptions = {}): string {
  if ((opts.mode ?? 'lattice') === 'smooth') {
    // Smooth tangent geometry: re-trace in smooth mode and render those
    // curves directly. No KolamDoc round-trip — smooth curves are not
    // Kolam-JSON-serializable (arc radius ≠ 0.5).
    const { curves } = traceCurves(sys, 'smooth');
    const doc: KolamDoc = { kolamVersion: '1.0', grid: { spec: sys.grid.spec, spacing: 1 }, curves };
    return renderSVG(doc, opts);
  }
  const doc = docFromSys(sys, { includeCurves: true, includeAnalysis: false });
  return renderSVG(doc, opts);
}

function dotList(doc: KolamDoc): [number, number][] {
  const fromSpec = specDots(doc.grid.spec);
  if (fromSpec) return fromSpec;
  return [];
}

function specDots(spec: KolamDoc['grid']['spec']): [number, number][] | null {
  const out: [number, number][] = [];
  switch (spec.kind) {
    case 'square':
      for (let j = 0; j < spec.size; j++) for (let i = 0; i < spec.size; i++) out.push([i, j]);
      return out;
    case 'rectangle':
      for (let j = 0; j < spec.rows; j++) for (let i = 0; i < spec.cols; i++) out.push([i, j]);
      return out;
    case 'diamond':
      for (let b = 0; b < spec.rows; b++)
        for (let a = 0; a < spec.rows; a++) if ((a + b) % 2 === 0) out.push([(a + b) / 2, (b - a) / 2]);
      return out;
    case 'rows': {
      const maxW = Math.max(...spec.widths);
      spec.widths.forEach((wd, j) => {
        const off = (maxW - wd) / 2;
        for (let i = 0; i < wd; i++) out.push([off + i, j]);
      });
      return out;
    }
    case 'custom':
      return spec.dots.map((d) => [d[0], d[1]] as [number, number]);
    default:
      return null;
  }
}

export function curveToPath(c: Curve): string {
  const cmds: string[] = [];
  let cur: [number, number] | null = null;
  const f = (v: number): string => (Math.round(v * 1000) / 1000).toString();
  for (const s of c.strokes) {
    if (s.kind === 'line') {
      if (!cur) cmds.push(`M ${f(s.from[0])} ${f(s.from[1])}`);
      else if (!eq(cur, s.from)) cmds.push(`M ${f(s.from[0])} ${f(s.from[1])}`);
      cmds.push(`L ${f(s.to[0])} ${f(s.to[1])}`);
      cur = s.to;
    } else {
      const start: [number, number] = [s.center[0] + s.r * Math.cos(s.a0), s.center[1] + s.r * Math.sin(s.a0)];
      const end: [number, number] = [s.center[0] + s.r * Math.cos(s.a1), s.center[1] + s.r * Math.sin(s.a1)];
      if (!cur || !eq(cur, start)) cmds.push(`M ${f(start[0])} ${f(start[1])}`);
      let delta = s.a1 - s.a0;
      if (s.sweep === 'cw') while (delta > 0) delta -= 2 * Math.PI;
      if (s.sweep === 'ccw') while (delta < 0) delta += 2 * Math.PI;
      const sweepFlag = s.sweep === 'ccw' ? 1 : 0;
      if (Math.abs(Math.abs(delta) - 2 * Math.PI) < 1e-9) {
        // full circle: two semicircles
        const midA = s.a0 + Math.PI;
        const mid: [number, number] = [s.center[0] + s.r * Math.cos(midA), s.center[1] + s.r * Math.sin(midA)];
        cmds.push(`A ${f(s.r)} ${f(s.r)} 0 0 ${sweepFlag} ${f(mid[0])} ${f(mid[1])}`);
        cmds.push(`A ${f(s.r)} ${f(s.r)} 0 0 ${sweepFlag} ${f(end[0])} ${f(end[1])}`);
      } else {
        const large = Math.abs(delta) > Math.PI ? 1 : 0;
        cmds.push(`A ${f(s.r)} ${f(s.r)} 0 ${large} ${sweepFlag} ${f(end[0])} ${f(end[1])}`);
      }
      cur = end;
    }
  }
  return cmds.join(' ');
}

export function strokeLength(s: Stroke): number {
  if (s.kind === 'line') return Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
  let delta = s.a1 - s.a0;
  if (s.sweep === 'cw') while (delta > 0) delta -= 2 * Math.PI;
  if (s.sweep === 'ccw') while (delta < 0) delta += 2 * Math.PI;
  return Math.abs(delta) * s.r;
}

export function curveLength(c: Curve): number {
  return c.strokes.reduce((acc, s) => acc + strokeLength(s), 0);
}

const eq = (a: [number, number], b: [number, number]): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
