/**
 * grammar.js — Core Grammar Parser & Derivation Engine
 *
 * Supports:
 *  - Parsing production rules in format: A → aB | b | ε
 *  - BFS and DFS derivation with step tracking
 *  - Derivation tree node construction
 *  - Multiple derivation collection
 */

'use strict';

/* ============================================================
   Grammar Parser
   ============================================================ */

/**
 * Parses text rule lines into a Grammar object.
 * @param {string[]} ruleLines  – Array of strings like "S → aS | b | ε"
 * @param {string}   startSym  – Start symbol e.g. "S"
 * @returns {{ rules: Map<string, string[][]>, terminals: Set<string>, nonTerminals: Set<string>, start: string }}
 */
function parseGrammar(ruleLines, startSym) {
  const rules = new Map();   // NT → array of productions (each production = array of symbols)
  const nonTerminals = new Set();
  const terminals = new Set();

  // Normalize arrow
  const normalize = s => s.replace(/->|→|⟶/g, '→');

  for (const rawLine of ruleLines) {
    const line = normalize(rawLine.trim());
    if (!line) continue;

    const arrowIdx = line.indexOf('→');
    if (arrowIdx === -1) throw new Error(`Missing arrow in rule: "${rawLine}"`);

    const lhs = line.slice(0, arrowIdx).trim();
    const rhsRaw = line.slice(arrowIdx + 1).trim();

    if (!lhs) throw new Error(`Empty LHS in rule: "${rawLine}"`);
    nonTerminals.add(lhs);

    // Split on | (but not inside strings)
    const alternatives = rhsRaw.split('|').map(a => a.trim());

    for (const alt of alternatives) {
      const prod = tokenizeProduction(alt);
      if (!rules.has(lhs)) rules.set(lhs, []);
      rules.get(lhs).push(prod);

      // Collect terminals
      for (const sym of prod) {
        if (sym === 'ε' || sym === '') continue;
        if (!isNonTerminal(sym)) terminals.add(sym);
      }
    }
  }

  // Mark non-terminals referenced on RHS
  for (const prods of rules.values()) {
    for (const prod of prods) {
      for (const sym of prod) {
        if (isNonTerminal(sym)) nonTerminals.add(sym);
      }
    }
  }

  return { rules, terminals, nonTerminals, start: startSym.trim() };
}

/**
 * Tokenizes a production RHS string into an array of symbols.
 * Handles multi-char terminals/non-terminals in angle-bracket notation <NT>.
 * By convention, single uppercase letter = non-terminal, everything else = terminal.
 */
function tokenizeProduction(alt) {
  if (alt === 'ε' || alt === '' || alt.toLowerCase() === 'eps') return ['ε'];

  const tokens = [];
  let i = 0;
  while (i < alt.length) {
    if (alt[i] === '<') {
      // Explicit NT in angle brackets
      const end = alt.indexOf('>', i);
      if (end === -1) throw new Error('Unmatched < in production');
      tokens.push(alt.slice(i + 1, end));
      i = end + 1;
    } else if (alt[i] === ' ') {
      i++;
    } else {
      // Single character
      tokens.push(alt[i]);
      i++;
    }
  }
  return tokens.length ? tokens : ['ε'];
}

/** A symbol is a non-terminal if it's a single uppercase letter (A–Z). */
function isNonTerminal(sym) {
  return /^[A-Z]$/.test(sym);
}

/* ============================================================
   Derivation Engine
   ============================================================ */

/**
 * DerivationNode — represents a node in the derivation tree.
 */
class DerivationNode {
  constructor(symbol, parent = null, ruleApplied = null) {
    this.symbol = symbol;          // 'S', 'a', 'ε', …
    this.parent = parent;
    this.children = [];            // DerivationNode[]
    this.ruleApplied = ruleApplied;// { lhs, rhs } string representation
    this.id = DerivationNode._nextId++;
  }

  isLeaf() { return this.children.length === 0; }
  isTerminal() { return !isNonTerminal(this.symbol) || this.symbol === 'ε'; }
}
DerivationNode._nextId = 0;

/**
 * DerivationState — an immutable snapshot of a partial derivation.
 */
class DerivationState {
  constructor(sentential, steps, treeRoot) {
    this.sentential = sentential;   // string[] of symbols
    this.steps = steps;             // { sentential, ruleText, appliedAt }[]
    this.treeRoot = treeRoot;       // DerivationNode (cloned root)
  }
}

