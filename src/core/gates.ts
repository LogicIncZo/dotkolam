/**
 * Gates: the binary pattern layer.
 *
 * A NODE is a channel midpoint between two orthogonally adjacent lattice
 * positions: H-nodes at (odd, even) with flanking positions (x-1, y), (x+1, y);
 * V-nodes at (even, odd) with flanking positions (x, y-1), (x, y+1).
 *
 * A node with BOTH flanks dotted is an INTERIOR GATE carrying one bit
 * ('open' = strands cross; 'closed' = strands reflect around the flanking
 * dots). A node with exactly ONE flank dotted is a BOUNDARY gate, always
 * closed: the kolam line wraps around the border dots.
 */
import { Pt, pt, ptEq, ptKey, Heading, GateState, Gate } from './types.js';
import { DotGrid } from './grid.js';

export interface GateSystem {
  grid: DotGrid;
  /** Interior gates in canonical order (sorted by a then b). */
  interior: { a: Pt; b: Pt; node: Pt; index: number }[];
  /** Boundary nodes (one flanking dot), always closed. */
  boundary: { node: Pt; dot: Pt }[];
  /** Interior gate states, key = canonical node key "x,y". */
  states: Map<string, GateState>;
  /** All nodes (interior + boundary). */
  nodes: Pt[];
}

export const nodeKey = (n: Pt): string => `${n.x},${n.y}`;

export function gateOrderKey(a: Pt, b: Pt): string {
  return `${a.x},${a.y}->${b.x},${b.y}`;
}

/** Flanking lattice positions of a node (internal coords). */
export function flanks(node: Pt): [Pt, Pt] {
  if (node.x % 2 !== 0 && node.y % 2 === 0) {
    return [pt(node.x - 1, node.y), pt(node.x + 1, node.y)];
  } else if (node.x % 2 === 0 && node.y % 2 !== 0) {
    return [pt(node.x, node.y - 1), pt(node.x, node.y + 1)];
  }
  throw new Error(`invalid node position ${nodeKey(node)}`);
}

export function buildGates(grid: DotGrid, init: 'all-open' | 'all-closed' = 'all-closed'): GateSystem {
  const interior: GateSystem['interior'] = [];
  const boundary: GateSystem['boundary'] = [];
  const states = new Map<string, GateState>();
  const nodeSeen = new Set<string>();
  const nodes: Pt[] = [];

  const consider = (node: Pt): void => {
    const k = nodeKey(node);
    if (nodeSeen.has(k)) return;
    const [f0, f1] = flanks(node);
    const d0 = grid.dotsSet.has(ptKey(f0));
    const d1 = grid.dotsSet.has(ptKey(f1));
    if (d0 && d1) {
      nodeSeen.add(k);
      // canonical a<b ordering:
      const first = f0.x < f1.x || (f0.x === f1.x && f0.y < f1.y) ? f0 : f1;
      const second = first === f0 ? f1 : f0;
      interior.push({ a: first, b: second, node, index: 0 });
      states.set(k, init === 'all-open' ? 'open' : 'closed');
      nodes.push(node);
    } else if (d0 !== d1) {
      nodeSeen.add(k);
      boundary.push({ node, dot: d0 ? f0 : f1 });
      states.set(k, 'closed');
      nodes.push(node);
    }
    // neither flank dotted: not a node at all.
  };

  // Enumerate candidate nodes from each dot's four sides (guarantees we see
  // every node with at least one flanking dot).
  for (const d of grid.dots) {
    consider(pt(d.x + 1, d.y));
    consider(pt(d.x - 1, d.y));
    consider(pt(d.x, d.y + 1));
    consider(pt(d.x, d.y - 1));
  }
  interior.sort((p, q) => p.a.y - q.a.y || p.a.x - q.a.x || p.b.y - q.b.y || p.b.x - q.b.x);
  interior.forEach((g, i) => (g.index = i));
  nodes.sort((p, q) => p.y - q.y || p.x - q.x);
  return { grid, interior, boundary, states, nodes };
}

export function getGate(sys: GateSystem, node: Pt): GateState {
  const s = sys.states.get(nodeKey(node));
  if (s === undefined) throw new Error(`no gate at node ${nodeKey(node)}`);
  return s;
}

export function setGate(sys: GateSystem, node: Pt, state: GateState): void {
  if (!sys.states.has(nodeKey(node))) throw new Error(`no gate at node ${nodeKey(node)}`);
  sys.states.set(nodeKey(node), state);
}

/** Prastāra index (1-based BigInt): bit i = interior gate i open, canonical order. */
export function encodeIndex(sys: GateSystem): bigint {
  let v = 0n;
  for (const g of sys.interior) {
    if (sys.states.get(nodeKey(g.node)) === 'open') v |= 1n << BigInt(g.index);
  }
  return v + 1n;
}

export function decodeIndex(sys: GateSystem, index: bigint): void {
  const n = BigInt(sys.interior.length);
  if (index < 1n || index > 1n << n) throw new Error(`index ${index} out of range [1, 2^${n}]`);
  const v = index - 1n;
  for (const g of sys.interior) {
    const bit = (v >> BigInt(g.index)) & 1n;
    sys.states.set(nodeKey(g.node), bit === 1n ? 'open' : 'closed');
  }
}

/** Export gates in Kolam-JSON display units (divide by 2). */
export function gatesToJSON(sys: GateSystem): Gate[] {
  return sys.interior.map((g) => ({
    a: [g.a.x / 2, g.a.y / 2],
    b: [g.b.x / 2, g.b.y / 2],
    state: sys.states.get(nodeKey(g.node))!,
  }));
}

/** Flip a single interior gate (open <-> closed). */
export function flipGate(sys: GateSystem, node: Pt): void {
  setGate(sys, node, getGate(sys, node) === 'open' ? 'closed' : 'open');
}

/** The interior gate (if any) whose canonical endpoints match a and b in display units. */
export function findGateByDots(sys: GateSystem, a: [number, number], b: [number, number]): Pt | null {
  const A = pt(2 * a[0], 2 * a[1]);
  const B = pt(2 * b[0], 2 * b[1]);
  for (const g of sys.interior) {
    if ((ptEq(g.a, A) && ptEq(g.b, B)) || (ptEq(g.a, B) && ptEq(g.b, A))) return g.node;
  }
  return null;
}
