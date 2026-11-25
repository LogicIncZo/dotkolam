/**
 * G-code exporter tests (src/render/gcode.ts, draft):
 *  - a simulated GRBL run of the output is a faithful plot: travel only with
 *    the pen up, drawing only with it down, every pen-down block returns to
 *    its start, every arc is a valid GRBL arc (start and end on one circle;
 *    r = 1/2 pulli in lattice geometry, sqrt(2)/4 in smooth geometry), and
 *    the plotted length equals the curve length — so arc direction and
 *    winding are transcribed exactly, in both geometries
 *  - hand-checked ground truths: a full circle -> two semicircles under one
 *    pen-down; the two-dot figure-eight -> one pen-down of 2 chords + two
 *    3/4-circle arcs (the line wraps each border dot and crosses the open
 *    gate straight); cw -> G2, ccw -> G3 with I/J = centre - start; an arc
 *    longer than a half turn stays one move
 *  - scale/offset mapping, drawingOrder.sequence, tracing a document that
 *    has no curves, determinism and fixed-point formatting (no NaN,
 *    exponents or "-0.0000"; GRBL's 79-character line limit)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid } from '../src/core/grid.js';
import { buildGates } from '../src/core/gates.js';
import { docFromSys, sysFromDoc } from '../src/core/doc.js';
import { traceCurves } from '../src/core/trace.js';
import { curveLength } from '../src/render/svg.js';
import { curvesToGcode, gcodeHeader, renderGcode } from '../src/render/gcode.js';
import { generate } from '../src/gen/generator.js';
import { Curve, KolamDoc } from '../src/core/types.js';

const dot = (): KolamDoc =>
  docFromSys(buildGates(buildGrid({ kind: 'custom', dots: [[0, 0]] }), 'all-closed'));
const eight = (): KolamDoc =>
  docFromSys(buildGates(buildGrid({ kind: 'custom', dots: [[0, 0], [1, 0]] }), 'all-open'));
const weave = (): KolamDoc => docFromSys(buildGates(buildGrid({ kind: 'square', size: 2 }), 'all-open'));

// --- a miniature GRBL reader: work-unit moves with pen state -------------

interface Move {
  cmd: 'G0' | 'G1' | 'G2' | 'G3';
  x: number;
  y: number;
  i: number;
  j: number;
  pen: boolean;
  line: string;
}

function parse(g: string): Move[] {
  const moves: Move[] = [];
  let pen = false;
  for (const line of g.split('\n')) {
    if (line.startsWith('M3')) pen = true;
    if (line.startsWith('M5')) pen = false;
    const m = /^(G\d) X(-?[\d.]+) Y(-?[\d.]+)(?: I(-?[\d.]+) J(-?[\d.]+))?/.exec(line);
    if (m) {
      moves.push({ cmd: m[1], x: Number(m[2]), y: Number(m[3]), i: Number(m[4] ?? 0), j: Number(m[5] ?? 0), pen, line });
    }
  }
  return moves;
}

type Pt = [number, number];

/** Angle an arc travels from `start` to `end` about `c` in the given direction, in (0, 2pi]. */
function swept(start: Pt, end: Pt, c: Pt, cw: boolean): number {
  const a0 = Math.atan2(start[1] - c[1], start[0] - c[0]);
  const a1 = Math.atan2(end[1] - c[1], end[0] - c[0]);
  let d = cw ? a0 - a1 : a1 - a0;
  while (d <= 1e-9) d += 2 * Math.PI;
  return d;
}

