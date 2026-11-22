#!/usr/bin/env node
/**
 * kolam — Kolam-JSON command line.
 *
 *   kolam generate --grid diamond:9 [--symmetry C4] [--density 0.55]
 *                  [--strokes one|any] [--seed pongal] [--name "My kolam"]
 *                  [--out file.kolam.json] [--render out.svg] [--smooth]
 *   kolam render   file.kolam.json [--out out.svg] [--smooth] [--width 640]
 *                  [--dots|--no-dots] [--dark]
 *   kolam validate file.kolam.json...
 *   kolam info     file.kolam.json...
 *   kolam prompt   "15 pulli diamond sikku kolam, 4-fold, dense" [--out ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { generate } from './gen/generator.js';
import { renderSVG, renderSysSVG } from './render/svg.js';
import { validateDoc } from './core/validate.js';
import { canonicalJSON, sysFromDoc } from './core/doc.js';
import { parsePrompt } from './prompt/parser.js';
import { KolamDoc, GridSpec } from './core/types.js';
import { SymGroup } from './gen/symmetry.js';

function parseGrid(s: string): GridSpec {
  const err = (): never => {
    throw new Error(`--grid: expected square:N | rectangle:CxR | diamond:N | rows:1-3-5-3-1 | custom:x,y;x,y — got "${s}"`) as never;
  };
  const [kind, arg] = s.split(':');
  switch (kind) {
    case 'square':
      return { kind: 'square', size: intArg(arg, err) };
    case 'rectangle': {
      const m = /^(\d+)x(\d+)$/.exec(arg ?? '');
      if (!m) err();
      return { kind: 'rectangle', cols: parseInt(m![1]!, 10), rows: parseInt(m![2]!, 10) };
    }
    case 'diamond': {
      const n = intArg(arg, err);
      if (n % 2 !== 1) throw new Error('--grid diamond:N requires an odd N');
      return { kind: 'diamond', rows: n };
    }
    case 'rows': {
      const widths = (arg ?? '').split('-').map((w) => parseInt(w, 10));
      if (widths.length < 1 || widths.some((w) => !Number.isInteger(w) || w < 1)) err();
      return { kind: 'rows', widths };
    }
    case 'custom': {
      const dots = (arg ?? '').split(';').map((p) => p.split(',').map(Number) as [number, number]);
      return { kind: 'custom', dots };
    }
    default:
      return err();
  }
}

function intArg(s: string | undefined, err: () => never): number {
  if (!s || !/^\d+$/.test(s)) err();
  return parseInt(s!, 10);
}

function loadDoc(path: string): KolamDoc {
  return JSON.parse(readFileSync(path, 'utf8')) as KolamDoc;
}

const HELP = `kolam — Kolam-JSON 1.0 (sikku kolam generator, renderer, validator)
commands:
  generate --grid diamond:9 [--symmetry C4|D4|D2|D1|none] [--density 0.55]
           [--strokes one|any] [--seed pongal] [--name NAME]
           [--out FILE.kolam.json] [--render FILE.svg] [--smooth]
  render   FILE.kolam.json [--out FILE.svg] [--smooth] [--width 640] [--no-dots] [--dark]
           (--smooth: render the smooth kambi geometry re-traced from pattern.gates)
  validate FILE.kolam.json...
  info     FILE.kolam.json...
  prompt   "TEXT"  [...same flags as generate]`;

const args = process.argv.slice(2);
const cmd = args[0];
const rest = args.slice(1);

function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = rest[i + 1];
  if (v === undefined || v.startsWith('--')) return '';
  return v;
}
const has = (name: string): boolean => rest.includes(`--${name}`);

function emit(doc: KolamDoc, opts: { out?: string | undefined; render?: string | undefined; smooth?: boolean }) {
  const json = canonicalJSON(doc);
  if (opts.out) writeFileSync(opts.out, json + '\n');
  else process.stdout.write(json + '\n');
  if (opts.render) {
    const svg = opts.smooth
      ? renderSysSVG(sysFromDoc(doc), { width: 640, mode: 'smooth' })
      : renderSVG(doc, { width: 640 });
    writeFileSync(opts.render, svg + '\n');
  }
}

try {
  switch (cmd) {
    case 'generate':
    case 'prompt': {
      let text = cmd === 'prompt' ? flag('text') ?? rest.find((a) => !a.startsWith('--')) : undefined;
      if (cmd === 'prompt' && text === undefined) throw new Error('prompt needs text');
      let grid: GridSpec | undefined;
      let symmetry: SymGroup | undefined;
      let density: number | undefined;
      let strokes: 1 | 'any' | undefined;
      let seed: string | undefined;
      let name: string | undefined;
      if (text) {
        const pr = parsePrompt(text);
        ({ grid, symmetry, density, strokes, seed } = pr.params as never);
        name = pr.params.name;
        for (const n of pr.interpretation) console.error(`  · ${n}`);
      }
      const g = flag('grid');
      if (g) grid = parseGrid(g);
      const sym = flag('symmetry');
      if (sym) symmetry = sym as SymGroup;
      const dens = flag('density');
      if (dens) density = parseFloat(dens);
      const st = flag('strokes');
      if (st === 'any') strokes = 'any';
      if (st === 'one') strokes = 1;
      const s = flag('seed');
      if (s !== undefined && s !== '') seed = s;
      const n = flag('name');
      if (n) name = n;
      if (!grid) {
        console.error(HELP);
        process.exit(2);
      }
      const r = generate({
        grid,
        symmetry: symmetry ?? 'C4',
        density: density ?? 0.55,
        strokes: strokes ?? 1,
        seed: seed ?? 'kolam',
        ...(name !== undefined ? { name } : {}),
      });
      console.error(
        `  loops=${r.achieved.loops} one-stroke=${r.achieved.isOneStroke} group=${r.doc.pattern?.symmetry?.group} density=${r.achieved.openRatio.toFixed(2)}${r.achieved.budgetExhausted ? ' (budget exhausted)' : ''}`,
      );
      emit(r.doc, { out: flag('out'), render: flag('render'), smooth: has('smooth') });
      break;
    }
    case 'render': {
      const file = rest.find((a) => !a.startsWith('--'));
      if (!file) throw new Error('render needs a file');
      const doc = loadDoc(file);
      if (has('smooth') && !doc.pattern) {
        throw new Error('--smooth re-traces pattern.gates; the document has no pattern (curves-only docs render lattice only)');
      }
      const base = {
        width: parseInt(flag('width') ?? '640', 10),
        showDots: !has('no-dots'),
        ...(has('dark') ? { background: '#3b2a1e', strokeColor: '#f5f1e6', dotColor: '#b08d57' } : {}),
      };
      const svg = has('smooth') ? renderSysSVG(sysFromDoc(doc), { ...base, mode: 'smooth' }) : renderSVG(doc, base);
      const out = flag('out') ?? `${file.replace(/\.kolam\.json$/, '')}.svg`;
      writeFileSync(out, svg + '\n');
      console.log(`wrote ${out}`);
      break;
    }
    case 'validate': {
      const files = rest.filter((a) => !a.startsWith('--'));
      if (files.length === 0) throw new Error('validate needs files');
      let bad = 0;
      for (const f of files) {
        const v = validateDoc(loadDoc(f));
        console.log(`${v.valid ? 'ok ' : 'FAIL'} ${f} [${v.level}]`);
        for (const i of v.issues) console.log(`    ${i.path}: ${i.message}`);
        if (!v.valid) bad++;
      }
      process.exit(bad > 0 ? 1 : 0);
      break;
    }
    case 'info': {
      const files = rest.filter((a) => !a.startsWith('--'));
      for (const f of files) {
        const doc = loadDoc(f);
        const a = doc.analysis;
        console.log(`${f}`);
        console.log(`  name: ${doc.meta?.name ?? '-'}`);
        console.log(`  grid: ${JSON.stringify(doc.grid.spec)}`);
        if (a) {
          console.log(`  dots=${a.dotCount} gates=${a.gateCount} loops=${a.loopCount} one-stroke=${a.isOneStroke} segments=${a.totalSegments}`);
          console.log(`  primitives: ${JSON.stringify(a.primitiveCounts)}`);
        }
        if (doc.pattern?.index) console.log(`  prastara index: ${doc.pattern.index}`);
      }
      break;
    }
    default:
      console.log(HELP);
      process.exit(cmd ? 2 : 0);
  }
} catch (e) {
  console.error(`kolam: ${(e as Error).message}`);
  process.exit(1);
}
