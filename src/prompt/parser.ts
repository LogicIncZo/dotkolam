/**
 * Deterministic prompt parser: Idea -> Prompt -> Draw, fully offline.
 *
 * Grammar (regex scans, case-insensitive; first match wins within a slot):
 *   grid:    "N pulli/dots/dot", "a-b-c... rows" / "1,3,5,3,1", "N x M",
 *            "square N", "diamond N", "rectangle N x M", custom words
 *   symmetry:"4-fold/four-fold/c4/rotational" -> C4; "d4/full symmetry" -> D4;
 *            "mirror(ed)" -> D1; "2-fold/180" -> D2; "asymmetric/free" -> none
 *   density: "dense/kambi style" -> 0.8; "balanced/sikku" -> 0.55;
 *            "open/airy" -> 0.35; "density/sigma 0.N" -> explicit
 *   strokes: "one stroke/single line/one-line/brahmamudi" -> 1 (default);
 *            "multiple loops/multi-loop/loose" -> any
 *   seed:    "seed WORD" -> WORD; otherwise the whole prompt is the seed
 *   tags:    motif words (chakaram, thamarai/lotus, kannadi, kolusu, sangu,
 *            temple, peacock...) and occasion words (margazhi, pongal,
 *            friday, deepavali) become tags + name flavour
 */
import { GridSpec } from '../core/types.js';
import { SymGroup } from '../gen/symmetry.js';

export interface PromptParams {
  grid: GridSpec;
  symmetry: SymGroup;
  density: number;
  strokes: 1 | 'any';
  seed: string;
  tags: string[];
  name: string | undefined;
}

export interface PromptResult {
  params: PromptParams;
  interpretation: string[];
}

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 21, twentyone: 21, 'twenty-one': 21, 'twenty-five': 25,
  twentyfive: 25, thirtyone: 31, 'thirty-one': 31,
};

function toOdd(n: number): number {
  return n % 2 === 1 ? n : n + 1;
}

