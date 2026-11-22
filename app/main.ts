/**
 * Kolam Harness — infinite-canvas app.
 * Idea → Prompt → Draw, plus manual gate-editing, all offline.
 */
import { KolamDoc, GridSpec } from '../src/core/types.js';
import { buildGrid } from '../src/core/grid.js';
import { buildGates } from '../src/core/gates.js';
import { traceCurves } from '../src/core/trace.js';
import { canonicalJSON, docFromSys } from '../src/core/doc.js';
import { generate } from '../src/gen/generator.js';
import { parsePrompt } from '../src/prompt/parser.js';
import { renderSVG, curveToPath, curveLength } from '../src/render/svg.js';
import {
  Scene, SceneKolam, newScene, findFreeSpot, bboxOfDoc, sceneToJSON, sceneFromJSON,
} from '../src/harness/scene.js';
import { Cmd, History, newHistory, doCmd, undo, redo } from '../src/harness/commands.js';

const svg = document.querySelector('#canvas') as SVGSVGElement;
const SVGNS = 'http://www.w3.org/2000/svg';

// ---------- state ----------
let scene: Scene = newScene();
let hist: History = newHistory();
let mode: 'select' | 'gates' = 'select';
let showDots = true;
let smooth = true;
let theme: 'flour' | 'paper' = 'flour';
let snap = false;
let selected: string | null = null;
let lastPromptEcho = '';

const PALETTE = {
  flour: { stroke: '#f2ead9', dot: '#c9a36a', ground: '#241a11' },
  paper: { stroke: '#221c14', dot: '#8a6d3b', ground: '#f0e9db' },
};

// ---------- scene helpers ----------

function kolamBBox(k: SceneKolam) {
  const b = bboxOfDoc(k.doc);
  const s = k.scale;
  // rotation swaps extents
  const w = (k.rot % 2 === 0 ? b.maxX - b.minX : b.maxY - b.minY) * s + 2;
  const h = (k.rot % 2 === 0 ? b.maxY - b.minY : b.maxX - b.minX) * s + 2;
  return { w, h };
}

function addGenerated(text: string): void {
  const pr = parsePrompt(text);
  const r = generate({
    grid: pr.params.grid,
    symmetry: pr.params.symmetry,
    density: pr.params.density,
    strokes: pr.params.strokes,
    seed: pr.params.seed,
    name: pr.params.name,
  });
  const b = bboxOfDoc(r.doc);
  const spot = findFreeSpot(scene, b.maxX - b.minX + 2, b.maxY - b.minY + 2);
  const k: SceneKolam = {
    id: `k${scene.nextId}`,
    name: pr.params.name ?? `${describeGrid(pr.params.grid)} kolam`,
    x: spot.x,
    y: spot.y,
    scale: 1,
    rot: 0,
    reflect: false,
    doc: r.doc,
    gen: {
      symmetry: r.doc.pattern?.symmetry?.group ?? 'C4',
      density: pr.params.density,
      strokes: String(pr.params.strokes),
      seed: pr.params.seed,
    },
  };
  run({ t: 'add', kolam: k });
  selected = k.id;
  lastPromptEcho = pr.interpretation.join(' · ');
  toast(`drew ${k.name} — ${r.achieved.isOneStroke ? 'one stroke ✓' : `${r.achieved.loops} loops`} · ${lastPromptEcho}`);
  centerOn(k);
}

function describeGrid(g: GridSpec): string {
  switch (g.kind) {
    case 'square': return `${g.size}×${g.size}`;
    case 'rectangle': return `${g.cols}×${g.rows}`;
    case 'diamond': return `diamond ${g.rows}`;
    case 'rows': return g.widths.join('-');
    case 'custom': return `${g.dots.length} dots`;
  }
}

function run(c: Cmd): void {
  const r = doCmd(scene, hist, c);
  scene = r.scene;
  hist = r.history;
  scheduleAutosave();
  renderAll();
}

function centerOn(k: SceneKolam): void {
  scene.camera.x = k.x;
  scene.camera.y = k.y;
  scheduleAutosave();
  renderAll();
}

// ---------- rendering ----------

