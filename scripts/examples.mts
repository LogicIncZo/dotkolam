/**
 * Generate the curated examples/ set with fixed seeds, validating each.
 * Run: npx tsx scripts/examples.mts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { generate } from '../src/gen/generator.js';
import { buildGrid } from '../src/core/grid.js';
import { buildGates } from '../src/core/gates.js';
import { docFromSys, canonicalJSON } from '../src/core/doc.js';
import { validateDoc } from '../src/core/validate.js';

mkdirSync('examples', { recursive: true });
mkdirSync('motifs', { recursive: true });

function save(name: string, doc: ReturnType<typeof docFromSys>, note: string): void {
  doc.meta = { ...doc.meta, notes: note };
  const v = validateDoc(doc);
  if (!v.valid) {
    console.error(`FAIL ${name}:`, v.issues.slice(0, 3));
    process.exit(1);
  }
  writeFileSync(`examples/${name}.kolam.json`, canonicalJSON(doc) + '\n');
  const a = doc.analysis!;
  console.log(
    `${name}: ${a.dotCount} dots, ${a.loopCount} loop(s), one-stroke=${a.isOneStroke}, gates=${a.gateCount}, index=${doc.pattern?.index}`,
  );
}

// 1. śrīvatsa knot: rows [1,3,3,1], all gates open — the plain weave is a
// single stroke here (prastāra index 2^9 = 512). (The all-closed weave,
// index 1, rings each dot individually: 8 legal closed loops.)
{
  const sys = buildGates(buildGrid({ kind: 'rows', widths: [1, 3, 3, 1] }), 'all-open');
  const doc = docFromSys(sys, { includeIndex: true, symmetry: { group: 'D1' }, meta: { name: 'Śrīvatsa' } });
  save('srivatsa-1331', doc, 'The śrīvatsa (endless knot): the all-open plain weave on rows 1-3-3-1 is one continuous stroke (index 512).');
}

// 2. classic 1-3-5-3-1 diamond, one stroke, C4
{
  const r = generate({ grid: { kind: 'diamond', rows: 5 }, symmetry: 'C4', seed: 'pongal', name: 'Pongal diamond' });
  save('diamond-5-one-stroke-c4', r.doc, 'One-stroke C4 kolam on the classic 13-pulli diamond.');
}

// 3. 9×9 square, one stroke, D4 request -> relaxes per Yanagisawa–Nagata
{
  const r = generate({ grid: { kind: 'square', size: 9 }, symmetry: 'D4', seed: 'margazhi', name: 'Margazhi square' });
  save('square-9-one-stroke', r.doc, `One-stroke 9x9 ner-pulli square (achieved symmetry: ${r.doc.pattern?.symmetry?.group}).`);
}

// 4. a legal multi-loop rectangle (traditional multi-line kolam)
{
  const r = generate({ grid: { kind: 'rectangle', cols: 3, rows: 3 }, symmetry: 'D2', density: 0.4, strokes: 'any', seed: 'multi' });
  save('rect-3x3-multi-loop', r.doc, `A traditionally legal ${r.achieved.loops}-loop kolam (Brahmamudichu-style multiple strands).`);
}

// 5. dense 15-pulli diamond
{
  const r = generate({ grid: { kind: 'diamond', rows: 15 }, symmetry: 'C4', density: 0.75, seed: 'margazhi-dense', name: 'Dense Margazhi diamond' });
  save('diamond-15-dense-c4', r.doc, 'Dense fan/diamond-heavy one-stroke on a 113-pulli diamond.');
}

// 6. two-dot figure-eight (the minimal crossing kolam)
{
  const sys = buildGates(buildGrid({ kind: 'custom', dots: [[0, 0], [1, 0]] }), 'all-open');
  const doc = docFromSys(sys, { includeIndex: true, meta: { name: 'Figure-eight' } });
  save('two-dot-figure-eight', doc, 'The minimal crossing sikku kolam: one gate, gcd(1,2)=1, one loop.');
}

// motif: chakaram (wheel) — 1-3-1 diamond, one stroke, C4
{
  const r = generate({ grid: { kind: 'diamond', rows: 3 }, symmetry: 'C4', seed: 'chakaram', name: 'Chakaram' });
  r.doc.meta = { ...r.doc.meta, notes: 'Reusable chakaram (wheel) motif: 5-pulli diamond, one stroke.' };
  const v = validateDoc(r.doc);
  if (!v.valid) {
    console.error('FAIL chakaram:', v.issues.slice(0, 3));
    process.exit(1);
  }
  writeFileSync('motifs/chakaram.kolam.json', canonicalJSON(r.doc) + '\n');
  console.log('motifs/chakaram: written');
}
