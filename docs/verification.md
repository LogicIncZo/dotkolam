# Kolam-JSON verification report

Date: 2026-11-22. Environment: Node 22.22, TypeScript 5.x, Python 3.14,
Z3 5.4.1 (`pip install --break-system-packages z3-solver`).
TLA+ (TLC) and Dafny tiers were not runnable here (no Java runtime, no
.NET SDK); the ladder degraded to the Z3 engine as planned. Everything below
is reproducible: `npm test` (Tier A) and `npm run verify` (adds Z3).

## Properties and status

| ID | Property | Method | Bound / scope | Status |
|---|---|---|---|---|
| P1 | Termination & closure: the trace is a permutation on directed states; every orbit is a closed cycle; no loose ends; orbits pair into physical loops | (a) structural argument (b) **Z3 symbolic proof** of successor closedness + injectivity with gate bits free (c) exhaustive TS | 2-dot, 2×2, 1-3-1 symbolic (all assignments); 10 grids × all configs exhaustive | ✅ |
| P2 | Coverage & no-retrace: every undirected lattice edge traversed exactly twice; traced == all valid states | exhaustive TS | all configs of 10 grids ≤ 2^16 | ✅ |
| P3 | Dot safety: strokes ≥ √2⁄4 from every dot; arcs exactly r = ½ centered on dots | unit geometry + validator invariant + exhaustive validator battery | all generated/exhausted docs | ✅ |
| P4 | Prastāra index bijection gates ↔ index over [1, 2^N] | exhaustive TS | ALL indices for grids ≤ 2^12; stride sample for 2^16 | ✅ |
| P5 | Flip-merge: a single gate flip changes the physical loop count by at most 1 | exhaustive TS (every config × every gate) | 2×2, 1-3-1 diamond, 2×3 | ✅ |
| P6 | Gerdes/Jablan gcd theorem: plain weave loop count = gcd(m, n); single curve iff coprime | exhaustive TS | ALL rectangles m, n ≤ 7 | ✅ |
| P7 | Spec well-formedness: schema + semantic validator complete & consistent | mutation testing (6 mutants rejected) + ajv cross-agreement + exhaustive docs validated | diamond 1-5-1 full space + curated examples | ✅ |
| P8 | Harness laws (undo/redo, round-trip, NaN-free camera) | node:test battery in `test/harness.test.ts` | seeded sequences + property fuzz | ✅ (see test file) |
| D1 | Differential: independent Python/Z3 model computes identical loop counts to the TS reference | full cross-check | ALL configs of 2×2, 1-3-1, 2×3, 1-3-3-1, 1-5-1 (66,720 configs) | ✅ |
| L1 | Literature anchor: exactly **240 of 65,536** one-stroke patterns on the 1-5-1 diamond (Yanagisawa–Nagata 2007) | exhaustive enumeration | full space | ✅ |
| L2 | Literature anchor: 1-3-1 plain weave = single stroke of **20 segments** (npj 2026: N_px = 2(ND²+1)) | unit test | — | ✅ |
| L3 | Literature anchor: 1-5-1 has 13 dots, 16 free gates (npj 2026 Eqs. 12–15) | unit test | — | ✅ |

## Exhaustive coverage detail (Tier A, `test/exhaustive.test.ts`)

| Grid | Gates | Configs verified (P1/P2) | One-stroke count |
|---|---|---|---|
| single dot | 0 | 1 | 1 |
| two dots (1 gate) | 1 | 2 | 1 |
| line 1×3 | 2 | 4 | 1 |
| square 2×2 | 4 | 16 | 4 |
| diamond 1-3-1 | 4 | 16 | 1 |
| rows [1,3,1] | 4 | 16 | 1 |
| rect 2×3 | 7 | 128 | 16 |
| rows [1,3,3,1] (śrīvatsa) | 9 | 512 | 16 |
| rect 3×3 | 12 | 4,096 | 240 |
| diamond 1-5-1 | 16 | 65,536 | **240** (= Yanagisawa–Nagata) |

Every configuration additionally satisfies: orbit parity (orbits even ⇒
physical loops = orbits/2), edge multiset = each edge exactly twice, arrival
cells dotted. The one-stroke counts for rect 3×3 (240/4,096) and śrīvatsa
(16/512) are, to our knowledge, new enumeration results.

## Z3 proofs (Tier C, `formal/z3/verify.py`)

**A. Symbolic (gate bits free — a proof for all assignments at once):**
for the 2-dot, 2×2 and 1-3-1 topologies the solver confirms

- A1 (closedness): every valid state's successor is a valid state;
- A2 (injectivity): the successor map is injective on valid states.

Together: the successor map is a permutation of a finite set, so every orbit
is a closed cycle — the trace always yields closed curves with no loose ends
and no retracing, for every possible gate pattern (unsat on the negations).

**B. Differential (model ⇄ implementation bridge):** an independent Python
reimplementation of the gate/trace model (written from `SPEC.md`, sharing no
code with the TypeScript) computes loop counts for every configuration of
the five export grids and equals the TypeScript reference counts exactly
(66,720/66,720).

## Structural notes

- The directed state space traces each physical curve twice (forwards and
  backwards); physical loops = orbits / 2, exact by the reversal involution.
- The one-stroke certificate (`analysis.isOneStroke`) is exact: one physical
  loop in the trace ≡ npj-2026's N_p = N_px.
- The generator's FTS always terminates within its flip budget; when the
  requested symmetry group admits no one-stroke kolam on the grid (e.g. D4
  on odd diamonds — no 4mm one-stroke patterns in Yanagisawa–Nagata's
  symmetric counts), it relaxes along D4→C4→D2→D1→none and reports the
  achieved group; `achieved.budgetExhausted` is reported honestly when the
  certificate is not reached.