function el(name: string, attrs: Record<string, string | number> = {}): SVGElement {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

let world: SVGGElement | null = null;

function renderAll(): void {
  svg.innerHTML = '';
  const pal = PALETTE[theme];
  document.body.classList.toggle('light', theme === 'paper');
  const { x: cx, y: cy, zoom } = scene.camera;
  const W = svg.clientWidth || 1200;
  const H = svg.clientHeight || 800;
  world = el('g', {
    transform: `translate(${W / 2},${H / 2}) scale(${zoom}) translate(${-cx},${-cy})`,
  });
  svg.appendChild(world);

  for (const k of scene.kolams) {
    const g = el('g', {
      class: `kolam${k.id === selected ? ' selected' : ''}`,
      transform: `translate(${k.x},${k.y}) rotate(${k.rot * 90}) scale(${k.reflect ? -k.scale : k.scale},${k.scale})`,
      'data-id': k.id,
    }) as SVGGElement;
    const b = bboxOfDoc(k.doc);
    const mx = (b.minX + b.maxX) / 2;
    const my = (b.minY + b.maxY) / 2;
    const inner = el('g', { transform: `translate(${-mx},${-my})` });

    // curves (smooth or lattice geometry derived on the fly)
    const sys = buildGates(buildGrid(k.doc.grid.spec), 'all-closed');
    for (const gate of k.doc.pattern?.gates ?? []) {
      const key = `${gate.a[0]},${gate.a[1]}<->${gate.b[0]},${gate.b[1]}`;
      void key;
    }
    applyGatesLite(sys, k.doc);
    const { curves } = traceCurves(sys, smooth ? 'smooth' : 'lattice');
    const curvesG = el('g', { class: 'curves' });
    for (const c of curves) {
      const len = curveLength(c);
      curvesG.appendChild(
        el('path', {
          d: curveToPath(c),
          stroke: pal.stroke,
          'stroke-width': 0.09,
          'data-length': len.toFixed(3),
          fill: 'none',
        }),
      );
    }
    inner.appendChild(curvesG);

    if (showDots) {
      const dotsG = el('g');
      for (const d of sys.grid.dots) {
        dotsG.appendChild(
          el('circle', { cx: d.x / 2, cy: d.y / 2, r: 0.13, fill: pal.dot }),
        );
      }
      inner.appendChild(dotsG);
    }

    // selection outline
    if (k.id === selected) {
      inner.appendChild(
        el('rect', {
          class: 'outline',
          x: b.minX - 0.6,
          y: b.minY - 0.6,
          width: b.maxX - b.minX + 1.2,
          height: b.maxY - b.minY + 1.2,
          fill: 'none',
          stroke: pal.stroke,
          'stroke-width': 0.035,
          'stroke-dasharray': '0.25 0.2',
          opacity: 0.7,
        }),
      );
    }

    // gate edit overlay
    if (mode === 'gates' && k.id === selected) {
      const gatesG = el('g', { class: 'gates' });
      for (const gate of k.doc.pattern?.gates ?? []) {
        const line = el('line', {
          x1: gate.a[0],
          y1: gate.a[1],
          x2: gate.b[0],
          y2: gate.b[1],
          class: gate.state,
          'data-gate': `${gate.a[0]},${gate.a[1]},${gate.b[0]},${gate.b[1]}`,
        });
        gatesG.appendChild(line);
      }
      inner.appendChild(gatesG);
    }

    g.appendChild(inner);
    g.addEventListener('pointerdown', (ev) => onKolamPointer(ev, k));
    world.appendChild(g);
  }

  // gate click handlers (delegated)
  svg.querySelectorAll('line[data-gate]').forEach((ln) => {
    ln.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      const id = (ev.target as SVGElement).closest('g.kolam')?.getAttribute('data-id')!;
      const [ax, ay, bx, by] = (ev.target as SVGElement).getAttribute('data-gate')!.split(',').map(Number);
      flipGate(id, [ax, ay, bx, by] as [number, number, number, number]);
    });
  });

  updateInspector();
  (document.querySelector('#zoomLabel') as HTMLElement).textContent = `${(scene.camera.zoom / 24).toFixed(1)}×`;
  (document.querySelector('#countLabel') as HTMLElement).textContent = `${scene.kolams.length} kolam${scene.kolams.length === 1 ? '' : 's'}`;
}