/** Replay `g` as GRBL would and check it plots exactly `curves` at `scale` work units per pulli. */
function assertPlottable(g: string, curves: Curve[], scale: number, arcRadius: number, what: string): void {
  assert.ok(!/NaN|Infinity/.test(g), `${what}: non-finite number in the output`);
  const moves = parse(g);
  assert.ok(moves.length > 0, `${what}: no moves`);
  const starts: Pt[] = [];
  const lengths: number[] = [];
  const counts: number[] = [];
  let block = -1; // pen-down block being plotted
  let open = false; // a travel has started a block that has not been checked yet
  let pos: Pt | null = null;
  const finish = (): void => {
    if (!open || pos === null) return;
    const s = starts[block]!;
    assert.ok(
      Math.hypot(pos[0] - s[0], pos[1] - s[1]) < 2e-4,
      `${what}: curve ${block + 1} does not close back to its start`,
    );
    open = false;
  };
  for (const m of moves) {
    if (m.cmd === 'G0') {
      finish(); // each travel follows one complete curve (no parking move in these calls)
      assert.equal(m.pen, false, `${what}: travel with the pen down: ${m.line}`);
      pos = [m.x, m.y];
      block += 1;
      starts[block] = pos;
      lengths[block] = 0;
      counts[block] = 0;
      open = true;
      continue;
    }
    assert.equal(m.pen, true, `${what}: drawing move with the pen up: ${m.line}`);
    assert.ok(open && pos !== null, `${what}: drawing before any travel: ${m.line}`);
    const start: Pt = pos!;
    if (m.cmd === 'G1') {
      lengths[block]! += Math.hypot(m.x - start[0], m.y - start[1]);
    } else {
      const c: Pt = [start[0] + m.i, start[1] + m.j];
      const r0 = Math.hypot(start[0] - c[0], start[1] - c[1]);
      const r1 = Math.hypot(m.x - c[0], m.y - c[1]);
      // GRBL rejects an arc whose radii differ by more than 0.005 mm or 0.1% of the radius (error 33)
      assert.ok(Math.abs(r0 - r1) < 1e-3, `${what}: arc radii differ (${r0} vs ${r1}): ${m.line}`);
      assert.ok(Math.abs(r0 - arcRadius) < 2e-3, `${what}: arc radius ${r0} != ${arcRadius}: ${m.line}`);
      lengths[block]! += r0 * swept(start, [m.x, m.y], c, m.cmd === 'G2');
    }
    counts[block]! += 1;
    pos = [m.x, m.y];
  }
  finish();
  assert.equal(starts.length, curves.length, `${what}: ${starts.length} pen-down blocks for ${curves.length} curves`);
  for (const [b, c] of curves.entries()) {
    assert.ok(counts[b]! > 0, `${what}: curve ${b + 1} plots nothing`);
    const want = curveLength(c) * scale;
    assert.ok(
      Math.abs(lengths[b]! - want) <= 1e-3 + 2e-4 * counts[b]!,
      `${what}: curve ${b + 1} plots ${lengths[b]} but is ${want} long`,
    );
  }
}

// ---

test('single dot: one full circle as two semicircles under one pen-down', () => {
  const g = renderGcode(dot());
  assert.equal(
    g,
    [
      '(kolam: untitled)',
      '(pulli 1, loops 1, one-stroke true)',
      '(GRBL: units mm, scale 10.0000 per pulli)',
      '(offset X0.0000 Y0.0000, feed 1500.0000)',
      'G21',
      'G90',
      'G17',
      'M5 S0',
      'G4 P0.2000',
      'G0 X0.0000 Y-5.0000',
      'M3 S1000',
      'G4 P0.2000',
      'G3 X0.0000 Y5.0000 I0.0000 J5.0000 F1500.0000',
      'G3 X0.0000 Y-5.0000 I0.0000 J-5.0000',
      'M5 S0',
      'G4 P0.2000',
      'G0 X0.0000 Y0.0000',
      '',
    ].join('\n'),
  );
});

test('two-dot figure-eight: one pen-down, two chords, two 3/4-circle arcs', () => {
  const g = renderGcode(eight(), { settle: 0 });
  assert.equal(
    g.slice(g.indexOf('G0 ')),
    [
      // start at the open gate (0.5, 0), chord to the top of dot (1, 0)
      'G0 X5.0000 Y0.0000',
      'M3 S1000',
      'G1 X10.0000 Y5.0000 F1500.0000',
      // clockwise around dot (1, 0): top -> right -> bottom -> back through the gate
      'G2 X5.0000 Y0.0000 I0.0000 J-5.0000',
      'G1 X0.0000 Y5.0000',
      // counter-clockwise around dot (0, 0): top -> left -> bottom -> back through the gate
      'G3 X5.0000 Y0.0000 I0.0000 J-5.0000',
      'M5 S0',
      'G0 X0.0000 Y0.0000',
      '',
    ].join('\n'),
  );
});

