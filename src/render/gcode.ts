/**
 * G-code exporter: kolam curves -> GRBL g-code for pen plotters and drawing
 * robots (draft).
 *
 * `curves` are already ordered closed strokes, so the export transcribes
 * them in `drawingOrder.sequence`: travel (pen up) to a curve's start, pen
 * down, one move per stroke, pen up:
 *
 *   line -> G1 X.. Y..                            (F on the first drawing move)
 *   arc  -> G2 (cw) / G3 (ccw) X.. Y.. I.. J..    (I/J = centre - start: GRBL's
 *                                                  incremental form; a full
 *                                                  circle is two semicircles)
 *
 * Frame: the JSON's right-handed coordinates, +X right and +Y up — unlike
 * SVG, nothing is mirrored — mapped onto work coordinates by `scale` (work
 * units per display unit, i.e. per pulli spacing) and `offset` (work
 * position of the display origin).
 *
 * Pen control is machine specific: `penDown` / `penUp` are the raw command
 * lines that lower and lift the pen (defaults: a hobby servo on the
 * spindle-PWM pin, `M3 S1000` / `M5 S0`; a Z-lift pen would use e.g.
 * `'G1 Z-2 F300'` / `'G1 Z5 F600'`), each followed by a `G4` dwell so the
 * pen settles before the next move.
 *
 * Determinism: the output is a pure function of (curves, options).
 * Axis-aligned trig values are snapped (cos(pi/2) is ~6e-17 on common
 * libm builds), numbers are fixed-point to 4 decimals and signed zero is
 * normalised, so the same document gives byte-identical g-code on every
 * platform.
 */
import { KolamDoc, Curve, Stroke } from '../core/types.js';
import { sysFromDoc } from '../core/doc.js';
import { traceCurves } from '../core/trace.js';

type Arc = Extract<Stroke, { kind: 'arc' }>;
type Pos = [number, number];

export interface GcodeOptions {
  /** Work units per display unit (one pulli spacing). Default 10. */
  scale?: number;
  /** Work coordinates of the display origin. Default [0, 0]. */
  offset?: Pos;
  /** Work units; selects G21 (mm) or G20 (in). Default 'mm'. */
  units?: 'mm' | 'in';
  /** Feed rate of drawing moves, work units per minute. Default 1500. */
  feed?: number;
  /** Command line(s) that lower the pen. Default 'M3 S1000'. */
  penDown?: string;
  /** Command line(s) that lift the pen. Default 'M5 S0'. */
  penUp?: string;
  /** Dwell after each pen command, seconds (servo settle time). Default 0.2; 0 emits no dwell. */
  settle?: number;
  /** Travel to the work origin after the last stroke. Default true. */
  park?: boolean;
}

interface Resolved {
  scale: number;
  offset: Pos;
  units: 'mm' | 'in';
  feed: number;
  penDown: string[];
  penUp: string[];
  settle: number;
  park: boolean;
}

function resolveOptions(opts: GcodeOptions): Resolved {
  const scale = opts.scale ?? 10;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`gcode scale must be a positive finite number, got ${scale}`);
  }
  const feed = opts.feed ?? 1500;
  if (!Number.isFinite(feed) || feed <= 0) {
    throw new Error(`gcode feed must be a positive finite number, got ${feed}`);
  }
  const settle = opts.settle ?? 0.2;
  if (!Number.isFinite(settle) || settle < 0) {
    throw new Error(`gcode settle must be a non-negative finite number, got ${settle}`);
  }
  const offset = opts.offset ?? [0, 0];
  if (offset.length !== 2 || !Number.isFinite(offset[0]) || !Number.isFinite(offset[1])) {
    throw new Error(`gcode offset must be a finite [x, y] pair, got ${JSON.stringify(offset)}`);
  }
  const units = opts.units ?? 'mm';
  if (units !== 'mm' && units !== 'in') {
    throw new Error(`gcode units must be 'mm' or 'in', got ${JSON.stringify(units)}`);
  }
  return {
    scale,
    offset: [offset[0]!, offset[1]!],
    units,
    feed,
    penDown: commandLines(opts.penDown ?? 'M3 S1000'),
    penUp: commandLines(opts.penUp ?? 'M5 S0'),
    settle,
    park: opts.park ?? true,
  };
}

