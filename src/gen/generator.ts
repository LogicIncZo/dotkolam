/**
 * Kolam generator: symmetric, density-biased gate assignment + one-stroke FTS
 * search (flip-test-switch, after Yanagisawa–Nagata / Sivakumar & Sivakumar,
 * npj Heritage Science 14:144, 2026), adapted from per-gate flips to
 * symmetry-orbit flips so the pattern stays invariant under the active group
 * throughout the search.
 *
 * One-stroke certificate: exactly one physical loop in the trace (equivalent
 * to N_p = N_px of the npj paper).
 *
 * Symmetry relaxation: some groups admit no one-stroke kolam on a given grid
 * (Yanagisawa–Nagata's symmetric counts list no 4mm one-stroke patterns for
 * the 1-5-1 / 1-7-1 diamonds). When strokes=1 and the certificate is not
 * reached within budget, the search falls back along D4 > C4 > D2 > D1 >
 * none and records the achieved group.
 */
import { GridSpec, KolamDoc } from '../core/types.js';
import { buildGrid } from '../core/grid.js';
import { buildGates, GateSystem, nodeKey } from '../core/gates.js';
import { GateState } from '../core/types.js';
import { physicalLoops } from '../core/trace.js';
import { classifyDot } from '../core/analysis.js';
import { docFromSys } from '../core/doc.js';
import { makeRng } from './rng.js';
import { SymGroup, gateOrbits, symmetryHolds, gridSupportsGroup } from './symmetry.js';

export interface GenParams {
  grid: GridSpec;
  symmetry?: SymGroup; // default 'none'
  density?: number; // sigma: target fraction of OPEN gates, 0..1 (default 0.5)
  strokes?: 1 | 'any'; // default 1: search for a single closed line
  seed?: string; // default 'kolam'
  restarts?: number; // random restarts per group before FTS (default 8)
  flipBudget?: number; // FTS orbit-flip attempts per group (default 40 * orbits)
  name?: string;
}

export interface GenResult {
  doc: KolamDoc;
  requestedSymmetry: SymGroup;
  achieved: {
    loops: number;
    isOneStroke: boolean;
    symmetryHolds: boolean; // for the achieved (possibly relaxed) group
    openRatio: number;
    budgetExhausted: boolean;
  };
}

const LADDER: SymGroup[] = ['D4', 'C4', 'D2', 'D1', 'none'];
const rank = (g: SymGroup): number => LADDER.indexOf(g);