function applyGatesLite(sys: ReturnType<typeof buildGates>, doc: KolamDoc): void {
  for (const gate of doc.pattern?.gates ?? []) {
    const nx = gate.a[0] === gate.b[0] ? 2 * gate.a[0] : 2 * gate.a[0] + 1;
    const ny = gate.a[1] === gate.b[1] ? 2 * gate.a[1] : 2 * gate.a[1] + (gate.a[0] === gate.b[0] ? (gate.b[1] > gate.a[1] ? 1 : -1) : 0);
    // H gate (horizontal neighbours): node y = a.y, x between
    const isH = gate.a[1] === gate.b[1];
    const node = isH
      ? { x: 2 * Math.min(gate.a[0], gate.b[0]) + 1, y: 2 * gate.a[1] }
      : { x: 2 * gate.a[0], y: 2 * Math.min(gate.a[1], gate.b[1]) + 1 };
    void nx; void ny;
    sys.states.set(`${node.x},${node.y}`, gate.state);
  }
}

function flipGate(id: string, pair: [number, number, number, number]): void {
  const k = scene.kolams.find((x) => x.id === id);
  if (!k) return;
  const gate = k.doc.pattern!.gates.find(
    (g) =>
      (g.a[0] === pair[0] && g.a[1] === pair[1] && g.b[0] === pair[2] && g.b[1] === pair[3]) ||
      (g.b[0] === pair[0] && g.b[1] === pair[1] && g.a[0] === pair[2] && g.a[1] === pair[3]),
  );
  if (!gate) return;
  const next = gate.state === 'open' ? 'closed' : 'open';
  run({
    t: 'gates',
    id,
    pairs: [[gate.a[0], gate.a[1], gate.b[0], gate.b[1]]],
    prev: [gate.state],
    next: [next],
  });
  const a = scene.kolams.find((x) => x.id === id)!.doc.analysis!;
  toast(`${next === 'open' ? 'opened' : 'closed'} gate — ${a.isOneStroke ? 'one stroke ✓' : `${a.loopCount} loops`}`);
}

// ---------- interaction ----------

type Drag =
  | { kind: 'pan'; startX: number; startY: number; camX: number; camY: number }
  | { kind: 'move'; id: string; offX: number; offY: number; origX: number; origY: number; moved: boolean }
  | null;
let drag: Drag = null;

svg.addEventListener('pointerdown', (ev) => {
  const t = ev.target as SVGElement;
  const kolamG = t.closest('g.kolam');
  if (kolamG) return; // handled per-kolam
  if (ev.button === 0 || ev.button === 1) {
    drag = { kind: 'pan', startX: ev.clientX, startY: ev.clientY, camX: scene.camera.x, camY: scene.camera.y };
    svg.classList.add('panning');
    svg.setPointerCapture(ev.pointerId);
  }
});

function onKolamPointer(ev: PointerEvent, k: SceneKolam): void {
  if (mode !== 'select') return;
  ev.stopPropagation();
  selected = k.id;
  renderAll();
  if (ev.button === 0) {
    const w = screenToWorld(ev.clientX, ev.clientY);
    drag = { kind: 'move', id: k.id, offX: w.x - k.x, offY: w.y - k.y, origX: k.x, origY: k.y, moved: false };
    svg.setPointerCapture(ev.pointerId);
  }
}

svg.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  if (drag.kind === 'pan') {
    const dx = (ev.clientX - drag.startX) / scene.camera.zoom;
    const dy = (ev.clientY - drag.startY) / scene.camera.zoom;
    scene.camera.x = drag.camX - dx;
    scene.camera.y = drag.camY - dy;
    renderAll();
  } else if (drag.kind === 'move') {
    const w = screenToWorld(ev.clientX, ev.clientY);
    let x = w.x - drag.offX;
    let y = w.y - drag.offY;
    if (snap) {
      x = Math.round(x * 2) / 2;
      y = Math.round(y * 2) / 2;
    }
    const k = scene.kolams.find((q) => q.id === drag.id);
    if (k) {
      k.x = x;
      k.y = y;
      drag.moved = true;
      renderAll();
    }
  }
});