/** Split a pen command option into trimmed, non-empty lines. */
function commandLines(spec: string): string[] {
  return spec
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

const DECIMALS = 4;

/** Fixed-point text; signed zero and sub-resolution noise print as "0.0000". */
function fmt(v: number): string {
  const r = Math.round(v * 10 ** DECIMALS) / 10 ** DECIMALS;
  return (r === 0 ? 0 : r).toFixed(DECIMALS);
}

/** cos/sin of an axis-aligned angle snapped onto {-1, 0, 1}. */
function axisSnap(v: number): number {
  if (Math.abs(v) < 1e-12) return 0;
  if (Math.abs(Math.abs(v) - 1) < 1e-12) return v < 0 ? -1 : 1;
  return v;
}

function arcPoint(a: Arc, angle: number): Pos {
  return [a.center[0] + a.r * axisSnap(Math.cos(angle)), a.center[1] + a.r * axisSnap(Math.sin(angle))];
}

function strokeStart(s: Stroke): Pos {
  return s.kind === 'line' ? s.from : arcPoint(s, s.a0);
}

const near = (a: Pos, b: Pos): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

/** Signed sweep of an arc in the direction it is travelled (negative = clockwise); a full circle is ±2pi. */
function sweepOf(a: Arc): number {
  let delta = a.a1 - a.a0;
  if (a.sweep === 'cw') while (delta > 0) delta -= 2 * Math.PI;
  else while (delta < 0) delta += 2 * Math.PI;
  return delta;
}

/** Curves in `sequence` order; the given order unless `sequence` is a permutation of the curve ids. */
function ordered(curves: Curve[], sequence: string[] | undefined): Curve[] {
  if (!sequence || sequence.length !== curves.length) return curves;
  if (new Set(sequence).size !== sequence.length || new Set(curves.map((c) => c.id)).size !== curves.length) {
    return curves;
  }
  const byId = new Map(curves.map((c) => [c.id, c] as const));
  const out: Curve[] = [];
  for (const id of sequence) {
    const c = byId.get(id);
    if (!c) return curves;
    out.push(c);
  }
  return out;
}

/**
 * Printable ASCII: accented Latin letters unaccented, other scripts dropped.
 * Surrogate code units go first (other scripts are dropped anyway, and
 * `normalize` throws on a lone one).
 */
function ascii(text: string): string {
  return text
    .replace(/[\uD800-\uDFFF]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\x20-\x7E]/g, '');
}

/**
 * Comment line safe for GRBL: ASCII, no parentheses or '%' (comment and
 * program delimiters), at most 77 characters — GRBL accepts at most 79 per
 * line, parentheses included.
 */
function comment(text: string): string {
  const clean = ascii(text)
    .replace(/[()%]/g, '')
    .trim()
    .slice(0, 77)
    .trim();
  return `(${clean})`;
}

/** Setup block: provenance comments, then units, absolute positioning and the XY plane. */
export function gcodeHeader(doc: KolamDoc | null, opts: GcodeOptions = {}): string {
  const o = resolveOptions(opts);
  const lines: string[] = [];
  if (doc) {
    lines.push(comment(`kolam: ${ascii(doc.meta?.name ?? '').trim() || 'untitled'}`));
    const a = doc.analysis;
    if (a) lines.push(comment(`pulli ${a.dotCount}, loops ${a.loopCount}, one-stroke ${a.isOneStroke}`));
  }
  lines.push(comment(`GRBL: units ${o.units}, scale ${fmt(o.scale)} per pulli`));
  lines.push(comment(`offset X${fmt(o.offset[0])} Y${fmt(o.offset[1])}, feed ${fmt(o.feed)}`));
  lines.push(o.units === 'mm' ? 'G21' : 'G20', 'G90', 'G17');
  return lines.join('\n') + '\n';
}

