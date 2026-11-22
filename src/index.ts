/**
 * @logicinczo/dotkolam — public library entry point.
 *
 * Re-exports the whole reference implementation as one browser-safe barrel
 * (no `cli.ts`, no Node built-ins), so a single import serves library
 * consumers such as OpenKolam (https://github.com/LogicIncZo/OpenKolam):
 *
 *   import { buildGrid, buildGates, traceCurves, renderSVG } from '@logicinczo/dotkolam';
 *
 * The `kolam` CLI is shipped separately via the package `bin` entry.
 */

// Core model: types, grids, gates, trace (permutation orbits), analysis,
// validator, doc (de)serialization, coordinate conversion, hit-testing.
export * from './core/types.js';
export * from './core/grid.js';
export * from './core/gates.js';
export * from './core/trace.js';
export * from './core/analysis.js';
export * from './core/validate.js';
export * from './core/doc.js';
export * from './core/coords.js';
export * from './core/pick.js';

// Generation: seeded RNG, symmetry orbits, deterministic generator.
export * from './gen/rng.js';
export * from './gen/symmetry.js';
export * from './gen/generator.js';

// Deterministic Idea → Prompt → Draw parser.
export * from './prompt/parser.js';

// SVG renderer (lattice + smooth tangent geometry).
export * from './render/svg.js';
