/**
 * P8: Harness laws — do/undo inverse, redo, gate-flip refresh, scene
 * round-trip identity, NaN-free placement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newScene, findFreeSpot, sceneToJSON, sceneFromJSON, flipGatesInDoc, SceneKolam } from '../src/harness/scene.ts';
import { newHistory, doCmd, undo, redo, Cmd } from '../src/harness/commands.ts';
import { generate } from '../src/gen/generator.ts';
import { canonicalJSON } from '../src/core/doc.ts';
import { validateDoc } from '../src/core/validate.ts';

function mkKolam(id: string, rows = 5): SceneKolam {
  const r = generate({ grid: { kind: 'diamond', rows }, symmetry: 'C4', seed: id });
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    scale: 1,
    rot: 0,
    reflect: false,
    doc: r.doc,
    gen: { symmetry: 'C4', density: '0.55', strokes: 'one', seed: id },
  };
}

test('do/undo inverse and redo laws across all command kinds', () => {
  let scene = newScene();
  let hist = newHistory();
  const k = mkKolam('k1');
  const ops: Cmd[] = [
    { t: 'add', kolam: k },
    { t: 'move', id: 'k1', from: { x: 0, y: 0 }, to: { x: 3, y: 4 } },
    { t: 'setTransform', id: 'k1', prev: { rot: 0, reflect: false, scale: 1 }, next: { rot: 1, reflect: true, scale: 2 } },
    { t: 'rename', id: 'k1', from: 'k1', to: 'pongal special' },
    {
      t: 'gates',
      id: 'k1',
      pairs: [[0.5, 1, 0.5, 2]],
      prev: ['open'],
      next: ['closed'],
    },
  ];
  // visible projection (nextId is a monotonic counter and may legitimately
  // differ after add/remove cycles)
  const snap = (sc: typeof scene): string =>
    canonicalJSON({ kolams: sc.kolams, camera: sc.camera });
  const snapshots: string[] = [];
  for (const c of ops) {
    snapshots.push(snap(scene));
    const r = doCmd(scene, hist, c);
    scene = r.scene;
    hist = r.history;
  }
  const finalSnap = snap(scene);
  // undo all the way
  for (let i = 0; i < ops.length; i++) {
    const r = undo(scene, hist);
    assert.ok(r);
    scene = r.scene;
    hist = r.history;
  }
  assert.equal(snap(scene), snapshots[0], 'undo-all returns to start');
  // redo all the way
  for (let i = 0; i < ops.length; i++) {
    const r = redo(scene, hist);
    assert.ok(r);
    scene = r.scene;
    hist = r.history;
  }
  assert.equal(snap(scene), finalSnap, 'redo-all returns to final');
  // stepwise: undo then redo at every depth is identity
  for (let d = 0; d < ops.length; d++) {
    let s = scene;
    let h = hist;
    for (let i = 0; i <= d; i++) {
      const r = undo(s, h)!;
      s = r.scene;
      h = r.history;
    }
    for (let i = 0; i <= d; i++) {
      const r = redo(s, h)!;
      s = r.scene;
      h = r.history;
    }
    assert.equal(snap(s), finalSnap, `undo/redo depth ${d} identity`);
  }
});

test('gate flips keep the doc valid and refresh analysis', () => {
  const r = generate({ grid: { kind: 'diamond', rows: 5 }, symmetry: 'C4', seed: 'edit' });
  const gate = r.doc.pattern!.gates[0]!;
  const { doc } = flipGatesInDoc(r.doc, [[gate.a[0], gate.a[1], gate.b[0], gate.b[1]]]);
  const v = validateDoc(doc);
  assert.equal(v.valid, true, JSON.stringify(v.issues.slice(0, 3)));
  assert.equal(doc.analysis!.gateCount, 16);
  // flipping twice returns to the original
  const back = flipGatesInDoc(doc, [[gate.a[0], gate.a[1], gate.b[0], gate.b[1]]]).doc;
  assert.equal(canonicalJSON(back), canonicalJSON(r.doc));
});

test('scene JSON round-trip identity', () => {
  let scene = newScene();
  const r1 = doCmd(scene, newHistory(), { t: 'add', kolam: mkKolam('k1') });
  scene = r1.scene;
  const r2 = doCmd(scene, r1.history, { t: 'add', kolam: mkKolam('k2', 7) });
  scene = r2.scene;
  const file = sceneToJSON(scene);
  const back = sceneFromJSON(JSON.parse(JSON.stringify(file)));
  assert.equal(canonicalJSON(back), canonicalJSON(scene));
  assert.throws(() => sceneFromJSON({ hello: 1 }));
});

test('findFreeSpot never overlaps and is NaN-free', () => {
  let scene = newScene();
  for (let i = 0; i < 8; i++) {
    const k = mkKolam(`k${i}`);
    const spot = findFreeSpot(scene, 5, 5);
    assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.y));
    k.x = spot.x;
    k.y = spot.y;
    scene = { ...scene, kolams: [...scene.kolams, k] };
    // boxes of added kolams must not overlap (with the 1-unit padding used)
    for (let a = 0; a < scene.kolams.length; a++) {
      for (let b = a + 1; b < scene.kolams.length; b++) {
        const A = scene.kolams[a]!;
        const B = scene.kolams[b]!;
        const dx = Math.abs(A.x - B.x);
        const dy = Math.abs(A.y - B.y);
        assert.ok(dx >= 4 || dy >= 4, `kolams ${a},${b} overlap (dx=${dx}, dy=${dy})`);
      }
    }
  }
});
