/**
 * Kolam Harness scene model: kolam objects on an infinite canvas.
 * Pure data + transforms; no DOM (headless-testable).
 */
import { KolamDoc } from '../core/types.js';
import { buildGrid } from '../core/grid.js';
import { buildGates, findGateByDots } from '../core/gates.js';
import { docFromSys, sysFromDoc } from '../core/doc.js';

export interface SceneKolam {
  id: string;
  name: string;
  /** world position of the kolam's bounding-box center (display units) */
  x: number;
  y: number;
  scale: number;
  rot: 0 | 1 | 2 | 3; // quarter turns
  reflect: boolean;
  doc: KolamDoc; // authoritative Kolam-JSON (L3)
  gen?: {
    symmetry: string;
    density: number;
    strokes: string;
    seed: string;
  };
}

export interface Scene {
  kolams: SceneKolam[]; // z-order = array order (last on top)
  nextId: number;
  camera: { x: number; y: number; zoom: number };
}

export function newScene(): Scene {
  return { kolams: [], nextId: 1, camera: { x: 0, y: 0, zoom: 24 } };
}

export function bboxOfDoc(doc: KolamDoc): { minX: number; minY: number; maxX: number; maxY: number } {
  const grid = buildGrid(doc.grid.spec);
  const xs = grid.dots.map((d) => d.x / 2);
  const ys = grid.dots.map((d) => d.y / 2);
  return {
    minX: Math.min(...xs) - 1,
    minY: Math.min(...ys) - 1,
    maxX: Math.max(...xs) + 1,
    maxY: Math.max(...ys) + 1,
  };
}

/** Find a free spot on a coarse placement grid (Chebyshev-ring spiral, with margin). */
export function findFreeSpot(scene: Scene, w: number, h: number): { x: number; y: number } {
  const MARGIN = 1.5;
  const occupied = scene.kolams.map((k) => {
    const b = bboxOfDoc(k.doc);
    return {
      x0: k.x + (b.minX - 1) * k.scale - MARGIN,
      y0: k.y + (b.minY - 1) * k.scale - MARGIN,
      x1: k.x + (b.maxX + 1) * k.scale + MARGIN,
      y1: k.y + (b.maxY + 1) * k.scale + MARGIN,
    };
  });
  const free = (x: number, y: number): boolean => {
    const x0 = x - w / 2, y0 = y - h / 2, x1 = x + w / 2, y1 = y + h / 2;
    return !occupied.some((o) => !(x1 < o.x0 || x0 > o.x1 || y1 < o.y0 || y0 > o.y1));
  };
  for (let ring = 0; ring < 400; ring++) {
    // all lattice points with max(|x|,|y|) == ring, step 4 (two dot-spacings)
    if (ring === 0) {
      if (free(0, 0)) return { x: 0, y: 0 };
      continue;
    }
    const r = ring * 4;
    for (let t = -r; t <= r; t += 4) {
      // four sides of the square ring
      for (const [x, y] of [
        [t, -r], [t, r], [-r, t], [r, t],
      ] as [number, number][]) {
        if (free(x, y)) return { x, y };
      }
    }
  }
  return { x: scene.kolams.length * 4, y: 0 };
}

/** Flip a set of gates inside a kolam doc; returns a refreshed doc (L3). */
export function flipGatesInDoc(
  doc: KolamDoc,
  pairs: [number, number, number, number][], // [ax, ay, bx, by] per gate
): { doc: KolamDoc; prev: ('open' | 'closed')[] } {
  const sys = sysFromDoc(doc);
  const prev: ('open' | 'closed')[] = [];
  for (const [ax, ay, bx, by] of pairs) {
    const node = findGateByDots(sys, [ax, ay], [bx, by]);
    if (!node) continue;
    const key = `${node.x},${node.y}`;
    const cur = (sys.states.get(key) === 'open' ? 'open' : 'closed') as 'open' | 'closed';
    prev.push(cur);
    sys.states.set(key, cur === 'open' ? 'closed' : 'open');
  }
  const refreshed = docFromSys(sys, {
    meta: doc.meta,
    render: doc.render,
    symmetry: doc.pattern?.symmetry,
    includeIndex: true,
  });
  return { doc: refreshed, prev };
}

/** Set explicit gate states (for undo). */
export function setGatesInDoc(
  doc: KolamDoc,
  pairs: [number, number, number, number][],
  states: ('open' | 'closed')[],
): KolamDoc {
  const sys = sysFromDoc(doc);
  pairs.forEach(([ax, ay, bx, by], i) => {
    const node = findGateByDots(sys, [ax, ay], [bx, by]);
    if (node) sys.states.set(`${node.x},${node.y}`, states[i] ?? 'closed');
  });
  return docFromSys(sys, {
    meta: doc.meta,
    render: doc.render,
    symmetry: doc.pattern?.symmetry,
    includeIndex: true,
  });
}

// --- serialization ---

export interface SceneFile {
  harnessVersion: '1.0';
  scene: {
    nextId: number;
    camera: Scene['camera'];
    kolams: SceneKolam[];
  };
}

export function sceneToJSON(scene: Scene): SceneFile {
  return {
    harnessVersion: '1.0',
    scene: { nextId: scene.nextId, camera: scene.camera, kolams: scene.kolams },
  };
}

export function sceneFromJSON(v: unknown): Scene {
  const f = v as SceneFile;
  if (!f || f.harnessVersion !== '1.0' || !f.scene) throw new Error('not a .harness.json file');
  return {
    kolams: f.scene.kolams,
    nextId: f.scene.nextId,
    camera: f.scene.camera ?? { x: 0, y: 0, zoom: 24 },
  };
}
