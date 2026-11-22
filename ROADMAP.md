# dotkolam roadmap

Releases start at **v0.0.1** — the baseline: Kolam-JSON 1.0 spec, the
zero-dependency TypeScript reference implementation (validator, generator,
renderer, CLI, prompt parser), the verification ladder (exhaustive model
checking → Z3 symbolic proofs → independent differential model), and the
canvas-facing primitives (`core/coords.ts`, `core/pick.ts`, smooth render
mode). The package version always matches its release tag.

Milestones track releases on GitHub; this file is the narrative view.

## Release process — the milestone gate

- All work lands on `dev` through PRs from feature branches
  (`feat/…`, `fix/…`, `chore/…`); CI must be green before a feature PR
  merges into `dev`.
- **`dev` → `main` is a human-reviewed milestone gate.** One release PR per
  milestone, reviewed and merged by a human — agents and automation must
  never merge, push, or fast-forward `main` (a branch ruleset enforces the
  PR-only flow). The `vX.Y.Z` tag on `main` triggers the GitHub Packages
  publish workflow.
- A milestone is ready for human review when every issue in it is closed on
  `dev` and full CI parity passes (`npm run build && npm run verify` +
  the examples determinism diff).

## v0.1.0 — next

- [ ] **`components`/`uses` motif composition** — the schema defines
      translate/rotate90/reflect composition, but `src/` does not implement
      it yet; bring the core and CLI up to the schema
- [ ] **Smooth-mode serialization decision** — smooth kambi geometry
      (arcs r=√2/4 display) is currently render-only because the schema
      fixes arc radius at 0.5; either extend the schema (per-stroke radius)
      or bless render-only forever, and record the decision in SPEC.md
- [ ] **Incremental trace** — per-gate recompute (dirty-orbit set) so large
      grids edit at interactive rates for canvas hosts; the API today is
      batch/whole-model
- [ ] **`gcode.ts` exporter (draft)** — kolam → GRBL g-code for pen
      plotters/robots; stroke ordering already comes from `drawingOrder`
- [ ] **docs/api.md refresh** — document `core/coords.ts` + `core/pick.ts`
      (shipped in v0.0.1) and the `RenderOptions.mode` smooth rendering

## later

- Hexagonal packing grids (woda pulli) — explicitly out of scope for spec 1.0
- Symmetry groups beyond D1/D2/C4/D4
- Animation primitives (per-`step` strand walking) for teaching tools
- Staged grid editing with a stable prastāra index across dot add/remove
