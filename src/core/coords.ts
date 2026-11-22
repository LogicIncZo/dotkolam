/**
 * Coordinate conversion between the two kolam frames.
 *
 *  - INTERNAL: dots sit on EVEN integers with spacing 2; curve nodes at
 *    (odd, even) / (even, odd); arc radius 1. All core arithmetic is exact
 *    integer math in this frame.
 *  - DISPLAY (Kolam-JSON documents, SVG output): internal coordinates
 *    divided by 2 — dots on integers, nodes on half-integers, arc radius 0.5.
 *
 * Conversion is exact dyadic halving/doubling. Serialization converts at the
 * document boundary (see gates.ts `gatesToJSON`, trace.ts, doc.ts); canvas
 * applications converting pointer/display coordinates into the model frame
 * use `fromDisplay` here and convert distances with `scaleDistance`.
 */
import { Pt } from './types.js';

/** Internal -> display (divide by 2): integer lattice -> half-integer lattice. */
export function toDisplay(p: Pt): Pt {
  return { x: p.x / 2, y: p.y / 2 };
}

/** Display -> internal (multiply by 2): half-integer lattice -> integer lattice. */
export function fromDisplay(p: Pt): Pt {
  return { x: 2 * p.x, y: 2 * p.y };
}

/** Convert a distance (tolerance, radius) from display units to internal units. */
export function scaleDistance(d: number): number {
  return 2 * d;
}
