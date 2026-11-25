# Kolam-JSON 1.0 — A JSON Specification for Rule-Bound Sikku (Kambi / Chikku) Kolam

Kolam-JSON is a machine-readable interchange format for **sikku kolam** (Tamil
சிக்கு; also *kambi* "line/wire", *chikku* "knot"; Telugu *chukkala muggu*):
the South Indian threshold art in which closed weaving lines are drawn around
a grid of dots (*pulli*). To the best of a thorough survey (GitHub, npm, PyPI,
app stores, academic literature; see `docs/research.md`), no JSON/XML
interchange format for kolams has been published before — Kolam-JSON is the
first.

A Kolam-JSON document is simultaneously:

1. **Renderable** — the resolved curve geometry draws the kolam exactly;
2. **Generative** — the binary gate pattern plus the grid regenerates the same
   curves deterministically;
3. **Verifiable** — traditional correctness rules are machine-checkable
   invariants, checked by the reference validator.

---

## 1. The kolam model (research foundations)

### 1.1 Dots and gates

A sikku kolam lives on a finite set of **dots** placed on a unit square
lattice (orthogonal neighbours at distance 1). Between every two orthogonally
adjacent dots lies one **gate** — the channel midpoint:

- an **open** gate: the two diagonal strands **cross discretely** at the
  channel midpoint (a plain crossing — no over/under; Ishimoto 2007: rice
  flour crossings carry no crossing signs);
- a **closed** gate: both strands **reflect**, each turning around its
  flanking dot (a two-sided mirror between the two dot cells — Gerdes/Jablan
  mirror curves).

Channels with a dot on only one side are **boundary gates**, always closed:
the kolam line wraps around the border dots. A kolam pattern is exactly **one
bit per interior gate**. This is the gate matrix of Yanagisawa & Nagata
(2007) and Sivakumar & Sivakumar (npj Heritage Science 14:144, 2026), and the
mirror-curve model of Gerdes (*Lunda Geometry*) and Jablan ("Mirror Curves",
Bridges 2001).

### 1.2 The trace

A strand travels diagonally (headings NE/NW/SE/SW) from channel midpoint to
channel midpoint, at 45° to the dot rows. At each gate: open → straight
through; closed → reflect in the channel wall (horizontal channel → negate
dx; vertical channel → negate dy). The map from each directed state (node,
heading) to the next is a **permutation** of a finite set, so every orbit is a
**closed cycle**: closed curves only, no loose ends, no retracing (proof and
model checking: `docs/verification.md`, property P1). The physical curve set
is the orbit set modulo traversal direction (each curve is traced once).

Verified consequences (all checked exhaustively or against published numbers;
see `docs/verification.md`):

- a plain weave on an m×n rectangle has exactly gcd(m, n) loops
  (Gerdes/Jablan theorem — reproduced exactly);
- the plain weave on the 1-3-1 diamond is a single stroke of 20 segments
  (= 2(ND²+1), the npj-2026 certificate value);
- exactly **240 of 65,536** gate patterns of the 1-5-1 diamond are
  one-stroke — the published Yanagisawa–Nagata count, reproduced exactly by
  exhaustive enumeration of the reference implementation.

### 1.3 Geometry of the line (two renderings)

- **Lattice geometry** (canonical in `curves`): straight chords run along the
  45° grid between channel midpoints; every turn at a closed gate hugs its
  dot as a circular arc of radius ½ spacing centered on the dot. Consecutive
  arcs around one dot merge (semicircles for U-turns; a full circle around an
  isolated dot). Lines pass dots at distance √2⁄4; arcs graze at exactly ½.
- **Smooth geometry** (a renderer mode, not stored): every 90° corner is
  rounded by the circle of radius √2⁄4 centered on the dot, which is exactly
  tangent to both adjacent chords. The rendered curve is G1-continuous and
  everywhere at distance √2⁄4 from the dots it weaves — the traditional
  smooth *kambi* look. Smoothing is a deterministic display transform of the
  same topology.

### 1.4 Primitives

Per dot, by its open gates: **0 circle** (island loop — cannot appear in a
one-stroke kolam), **1 drop**, **2 adjacent door**, **2 opposite eye**,
**3 fan**, **4 diamond** (names after Gopalan / Sivakumar & Sivakumar 2026).
`analysis.primitiveCounts` reports the mix; the generator's density parameter
steers it (σ ≈ 0.5–0.6 balances; σ > 0.7 is fan/diamond-dominated, straight
"kambi look"; σ < 0.3 has weak effect because island repair opens gates).