export function parsePrompt(text: string): PromptResult {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9\s.,-]/g, ' ')} `;
  const notes: string[] = [];
  let grid: GridSpec | null = null;
  let symmetry: SymGroup | null = null;
  let density: number | null = null;
  let strokes: 1 | 'any' | null = null;
  let seed: string | null = null;
  const tags: string[] = [];
  let name: string | undefined;

  const num = (w: string): number | null => {
    if (/^\d+$/.test(w)) return parseInt(w, 10);
    return WORD_NUM[w.replace(/\s/g, '')] ?? null;
  };

  // --- grid ---
  // explicit row list "1-3-5-3-1" or "1,3,5,3,1"
  const rowsMatch = t.match(/(?:^|\s)(\d+(?:[-,\s]\d+){2,})(?=$|[\s,.;:])/);
  if (rowsMatch) {
    const widths = rowsMatch[1]!.split(/[-,\s]+/).map((w) => parseInt(w, 10));
    if (widths.every((w) => w >= 1)) {
      grid = { kind: 'rows', widths };
      notes.push(`rows ${widths.join('-')}`);
    }
  }
  if (!grid) {
    // "N x M" rectangle
    const rect = t.match(/(\d+)\s*(?:x|by|×)\s*(\d+)/);
    if (rect) {
      grid = { kind: 'rectangle', cols: parseInt(rect[1]!, 10), rows: parseInt(rect[2]!, 10) };
      notes.push(`${rect[1]}x${rect[2]} rectangle`);
    }
  }
  if (!grid) {
    // diamond shorthand "7-1" style; explicit dot counts; shape keywords
    const dshort = t.match(/(?:^|\s)(\d+)-1(?:\s|$)/);
    const dotCount = t.match(/(\d+)\s*(?:pulli|dots?|points?)\b/);
    const diamond = t.match(/(?:diamond|rhombus)\s*(\d+)?/);
    const square = t.match(/(?:square|ner(?:\s+pulli)?)\s*(\d+)?/);
    if (dshort) {
      const max = toOdd(parseInt(dshort[1]!, 10));
      grid = { kind: 'diamond', rows: max };
      notes.push(`diamond rows 1..${max}..1 ("${dshort[1]}-1")`);
    } else if (dotCount) {
      const n = parseInt(dotCount[1]!, 10);
      // pick the classic diamond whose dot count (1+rows^2)/2 matches, else closest
      let best = 5;
      for (let r = 3; r <= 31; r += 2) {
        if ((1 + r * r) / 2 === n) { best = r; break; }
        if (Math.abs((1 + r * r) / 2 - n) < Math.abs((1 + best * best) / 2 - n)) best = r;
      }
      grid = { kind: 'diamond', rows: best };
      notes.push(`${n} pulli -> diamond rows 1..${best}..1 (${(1 + best * best) / 2} dots)`);
    } else if (diamond) {
      const n = diamond[1] ? toOdd(parseInt(diamond[1], 10)) : 9;
      grid = { kind: 'diamond', rows: n };
      notes.push(`diamond ${n}`);
    } else if (square && square[1]) {
      grid = { kind: 'square', size: parseInt(square[1]!, 10) };
      notes.push(`square ${square[1]}`);
    }
  }
  if (!grid) {
    grid = { kind: 'diamond', rows: 9 };
    notes.push('default: diamond 9 (1-3-5-7-9-7-5-3-1, 41 pulli)');
  }

  // --- symmetry ---
  if (/\b(d4|full(?:ly)? symmetr\w*|eightfold|eight-fold)\b/.test(t)) symmetry = 'D4';
  else if (/\b(c4|4-fold|four-fold|fourfold|rotational|chatur\w*)\b/.test(t)) symmetry = 'C4';
  else if (/\b(d2|2-fold|two-fold|180)\b/.test(t)) symmetry = 'D2';
  else if (/\b(mirror(ed)?|d1|symmetr\w*|balance[ds]?)\b/.test(t)) symmetry = 'D1';
  else if (/\b(asymmetric|free|random|wild)\b/.test(t)) symmetry = 'none';
  if (symmetry) notes.push(`symmetry ${symmetry}`);
  else {
    symmetry = 'C4';
    notes.push('default symmetry C4');
  }

  // --- density ---
  const dens = t.match(/(?:density|sigma)\s*([0-9]*\.?[0-9]+)/);
  if (dens) {
    density = Math.min(1, Math.max(0, parseFloat(dens[1]!)));
    notes.push(`density ${density}`);
  } else if (/\b(dense|tightly|intricate|kambi style|complex|busy)\b/.test(t)) {
    density = 0.8;
    notes.push('dense (density 0.8)');
  } else if (/\b(open|airy|simple|clean|minimal|sparse)\b/.test(t)) {
    density = 0.35;
    notes.push('open (density 0.35)');
  } else {
    density = 0.55;
    notes.push('balanced density 0.55');
  }

  // --- strokes ---
  if (/\b(multiple|multi-loop|several|loose)\b.*\b(loop|line|stroke)s?\b|\bthree lines?\b/.test(t)) {
    strokes = 'any';
    notes.push('multiple closed loops allowed');
  } else if (/\b(one[- ]?stroke|single (?:continuous )?line|one line|brahmamudi|brahmamudichu|never lift)\b/.test(t)) {
    strokes = 1;
    notes.push('one-stroke');
  }
  if (strokes === null) {
    strokes = 1;
    notes.push('default: one stroke');
  }

  // --- seed ---
  const seedM = t.match(/\bseed\s+([a-z0-9-]+)/);
  if (seedM) {
    seed = seedM[1]!;
    notes.push(`seed "${seed}"`);
  } else {
    seed = text.trim().toLowerCase() || 'kolam';
    notes.push(`seed derived from prompt`);
  }

  // --- tags / name flavour ---
  const MOTIFS: Record<string, string> = {
    chakaram: 'chakaram', wheel: 'chakaram', thamarai: 'thamarai', lotus: 'thamarai',
    kannadi: 'kannadi', mirror: 'kannadi', kolusu: 'kolusu', anklet: 'kolusu',
    sangu: 'sangu', conch: 'sangu', temple: 'kovil', kovil: 'kovil',
    peacock: 'mayil', mayil: 'mayil', butterfly: 'vannathupoochi',
  };
  const OCCASIONS = ['margazhi', 'pongal', 'friday', 'deepavali', 'festival', 'harvest', 'aadi'];
  for (const [kw, tag] of Object.entries(MOTIFS)) {
    if (t.includes(kw) && !tags.includes(tag)) tags.push(tag);
  }
  for (const o of OCCASIONS) if (t.includes(o)) tags.push(o);
  const firstTag = tags[0];
  name = firstTag ? `${firstTag} kolam` : undefined;

  return {
    params: { grid, symmetry, density, strokes, seed, tags, name },
    interpretation: notes,
  };
}