/**
 * Plot `curves` (display units) as a GRBL program body. `sequence` is
 * `drawingOrder.sequence`; curves are plotted in array order unless it is a
 * permutation of the curve ids. The pen starts and ends lifted.
 */
export function curvesToGcode(curves: Curve[], sequence?: string[], opts: GcodeOptions = {}): string {
  const o = resolveOptions(opts);
  const out: string[] = [];
  let penIsDown = false;
  let fed = false; // F word emitted since the last pen-down
  let cur: Pos | null = null; // display-unit tool position

  const work = (p: Pos): string =>
    `X${fmt(o.offset[0] + o.scale * p[0])} Y${fmt(o.offset[1] + o.scale * p[1])}`;
  const pen = (down: boolean, force = false): void => {
    if (!force && down === penIsDown) return;
    out.push(...(down ? o.penDown : o.penUp));
    if (o.settle > 0) out.push(`G4 P${fmt(o.settle)}`);
    penIsDown = down;
    fed = false;
  };
  const travel = (p: Pos): void => {
    out.push(`G0 ${work(p)}`);
    cur = p;
  };
  const draw = (cmd: 'G1' | 'G2' | 'G3', p: Pos, ij = ''): void => {
    out.push(`${cmd} ${work(p)}${ij}${fed ? '' : ` F${fmt(o.feed)}`}`);
    fed = true;
    cur = p;
  };

  pen(false, true); // the program opens by lifting the pen, whatever the machine's state
  for (const c of ordered(curves, sequence)) {
    if (c.strokes.length === 0) continue;
    const head = strokeStart(c.strokes[0]!);
    pen(false);
    if (cur === null || !near(cur, head)) travel(head);
    pen(true);
    for (const s of c.strokes) {
      const start = strokeStart(s);
      if (cur === null || !near(cur, start)) {
        // a broken chain: lift, travel to the stroke's own start, lower again
        pen(false);
        travel(start);
        pen(true);
      }
      if (s.kind === 'line') {
        draw('G1', s.to);
        continue;
      }
      const delta = sweepOf(s);
      if (Math.abs(delta) < 1e-9) continue; // zero-length arc: nothing to travel
      const cmd = s.sweep === 'cw' ? 'G2' : 'G3';
      const end = arcPoint(s, s.a1);
      const ij = (from: Pos): string =>
        ` I${fmt(o.scale * (s.center[0] - from[0]))} J${fmt(o.scale * (s.center[1] - from[1]))}`;
      if (Math.abs(Math.abs(delta) - 2 * Math.PI) < 1e-9) {
        // full circle: two semicircles (start -> antipode -> start)
        const mid = arcPoint(s, s.a0 + Math.PI);
        draw(cmd, mid, ij(start));
        draw(cmd, end, ij(mid));
      } else {
        draw(cmd, end, ij(start));
      }
    }
  }
  pen(false);
  if (o.park) out.push(`G0 X${fmt(o.offset[0])} Y${fmt(o.offset[1])}`);
  return out.join('\n') + '\n';
}

/**
 * A whole document as a GRBL program. Curves are plotted as written, in
 * `drawingOrder` order; a document with no curves is traced from its
 * pattern.
 */
export function renderGcode(doc: KolamDoc, opts: GcodeOptions = {}): string {
  let curves = doc.curves;
  let sequence = doc.drawingOrder?.sequence;
  if (!curves?.length && doc.pattern) {
    ({ curves, drawingOrder: sequence } = traceCurves(sysFromDoc(doc)));
  }
  return gcodeHeader(doc, opts) + curvesToGcode(curves ?? [], sequence, opts);
}