svg.addEventListener('pointerup', (ev) => {
  svg.classList.remove('panning');
  if (drag?.kind === 'move' && drag.moved) {
    const k = scene.kolams.find((q) => q.id === drag.id)!;
    const { x, y } = k;
    k.x = drag.origX;
    k.y = drag.origY;
    run({ t: 'move', id: drag.id, from: { x: drag.origX, y: drag.origY }, to: { x, y } });
  }
  drag = null;
});

svg.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const before = screenToWorld(ev.clientX, ev.clientY);
  const factor = Math.exp(-ev.deltaY * 0.0012);
  scene.camera.zoom = Math.min(240, Math.max(2, scene.camera.zoom * factor));
  const after = screenToWorld(ev.clientX, ev.clientY);
  scene.camera.x += before.x - after.x;
  scene.camera.y += before.y - after.y;
  scheduleAutosave();
  renderAll();
}, { passive: false });

function screenToWorld(px: number, py: number): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  const { x: cx, y: cy, zoom } = scene.camera;
  return { x: cx + (px - rect.left - W / 2) / zoom, y: cy + (py - rect.top - H / 2) / zoom };
}

// ---------- animation ----------

function animateLast(): void {
  const groups = [...svg.querySelectorAll('g.kolam')];
  const target = selected ? groups.find((g) => g.getAttribute('data-id') === selected) : groups[groups.length - 1];
  if (!target) return;
  animateGroup(target as SVGGElement);
}

function animateGroup(g: SVGGElement): void {
  const paths = [...g.querySelectorAll('.curves path')] as SVGPathElement[];
  let delay = 0;
  for (const p of paths) {
    const len = parseFloat(p.getAttribute('data-length') ?? '0') || 1;
    const dur = Math.max(400, Math.min(4000, len * scene.camera.zoom * 0.9));
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
    p.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: dur, delay, fill: 'forwards', easing: 'ease-in-out' },
    );
    delay += dur * 0.9;
  }
}

// ---------- inspector ----------

function updateInspector(): void {
  const empty = document.querySelector('#inspEmpty') as HTMLElement;
  const body = document.querySelector('#inspBody') as HTMLElement;
  const k = scene.kolams.find((q) => q.id === selected);
  if (!k) {
    empty.hidden = false;
    body.hidden = true;
    (document.querySelector('#promptEcho') as HTMLElement).innerHTML = lastPromptEcho ? `<b>interpreted as</b><br/>${lastPromptEcho}` : '';
    return;
  }
  empty.hidden = true;
  body.hidden = false;
  const a = k.doc.analysis!;
  (document.querySelector('#inspName') as HTMLElement).textContent = k.name;
  const badge = document.querySelector('#inspBadge') as HTMLElement;
  badge.textContent = a.isOneStroke ? 'one stroke ✓ (Brahmamudi)' : `${a.loopCount} closed loops`;
  badge.classList.toggle('multi', !a.isOneStroke);
  const facts: [string, string][] = [
    ['grid', describeGrid(k.doc.grid.spec)],
    ['dots', String(a.dotCount)],
    ['gates', String(a.gateCount)],
    ['segments', String(a.totalSegments)],
    ['symmetry', k.doc.pattern?.symmetry?.group ?? '—'],
    ['prastāra', k.doc.pattern?.index ?? '—'],
  ];
  if (k.gen) facts.push(['seed', k.gen.seed], ['density', k.gen.density]);
  (document.querySelector('#inspFacts') as HTMLElement).innerHTML = facts
    .map(([x, v]) => `<span>${x}</span><b>${v}</b>`)
    .join('');
  const prims = document.querySelector('#inspPrims') as HTMLElement;
  const entries = Object.entries(a.primitiveCounts) as [string, number][];
  const max = Math.max(1, ...entries.map(([, v]) => v));
  prims.innerHTML = entries
    .map(([name, v]) => `<div class="bar" style="height:${(v / max) * 100}%" title="${name}: ${v}"><span>${name.slice(0, 2)}</span></div>`)
    .join('');
  (document.querySelector('#inspJson') as HTMLElement).textContent = canonicalJSON(k.doc);
}

// ---------- persistence ----------

