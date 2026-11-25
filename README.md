# dotKolam (Kolam-JSON)

[![CI](https://github.com/LogicIncZo/dotkolam/actions/workflows/ci.yml/badge.svg)](https://github.com/LogicIncZo/dotkolam/actions/workflows/ci.yml)
[![Docs on GitHub Pages](https://img.shields.io/badge/docs-github%20pages-e8b04b)](https://logicinczo.github.io/dotkolam/docs/)
[![GitHub Packages](https://img.shields.io/badge/package-%40logicinczo%2Fdotkolam-7ec8a9)](https://github.com/LogicIncZo/dotkolam/pkgs/npm/%40logicinczo%2Fdotkolam)
[![License: MIT](https://img.shields.io/badge/code-MIT-7ec8a9)](LICENSE) [![Spec: CC-BY-4.0](https://img.shields.io/badge/docs-CC--BY--4.0-b9a88f)](LICENSE)

**Live**: [docs & specification](https://logicinczo.github.io/dotkolam/docs/) ·
Canvas app: **[OpenKolam](https://github.com/LogicIncZo/OpenKolam)** (Kolam Harness, its own project)

**dotKolam** maintains **Kolam-JSON**, a research-driven JSON specification —
the first of its kind — for **rule-bound sikku kolam** (Tamil
சிக்கு/கம்பி கோலம், Telugu chukkala muggu): the South Indian threshold art of
knotted lines woven around a grid of dots (*pulli*). Alongside the spec:

- **Reference implementation** (TypeScript, zero runtime deps): validator,
  deterministic generator, SVG renderer with drawing animation — published to
  GitHub Packages as [`@logicinczo/dotkolam`](https://github.com/LogicIncZo/dotkolam/pkgs/npm/%40logicinczo%2Fdotkolam);
- **`kolam` CLI** (shipped with the package);
- **Formal verification**: exhaustive model checking, Z3 symbolic proofs,
  and an independent-model differential bridge
  ([docs/verification.md](docs/verification.md)).

## The model in one paragraph

A sikku kolam is a dot grid plus one bit per **gate** — the channel between
two orthogonally adjacent dots. Open gate: the two strands cross discretely
at the channel midpoint. Closed gate: each strand reflects around its
flanking dot (the mirror-curve model of Gerdes/Jablan; the gate matrix of
Yanagisawa–Nagata and Sivakumar & Sivakumar, npj Heritage Science 2026).
The kolam line is the orbit structure of a **permutation** on directed
channel states — hence closed curves only, no loose ends, no retracing, by
construction. One bit per gate also means a kolam is a number: the optional
`prastāra index` bijectively encodes the whole pattern.

## Quick start

The package lives on **GitHub Packages** (npm registry), which requires
GitHub authentication for install even though it is public. One-time setup
(see [GitHub docs](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)):

```bash
# ~/.npmrc  (or generate a PAT with read:packages and paste it)
echo "@logicinczo:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=$(gh auth token)" >> ~/.npmrc
```

Then:

```bash
npm install @logicinczo/dotkolam     # library + kolam CLI
npx kolam --help
```

Library:

```ts
import { buildGrid, buildGates, traceCurves, renderSVG } from '@logicinczo/dotkolam';
```

CLI:

```bash
npx @logicinczo/dotkolam generate --grid diamond:9 --symmetry C4 --strokes one --seed pongal --out k.kolam.json --render k.svg
npx @logicinczo/dotkolam validate k.kolam.json
npx @logicinczo/dotkolam info k.kolam.json
npx @logicinczo/dotkolam prompt "15 pulli dense sikku kolam, 4-fold, seed margazhi" --render k.svg
npx @logicinczo/dotkolam gcode k.kolam.json --scale 12 --out k.nc    # GRBL pen-plotter export
```

Developing in this repo:

```bash
npm install
npm test          # Tier-A verification incl. exhaustive sweeps
npm run verify    # + Z3 symbolic proofs and differential check
```

## What "traditionally correct" means here

Each practitioner rule (attested: Sahapedia, Gopalan 2024, Yanagisawa–Nagata
2007, Ishimoto 2007 — see [docs/research.md](docs/research.md)) is a
machine-checked invariant:

| Tradition | In the spec |
|---|---|
| All line orbits closed, no loose ends | structural (permutation trace); validator checks curve closure |
| Every dot encircled | trace covers every channel; validator P2 |
| Lines never touch dots | min distance √2⁄4 enforced (P3) |
| Crossings discrete, plain (no over/under) | crossings only at open-gate midpoints |
| No retracing | permutation orbits (P2) |
| 45° grid, arcs around dots, smooth | line/arc stroke model; smooth tangent rendering |
| One-stroke ideal (*Brahmamudi*) | certified exactly: `analysis.isOneStroke` |
| Multiple closed loops are traditional | supported; loop count reported honestly |

## Repository map

```
AGENTS.md             working guide for AI coding agents (commands, invariants, change protocol)
SPEC.md               the Kolam-JSON 1.0 specification
ROADMAP.md            release roadmap (v0.0.1 baseline → milestones)
schema/               JSON Schema 2020-12
docs/research.md      annotated bibliography (formal models, tradition, prior art)
docs/verification.md  verification results (what is proven, how, at what bound)
examples/             curated .kolam.json files (all validate at L3)
motifs/               reusable motifs (chakaram)
src/core/             grid, gates, trace, analysis, validator, doc I/O
src/gen/              seeded RNG, symmetry orbits, σ-density, FTS one-stroke search
src/render/           SVG and G-code exporters (lattice + smooth geometry), animation lengths
src/prompt/           deterministic Idea→Prompt→Draw parser
src/index.ts          public library barrel (the npm package entry)
src/cli.ts            the kolam CLI
formal/z3/            Z3 proofs + independent differential model
test/                 unit, exhaustive, generator, prompt suites
```

**OpenKolam** (separate repo) builds on this package: the Kolam Harness
offline infinite-canvas app — *Idea → Prompt → Draw*, manual gate editing
with live one-stroke feedback, `.harness.json` scenes, exact undo/redo.

## Verification highlights

- **Exhaustive**: every gate configuration of ten small grids (up to all
  2¹⁶ = 65,536 of the 1-5-1 diamond) satisfies closure, coverage, no-retrace,
  and flip-merge properties; the one-stroke count **240/65,536** matches
  Yanagisawa–Nagata exactly.
- **Z3**: successor-map closedness + injectivity proven symbolically for all
  assignments (⇒ closed orbits); an independent Python model reproduces the
  TypeScript loop counts on all 66,720 exported configurations.
- **gcd theorem** (Gerdes/Jablan) verified for all rectangles ≤ 7×7.
- Mutation-tested validator cross-checked against JSON Schema (ajv).

See [docs/verification.md](docs/verification.md) for the full table.

## License

Code: MIT. Specification and docs: CC-BY-4.0.
Traditional art form belongs to its practitioners — this project only
formalizes a respectful computational model of it.