test('a simulated GRBL plot is faithful, in lattice and in smooth geometry', () => {
  const cases: [string, KolamDoc, number][] = [
    ['single dot', dot(), 10],
    ['figure-eight', eight(), 10],
    ['2x2 weave', weave(), 10],
    ['all-closed 3x3', docFromSys(buildGates(buildGrid({ kind: 'square', size: 3 }), 'all-closed')), 25],
    ['1-5-1 plain weave', docFromSys(buildGates(buildGrid({ kind: 'diamond', rows: 5 }), 'all-open')), 40],
    ['generated one-stroke', generate({ grid: { kind: 'diamond', rows: 7 }, symmetry: 'C4', seed: 'gcode' }).doc, 8],
    [
      'generated multi-loop',
      generate({ grid: { kind: 'rectangle', cols: 5, rows: 4 }, symmetry: 'D2', strokes: 'any', seed: 'gcode-multi' }).doc,
      8,
    ],
  ];
  for (const [name, doc, scale] of cases) {
    assertPlottable(renderGcode(doc, { scale, settle: 0, park: false }), doc.curves!, scale, 0.5 * scale, name);
  }
  for (const [name, doc, scale] of cases) {
    const { curves, drawingOrder } = traceCurves(sysFromDoc(doc), 'smooth');
    const g = curvesToGcode(curves, drawingOrder, { scale, settle: 0, park: false });
    assertPlottable(g, curves, scale, (Math.SQRT2 / 4) * scale, `${name} (smooth)`);
  }
});

test('cw -> G2 and ccw -> G3, with I/J = centre - start (scaled, not offset)', () => {
  const arc = (a0: number, a1: number, sweep: 'cw' | 'ccw'): Curve => ({
    id: 'c',
    closed: true,
    strokes: [{ kind: 'arc', center: [1, 0], r: 0.5, a0, a1, sweep }],
  });
  const body = (c: Curve): string[] =>
    curvesToGcode([c], undefined, { scale: 10, offset: [100, 200], settle: 0, park: false })
      .trim()
      .split('\n')
      .slice(1); // drop the opening pen-up

  // top (1, 0.5) -> right (1.5, 0), a quarter turn clockwise
  assert.deepEqual(body(arc(Math.PI / 2, 0, 'cw')), [
    'G0 X110.0000 Y205.0000',
    'M3 S1000',
    'G2 X115.0000 Y200.0000 I0.0000 J-5.0000 F1500.0000',
    'M5 S0',
  ]);
  // right (1.5, 0) -> top (1, 0.5), a quarter turn counter-clockwise
  assert.deepEqual(body(arc(0, Math.PI / 2, 'ccw')), [
    'G0 X115.0000 Y200.0000',
    'M3 S1000',
    'G3 X110.0000 Y205.0000 I-5.0000 J0.0000 F1500.0000',
    'M5 S0',
  ]);

  // the long way round (three quarters clockwise) is one move, not a short arc
  const long = parse(curvesToGcode([arc(0, Math.PI / 2, 'cw')], undefined, { scale: 10, settle: 0, park: false }));
  assert.deepEqual(
    long.map((m) => m.cmd),
    ['G0', 'G2'],
  );
  assert.ok(Math.abs(swept([15, 0], [10, 5], [10, 0], true) - 1.5 * Math.PI) < 1e-9);

  // a zero-length arc moves nothing
  assert.deepEqual(
    parse(curvesToGcode([arc(1, 1, 'ccw')], undefined, { scale: 10, settle: 0, park: false })).map((m) => m.cmd),
    ['G0'],
  );
});

test('a broken chain lifts the pen and travels to the next stroke', () => {
  const c: Curve = {
    id: 'c',
    closed: false,
    strokes: [
      { kind: 'line', from: [0, 0], to: [1, 0] },
      { kind: 'line', from: [2, 0], to: [3, 0] },
    ],
  };
  assert.equal(
    curvesToGcode([c], undefined, { settle: 0, park: false }),
    [
      'M5 S0', // the program starts with the pen lifted
      'G0 X0.0000 Y0.0000',
      'M3 S1000',
      'G1 X10.0000 Y0.0000 F1500.0000',
      'M5 S0',
      'G0 X20.0000 Y0.0000',
      'M3 S1000',
      'G1 X30.0000 Y0.0000 F1500.0000', // feed restated after every pen-down (a Z-lift pen brings its own F)
      'M5 S0',
      '',
    ].join('\n'),
  );
});

test('pen commands and dwell are configurable', () => {
  const g = renderGcode(dot(), {
    penDown: 'G1 Z-2 F300',
    penUp: 'G1 Z5 F600',
    settle: 0.5,
    feed: 900,
  });
  assert.deepEqual(g.split('\n').slice(7, 14), [
    'G1 Z5 F600',
    'G4 P0.5000',
    'G0 X0.0000 Y-5.0000',
    'G1 Z-2 F300',
    'G4 P0.5000',
    'G3 X0.0000 Y5.0000 I0.0000 J5.0000 F900.0000',
    'G3 X0.0000 Y-5.0000 I0.0000 J-5.0000',
  ]);
  // multi-line pen commands are emitted line by line, verbatim; an empty string emits nothing
  const multi = renderGcode(eight(), { penDown: 'M3 S800\nG4 P0.1', penUp: '', settle: 0, park: false });
  assert.equal(multi.slice(multi.indexOf('G0 ')), 'G0 X5.0000 Y0.0000\nM3 S800\nG4 P0.1\nG1 X10.0000 Y5.0000 F1500.0000\nG2 X5.0000 Y0.0000 I0.0000 J-5.0000\nG1 X0.0000 Y5.0000\nG3 X5.0000 Y0.0000 I0.0000 J-5.0000\n');
});

