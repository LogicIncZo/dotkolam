/**
 * Dot-grid construction.
 *
 * All layouts produce a finite dot set on EVEN integer coordinates (internal
 * scale x2, spacing 2). Orthogonally adjacent dots (distance 2) share a gate.
 *
 * Layouts:
 *  - square / rectangle: ner pulli (aligned rows), e.g. 9x9.
 *  - diamond: the classic sikku diamond with rows 1-3-5-...-m-...-3-1 (m odd),
 *    constructed as Gopalan's "2R" template: two interleaved lattices
 *    {a,b in 0..m-1, a === b (mod 2)} rotated 45 degrees via (a,b)->(a+b, b-a).
 *    Dot count = (1 + m^2) / 2 (Sivakumar & Sivakumar 2026, Eq. 13).
 *  - rows: arbitrary aligned row widths (e.g. [1,3,3,1] srivatsa, [5,5,5]).
 *  - custom: explicit dot list.
 *
 * Hexagonal packing (woda pulli) is out of scope for Kolam-JSON 1.0.
 */
import { Pt, pt, ptKey } from './types.js';
import { GridSpec } from './types.js';

export interface DotGrid {
  /** All dots, internal coordinates (even integers). */
  dots: Pt[];
  dotsSet: Set<string>;
  spec: GridSpec;
}

export function buildGrid(spec: GridSpec): DotGrid {
  let dots: Pt[] = [];
  switch (spec.kind) {
    case 'square': {
      const n = spec.size;
      if (!Number.isInteger(n) || n < 1) throw new Error('square size must be a positive integer');
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) dots.push(pt(2 * i, 2 * j));
      break;
    }
    case 'rectangle': {
      const { cols, rows } = spec;
      if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1)
        throw new Error('rectangle cols/rows must be positive integers');
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) dots.push(pt(2 * i, 2 * j));
      break;
    }
    case 'diamond': {
      const m = spec.rows;
      if (!Number.isInteger(m) || m < 1 || m % 2 !== 1)
        throw new Error('diamond rows must be a positive odd integer');
      for (let b = 0; b < m; b++) {
        for (let a = 0; a < m; a++) {
          if ((a + b) % 2 === 0) dots.push(pt(a + b, b - a));
        }
      }
      break;
    }
    case 'rows': {
      const widths = spec.widths;
      if (widths.length < 1) throw new Error('rows needs at least one row');
      const maxW = Math.max(...widths);
      widths.forEach((w, j) => {
        if (!Number.isInteger(w) || w < 1) throw new Error('row widths must be positive integers');
        if ((maxW - w) % 2 !== 0) throw new Error('row widths should differ by even amounts for a centred layout');
        const offset = (maxW - w) / 2;
        for (let i = 0; i < w; i++) dots.push(pt(2 * (offset + i), 2 * j));
      });
      break;
    }
    case 'custom': {
      dots = spec.dots.map(([x, y]) => pt(2 * x, 2 * y));
      break;
    }
  }
  // Deduplicate, deterministic order.
  const seen = new Set<string>();
  const out: Pt[] = [];
  for (const d of dots) {
    const k = ptKey(d);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(d);
    }
  }
  out.sort((p, q) => p.y - q.y || p.x - q.x);
  return { dots: out, dotsSet: new Set(out.map(ptKey)), spec };
}

/** A centered copy of the grid, translated so its bbox center is at (0,0) (rounded to even). */
export function centerGrid(grid: DotGrid): DotGrid {
  if (grid.dots.length === 0) return grid;
  const xs = grid.dots.map((d) => d.x);
  const ys = grid.dots.map((d) => d.y);
  const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2 / 2) * 2;
  const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2 / 2) * 2;
  if (cx === 0 && cy === 0) return grid;
  const dots = grid.dots.map((d) => pt(d.x - cx, d.y - cy));
  dots.sort((p, q) => p.y - q.y || p.x - q.x);
  return { dots, dotsSet: new Set(dots.map(ptKey)), spec: grid.spec };
}

/** Row widths of the dot set (for naming, e.g. "1-3-5-3-1"), display units. */
export function rowWidths(grid: DotGrid): number[] {
  const counts = new Map<number, number>();
  for (const d of grid.dots) counts.set(d.y, (counts.get(d.y) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
}