/**
 * Main derivation function.
 *
 * @param {object} grammar      – parsed grammar
 * @param {string} targetStr    – target string to derive
 * @param {number} maxSteps     – max production applications
 * @param {'bfs'|'dfs'} strategy
 * @returns {{ success: boolean, steps: object[], tree: DerivationNode|null,
 *             allDerivations: object[][], stepsChecked: number }}
 */
function derive(grammar, targetStr, maxSteps, strategy = 'bfs') {
  DerivationNode._nextId = 0;

  const target = normalizeTarget(targetStr);
  const targetNorm = target === 'ε' ? '' : target;

  const rootNode = new DerivationNode(grammar.start, null, null);
  const initSentential = [grammar.start];

  if (!grammar.rules.has(grammar.start)) {
    return {
      success: false,
      steps: [],
      tree: null,
      allDerivations: [],
      stepsChecked: 0,
      error: `Start symbol "${grammar.start}" has no production rules.`
    };
  }

  /*
   * IMPORTANT:
   * BFS and DFS must search the derivation STATE space, not a globally
   * visited set of sentential strings. The same sentential form can be
   * reached through different derivation histories and therefore have
   * different trees. A global visited set was causing valid DFS/BFS
   * branches to be discarded and could make their displayed trees look
   * identical.
   */
  const initialState = {
    sentential: initSentential,
    steps: [],
    root: rootNode,
    stepCount: 0,
  };

  const frontier = [initialState];
  let stepsChecked = 0;
  const allSuccessDerivations = [];
  let firstSuccess = null;

  while (frontier.length > 0) {
    if (stepsChecked++ >= 200000) break;

    const state = strategy === 'dfs'
      ? frontier.pop()
      : frontier.shift();

    const { sentential, steps, root, stepCount } = state;

    // Target check
    if (isTerminalString(sentential)) {
      const derived = sentential.join('');
      const derivedNorm = derived === 'ε' ? '' : derived;

      if (derivedNorm === targetNorm) {
        const derivResult = { steps, tree: root };
        allSuccessDerivations.push(derivResult);

        if (!firstSuccess) {
          firstSuccess = derivResult;

          // BFS naturally returns the shallowest successful derivation.
          // DFS returns its first depth-first successful derivation.
          if (strategy === 'bfs') break;
        }

        if (allSuccessDerivations.length >= 10) break;
      }

      continue;
    }

    if (stepCount >= maxSteps) continue;

    // This remains a leftmost derivation, while BFS/DFS controls
    // the order in which alternative derivation states are explored.
    const ntIdx = sentential.findIndex(sym => isNonTerminal(sym));
    if (ntIdx === -1) continue;

    const nt = sentential[ntIdx];
    const productions = grammar.rules.get(nt);
    if (!productions) continue;

    /*
     * For DFS, push alternatives in reverse order because the stack is
     * LIFO. This makes DFS explore productions in the same written order
     * as the grammar: first alternative first, then second, etc.
     *
     * BFS keeps the normal production order.
     */
    const orderedProductions = strategy === 'dfs'
      ? [...productions].reverse()
      : productions;

    for (const prod of orderedProductions) {
      const isEps = prod.length === 1 && prod[0] === 'ε';

      const replacement = isEps ? [] : prod;
      const finalSentential = [
        ...sentential.slice(0, ntIdx),
        ...replacement,
        ...sentential.slice(ntIdx + 1)
      ];

      const normalizedSentential =
        finalSentential.length === 0 ? ['ε'] : finalSentential;

      // Clone the complete derivation tree for this branch.
      const newRoot = cloneNode(root, null);

      const targetNode =
        findNodeBySymbolIndex(newRoot, nt, ntIdx, sentential);

      if (targetNode) {
        if (isEps) {
          const epsChild =
            new DerivationNode('ε', targetNode, `${nt} → ε`);
          targetNode.children.push(epsChild);
        } else {
          for (const sym of prod) {
            const child =
              new DerivationNode(sym, targetNode, `${nt} → ${prod.join('')}`);
            targetNode.children.push(child);
          }
        }

        targetNode.ruleApplied =
          `${nt} → ${isEps ? 'ε' : prod.join('')}`;
      }

      const ruleText =
        `${nt} → ${isEps ? 'ε' : prod.join(' ')}`;

      const newSteps = [
        ...steps,
        {
          sentential: [...normalizedSentential],
          ruleText,
          appliedNT: nt,
          appliedAt: ntIdx,
        }
      ];

      frontier.push({
        sentential: normalizedSentential,
        steps: newSteps,
        root: newRoot,
        stepCount: stepCount + 1,
      });
    }
  }

  if (firstSuccess) {
    return {
      success: true,
      steps: firstSuccess.steps,
      tree: firstSuccess.tree,
      allDerivations: allSuccessDerivations.map(d => d.steps),
      stepsChecked,
    };
  }

  return {
    success: false,
    steps: [],
    tree: null,
    allDerivations: [],
    stepsChecked,
  };
}