export function generate(p: GenParams): GenResult {
  const requested: SymGroup = p.symmetry ?? 'none';
  const sigma = Math.min(1, Math.max(0, p.density ?? 0.5));
  const strokes = p.strokes ?? 1;
  const seed = p.seed ?? 'kolam';
  const restarts = p.restarts ?? 8;
  const rng = makeRng(`kolam-json|${seed}`);

  const grid = buildGrid(p.grid);
  const sys = buildGates(grid, 'all-closed');
  if (!gridSupportsGroup(sys, requested)) {
    throw new Error(`grid ${JSON.stringify(p.grid)} does not support symmetry ${requested}`);
  }

  // groups to try, from the request downward
  const groups: SymGroup[] =
    strokes === 1 ? LADDER.filter((g) => rank(g) >= rank(requested)) : [requested];

  let loops = Infinity;
  let usedGroup: SymGroup = requested;
  let exhausted = false;

  for (const group of groups) {
    const os = gateOrbits(sys, group);
    const loopsNow = () => physicalLoops(sys).length;
    const setState = (node: { x: number; y: number }, open: boolean) =>
      sys.states.set(nodeKey(node), open ? 'open' : 'closed');
    const isOpen = (node: { x: number; y: number }) => sys.states.get(nodeKey(node)) === 'open';
    const hasIsland = () => sys.grid.dots.some((d) => classifyDot(sys, d) === 'circle');
    const assignOrbit = (oi: number, open: boolean) => {
      for (const node of os.orbits[oi]!) setState(node, open);
    };

    const randomAssign = (): void => {
      for (let oi = 0; oi < os.orbits.length; oi++) assignOrbit(oi, rng() < sigma);
      // anti-island repair (npj constraint (a)): a dot whose surrounding gates
      // are all closed is an unreachable island loop. Open a minimal(greedy
      // set-cover) collection of orbits so no dot stays an island.
      let islands = sys.grid.dots.filter((d) => classifyDot(sys, d) === 'circle');
      while (islands.length > 0) {
        const scores = new Map<number, number>();
        for (const d of islands) {
          for (const s of neighborGateNodes(sys, d)) {
            const oi = os.orbitOf.get(nodeKey(s));
            if (oi !== undefined) scores.set(oi, (scores.get(oi) ?? 0) + 1);
          }
        }
        let bestOi = -1;
        let bestScore = 0;
        for (const [oi, sc] of scores) {
          if (sc > bestScore) {
            bestScore = sc;
            bestOi = oi;
          }
        }
        if (bestOi < 0) break; // orbit-touching failed (isolated single dot)
        assignOrbit(bestOi, true);
        islands = sys.grid.dots.filter((d) => classifyDot(sys, d) === 'circle');
      }
    };

    let l: number;
    if (strokes === 1) {
      let bestSnap: Map<string, GateState> | null = null;
      let bestLoops = Infinity;
      // Phase 1: random restarts, keep fewest loops.
      for (let r = 0; r < restarts; r++) {
        randomAssign();
        const lr = loopsNow();
        if (lr === 1) break;
        if (lr < bestLoops) {
          bestLoops = lr;
          bestSnap = new Map(sys.states);
        }
      }
      if (bestLoops > 1 && bestSnap) sys.states = new Map(bestSnap);

      // Phase 2: FTS over orbits — flip, keep iff loops do not increase
      // (strictly preferring decreases); reject island-creating flips.
      const budget = p.flipBudget ?? Math.max(200, 40 * os.orbits.length);
      l = loopsNow();
      let spent = 0;
      let oi = 0;
      let plateauMoves = 0;
      while (l > 1 && spent < budget) {
        if (oi >= os.orbits.length) oi = 0;
        const flip = oi;
        oi++;
        spent++;
        const before = l;
        for (const node of os.orbits[flip]!) setState(node, !isOpen(node));
        if (hasIsland()) {
          for (const node of os.orbits[flip]!) setState(node, !isOpen(node));
          continue;
        }
        const after = loopsNow();
        if (after < before || (after === before && plateauMoves < budget / 10 && rng() < 0.25)) {
          if (after === before) plateauMoves++;
          else plateauMoves = 0;
          l = after;
        } else {
          for (const node of os.orbits[flip]!) setState(node, !isOpen(node)); // revert
        }
      }
    } else {
      // strokes 'any': a single symmetric assignment; no FTS.
      randomAssign();
      l = loopsNow();
    }
    loops = l;
    usedGroup = group;
    exhausted = l > 1;
    if (l === 1) break;
  }

  const openRatio =
    sys.interior.filter((g) => sys.states.get(nodeKey(g.node)) === 'open').length /
    Math.max(1, sys.interior.length);
  const doc = docFromSys(sys, {
    meta: p.name ? { name: p.name } : undefined,
    includeIndex: true,
    symmetry: { group: usedGroup },
  });
  return {
    doc,
    requestedSymmetry: requested,
    achieved: {
      loops,
      isOneStroke: loops === 1,
      symmetryHolds: symmetryHolds(sys, usedGroup),
      openRatio,
      budgetExhausted: strokes === 1 && exhausted,
    },
  };
}

function neighborGateNodes(sys: GateSystem, d: { x: number; y: number }): { x: number; y: number }[] {
  const sides = [
    { x: d.x, y: d.y + 1 },
    { x: d.x + 1, y: d.y },
    { x: d.x, y: d.y - 1 },
    { x: d.x - 1, y: d.y },
  ];
  return sides.filter((s) => sys.states.has(nodeKey(s)));
}
