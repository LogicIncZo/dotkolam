/**
 * Visual smoke: render sample kolams to SVG files for inspection.
 * Run: npx tsx scripts/smoke.mts
 */
import { buildGrid } from '../src/core/grid.js';
import { buildGates } from '../src/core/gates.js';
import { docFromSys, canonicalJSON } from '../src/core/doc.js';
import { renderSVG } from '../src/render/svg.js';
import { validateDoc } from '../src/core/validate.js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('smoke', { recursive: true });

const samples: [string, ReturnType<typeof buildGrid>, number][] = [
  ['single-dot', buildGrid({ kind: 'custom', dots: [[0, 0]] }), 1],
  ['two-dot-open', buildGrid({ kind: 'custom', dots: [[0, 0], [1, 0]] }), 1],
  ['diamond-3-plain', buildGrid({ kind: 'diamond', rows: 3 }), 1],
  ['diamond-5-plain', buildGrid({ kind: 'diamond', rows: 5 }), 1],
  ['square-3x3-plain', buildGrid({ kind: 'square', size: 3 }), 1],
  ['srivatsa-1331', buildGrid({ kind: 'rows', widths: [1, 3, 3, 1] }), 1],
];

for (const [name, grid, idx] of samples) {
  const sys = buildGates(grid, 'all-open');
  const doc = docFromSys(sys, { meta: { name } });
  const v = validateDoc(doc);
  writeFileSync(`smoke/${name}.svg`, renderSVG(doc, { width: 480 }));
  writeFileSync(`smoke/${name}.json`, canonicalJSON(doc));
  console.log(name, 'level', v.level, 'valid', v.valid, v.issues.slice(0, 2));
  if (!v.valid) console.log(JSON.stringify(v.issues, null, 1));
}

// smooth geometry renders
import { renderSysSVG } from '../src/render/svg.js';
for (const [name, grid] of samples) {
  const sys = buildGates(grid, 'all-open');
  writeFileSync(`smoke/${name}-smooth.svg`, renderSysSVG(sys, { width: 480 }));
}
