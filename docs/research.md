# Research notes — Kolam-JSON foundations

Annotated bibliography assembled 2026-11-22 from three research threads
(formal models; traditional practice; prior software and formats). Every
design decision in `SPEC.md` traces to at least one source below.

## 1. Formal and mathematical models

### The gate ("gating structure") model — the canonical generative layer

- **S. Sivakumar & S. Sivakumar, "An algorithm for one-stroke kolam generation
  using a gating structure", npj Heritage Science 14:144 (2026)** —
  <https://www.nature.com/articles/s40494-026-02310-3>. Gate matrix G
  ((ND+1)² elements, 1 = open / 0 = closed, boundary closed); path evolution
  equations (Eqs. 4–11) with interpolated midpoints for smooth arcs; five
  primitives (drop/door/eye/fan/diamond by open-gate count); aesthetic
  parameter σ (≈0.5–0.6 balanced; >0.7 fan/diamond-dominated); 1-/2-mirror
  symmetry constraints; **flip-test-switch (FTS)** randomized greedy search
  with the exact certificate N_p = N_px = 4·N_S = 2(ND²+1); anti-island
  constraint (≥1 open gate per dot); scalability to ND = 501.
- **K. Yanagisawa & S. Nagata, "Fundamental Study on Design System of Kolam
  Pattern", Forma 22, 31–46 (2007)** —
  <https://q-labo.info/img/200902/KOLAM_Designsystem.pdf>. The original
  gating formalization: crossing=1 / uncrossing=0 at each intersection of the
  45° inclined grid; drawing rules (45° straight lines, arcs around points,
  smooth transitions, no retracing, complete when all dots enclosed);
  exhaustive counts: 1-5-1 has 2^16 patterns of which **240 one-stroke
  (0.366%)**; 1-7-1 has 2^36 with 11.66M one-stroke (0.017%); symmetric
  one-stroke counts (no 4mm category appears — motivation for Kolam-JSON's
  symmetry relaxation ladder).
- **Reference implementation (npj authors)** —
  <https://github.com/SeshadriSivakumar/One-Stroke-Pulli-Kolam-Generation>
  (MIT): gate matrix + occupancy matrix, PI-controlled biased assignment,
  Dice restarts, revert-if-worse FTS with symmetric quadruple writes, island
  monitoring.

### Mirror curves — the equivalence

- **S. Jablan, "Mirror Curves", Bridges 2001, 233–246** —
  <https://archive.bridgesmathart.org/2001/bridges2001-233.pdf>. 4-regular
  midpoint graph; crossings vs two-sided mirrors; RG[a,b] rectangular grid
  with mirrored sides; **theorem: plain grid yields a single closed curve iff
  a and b are coprime, otherwise gcd(a, b) curves**; curve surgery rules
  (a mirror at a crossing of two distinct curves merges them).
- **P. Gerdes, *Lunda Geometry: Mirror Curves, Designs, Knots, Polyominoes***
  — <https://sahistory.org.za/sites/default/files/archive-files3/paulus_gerdes_lunda_geometry_mirror_curves_desbook4you.pdf>;
  "m-canonic mirror curves" —
  <https://www.mi.sanu.ac.rs/vismath/gerd1/index.html>; the gcd result for
  plaited-mat lusona —
  <https://www.math.sinica.edu.tw/media/media/d10_2/10-2-3.pdf>.
- Mapping used by Kolam-JSON: **open gate = crossing (no mirror); closed gate
  = two-sided mirror on the shared edge of the two flanking dot cells**;
  boundary = wall of closed gates through the border-dot ring; a gate flip is
  Jablan's mirror surgery.

### Other formal work

- **V. Gopalan, "Symmetry Classification and Enumeration of Square-Tile
  Sikku Kolams", arXiv:2304.14134 (J. Math. Arts 18, 2024)** — six tiles by
  loose-end count (Circle/Drop/Eye/Door/Fan/Diamond), 1R/2R templates (ner /
  idukku), 8 point groups, N = 2^m enumeration, drops+fans-even necessary
  condition. The 2R k=l=3 template = the 13-dot 1-3-5-3-1 diamond (verified).
- **V. Gopalan & B. K. VanLeeuwen, "A topological approach to creating any
  pulli kolam", Forma 30, 35–41 (2015)** — arXiv:1503.02130: grid-free
  5-step construction for arbitrary dot layouts.
- **Y. Ishimoto, "Solving infinite kolam in knot theory", Forma 22, 15–30
  (2007)** — arXiv:0710.1976: kolams as knot/link diagrams; crossings carry
  no over/under signs in practice; mono-linearity = Eulerian criterion.
- **S. Nagata, "How many loops kolam loop pattern consists of", Forma 30,
  9–18 (2015)** — loop number via Tutte polynomial of the N-line medial
  graph.
- **Gift Siromoney et al.** — array grammars / picture languages for kolam
  (formal-language tradition); **T. Waring, "Sequential Encoding of Tamil
  Kolam Patterns", FORMA** — gesture-code lexicons —
  <https://timwaring.info/wp-content/uploads/2012/03/waring-forma-lexicon-preprint.pdf>.
- **N. Hartmann (2023 thesis)** — mono-linearity as the Eulerian property
  (0 or 2 odd-degree vertices), cited by npj 2026.

## 2. Traditional practice rules (attested)

