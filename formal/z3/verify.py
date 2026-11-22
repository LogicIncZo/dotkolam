#!/usr/bin/env python3
"""
Kolam-JSON formal verification with Z3 (Tier C engine; Tier B TLA+/Dafny
unavailable in this environment: no Java/.NET).

Two independent checks:

A. SYMBOLIC PROOFS (all gate assignments at once, gate bits free):
   A1 closedness: the successor of every valid state is a valid state.
   A2 injectivity: the successor map on valid states is injective (hence a
      permutation => every orbit is a closed cycle: P1 termination & closure,
      no loose ends, no retracing).
   Run for: 2x2 square, 1-3-1 diamond (and 2 dots).

B. DIFFERENTIAL MODEL CHECK: an independent Python reimplementation of the
   gate/trace model computes loop counts for EVERY configuration of each
   export grid and must equal the TypeScript reference counts exactly
   (formal/z3/data/loops.json). This bridges the verified model to the
   shipped implementation.

Usage: python3 formal/z3/verify.py   (from the repo root)
"""
import json
import sys
from pathlib import Path

import z3

DOTS: dict[str, set[tuple[int, int]]] = {}


def build_grid(spec: dict) -> set[tuple[int, int]]:
    kind = spec["kind"]
    dots: set[tuple[int, int]] = set()
    if kind == "rectangle":
        for j in range(spec["rows"]):
            for i in range(spec["cols"]):
                dots.add((2 * i, 2 * j))
    elif kind == "diamond":
        m = spec["rows"]
        for b in range(m):
            for a in range(m):
                if (a + b) % 2 == 0:
                    dots.add((a + b, b - a))
    elif kind == "rows":
        widths = spec["widths"]
        maxw = max(widths)
        for j, w in enumerate(widths):
            off = (maxw - w) // 2
            for i in range(w):
                dots.add((2 * (off + i), 2 * j))
    elif kind == "custom":
        for x, y in spec["dots"]:
            dots.add((2 * x, 2 * y))
    else:
        raise ValueError(kind)
    return dots


def nodes_of(dots):
    nodes = set()
    for (x, y) in dots:
        for n in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]:
            f = flanks(n)
            if (f[0] in dots) and (f[1] in dots):
                nodes.add(("int", n))
            elif (f[0] in dots) or (f[1] in dots):
                nodes.add(("bnd", n))
    return nodes


def flanks(node):
    x, y = node
    if x % 2 != 0:
        return ((x - 1, y), (x + 1, y))
    return ((x, y - 1), (x, y + 1))


HEADINGS = [(1, 1), (-1, 1), (1, -1), (-1, -1)]


def arrival_cell(node, d):
    x, y = node
    return (x - d[0], y) if x % 2 != 0 else (x, y - d[1])


def states_of(dots, nodes):
    states = []
    for (_t, node) in sorted(nodes):
        for d in HEADINGS:
            if arrival_cell(node, d) in dots:
                states.append((node, d))
    return states


def step_expr(node, d, gate_var, node_gate_kind):
    """Return (next_node, next_heading) as concrete tuple (gate resolved later)."""
    # open: straight; closed: reflect in channel (H: negate dx, V: negate dy)
    # return both branches
    closed = (
        ((-d[0], d[1]) if node[0] % 2 != 0 else (d[0], -d[1]))
        if True
        else None
    )
    open_ = (d[0], d[1])
    def apply(h):
        return (node[0] + h[0], node[1] + h[1])
    return (apply(open_), apply(closed), gate_var)


