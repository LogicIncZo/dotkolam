# API Reference — Kolam-JSON v1.0

Reference for the TypeScript implementation (`src/`). Zero runtime
dependencies; everything runs in Node ≥ 18 and modern browsers. Import from
the entry points below, the compiled `dist/` after `npm run build`, or — as
an npm consumer — the single barrel `import … from '@logicinczo/dotkolam'` (package
entry `src/index.ts`, which re-exports everything documented here except the
CLI).

Coordinate systems (see [SPEC.md](../SPEC.md) §1): all module APIs work in
**internal** lattice units (dots on even integers, spacing 2, arcs radius 1);
**Kolam-JSON documents** use **display** units (spacing 1, arcs radius 0.5).
Serialization converts at the document boundary (`internal / 2`); canvas
hosts that map pointer or view coordinates into the model frame convert
explicitly with `core/coords.ts` (below).

---

## Core — `src/core/`

### types.ts — document types

The canonical shapes of a Kolam-JSON document and its parts:

| Type | Purpose |
|---|---|
| `KolamDoc` | the whole document: `kolamVersion`, `meta?`, `grid`, `pattern?`, `curves?`, `drawingOrder?`, `analysis?`, `render?` |
| `GridSpec` | `square \| rectangle \| diamond \| rows \| custom` (tagged union; see SPEC §2.1) |
| `Gate` | `{ a: [x,y], b: [x,y], state: 'open' \| 'closed' }` in display units |
| `Stroke` | `line { from, to }` or `arc { center, r: 0.5, a0, a1, sweep }` in display units |
| `Curve` | `{ id, closed: true, strokes: Stroke[] }` |
| `Analysis` | `{ dotCount, gateCount, loopCount, isOneStroke, totalSegments, primitiveCounts }` |
| `Primitive` | `'circle' \| 'drop' \| 'door' \| 'eye' \| 'fan' \| 'diamond'` |
| `Symmetry` | `{ group: 'none' \| 'D1' \| 'D2' \| 'C4' \| 'D4' }` |

Helpers: `pt(x, y)`, `ptEq(a, b)`, `ptKey(p)`, `HEADINGS` (the four diagonal
unit vectors).

### grid.ts — dot layouts

```ts
buildGrid(spec: GridSpec): DotGrid          // DotGrid = { dots: Pt[]; dotsSet: Set<string>; spec }
centerGrid(grid: DotGrid): DotGrid          // translate so bbox center is at (0,0) (even coords)
rowWidths(grid: DotGrid): number[]          // e.g. [1,3,5,3,1] for naming conventions
```

- `diamond rows: m` (odd) constructs Gopalan's 2R template via
  `(a,b) ↦ (a+b, b−a)` for `0 ≤ a,b < m` with `a ≡ b (mod 2)`; dot count
  `(1+m²)/2`. `rows widths` centres each row; `custom` takes explicit integer
  dots. All coordinates are even integers (internal units).
- Throws on invalid parameters (non-odd diamond, ragged row parity, …).

### gates.ts — the pattern layer

A **node** is a channel midpoint: H-nodes at `(odd, even)`, V-nodes at
`(even, odd)`. A node with two flanking dots is an interior gate; with one, a
boundary gate (always closed).

```ts
buildGates(grid: DotGrid, init?: 'all-open' | 'all-closed'): GateSystem
getGate(sys, node): GateState            // throws on unknown node
setGate(sys, node, state): void
flipGate(sys, node): void
encodeIndex(sys): bigint                 // 1-based prastāra index
decodeIndex(sys, index: bigint): void    // exact inverse over [1, 2^N]
gatesToJSON(sys): Gate[]                 // display units, canonical order
findGateByDots(sys, a, b): Pt | null     // node for a display-unit dot pair
```

`GateSystem` = `{ grid, interior: {a, b, node, index}[], boundary, states:
Map<nodeKey, GateState>, nodes }`. `encodeIndex` sets bit *i* for an open
gate *i* in canonical order and adds 1 — index 1 = all closed, `2^N` = all
open (bijection verified exhaustively, P4 in
[verification.md](verification.md)).

### trace.ts — the kolam line

```ts
step(sys, s: DState): DState             // one permutation step
traceAll(sys): Orbit[]                   // directed orbits (each curve twice)
physicalLoops(sys): Orbit[]              // orientation-deduplicated curves
traceCurves(sys, mode?): { curves: Curve[]; drawingOrder: string[] }
orbitToCurve(sys, orbit, id, mode?): Curve
```

- State `(m, d)`: strand at node `m` with diagonal heading `d`; the arriving
  segment's dotted cell is `arrivalCell(m, d)`.
- Transition: open gate → straight; closed → reflect (`H: (−dx, dy)`,
  `V: (dx, −dy)`); next node `m + d′`. The map is a permutation ⇒ closed
  cycles only (P1).
