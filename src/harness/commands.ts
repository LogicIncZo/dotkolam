/**
 * Command algebra with exact undo: every command is data; `invert` produces
 * its exact inverse against the pre-state. Laws (verified in tests):
 *   apply(apply(s, c), invert(s, c)) == s
 *   invert(apply(s, c), invert-after-apply) round-trips
 */
import { Scene, SceneKolam, setGatesInDoc } from './scene.js';

export type Cmd =
  | { t: 'add'; kolam: SceneKolam }
  | { t: 'remove'; id: string; index: number }
  | { t: 'move'; id: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | { t: 'setTransform'; id: string; prev: Pick<SceneKolam, 'rot' | 'reflect' | 'scale'>; next: Pick<SceneKolam, 'rot' | 'reflect' | 'scale'> }
  | { t: 'rename'; id: string; from: string; to: string }
  | {
      t: 'gates';
      id: string;
      pairs: [number, number, number, number][];
      prev: ('open' | 'closed')[];
      next: ('open' | 'closed')[];
    };

export interface History {
  stack: Cmd[];
  idx: number; // next redo position; idx-1 = last applied
}

export const newHistory = (): History => ({ stack: [], idx: 0 });

export function apply(scene: Scene, c: Cmd): Scene {
  switch (c.t) {
    case 'add': {
      const kolams = [...scene.kolams, c.kolam];
      return { ...scene, kolams, nextId: Math.max(scene.nextId, idNum(c.kolam.id) + 1) };
    }
    case 'remove': {
      const kolams = scene.kolams.filter((k) => k.id !== c.id);
      return { ...scene, kolams };
    }
    case 'move':
      return mapKolam(scene, c.id, (k) => ({ ...k, x: c.to.x, y: c.to.y }));
    case 'setTransform':
      return mapKolam(scene, c.id, (k) => ({ ...k, ...c.next }));
    case 'rename':
      return mapKolam(scene, c.id, (k) => ({ ...k, name: c.to }));
    case 'gates':
      return mapKolam(scene, c.id, (k) => {
        const doc = setGates(k.doc, c.pairs, c.next);
        return { ...k, doc };
      });
  }
}

export function invert(scene: Scene, c: Cmd): Cmd {
  switch (c.t) {
    case 'add': {
      const index = scene.kolams.findIndex((k) => k.id === c.kolam.id);
      return { t: 'remove', id: c.kolam.id, index };
    }
    case 'remove': {
      const k = scene.kolams[c.index] ?? findByDoc(scene, c.id);
      if (!k) throw new Error(`invert remove: kolam ${c.id} not found`);
      return { t: 'add', kolam: k };
    }
    case 'move':
      return { ...c, from: c.to, to: c.from };
    case 'setTransform':
      return { ...c, prev: c.next, next: c.prev };
    case 'rename':
      return { ...c, from: c.to, to: c.from };
    case 'gates':
      return { ...c, prev: c.next, next: c.prev };
  }
}

export function doCmd(scene: Scene, h: History, c: Cmd): { scene: Scene; history: History } {
  const next = apply(scene, c);
  const stack = [...h.stack.slice(0, h.idx), c];
  return { scene: next, history: { stack, idx: stack.length } };
}

export function undo(scene: Scene, h: History): { scene: Scene; history: History } | null {
  if (h.idx === 0) return null;
  const c = h.stack[h.idx - 1]!;
  const inv = invert(scene, c);
  return { scene: apply(scene, inv), history: { stack: h.stack, idx: h.idx - 1 } };
}

export function redo(scene: Scene, h: History): { scene: Scene; history: History } | null {
  if (h.idx >= h.stack.length) return null;
  const c = h.stack[h.idx]!;
  return { scene: apply(scene, c), history: { stack: h.stack, idx: h.idx + 1 } };
}

// --- helpers ---

function mapKolam(scene: Scene, id: string, f: (k: SceneKolam) => SceneKolam): Scene {
  return { ...scene, kolams: scene.kolams.map((k) => (k.id === id ? f(k) : k)) };
}

function findByDoc(scene: Scene, id: string): SceneKolam | undefined {
  return scene.kolams.find((k) => k.id === id);
}

const idNum = (id: string): number => {
  const m = /\d+$/.exec(id);
  return m ? parseInt(m[0], 10) : 0;
};

function setGates(
  doc: SceneKolam['doc'],
  pairs: [number, number, number, number][],
  states: ('open' | 'closed')[],
): SceneKolam['doc'] {
  return setGatesInDoc(doc, pairs, states);
}