const LS_KEY = 'kolam-harness-scene-v1';
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(): void {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(sceneToJSON(scene)));
    } catch {
      /* storage full: ignore */
    }
  }, 400);
}

function restoreAutosave(): void {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = sceneFromJSON(JSON.parse(raw));
    scene = s;
    hist = newHistory();
    toast(`restored ${scene.kolams.length} kolam${scene.kolams.length === 1 ? '' : 's'} from this browser`);
  } catch {
    /* corrupt: start fresh */
  }
}

// ---------- exports ----------

function download(name: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportJson(): void {
  const k = selectedKolam();
  if (!k) return;
  download(`${slug(k.name)}.kolam.json`, new Blob([canonicalJSON(k.doc) + '\n'], { type: 'application/json' }));
}

function exportSvg(): void {
  const k = selectedKolam();
  if (!k) return;
  const pal = PALETTE[theme];
  const svgText = renderSVG(k.doc, {
    width: 900,
    showDots,
    strokeColor: pal.stroke,
    dotColor: pal.dot,
    background: pal.ground,
    padding: 1.4,
  });
  download(`${slug(k.name)}.svg`, new Blob([svgText], { type: 'image/svg+xml' }));
}

async function exportPng(): Promise<void> {
  const k = selectedKolam();
  if (!k) return;
  const pal = PALETTE[theme];
  const svgText = renderSVG(k.doc, {
    width: 1600,
    showDots,
    strokeColor: pal.stroke,
    dotColor: pal.dot,
    background: pal.ground,
    padding: 1.4,
  });
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('rasterize failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = Math.round((1600 * img.height) / Math.max(1, img.width));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => b && download(`${slug(k.name)}.png`, b), 'image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kolam';
}

function selectedKolam(): SceneKolam | undefined {
  return scene.kolams.find((q) => q.id === selected);
}

// ---------- toolbar wiring ----------

const $ = (sel: string) => document.querySelector(sel) as HTMLButtonElement;

$('#promptForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = ($('#prompt') as HTMLInputElement).value.trim();
  if (text) addGenerated(text);
});
document.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
  c.addEventListener('click', () => {
    ($('#prompt') as HTMLInputElement).value = c.dataset.prompt!;
    addGenerated(c.dataset.prompt!);
  });
});

function setMode(m: 'select' | 'gates'): void {
  mode = m;
  $('#modeSelect').classList.toggle('active', m === 'select');
  $('#modeGates').classList.toggle('active', m === 'gates');
  svg.classList.toggle('mode-gates', m === 'gates');
  renderAll();
  if (m === 'gates' && !selected) toast('select a kolam, then click between its dots to toggle gates');
}
$('#modeSelect').addEventListener('click', () => setMode('select'));
$('#modeGates').addEventListener('click', () => setMode('gates'));

$('#btnUndo').addEventListener('click', () => {
  const r = undo(scene, hist);
  if (r) { scene = r.scene; hist = r.history; scheduleAutosave(); renderAll(); }
});
$('#btnRedo').addEventListener('click', () => {
  const r = redo(scene, hist);
  if (r) { scene = r.scene; hist = r.history; scheduleAutosave(); renderAll(); }
});

function withSelected(f: (k: SceneKolam) => void): void {
  const k = selectedKolam();
  if (k) f(k);
}
$('#btnRotate').addEventListener('click', () =>
  withSelected((k) =>
    run({ t: 'setTransform', id: k.id, prev: { rot: k.rot, reflect: k.reflect, scale: k.scale }, next: { rot: ((k.rot + 1) % 4) as 0 | 1 | 2 | 3, reflect: k.reflect, scale: k.scale } }),
  ),
);
$('#btnReflect').addEventListener('click', () =>
  withSelected((k) =>
    run({ t: 'setTransform', id: k.id, prev: { rot: k.rot, reflect: k.reflect, scale: k.scale }, next: { rot: k.rot, reflect: !k.reflect, scale: k.scale } }),
  ),
);
$('#btnDup').addEventListener('click', () =>
  withSelected((k) => {
    const copy: SceneKolam = { ...k, id: `k${scene.nextId}`, x: k.x + 1.5, y: k.y + 1.5 };
    selected = copy.id;
    run({ t: 'add', kolam: copy });
  }),
);
$('#btnDelete').addEventListener('click', () => {
  const k = selectedKolam();
  if (k) {
    const idx = scene.kolams.findIndex((q) => q.id === k.id);
    run({ t: 'remove', id: k.id, index: idx });
    selected = null;
    renderAll();
  }
});
$('#btnReplay').addEventListener('click', animateLast);
$('#btnDots').addEventListener('click', () => { showDots = !showDots; $('#btnDots').classList.toggle('active', showDots); renderAll(); });
$('#btnSmooth').addEventListener('click', () => { smooth = !smooth; $('#btnSmooth').classList.toggle('active', smooth); renderAll(); });
$('#btnTheme').addEventListener('click', () => { theme = theme === 'flour' ? 'paper' : 'flour'; renderAll(); });
$('#btnSnap').addEventListener('click', () => { snap = !snap; $('#btnSnap').classList.toggle('active', snap); });