- `mode: 'lattice' | 'smooth'` — lattice emits chords + arcs of radius 0.5
  hugging dots; **smooth** trims each lattice segment by the tangent length
  at turning ends and rounds every corner with the tangent circle centred
  on the dot (radius √2⁄2 internal = √2⁄4 in the display-unit strokes it
  returns), producing the G1-continuous traditional line, everywhere
  √2⁄4 (display) from the dots it weaves (see SPEC §1.3).
- Smooth curves are a **rendering-only** view of the same topology: their
  arc radius is not 0.5, so they are not valid Kolam-JSON `curves`
  (`validateDoc` rejects them; see the renderer's `mode` option).
- `orbitSignature(o)` identifies the forward/reverse pair of a curve.

### analysis.ts — loop counts and primitives

```ts
analyze(sys): Analysis                   // loopCount = physicalLoops().length
classifyDot(sys, dot): Primitive         // circle/drop/door/eye/fan/diamond by open gates
coverageOK(sys): boolean                 // traced states == all valid states
minDotDistance(sys, strokes): number     // sampled min distance (P3 check)
```

`isOneStroke` ⇔ exactly one physical loop ⇔ the npj-2026 certificate
`N_p = N_px`.

### doc.ts — document I/O

```ts
sysFromDoc(doc: KolamDoc): GateSystem            // build from grid + pattern
applyGates(sys, gates: Gate[]): void             // throws on non-channel pairs
docFromSys(sys, opts?): KolamDoc                 // full L3 document
canonicalJSON(v: unknown): string                // sorted keys, 2-space indent
```

`docFromSys` options: `{ meta?, includeCurves? (default true),
includeAnalysis? (true), includeIndex? (false), symmetry?, render? }`. When
both pattern and curves are present the validator re-traces and compares
canonical JSON — documents are their own proof.

### validate.ts — conformance

```ts
validateDoc(doc: KolamDoc): { valid, level: 'L1' | 'L2' | 'L3', issues: {path, message}[] }
```

Checks (SPEC §2.5): closed stroke chains; arcs radius 0.5 centred on dots
with endpoints on the circle; dot-safety ≥ √2⁄4; gate channels valid and
complete; `pattern.index` matches gates; `curves` equals the deterministic
trace of `pattern`; `analysis` matches recomputation.

### coords.ts — internal ↔ display conversion

```ts
toDisplay(p: Pt): Pt                      // internal -> display: halve both coordinates
fromDisplay(p: Pt): Pt                    // display -> internal: double both coordinates
scaleDistance(d: number): number          // a tolerance or radius, display -> internal (×2)
```

Both conversions are exact dyadic halving/doubling and are mutual inverses
on the lattice. In the display frame dots sit on integers and nodes
(channel midpoints) on half-integers in exactly one axis. A canvas host
maps a pointer position into the model frame with `fromDisplay` and
converts its hit tolerances with `scaleDistance` before calling the
hit-tests below.

### pick.ts — hit-testing

```ts
channelSegment(node: Pt): [Pt, Pt]                    // the node's two flanking lattice positions
squaredDistPointSegment(p: Pt, a: Pt, b: Pt): number  // exact on lattice inputs
pickDot(grid: DotGrid, p: Pt, maxDist: number): Pt | null
pickGate(sys: GateSystem, p: Pt, maxDist: number): GateHit | null
```

All inputs are internal coordinates and `maxDist` is inclusive.
`pickDot` returns the nearest dot within `maxDist`; `pickGate` returns the
nearest channel — interior or boundary — measured to the whole channel
segment, not just its midpoint. `GateHit` = `{ node, a, b, interior }`:
`node` is the channel midpoint, `a`/`b` its two flanking lattice positions
(for a boundary channel one of them is not a dot), and `interior: true`
means both flanks are dotted — a gate that carries one bit and may be
edited — while `interior: false` is an always-closed boundary channel.
Both return `null` when nothing lies within `maxDist`, and both break ties
deterministically: `pickDot` by canonical dot order (sorted by `y`, then
`x`), `pickGate` by the smallest node key compared as text (`"x,y"`, so
`"10,0"` sorts before `"9,0"`) — repeated queries over the same geometry
always pick the same feature.

---

## Generator — `src/gen/`

### rng.ts

```ts
makeRng(seed: string): () => number      // cyrb128 → sfc32, platform-stable
```

Same seed ⇒ same stream everywhere (byte-identical canonical JSON; CI-checked).

### symmetry.ts

```ts
groupMaps(group, center): PointMap[]     // dihedral maps about a center
gateOrbits(sys, group): OrbitSet         // { orbits: Pt[][], orbitOf, center }
symmetryHolds(sys, group): boolean
gridSupportsGroup(sys, group): boolean   // does the dot set admit the group?
```

### generator.ts

```ts
generate(params: GenParams): GenResult
```

`GenParams`: `{ grid, symmetry? (default 'none'), density? (σ 0..1, default
0.5), strokes? (1 | 'any', default 1), seed?, restarts? (8), flipBudget?,
name? }`. `GenResult`: `{ doc, requestedSymmetry, achieved: { loops,
isOneStroke, symmetryHolds, openRatio, budgetExhausted } }`.

Algorithm: symmetric σ-biased random assignment (anti-island repair by
greedy set-cover, per npj constraint (a)) → random restarts → **FTS** over
orbits (flip, keep iff loops decrease or plateau-budget allows) → symmetry
**relaxation ladder** `D4→C4→D2→D1→none` when the certificate is unreachable
(e.g. D4 on odd diamonds). The certificate is exact: one physical loop.
`achieved.budgetExhausted` is reported honestly when not reached.

---

## Renderer — `src/render/svg.ts`

```ts
renderSVG(doc: KolamDoc, opts?: RenderOptions): string
renderSysSVG(sys: GateSystem, opts?): string
curveToPath(c: Curve): string            // M/L/A path data (full circles split in two arcs)
curveLength(c: Curve): number
```

`RenderOptions`: `{ width? (640), padding? (1), showDots? (true),
strokeColor?, strokeWidth? (0.09), dotColor?, background? ('none'),
animateClass?, mode? ('lattice') }`. Each curve becomes one
`<path data-length="…">` — ready for the `stroke-dasharray`/
`stroke-dashoffset` draw-in animation (Jake Archibald technique), used by
the OpenKolam replay button.

**Smooth mode** (`mode: 'smooth'`, honoured by `renderSysSVG`): re-traces
the gate system in smooth geometry — every 90° corner rounded by the
tangent circle of radius √2⁄4 (display units) centred on its dot. The
output has the same curve count and loop structure as the lattice render,
with the traditional smooth *kambi* line in place of chords and 0.5 arcs
(SPEC §1.3). Smooth curves are a display transform, not document data:
`renderSVG(doc)` ignores `mode` and draws `doc.curves` exactly as written.
To render a document smoothly, re-trace it from its pattern:
`renderSysSVG(sysFromDoc(doc), { mode: 'smooth' })`. That needs a
`pattern` — on a curves-only document `sysFromDoc` builds the all-closed
system, so the call silently renders that instead of `doc.curves` (the
CLI's `render --smooth` refuses such documents).

---

## Prompt parser — `src/prompt/parser.ts`

```ts
parsePrompt(text: string): { params: PromptParams; interpretation: string[] }
```

Understands (case-insensitive, fully offline): row lists `1-3-5-3-1` (with
trailing punctuation), the `a-b` diamond shorthand (`7-1`), explicit shapes
(`square 9`, `diamond 15`, `9x5`), dot counts (`15 pulli` → nearest classic
diamond), symmetry words (`4-fold`, `mirror`, `asymmetric`…), density words
(`dense`, `open`, `density 0.7`), stroke mode (`one stroke`,
`brahmamudi`, `multiple loops`), `seed WORD`, and motif/occasion tags
(`thamarai`, `margazhi`, …). `interpretation` is a human-readable trace of
every decision — shown in the OpenKolam echo panel. Defaults: diamond 9, C4,
σ 0.55, one stroke, seed = whole prompt (deterministic).

---

## CLI — `src/cli.ts`

```
kolam generate --grid diamond:9 [--symmetry C4] [--density 0.55]
               [--strokes one|any] [--seed pongal] [--name N]
               [--out f.kolam.json] [--render f.svg] [--smooth]
kolam prompt   "15 pulli dense sikku kolam, 4-fold, seed margazhi" […same flags]
kolam render   f.kolam.json [--out f.svg] [--width 640] [--no-dots] [--dark] [--smooth]
kolam validate f.kolam.json…          # exit 1 on any invalid file
kolam info     f.kolam.json…          # dots/gates/loops/primitives/index
```

`--grid` accepts `square:N`, `rectangle:CxR`, `diamond:N` (odd),
`rows:1-3-5-3-1`, `custom:x,y;x,y`. Diagnostics go to stderr, JSON to stdout
(or `--out`), so it composes in pipes.

`--smooth` (with `--render`, or `render`) writes the SVG in smooth kambi
geometry, re-traced from `pattern.gates`. The document itself is never
altered — `generate`/`prompt` still emit lattice `curves`, because smooth
geometry is not serializable — and `render --smooth` requires a document
that has a pattern (it refuses curves-only L1 documents, whose smooth
geometry cannot be re-traced).

---

## Errors and guarantees

- Constructors throw `Error` with specific messages on invalid grids, gate
  pairs, or indices; `validateDoc` never throws — it collects issues.
- Determinism: same seed ⇒ identical canonical JSON (CI-enforced, including
  example regeneration).
- All structural guarantees are formally verified — see
  [verification.md](verification.md) for what is proven and at what bounds.
