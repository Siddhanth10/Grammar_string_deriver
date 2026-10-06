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

  // Build initial state
  const rootNode = new DerivationNode(grammar.start, null, null);
  const initSentential = [grammar.start];

  // Check if start symbol exists in rules
  if (!grammar.rules.has(grammar.start)) {
    return { success: false, steps: [], tree: null, allDerivations: [], stepsChecked: 0, error: `Start symbol "${grammar.start}" has no production rules.` };
  }

  const queue = [{
    sentential: [...initSentential],
    steps: [],
    nodeMap: new Map([[grammar.start + ':0', rootNode]]),
    root: rootNode,
    stepCount: 0,
  }];

  const visited = new Set();
  visited.add(serializeSentential(initSentential));

  let stepsChecked = 0;
  const allSuccessDerivations = [];
  let firstSuccess = null;

  const structure = strategy === 'bfs' ? 'queue' : 'stack';

  while (queue.length > 0) {
    stepsChecked++;
    if (stepsChecked > 200000) break; // Safety

    const state = structure === 'queue' ? queue.shift() : queue.pop();
    const { sentential, steps, nodeMap, root, stepCount } = state;

    // Check if current sentential matches target
    if (isTerminalString(sentential)) {
      const derived = sentential.join('');
      const derivedStr = derived === 'ε' ? '' : derived;
      const targetNorm = target === 'ε' ? '' : target;

      if (derivedStr === targetNorm) {
        const derivResult = { steps, tree: root };
        allSuccessDerivations.push(steps);
        if (!firstSuccess) {
          firstSuccess = derivResult;
          // If BFS, we have the shortest — return early
          if (strategy === 'bfs') break;
        }
        if (allSuccessDerivations.length >= 10) break; // cap
        continue;
      }
      continue; // terminal string but not our target
    }

    if (stepCount >= maxSteps) continue;

    // Find leftmost non-terminal
    const ntIdx = sentential.findIndex(sym => isNonTerminal(sym));
    if (ntIdx === -1) continue;

    const nt = sentential[ntIdx];
    const productions = grammar.rules.get(nt);
    if (!productions) continue;

    for (const prod of productions) {
      // Apply production: replace sentential[ntIdx] with prod
      const newSentential = [
        ...sentential.slice(0, ntIdx),
        ...prod.filter(s => s !== 'ε'),
        ...sentential.slice(ntIdx + 1),
      ];

      // Handle epsilon → produces empty (remove the nt)
      const isEps = prod.length === 1 && prod[0] === 'ε';
      const newSententialWithEps = isEps
        ? [...sentential.slice(0, ntIdx), ...sentential.slice(ntIdx + 1)]
        : [...sentential.slice(0, ntIdx), ...prod, ...sentential.slice(ntIdx + 1)];

      const finalSentential = newSententialWithEps.length === 0 ? ['ε'] : newSententialWithEps;

      const serialized = serializeSentential(finalSentential) + ':' + stepCount;
      if (visited.has(serialized) && strategy === 'bfs') continue;
      visited.add(serialized);

      // Clone tree and apply production
      const newRoot = cloneNode(root, null);
      const nodeId = nt + ':' + ntIdx;
      const targetNode = findNodeBySymbolIndex(newRoot, nt, ntIdx, sentential);

      if (targetNode) {
        if (isEps) {
          const epsChild = new DerivationNode('ε', targetNode, `${nt} → ε`);
          targetNode.children.push(epsChild);
        } else {
          for (const sym of prod) {
            const child = new DerivationNode(sym, targetNode, `${nt} → ${prod.join('')}`);
            targetNode.children.push(child);
          }
        }
        targetNode.ruleApplied = `${nt} → ${prod.join('')}`;
      }

      const ruleText = `${nt} → ${isEps ? 'ε' : prod.join(' ')}`;
      const newSteps = [...steps, {
        sentential: [...finalSentential],
        ruleText,
        appliedNT: nt,
        appliedAt: ntIdx,
      }];

      queue.push({
        sentential: finalSentential,
        steps: newSteps,
        nodeMap: new Map(),
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
      allDerivations: allSuccessDerivations,
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