- **Sahapedia** — three mandatory sikku rules: all line orbits closed; all
  dots encircled; no two lines overlap over a finite length —
  <http://www.sahapedia.org/significance-of-kolam-tamil-culture>.
- **Gopalan (J. Math. Arts 2024)** — all dots individually encircled;
  crossings are discrete points; no loose ends.
- **Yanagisawa & Nagata (2007)** — five drawing rules: closed loops, never
  retrace; all dots enclosed; 45°-inclined straight grid; arcs surrounding
  the dots; no right-angle bends.
- **Ishimoto (2007)** — smooth closed lines; crossings allowed and plain
  ("fine granular objects" carry no crossing signs); lines pass through edge
  midpoints only; each dot isolated by at most four lines.
- **Wikipedia: Kolam** — stroke "runs once around each dot and returns to the
  beginning point"; pride in drawing "without lifting the hand"; closing
  lines symbolically bars evil spirits; Margazhi (mid-Dec–mid-Jan) season;
  rice flour shared with ants — <https://en.wikipedia.org/wiki/Kolam>.
- **Terminology**: *pulli* (dot; Skt. bindu), *kambi* (line), *sikku/chikku*
  (knot), *neli/nelevu* (curving); **ner pulli** = dots in neat rows,
  **idukku pulli** = staggered rows (Chantal Jumel —
  <https://chantal-jumel-kolam-kalam.com/en/pulli-kolam-or-kolam-with-dots>);
  *woda pulli* = hexagonally packed (out of scope for 1.0). Telugu: muggu /
  chukkala muggu; Kannada: rangole/chukki.
- **Naming by dot count**: "9 pulli sikku kolam", "7-1" (= 1-3-5-7-5-3-1),
  "15-8 interlaced", "10-10 straight" (ikolam and practitioner conventions).
- **Classic motif names** (practitioner-attested): chakaram (wheel), sangu
  (conch), thamarai (lotus), kannadi (mirror), kolusu (anklet), seepu (comb),
  temple lamp; **Brahmamudi/Brahmamudi** = the single continuous line;
  *Brahmamudichu* = three knotted strands (multiple closed loops are
  traditional and allowed).
- **Kaavi**: brick-red border enclosing festival kolams — kept as an
  extension point in Kolam-JSON (render layer), not in the pattern layer.
- **Dots remain visible** inside the loops in sikku kolam (Waring).

## 3. Prior software and formats (and why Kolam-JSON is first)

Survey (2026-11-22): GitHub (~1,150 hits, ~30 inspected), npm, PyPI, app
stores, academia. **No JSON/XML kolam interchange format exists.** Nearest
prior art:

- **@muggula-prastaram (core + render), MIT, TypeScript (2026)** —
  <https://github.com/saahily/muggula-prastaram>: gates as a binary vector,
  trace() → closed polylines, BigInt pattern index (Piṅgala prastāra names),
  seeded symmetric search for single-stroke C4 muggus; deliberately ships no
  serialization schema. Kolam-JSON borrows the gate-vector + prastāra-index
  ideas (reimplemented clean-room).
- **evoluteur/kolam-maker, MIT (2026)** —
  <https://github.com/evoluteur/kolam-maker>: mirror-curve generator; mirrors
  added in groups of four until one line remains; click-between-dots toggle
  UX (adopted in Kolam Harness); animated SVG; URL state sharing.
- **zen-kolam (no license), SIKKU_KOLAM_GENERATOR (MIT)** — 16 cell curve
  patterns + connectivity rules (MATLAB File Exchange lineage); the first is
  unusable for code reuse (no license), both lack any format.
- **nhtran93/kolam (R, AGPL)** — the only file-format prior art found:
  undocumented YAML gesture transcriptions.
- **Knot Atlas PD codes** — <https://katlas.org/wiki/Planar_Diagrams> — model
  of multiple equivalent encodings over one diagram (gate vector ≈ PD code
  for kolams).
- **Celtic knot generators** (Sloss tile alphabet; MrBenGriffin/Knot edge
  glyph strings; 2earth barrier-count tile derivation) — tile alphabets and
  break/mirror structures analogous to gates.
- **SVG techniques**: exact arcs via `A` commands; animated line drawing via
  `stroke-dasharray`/`stroke-dashoffset` (Jake Archibald,
  <https://jakearchibald.com/2013/animated-line-drawing-svg/>); plain
  crossings (no over/under) confirmed as the kolam convention.

## 4. Verification anchors (numbers this project reproduces)

| Claim | Source | Status |
|---|---|---|
| Plain rectangle weave: gcd(m,n) loops; single curve iff coprime | Jablan 2001; Gerdes | reproduced (unit tests) |
| 1-3-1 diamond plain weave: single stroke, 20 segments (= 2(ND²+1)) | npj 2026 Eq. 14 | reproduced (unit test) |
| 1-5-1 diamond: 2^16 patterns; exactly 240 one-stroke | Yanagisawa–Nagata 2007 | reproduced (exhaustive enumeration) |
| 1-5-1 dot count (1+ND²)/2 = 13; free gates (ND−1)² = 16 | npj 2026 Eqs. 12–15 | reproduced |
| σ < 0.3 has weak effect (island repair opens gates) | npj 2026 Results | reproduced (density tests) |
| No 4mm (D4) one-stroke on 1-5-1/1-7-1 → relaxation ladder | Y&N symmetric counts | reproduced (generator tests) |