### 1.5 The one-stroke tradition

Traditional drawing ideals (well-attested; see `docs/research.md` §2): all
loops closed, no dangling ends; every dot encircled; lines never touch dots;
crossings are discrete; plain crossings; no retracing; lines on the 45° grid
with arcs around dots; dots remain visible; a single continuous closed line
("one-stroke", *Brahmamudi*) is the prized ideal, though multiple closed
loops are also traditional. Kolam-JSON represents both; `analysis.isOneStroke`
certifies the single-line property exactly (one physical loop in the trace =
the npj N_p = N_px certificate).

---

## 2. Document structure

```jsonc
{
  "kolamVersion": "1.0",
  "meta": {                       // optional
    "name": "Margazhi diamond",
    "nameTa": "மார்கழி கோலம்",     // optional Tamil name
    "tags": ["sikku", "diamond"], // optional
    "notes": "...",               // optional
    "source": "...",              // optional provenance
    "license": "CC-BY-4.0"        // optional
  },
  "grid": {
    "spec": { /* one of the grid kinds below */ },
    "spacing": 1                  // display units per dot step
  },
  "pattern": {                    // generative layer (L2+)
    "gates": [                    // ALL interior gates, canonical order
      { "a": [1, 0], "b": [1, 1], "state": "open" }
    ],
    "index": "12345",             // optional BigInt prastāra index
    "symmetry": { "group": "C4" } // optional declared group
  },
  "curves": [                     // resolved layer (L1+)
    {
      "id": "c1",
      "closed": true,
      "strokes": [
        { "kind": "line", "from": [0.5, 0], "to": [1, 0.5] },
        { "kind": "arc", "center": [1, 0], "r": 0.5,
          "a0": 1.5707963, "a1": -1.5707963, "sweep": "cw" }
      ]
    }
  ],
  "drawingOrder": { "start": [0.5, 0], "direction": "cw", "sequence": ["c1"] },
  "analysis": {
    "dotCount": 13, "gateCount": 16, "loopCount": 1, "isOneStroke": true,
    "totalSegments": 52,
    "primitiveCounts": { "circle": 0, "drop": 4, "door": 2, "eye": 4, "fan": 1, "diamond": 2 }
  },
  "render": {                     // optional display hints
    "stroke": { "width": 0.09, "color": "#f5f1e6" },
    "background": "#5b3a29",
    "showDots": true,
    "padding": 1
  }
}
```

### 2.1 Grid kinds

```jsonc
{ "kind": "square",    "size": 9 }                     // ner pulli, size x size
{ "kind": "rectangle", "cols": 9, "rows": 5 }           // ner pulli
{ "kind": "diamond",   "rows": 15 }                     // classic sikku diamond, rows
                                                        // 1-3-...-15-...-3-1 (odd);
                                                        // dot count (1+rows^2)/2
{ "kind": "rows",      "widths": [1, 3, 3, 1] }         // centred custom rows (e.g. srivatsa)
{ "kind": "custom",    "dots": [[0,0], [1,0], ...] }    // explicit integer lattice dots
```

The **diamond** is Gopalan's "2R" template (two interleaved lattices rotated
45°), i.e. the gate matrix of the npj model; its display form is the classic
staggered-looking 1-3-5-…-1 pulli arrangement. Hexagonal packing (*woda
pulli*) is out of scope for 1.0.

### 2.2 Gates and the prastāra index

`pattern.gates` lists every interior gate once as `{a, b, state}` with `a`,
`b` the two flanking dots (display coordinates, orthogonally adjacent). The
canonical order sorts by `a` then `b` (row-major). The optional `index` is
the 1-based **prastāra index**: gate i contributes bit i (1 = open) to
`index − 1` in binary — so index 1 is all-closed and 2^N is all-open. Encode
and decode are exact inverses over [1, 2^N] (verified).

### 2.3 Curves

Each curve is an ordered cyclic chain of strokes in display units (divide
internal lattice units by 2):

- `line`: `{from, to}` — a straight chord of the 45° grid (endpoints on
  channel midpoints: exactly one coordinate is a half-integer);
- `arc`: `{center, r: 0.5, a0, a1, sweep}` — radians, math convention (y up),
  `sweep ∈ {cw, ccw}` gives the winding from `a0` to `a1` (|a1 − a0| follows
  the sweep and may exceed π: merged semicircles/three-quarter arcs; a full
  circle uses a1 = a0 ± 2π).