test('scale and offset map display units onto work coordinates', () => {
  const doc = weave(); // dots at display (0,0)..(1,1)
  const g = renderGcode(doc, { scale: 60, offset: [150, 90], park: false, settle: 0 });
  for (const m of parse(g)) {
    // the line stays within half a pulli of the dot square [150, 210] x [90, 150]
    assert.ok(m.x >= 120 - 1e-9 && m.x <= 240 + 1e-9 && m.y >= 60 - 1e-9 && m.y <= 180 + 1e-9, m.line);
  }
  assertPlottable(g, doc.curves!, 60, 30, 'scaled weave');
  // the park move returns to the work origin
  const parked = renderGcode(doc, { scale: 60, offset: [150, 90], settle: 0 }).trim().split('\n');
  assert.equal(parked[parked.length - 1], 'G0 X150.0000 Y90.0000');
  assert.ok(renderGcode(doc, { units: 'in' }).includes('\nG20\n'));
});

test('drawingOrder.sequence sets the plotting order', () => {
  const doc = weave(); // two loops: c1, c2
  const firstTravel = (d: KolamDoc): string => parse(renderGcode(d, { settle: 0, park: false }))[0]!.line;
  const startOf = (id: string): Pt => {
    const s = doc.curves!.find((c) => c.id === id)!.strokes[0]!;
    return s.kind === 'line' ? s.from : [s.center[0] + s.r * Math.cos(s.a0), s.center[1] + s.r * Math.sin(s.a0)];
  };
  const at = (p: Pt): string => `G0 X${(p[0] * 10).toFixed(4)} Y${(p[1] * 10).toFixed(4)}`;
  assert.equal(firstTravel(doc), at(startOf('c1')));
  const reversed: KolamDoc = { ...doc, drawingOrder: { ...doc.drawingOrder!, sequence: ['c2', 'c1'] } };
  assert.equal(firstTravel(reversed), at(startOf('c2')));
  // a sequence that is not a permutation of the curve ids falls back to document order:
  // a partial one, and a repeated id (which must neither double one curve nor drop another)
  const partial: KolamDoc = { ...doc, drawingOrder: { ...doc.drawingOrder!, sequence: ['c1'] } };
  const doubled: KolamDoc = { ...doc, drawingOrder: { ...doc.drawingOrder!, sequence: ['c1', 'c1'] } };
  const bare: KolamDoc = { ...doc, drawingOrder: undefined };
  for (const [name, bad] of [['partial', partial], ['doubled', doubled]] as const) {
    assert.equal(firstTravel(bad), at(startOf('c1')), name);
    assertPlottable(renderGcode(bad, { settle: 0, park: false }), doc.curves!, 10, 5, `${name} sequence`);
    assert.equal(renderGcode(bad, { settle: 0 }), renderGcode(bare, { settle: 0 }), name);
  }
});

test('a document without curves is traced from its pattern', () => {
  const full = generate({ grid: { kind: 'diamond', rows: 5 }, symmetry: 'C4', seed: 'l2' }).doc;
  const { curves: _curves, drawingOrder: _order, analysis: _analysis, ...l2 } = full;
  const body = (g: string): string => g.split('\n').filter((l) => !l.startsWith('(')).join('\n');
  assert.ok(l2.pattern && !('curves' in l2));
  assert.equal(body(renderGcode(l2 as KolamDoc)), body(renderGcode(full)));
  // an empty curves array with a pattern is traced too (the validator calls this L2)
  assert.equal(body(renderGcode({ ...full, curves: [] })), body(renderGcode(full)));
});

