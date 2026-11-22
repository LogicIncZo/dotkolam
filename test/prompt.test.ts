import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrompt } from '../src/prompt/parser.ts';

test('prompt: classic forms', () => {
  const a = parsePrompt('15 pulli diamond sikku kolam with 4-fold symmetry');
  assert.deepEqual(a.params.grid, { kind: 'diamond', rows: 5 }); // (1+25)/2 = 13 closest... 15 -> closest odd
  assert.equal(a.params.symmetry, 'C4');

  const b = parsePrompt('7-1 sikku kolam, dense');
  assert.deepEqual(b.params.grid, { kind: 'diamond', rows: 7 });
  assert.equal(b.params.density, 0.8);

  const c = parsePrompt('square 9 one stroke seed pongal');
  assert.deepEqual(c.params.grid, { kind: 'square', size: 9 });
  assert.equal(c.params.strokes, 1);
  assert.equal(c.params.seed, 'pongal');

  const d = parsePrompt('rows 1-3-5-3-1 mirror');
  assert.deepEqual(d.params.grid, { kind: 'rows', widths: [1, 3, 5, 3, 1] });
  assert.equal(d.params.symmetry, 'D1');

  const e = parsePrompt('9x5 rectangle, multiple loops');
  assert.deepEqual(e.params.grid, { kind: 'rectangle', cols: 9, rows: 5 });
  assert.equal(e.params.strokes, 'any');

  const f = parsePrompt('thamarai margazhi kolam');
  assert.ok(f.params.tags.includes('thamarai'));
  assert.ok(f.params.tags.includes('margazhi'));
  assert.equal(f.params.name, 'thamarai kolam');
});

test('prompt: deterministic defaults & seed from prompt', () => {
  const a = parsePrompt('a nice kolam');
  const b = parsePrompt('a nice kolam');
  assert.deepEqual(a.params, b.params);
  assert.equal(a.params.seed, 'a nice kolam');
});