Consecutive strokes chain exactly (stroke end = next start) and the last
closes to the first. When both `pattern` and `curves` are present, `curves`
MUST equal the deterministic trace of `pattern` on `grid` (the validator
re-traces and compares canonical JSON).

### 2.4 Conformance levels

| Level | Requires | Usable as |
|---|---|---|
| **L1** | `grid`, `curves` | static rendering |
| **L2** | + `pattern` | re-generation, editing, indexing |
| **L3** | + `analysis`, `drawingOrder` | full round-trip |

### 2.5 Traditional-rule invariants (machine-checked)

| Traditional rule (source) | Invariant |
|---|---|
| All line orbits closed; no loose ends (Sahapedia; Gopalan; Ishimoto) | every curve `closed: true` and stroke-chained cyclically; follows structurally from the permutation trace (P1) |
| Every dot encircled (Yanagisawa–Nagata rule 2) | every dot is flanked by gate channels; the trace covers every valid channel traversal exactly twice (P2) |
| Lines never touch dots (Waring; Ishimoto) | every stroke point is at distance ≥ √2⁄4·spacing − ε from every dot; arcs graze at exactly ½ (P3) |
| Crossings are discrete points, plain (Gopalan; Ishimoto) | crossings occur only at open-gate channel midpoints; no over/under data exists in the format |
| No retracing (Yanagisawa–Nagata rule 1) | permutation orbits never repeat a directed edge (P2) |
| 45° grid, arcs around dots, no right-angle bends (Y&N rules 3–5) | line endpoints on the diagonal channel lattice; arcs centered on dots with r = ½ |
| One-stroke ideal (Brahmamudi) | optional, certified: `analysis.isOneStroke` ⇔ trace has exactly one physical loop |
| Dots remain visible | `render.showDots` default true; dots are first-class grid data |

### 2.6 Reusable structures (components)

A document (or a shared motif library file) may define **components** and a
composition may reference them with dihedral transforms. In 1.0 a component
is a named grid+pattern fragment; placements compose by translation on the
shared lattice (rotation/reflection of a fragment lands on the same lattice
because the model frame is closed under the dihedral group):

```jsonc
"components": {
  "chakaram": { "grid": { "spec": { "kind": "diamond", "rows": 5 } },
                "pattern": { "...": "same shape as the top-level pattern" } }
},
"uses": [ { "component": "chakaram", "transform": { "translate": [4, 0] } } ]
```

Semantics: a `use` contributes its fragment's gates (mapped by the
transform) into the pattern before tracing; overlapping gates must agree.
Components are how classic motifs (chakaram, kannadi, kolusu, border strips)
are shared as `motifs/*.kolam.json`.

### 2.7 Extensibility and versioning

Unknown fields MUST be preserved and ignored by 1.0 consumers. Future minor
revisions keep the invariant core (grid + pattern semantics); the semantics
of open/closed gates and the trace are frozen. Decoration layers (kaavi
borders, fills, freehand annotation) are out of the 1.0 pattern layer and
belong in namespaced extensions.

---

## 3. File format and media types

- Extension: `.kolam.json`; UTF-8; JSON.
- Suggested media type: `application/vnd.kolam+json`.
- Canonical serialization (for signing, dedup, golden tests): UTF-8 JSON,
  recursively sorted keys, no undefined fields, 2-space indent
  (`canonicalJSON` in the reference implementation).
- `schema/kolam-1.0.schema.json` is a JSON Schema 2020-12 document for
  structural validation; the reference validator additionally checks the
  semantic invariants of §2.5.

## 4. Reference implementation

`src/` in this repository (TypeScript, zero runtime dependencies):

- `core/` — grid, gates, trace (permutation orbits), analysis, validator;
- `gen/` — seeded symmetric generator with FTS one-stroke search and the
  D4→C4→D2→D1→none relaxation ladder;
- `render/` — SVG (lattice and smooth geometry, per-curve lengths for
  stroke-dashoffset drawing animation) and GRBL g-code for pen plotters
  and drawing robots;
- `prompt/` — deterministic prompt parser;
- `index.ts` — public library barrel (the published `@logicinczo/dotkolam`
  package; the OpenKolam canvas app consumes it);
- `src/cli.ts` — `kolam generate | render | validate | info`.

## 5. References

See `docs/research.md` for the annotated bibliography (formal models,
traditional practice, prior software) with URLs, and `docs/verification.md`
for the verification results that back §1.2 and §2.5.