test('header comments carry provenance and stay GRBL-safe', () => {
  const base = eight();
  const g = renderGcode({ ...base, meta: { name: 'Pongal (பொங்கல்) 100%' } }, {
    scale: 2.5,
    offset: [3, -4],
    feed: 900,
  });
  assert.deepEqual(g.split('\n').slice(0, 6), [
    '(kolam: Pongal  100)', // non-ASCII, parentheses and '%' would break GRBL's comment parser
    '(pulli 2, loops 1, one-stroke true)',
    '(GRBL: units mm, scale 2.5000 per pulli)',
    '(offset X3.0000 Y-4.0000, feed 900.0000)',
    'G21',
    'G90',
  ]);
  // accented Latin letters are unaccented, not dropped: "Śrīvatsa" -> "Srivatsa"
  assert.equal(renderGcode({ ...base, meta: { name: 'Śrīvatsa' } }).split('\n')[0], '(kolam: Srivatsa)');
  // a name with nothing left in ASCII falls back
  assert.equal(renderGcode({ ...base, meta: { name: 'கோலம்' } }).split('\n')[0], '(kolam: untitled)');
  // a lone surrogate (legal in JSON) must not abort the export
  assert.equal(renderGcode({ ...base, meta: { name: '\uD800x\uDFFF' } }).split('\n')[0], '(kolam: x)');
  // long comments are cut to what GRBL accepts: 79 characters, parentheses included
  const [longest] = renderGcode({ ...base, meta: { name: 'x'.repeat(200) } }).split('\n');
  assert.equal(longest, `(kolam: ${'x'.repeat(70)})`);
  assert.equal(longest.length, 79);
  // gcodeHeader works standalone (hosts that trace curves themselves)
  assert.equal(gcodeHeader(null, { units: 'in' }), '(GRBL: units in, scale 10.0000 per pulli)\n(offset X0.0000 Y0.0000, feed 1500.0000)\nG20\nG90\nG17\n');
});

test('output is deterministic and fixed-point everywhere', () => {
  const docs = [
    dot(),
    eight(),
    docFromSys(buildGates(buildGrid({ kind: 'diamond', rows: 5 }), 'all-open')), // negative coordinates
    generate({ grid: { kind: 'square', size: 9 }, symmetry: 'D4', seed: 'fmt' }).doc,
  ];
  for (const doc of docs) {
    for (const opts of [{ offset: [-3, 7] }, { scale: 0.3333, offset: [1, 1] }]) {
      const g = renderGcode(doc, opts);
      assert.equal(g, renderGcode(doc, opts));
      assert.ok(g.endsWith('\n') && !g.includes('\n\n'));
      assert.ok(!/NaN|Infinity|[0-9]e[+-]?\d/i.test(g));
      for (const line of g.split('\n')) {
        assert.ok(line.length <= 79, `line over GRBL's 79-character budget: ${line}`);
        if (line === '' || line.startsWith('(') || line.startsWith('M')) continue; // M lines are the user's own
        for (const tok of line.split(' ').slice(1)) {
          assert.ok(/^[A-Z]-?\d+\.\d{4}$/.test(tok) && !/-0\.0000$/.test(tok), `bad number in "${line}"`);
        }
      }
    }
  }
  // why the snapping matters: cos(1.5pi) is not exactly 0, and a naive
  // toFixed would print the arc's start as "-0.0000"
  assert.notEqual(Math.cos(1.5 * Math.PI), 0);
  const axisAligned: Curve = {
    id: 'c',
    closed: true,
    strokes: [{ kind: 'arc', center: [0, 0], r: 0.5, a0: 1.5 * Math.PI, a1: 2 * Math.PI, sweep: 'ccw' }],
  };
  assert.equal(
    curvesToGcode([axisAligned], undefined, { settle: 0, park: false }),
    'M5 S0\nG0 X0.0000 Y-5.0000\nM3 S1000\nG3 X5.0000 Y0.0000 I0.0000 J5.0000 F1500.0000\nM5 S0\n',
  );
});

test('invalid options throw with a specific message', () => {
  const doc = eight();
  const bad: Record<string, unknown>[] = [
    { scale: 0 },
    { scale: -1 },
    { scale: NaN },
    { scale: Infinity },
    { offset: [NaN, 0] },
    { offset: [0] },
    { offset: [1, Infinity] },
    { feed: 0 },
    { feed: -5 },
    { settle: -1 },
    { settle: NaN },
    { units: 'cm' },
  ];
  for (const o of bad) {
    assert.throws(() => renderGcode(doc, o), /^Error: gcode (scale|offset|feed|settle|units) must be /, JSON.stringify(o));
    assert.throws(() => curvesToGcode(doc.curves!, undefined, o), /^Error: gcode /, JSON.stringify(o));
  }
  // nothing to plot is not an error: an empty body lifts the pen and parks
  assert.equal(curvesToGcode([], undefined, { settle: 0 }), 'M5 S0\nG0 X0.0000 Y0.0000\n');
});