$('#btnSaveScene').addEventListener('click', () => {
  download('canvas.harness.json', new Blob([JSON.stringify(sceneToJSON(scene), null, 2)], { type: 'application/json' }));
});
$('#btnExportScene').addEventListener('click', () => {
  // serialize the live world (all kolams with their transforms), minus selection chrome
  const keep = selected;
  selected = null;
  renderAll();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVGNS);
  const { x: cx, y: cy, zoom } = scene.camera;
  const W = svg.clientWidth || 1200;
  const H = svg.clientHeight || 800;
  const text =
    `<svg xmlns="${SVGNS}" viewBox="${cx - W / 2 / zoom} ${cy - H / 2 / zoom} ${W / zoom} ${H / zoom}" width="${W}" height="${H}">` +
    clone.innerHTML.replaceAll('class="kolam "', 'class="kolam"') +
    '</svg>';
  selected = keep;
  renderAll();
  download('canvas.svg', new Blob([text], { type: 'image/svg+xml' }));
  toast('exported whole canvas as SVG');
});
$('#btnLoadScene').addEventListener('click', () => $('#fileInput').click());
$('#btnImport').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    const parsed = JSON.parse(text);
    if (parsed && parsed.harnessVersion === '1.0') {
      scene = sceneFromJSON(parsed);
      hist = newHistory();
      selected = null;
      scheduleAutosave();
      renderAll();
      toast(`loaded scene (${scene.kolams.length} kolams)`);
    } else {
      const doc = parsed as KolamDoc;
      const b = bboxOfDoc(doc);
      const spot = findFreeSpot(scene, b.maxX - b.minX + 2, b.maxY - b.minY + 2);
      const k: SceneKolam = {
        id: `k${scene.nextId}`,
        name: doc.meta?.name ?? 'imported kolam',
        x: spot.x,
        y: spot.y,
        scale: 1,
        rot: 0,
        reflect: false,
        doc,
      };
      selected = k.id;
      run({ t: 'add', kolam: k });
      toast('imported Kolam-JSON');
    }
  } catch (err) {
    toast(`could not read file: ${(err as Error).message}`);
  }
  ($('#fileInput') as HTMLInputElement).value = '';
});
$('#btnClear').addEventListener('click', () => {
  if (!scene.kolams.length || confirm('Clear the whole canvas?')) {
    scene = newScene();
    hist = newHistory();
    selected = null;
    scheduleAutosave();
    renderAll();
  }
});
$('#btnReroll').addEventListener('click', () =>
  withSelected((k) => {
    if (!k.gen) { toast('this kolam has no generator provenance'); return; }
    const seed = `${k.gen.seed}~${Math.floor(Math.random() * 1e6)}`;
    const r = generate({
      grid: k.doc.grid.spec,
      symmetry: k.gen.symmetry as never,
      density: parseFloat(k.gen.density),
      strokes: k.gen.strokes === 'any' ? 'any' : 1,
      seed,
      name: k.name,
    });
    const idx = scene.kolams.findIndex((q) => q.id === k.id);
    const replacement: SceneKolam = { ...k, doc: r.doc, gen: { ...k.gen, seed } };
    scene = { ...scene, kolams: scene.kolams.map((q) => (q.id === k.id ? replacement : q)) };
    void idx;
    scheduleAutosave();
    renderAll();
    animateLast();
    toast(`rerolled — ${r.achieved.isOneStroke ? 'one stroke ✓' : `${r.achieved.loops} loops`}`);
  }),
);
$('#btnExportJson').addEventListener('click', exportJson);
$('#btnExportSvg').addEventListener('click', exportSvg);
$('#btnExportPng').addEventListener('click', () => void exportPng());

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) ($('#btnRedo') as HTMLButtonElement).click();
    else ($('#btnUndo') as HTMLButtonElement).click();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    ($('#btnDelete') as HTMLButtonElement).click();
  } else if (e.key === '1') setMode('select');
  else if (e.key === '2') setMode('gates');
  else if (e.key.toLowerCase() === 'r') ($('#btnRotate') as HTMLButtonElement).click();
  else if (e.key.toLowerCase() === 'f') ($('#btnReflect') as HTMLButtonElement).click();
  else if (e.key.toLowerCase() === 'd') ($('#btnDup') as HTMLButtonElement).click();
});