/* ============================================================
   Helpers
   ============================================================ */

function normalizeTarget(str) {
  if (!str || str.trim() === '' || str.trim() === 'ε') return 'ε';
  return str.trim();
}

function serializeSentential(s) {
  return s.join('|');
}

function isTerminalString(sentential) {
  return sentential.every(sym => !isNonTerminal(sym));
}

/**
 * Deep-clone a DerivationNode tree.
 */
function cloneNode(node, parent) {
  const cloned = new DerivationNode(node.symbol, parent, node.ruleApplied);
  cloned.id = node.id; // preserve IDs for lookup
  for (const child of node.children) {
    cloned.children.push(cloneNode(child, cloned));
  }
  return cloned;
}

/**
 * Find a node in the tree that corresponds to a specific non-terminal
 * at a specific position within a given sentential form.
 * Uses BFS to locate the correct leaf node.
 */
function findNodeBySymbolIndex(root, nt, targetIdx, sentential) {
  // Collect all leaf nodes (current frontier)
  const leaves = [];
  collectLeaves(root, leaves);

  // Count which occurrence of `nt` in sentential
  let count = 0;
  for (let i = 0; i < sentential.length; i++) {
    if (sentential[i] === nt) {
      if (i === targetIdx) break;
    }
  }

  // Map sentential to leaves
  let leafIdx = 0;
  for (let i = 0; i < sentential.length; i++) {
    if (sentential[i] === nt && i === targetIdx && leafIdx < leaves.length) {
      return leaves[leafIdx];
    }
    if (leafIdx < leaves.length && leaves[leafIdx].symbol === sentential[i]) {
      leafIdx++;
    }
  }

  // Fallback: find any leaf matching NT
  for (const leaf of leaves) {
    if (leaf.symbol === nt && leaf.isLeaf()) return leaf;
  }
  return null;
}

function collectLeaves(node, result) {
  if (node.children.length === 0) {
    result.push(node);
  } else {
    for (const child of node.children) collectLeaves(child, result);
  }
}

/**
 * Validates grammar rules and returns an array of error messages.
 */
function validateGrammar(ruleLines, startSym) {
  const errors = [];
  if (!startSym || !startSym.trim()) {
    errors.push('Start symbol cannot be empty.');
  }

  const normalize = s => s.replace(/->|→|⟶/g, '→');

  for (let i = 0; i < ruleLines.length; i++) {
    const line = normalize(ruleLines[i].trim());
    if (!line) continue;

    const arrowIdx = line.indexOf('→');
    if (arrowIdx === -1) {
      errors.push(`Rule ${i + 1}: Missing arrow (use → or ->).`);
      continue;
    }

    const lhs = line.slice(0, arrowIdx).trim();
    if (!lhs) errors.push(`Rule ${i + 1}: LHS is empty.`);
    if (lhs.length > 1) errors.push(`Rule ${i + 1}: LHS "${lhs}" should be a single character for regular grammars.`);
    if (!/^[A-Z]$/.test(lhs)) errors.push(`Rule ${i + 1}: LHS "${lhs}" should be an uppercase letter (non-terminal).`);

    const rhs = line.slice(arrowIdx + 1).trim();
    if (!rhs) errors.push(`Rule ${i + 1}: RHS is empty.`);
  }

  return errors;
}

/* ============================================================
   Preset Grammars
   ============================================================ */
const PRESETS = {
  ab: {
    name: 'a*b (strings of a\'s followed by b)',
    start: 'S',
    rules: ['S → aS | b'],
    target: 'aaab',
    steps: 10,
  },
  anbn: {
    name: 'Balanced ab (a^n b^n)',
    start: 'S',
    rules: ['S → aSb | ε'],
    target: 'aabb',
    steps: 10,
  },
  binary: {
    name: 'Binary strings',
    start: 'S',
    rules: ['S → 0S | 1S | ε'],
    target: '1010',
    steps: 12,
  },
  identifier: {
    name: 'Simple identifier (letters)',
    start: 'S',
    rules: ['S → aS | bS | cS | a | b | c'],
    target: 'abc',
    steps: 8,
  },
  palindrome: {
    name: 'Palindromes over {a,b}',
    start: 'S',
    rules: ['S → aSa | bSb | a | b | ε'],
    target: 'abba',
    steps: 10,
  },
};
