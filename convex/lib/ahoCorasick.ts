// Deterministic multi-pattern matcher (tech_design.md §3.1).
//
// Standard Aho-Corasick: build a trie of the patterns, add failure links via
// BFS, then scan the text once in O(n + matches). We hand-roll it (rather than
// add a dependency) because the algorithm is small, auditable, and the whole
// point of §3 is a *deterministic* severity floor we can explain in plain
// language: "does the report text contain any hazard word, yes or no."
//
// Failure mode this prevents: a naive `text.includes(word)` loop is O(n*k) and
// re-scans the text per word; Aho-Corasick scans once and is the canonical
// choice when the pattern set is fixed and the text stream is the variable.

interface Node {
  next: Map<string, number>; // char -> node index
  fail: number; // failure link node index
  outputs: string[]; // patterns ending at this node
}

export class AhoCorasick {
  private nodes: Node[] = [];

  constructor(patterns: readonly string[]) {
    this.nodes.push(this.emptyNode()); // root at index 0
    for (const p of patterns) {
      this.addPattern(p.toLowerCase());
    }
    this.buildFailureLinks();
  }

  private emptyNode(): Node {
    return { next: new Map(), fail: 0, outputs: [] };
  }

  private addPattern(pattern: string): void {
    let node = 0;
    for (const ch of pattern) {
      const existing = this.nodes[node].next.get(ch);
      if (existing === undefined) {
        this.nodes.push(this.emptyNode());
        const idx = this.nodes.length - 1;
        this.nodes[node].next.set(ch, idx);
        node = idx;
      } else {
        node = existing;
      }
    }
    this.nodes[node].outputs.push(pattern);
  }

  private buildFailureLinks(): void {
    const queue: number[] = [];
    // Depth-1 nodes fail to root.
    for (const child of this.nodes[0].next.values()) {
      this.nodes[child].fail = 0;
      queue.push(child);
    }
    while (queue.length > 0) {
      const current = queue.shift() as number;
      for (const [ch, child] of this.nodes[current].next) {
        let fail = this.nodes[current].fail;
        while (fail !== 0 && !this.nodes[fail].next.has(ch)) {
          fail = this.nodes[fail].fail;
        }
        const failTarget = this.nodes[fail].next.get(ch);
        this.nodes[child].fail =
          failTarget !== undefined && failTarget !== child ? failTarget : 0;
        // Merge outputs along the failure link (suffix matches).
        this.nodes[child].outputs.push(
          ...this.nodes[this.nodes[child].fail].outputs,
        );
        queue.push(child);
      }
    }
  }

  /** Returns true if the text contains at least one pattern. */
  hasMatch(text: string): boolean {
    const lower = text.toLowerCase();
    let node = 0;
    for (const ch of lower) {
      while (node !== 0 && !this.nodes[node].next.has(ch)) {
        node = this.nodes[node].fail;
      }
      node = this.nodes[node].next.get(ch) ?? 0;
      if (this.nodes[node].outputs.length > 0) {
        return true;
      }
    }
    return false;
  }

  /** Returns the distinct patterns found in the text (for audit/logging). */
  findMatches(text: string): string[] {
    const lower = text.toLowerCase();
    const found = new Set<string>();
    let node = 0;
    for (const ch of lower) {
      while (node !== 0 && !this.nodes[node].next.has(ch)) {
        node = this.nodes[node].fail;
      }
      node = this.nodes[node].next.get(ch) ?? 0;
      for (const out of this.nodes[node].outputs) {
        found.add(out);
      }
    }
    return [...found];
  }
}