// ---------- toast ----------

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(msg: string): void {
  const t = document.querySelector('#toast') as HTMLElement;
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
}

// ---------- boot ----------

window.addEventListener('resize', renderAll);
restoreAutosave();
if (scene.kolams.length === 0) {
  addGenerated('9 pulli diamond sikku kolam, 4-fold, one stroke');
  scene.camera.zoom = 26;
} else {
  renderAll();
}
// animate the welcome kolam once fonts/layout settle
setTimeout(() => {
  const g = svg.querySelector('g.kolam');
  if (g) animateGroup(g as SVGGElement);
}, 300);

// used by tests
void docFromSys;
void generate;

// E2E test hook: verify export content directly (browser download itself is
// handled by the anchor+blob mechanism, which is browser-provided). Results
// travel via DOM (sandboxed bridge worlds share the DOM, not window).
document.addEventListener('kolam:test-export', async () => {
  document.getElementById('exportProbe')?.remove();
  const k = selectedKolam();
  const holder = document.createElement('div');
  holder.id = 'exportProbe';
  holder.setAttribute('data-json', k ? canonicalJSON(k.doc) : 'null');
  const svgText = k
    ? renderSVG(k.doc, { width: 1600, showDots, strokeColor: PALETTE[theme].stroke, dotColor: PALETTE[theme].dot, background: PALETTE[theme].ground, padding: 1.4 })
    : 'null';
  holder.setAttribute('data-svg', k ? renderSVG(k.doc, { width: 900, showDots, strokeColor: PALETTE[theme].stroke, dotColor: PALETTE[theme].dot, background: PALETTE[theme].ground, padding: 1.4 }) : 'null');
  // PNG: rasterize the same SVG through an offscreen canvas
  let png = 'null';
  if (k) {
    try {
      const blob = new Blob([svgText], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('rasterize failed'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = Math.round((1600 * img.height) / Math.max(1, img.width));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      png = canvas.toDataURL('image/png').slice(0, 64);
      URL.revokeObjectURL(url);
    } catch (e) {
      png = `error: ${(e as Error).message}`;
    }
  }
  holder.setAttribute('data-png', png);
  document.body.appendChild(holder);
});
(window as unknown as Record<string, unknown>).__kolamTest = {
  exportJsonText: () => {
    const k = selectedKolam();
    return k ? canonicalJSON(k.doc) : null;
  },
  exportSvgText: () => {
    const k = selectedKolam();
    if (!k) return null;
    const pal = PALETTE[theme];
    return renderSVG(k.doc, {
      width: 900,
      showDots,
      strokeColor: pal.stroke,
      dotColor: pal.dot,
      background: pal.ground,
      padding: 1.4,
    });
  },
  exportPngCanvas: () => {
    const k = selectedKolam();
    if (!k) return null;
    const pal = PALETTE[theme];
    const svgText = renderSVG(k.doc, {
      width: 1600,
      showDots,
      strokeColor: pal.stroke,
      dotColor: pal.dot,
      background: pal.ground,
      padding: 1.4,
    });
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    return new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1600;
        canvas.height = Math.round((1600 * img.height) / Math.max(1, img.width));
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png').slice(0, 60));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  },
};
