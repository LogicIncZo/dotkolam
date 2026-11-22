/**
 * Kolam-JSON core types.
 *
 * Two coordinate systems are used:
 *
 *  - INTERNAL (integer, scale x2): dots sit on EVEN integer coordinates with
 *    spacing 2; curve nodes (channel midpoints) sit at (odd, even) for
 *    horizontal channels and (even, odd) for vertical channels. A strand step
 *    between consecutive nodes is (±1, ±1). Arc radius around a dot is 1.
 *    All trace arithmetic is exact integer math.
 *
 *  - DISPLAY (Kolam-JSON output, spacing 1): internal coordinates divided by 2.
 *    Dots at integer coordinates, nodes at half-integers, arc radius 0.5.
 *
 * Model (see SPEC.md, "Research foundations"): a sikku kolam on a finite dot
 * set D is a binary assignment to the GATES (channels between orthogonally
 * adjacent dots). An OPEN gate lets both strands cross discretely at the
 * channel midpoint; a CLOSED gate makes each strand reflect around its
 * flanking dot (mirror-curve model of Gerdes/Jablan; gate matrix of
 * Yanagisawa–Nagata and Sivakumar & Sivakumar, npj Heritage Science 2026).
 * Boundary channels (a dot with an empty flank) are always closed, which
 * wraps the kolam line around the border dots.
 */

/** Integer point in internal coordinates. */
export interface Pt {
  x: number;
  y: number;
}

export const pt = (x: number, y: number): Pt => ({ x, y });
export const ptEq = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;
export const ptKey = (p: Pt): string => `${p.x},${p.y}`;

/** Diagonal unit heading: NE=(1,1), NW=(-1,1), SE=(1,-1), SW=(-1,-1). */
export type Heading = Pt;

export const HEADINGS: readonly Heading[] = [
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
];

/** A directed trace state: arriving at node m with heading d (so the segment just travelled was m-d -> m). */
export interface DState {
  m: Pt;
  d: Heading;
}

export const dstateKey = (s: DState): string => `${s.m.x},${s.m.y}|${s.d.x},${s.d.y}`;

export type GateState = 'open' | 'closed';

/** A gate in Kolam-JSON (display units): channel between adjacent dots a and b. */
export interface Gate {
  a: [number, number];
  b: [number, number];
  state: GateState;
}

/** Grid specification (Kolam-JSON). */
export type GridSpec =
  | { kind: 'square'; size: number }
  | { kind: 'rectangle'; cols: number; rows: number }
  | { kind: 'diamond'; rows: number } // max row size (odd), e.g. 5 -> 1-3-5-3-1
  | { kind: 'rows'; widths: number[]; staggered?: boolean }
  | { kind: 'custom'; dots: [number, number][] };

/** Kolam-JSON curve strokes (display units). */
export type Stroke =
  | { kind: 'line'; from: [number, number]; to: [number, number] }
  | {
      kind: 'arc';
      center: [number, number];
      r: number;
      a0: number; // radians
      a1: number; // radians
      sweep: 'cw' | 'ccw';
    };

export interface Curve {
  id: string;
  closed: boolean;
  strokes: Stroke[];
}

export interface Symmetry {
  group: 'none' | 'D1' | 'D2' | 'C4' | 'D4';
}

export type Primitive = 'circle' | 'drop' | 'door' | 'eye' | 'fan' | 'diamond';

export interface Analysis {
  dotCount: number;
  gateCount: number;
  loopCount: number;
  isOneStroke: boolean;
  totalSegments: number;
  primitiveCounts: Record<Primitive, number>;
}

export interface RenderStyle {
  stroke: { width: number; color: string };
  background: string;
  showDots: boolean;
  padding: number;
}

export interface Meta {
  name?: string;
  nameTa?: string;
  tags?: string[];
  notes?: string;
  source?: string;
  license?: string;
}

export interface KolamDoc {
  kolamVersion: '1.0';
  meta?: Meta;
  grid: { spec: GridSpec; spacing?: number };
  pattern?: {
    gates: Gate[];
    index?: string; // 1-based prastāra index over canonically ordered gates (bit open=1)
    symmetry?: Symmetry;
  };
  curves?: Curve[];
  drawingOrder?: {
    start: [number, number];
    direction: 'cw' | 'ccw';
    sequence: string[]; // curve ids in drawing order
  };
  analysis?: Analysis;
  render?: RenderStyle;
}