def symbolic_proofs(name: str, spec: dict):
    dots = build_grid(spec)
    nodes = nodes_of(dots)
    states = states_of(dots, nodes)
    idx = {s: i for i, s in enumerate(states)}
    gate_bits: dict[tuple[int, int], z3.BoolRef] = {}
    interior = set()
    for (_t, n) in nodes:
        f = flanks(n)
        if f[0] in dots and f[1] in dots:
            interior.add(n)
            gate_bits[n] = z3.Bool(f"g_{n[0]}_{n[1]}")
    s = z3.Solver()

    # successor as nested ite over states: succ[i] = Int in [0, len)
    succ = []
    for st in states:
        (node, d) = st
        gv = gate_bits.get(node, z3.BoolVal(False))  # boundary gates: closed
        reflect = ((-d[0], d[1]) if node[0] % 2 != 0 else (d[0], -d[1]))
        nx_open = (node[0] + d[0], node[1] + d[1])
        nx_closed = (node[0] + reflect[0], node[1] + reflect[1])
        succ.append(
            z3.If(gv, idx.get((nx_open, d), -1), idx.get((nx_closed, reflect), -1))
        )

    # A1 closedness: succ of a valid state is a valid state index (>= 0)
    ok = z3.BoolVal(True)
    for i, st in enumerate(states):
        ok = z3.And(ok, succ[i] >= 0)
    s.add(z3.Not(ok))
    r = s.check()
    assert r == z3.unsat, f"{name}: A1 closedness FAILED ({r})"
    print(f"  A1 {name}: successor closure holds for ALL gate assignments (unsat)")

    # A2 injectivity: succ[i] == succ[j] => i == j  (over valid states)
    s2 = z3.Solver()
    n = len(states)
    i_, j_ = z3.Ints("i j")
    succ_arr = z3.Array("succ", z3.IntSort(), z3.IntSort())
    # encode succ_arr via nested store on concrete indices
    arr = succ_arr
    for i in range(n):
        arr = z3.Store(arr, i, succ[i])
    s2.add(i_ >= 0, i_ < n, j_ >= 0, j_ < n)
    s2.add(i_ != j_)
    s2.add(z3.Select(arr, i_) == z3.Select(arr, j_))
    r2 = s2.check()
    assert r2 == z3.unsat, f"{name}: A2 injectivity FAILED ({r2})"
    print(f"  A2 {name}: successor map injective for ALL gate assignments (unsat) => permutation => closed orbits (P1)")


def loop_count_python(spec: dict, gates: dict) -> int:
    """Independent Python trace: returns physical loop count."""
    dots = build_grid(spec)
    nodes = nodes_of(dots)
    states = states_of(dots, nodes)
    succ_map = {}
    for st in states:
        node, d = st
        f = flanks(node)
        interior = f[0] in dots and f[1] in dots
        if interior:
            open_ = gates.get(node, False)
        else:
            open_ = False
        if open_:
            h = d
        else:
            h = ((-d[0], d[1]) if node[0] % 2 != 0 else (d[0], -d[1]))
        nxt = ((node[0] + h[0], node[1] + h[1]), h)
        succ_map[st] = nxt
    seen = set()
    loops = 0
    for st in states:
        if st in seen:
            continue
        cur = st
        while cur not in seen:
            seen.add(cur)
            cur = succ_map[cur]
        loops += 1
    return loops // 2


def differential():
    data = json.loads(Path("formal/z3/data/loops.json").read_text())
    for name, entry in data.items():
        spec, loops_ts = entry["spec"], entry["loops"]
        n = entry["gateCount"]
        dots = build_grid(spec)
        nodes = nodes_of(dots)
        interior = sorted(
            (
                nd
                for (_t, nd) in nodes
                if flanks(nd)[0] in dots and flanks(nd)[1] in dots
            ),
            # canonical order must match the TS reference: by dot pair
            # (a.y, a.x, b.y, b.x) with a < b the two flanking dots
            key=lambda nd: (
                min(flanks(nd))[1],
                min(flanks(nd))[0],
                max(flanks(nd))[1],
                max(flanks(nd))[0],
            ),
        )
        assert len(interior) == n, f"{name}: gate count mismatch py={len(interior)} ts={n}"
        mismatches = 0
        for mask in range(2 ** n):
            gates = {interior[i]: bool((mask >> i) & 1) for i in range(n)}
            py = loop_count_python(spec, gates)
            if py != loops_ts[mask]:
                mismatches += 1
                if mismatches < 4:
                    print(f"    MISMATCH {name} mask={mask}: py={py} ts={loops_ts[mask]}")
        status = "OK" if mismatches == 0 else f"FAILED ({mismatches} mismatches)"
        print(f"  B {name}: {2**n} configs cross-checked: {status}")
        if mismatches:
            sys.exit(1)


if __name__ == "__main__":
    print("Kolam-JSON Z3 verification")
    print(" A. symbolic proofs (gate bits free):")
    symbolic_proofs("two dots", {"kind": "custom", "dots": [[0, 0], [1, 0]]})
    symbolic_proofs("square 2x2", {"kind": "rectangle", "cols": 2, "rows": 2})
    symbolic_proofs("diamond 1-3-1", {"kind": "diamond", "rows": 3})
    print(" B. differential vs TypeScript reference (all configurations):")
    if not Path("formal/z3/data/loops.json").exists():
        print("   loops.json missing — run: npx tsx scripts/export-loops.mts")
        sys.exit(1)
    differential()
    print("ALL Z3 CHECKS PASSED")
