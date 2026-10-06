/**
 * app.js — Application Controller
 *
 * Wires the UI together: rule editor, derivation trigger,
 * results display (tree, steps, all derivations, grammar table).
 */

'use strict';

/* ============================================================
   State
   ============================================================ */

let panZoom = null;
let currentSvg = null;
let currentGrammar = null;
let currentResult = null;

/* ============================================================
   DOM References
   ============================================================ */

const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const ruleEditor    = $('ruleEditor');
const startSymbol   = $('startSymbol');
const targetString  = $('targetString');
const maxSteps      = $('maxSteps');
const maxStepsRange = $('maxStepsRange');
const strategy      = $('strategy');
const deriveBtn     = $('deriveBtn');
const resetBtn      = $('resetBtn');
const addRuleBtn    = $('addRuleBtn');
const treeViewport  = $('treeViewport');
const resultBanner  = $('resultBanner');
const stepsContainer = $('stepsContainer');
const allContainer  = $('allContainer');
const grammarSummary = $('grammarSummary');
const summaryContent = $('summaryContent');
const grammarTableContainer = $('grammarTableContainer');

/* ============================================================
   Rule Editor
   ============================================================ */

function createRuleRow(value = '') {
  const row = document.createElement('div');
  row.className = 'rule-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'e.g.  S → aS | b | ε';
  input.value = value;
  input.setAttribute('aria-label', 'Production rule');
  input.spellcheck = false;

  input.addEventListener('input', () => {
    input.classList.remove('rule-error');
    updateGrammarSummary();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') deriveBtn.click();
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'rule-del-btn';
  delBtn.innerHTML = '✕';
  delBtn.title = 'Remove rule';
  delBtn.setAttribute('aria-label', 'Remove rule');
  delBtn.addEventListener('click', () => {
    if (ruleEditor.children.length > 1) {
      row.remove();
      updateGrammarSummary();
    }
  });

  row.appendChild(input);
  row.appendChild(delBtn);
  return row;
}

function getRuleLines() {
  return Array.from(ruleEditor.querySelectorAll('input'))
    .map(i => i.value.trim())
    .filter(Boolean);
}

addRuleBtn.addEventListener('click', () => {
  ruleEditor.appendChild(createRuleRow());
  ruleEditor.lastElementChild.querySelector('input').focus();
});

/* ============================================================
   Grammar Summary
   ============================================================ */

function updateGrammarSummary() {
  const lines = getRuleLines();
  if (!lines.length) { grammarSummary.hidden = true; return; }

  try {
    const g = parseGrammar(lines, startSymbol.value || 'S');
    currentGrammar = g;
    grammarSummary.hidden = false;

    const nts = [...g.nonTerminals].join(', ') || '—';
    const ts  = [...g.terminals].join(', ')    || '(none / only ε)';
    const ruleCount = [...g.rules.values()].reduce((acc, prods) => acc + prods.length, 0);

    summaryContent.innerHTML = `
      <div class="summary-row"><span class="summary-label">Non-Terminals</span><span class="summary-val">{${nts}}</span></div>
      <div class="summary-row"><span class="summary-label">Terminals</span><span class="summary-val">{${ts}}</span></div>
      <div class="summary-row"><span class="summary-label">Productions</span><span class="summary-val">${ruleCount}</span></div>
      <div class="summary-row"><span class="summary-label">Start Symbol</span><span class="summary-val">${g.start}</span></div>
    `;

    renderGrammarTable(g);
  } catch (e) {
    grammarSummary.hidden = true;
  }
}

/* ============================================================
   Grammar Table
   ============================================================ */

function renderGrammarTable(grammar) {
  const container = grammarTableContainer;
  const placeholder = document.querySelector('.grammar-table-placeholder');
  container.hidden = false;
  if (placeholder) placeholder.hidden = true;

  let html = `<div class="grammar-table-container">
  <table class="grammar-table">
    <thead>
      <tr>
        <th>Non-Terminal</th>
        <th>Productions</th>
        <th>Count</th>
      </tr>
    </thead>
    <tbody>`;

  for (const [nt, prods] of grammar.rules.entries()) {
    const prodStrs = prods.map(p => {
      const str = p.join('');
      return `<span class="prod">${escapeHtml(str === '' ? 'ε' : str)}</span>`;
    });
    const isStart = nt === grammar.start;
    html += `<tr>
      <td><span class="nt">${escapeHtml(nt)}${isStart ? ' <small>(start)</small>' : ''}</span></td>
      <td>${prodStrs.join(' <span class="prod-alt">|</span> ')}</td>
      <td>${prods.length}</td>
    </tr>`;
  }

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

/* ============================================================
   Tab Switching
   ============================================================ */

function activateTab(tabId) {
  $$('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
    b.setAttribute('aria-selected', b.dataset.tab === tabId);
  });
  $$('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'tab-' + tabId);
  });
}

$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

/* ============================================================
   Presets
   ============================================================ */

$$('.chip[data-preset]').forEach(chip => {
  chip.addEventListener('click', () => {
    const preset = PRESETS[chip.dataset.preset];
    if (!preset) return;

    startSymbol.value = preset.start;
    ruleEditor.innerHTML = '';
    for (const rule of preset.rules) {
      ruleEditor.appendChild(createRuleRow(rule));
    }
    targetString.value = preset.target;
    maxSteps.value = preset.steps;
    maxStepsRange.value = preset.steps;
    updateGrammarSummary();
  });
});

/* ============================================================
   Range ↔ Number Sync
   ============================================================ */

maxStepsRange.addEventListener('input', () => {
  maxSteps.value = maxStepsRange.value;
});
maxSteps.addEventListener('input', () => {
  maxStepsRange.value = Math.min(30, Math.max(1, maxSteps.value));
});

/* ============================================================
   Derive
   ============================================================ */

deriveBtn.addEventListener('click', runDerivation);

function runDerivation() {
  const lines = getRuleLines();

  // Validate
  const errors = validateGrammar(lines, startSymbol.value);
  if (errors.length) {
    showBanner('failure', '⚠ ' + errors[0]);
    return;
  }
  if (!lines.length) {
    showBanner('failure', '⚠ Please add at least one production rule.');
    return;
  }

  let grammar;
  try {
    grammar = parseGrammar(lines, startSymbol.value);
  } catch (e) {
    showBanner('failure', '⚠ Parse error: ' + e.message);
    return;
  }

  const target = targetString.value.trim() || 'ε';
  const N = parseInt(maxSteps.value, 10) || 10;
  const strat = strategy.value;

  // Show loading state
  deriveBtn.disabled = true;
  deriveBtn.textContent = '⌛ Deriving…';
  treeViewport.innerHTML = `<div class="tree-placeholder"><div class="spinner"></div><p>Running ${strat.toUpperCase()} derivation…</p></div>`;
  resultBanner.hidden = true;

  // Run async so UI updates
  setTimeout(() => {
    try {
      const result = derive(grammar, target, N, strat);
      currentResult = result;
      displayResult(grammar, result, target, N);
    } catch (e) {
      showBanner('failure', '⚠ Derivation error: ' + e.message);
      treeViewport.innerHTML = `<div class="tree-placeholder"><span class="placeholder-icon">⚠</span><p>${e.message}</p></div>`;
    } finally {
      deriveBtn.disabled = false;
      deriveBtn.textContent = '▶ Derive';
    }
  }, 30);
}

/* ============================================================
   Display Result
   ============================================================ */

function displayResult(grammar, result, target, N) {
  resultBanner.hidden = false;

  if (result.success) {
    const stepCount = result.steps.length;
    showBanner('success', `✅ "${escapeHtml(target)}" derived in ${stepCount} step${stepCount !== 1 ? 's' : ''} (checked ${result.stepsChecked.toLocaleString()} state${result.stepsChecked !== 1 ? 's' : ''})`);
    renderDerivationTree(result.tree);
    renderSteps(grammar.start, result.steps);
    renderAllDerivations(grammar.start, result.allDerivations);
  } else {
    const msg = result.error || `"${target}" cannot be derived within ${N} steps.`;
    showBanner('failure', `❌ ${msg} (checked ${result.stepsChecked.toLocaleString()} states)`);
    treeViewport.innerHTML = `<div class="tree-placeholder"><span class="placeholder-icon">🚫</span><p>No derivation found within ${N} steps.</p></div>`;
    $('treeControls').hidden = true;
  }

  renderGrammarTable(grammar);
}

/* ============================================================
   Tree Rendering
   ============================================================ */

function renderDerivationTree(root) {
  if (!root) return;

  treeViewport.innerHTML = '';
  const svg = renderTree(root, treeViewport);
  currentSvg = svg;

  $('treeControls').hidden = false;

  if (panZoom) {
    panZoom.viewport = treeViewport;
  } else {
    panZoom = new PanZoom(treeViewport);
  }
  panZoom.reset();
}

/* ============================================================
   Steps Rendering
   ============================================================ */

function renderSteps(start, steps) {
  const container = stepsContainer;
  const placeholder = document.querySelector('.steps-placeholder');

  container.hidden = false;
  if (placeholder) placeholder.hidden = true;
  container.innerHTML = '';

  // Initial step: start symbol
  const initCard = buildStepCard(0, [start], 'Start', null);
  container.appendChild(initCard);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const card = buildStepCard(
      i + 1,
      step.sentential,
      step.ruleText,
      step.appliedNT
    );
    container.appendChild(card);
  }
}

function buildStepCard(num, sentential, ruleText, highlightNT) {
  const card = document.createElement('div');
  card.className = 'step-card';

  const numEl = document.createElement('div');
  numEl.className = 'step-num';
  numEl.textContent = num;

  const body = document.createElement('div');
  body.className = 'step-body';

  const sentEl = document.createElement('div');
  sentEl.className = 'step-sentential';
  sentEl.innerHTML = formatSentential(sentential, highlightNT);

  const ruleEl = document.createElement('div');
  ruleEl.className = 'step-rule';
  ruleEl.textContent = ruleText ? `Apply: ${ruleText}` : '';

  body.appendChild(sentEl);
  if (ruleText) body.appendChild(ruleEl);

  card.appendChild(numEl);
  card.appendChild(body);
  return card;
}

function formatSentential(sentential, highlightNT) {
  return sentential.map(sym => {
    if (sym === 'ε') return `<span class="tok-eps">ε</span>`;
    if (isNonTerminal(sym)) {
      if (sym === highlightNT) return `<span class="step-highlight">${escapeHtml(sym)}</span>`;
      return `<span class="tok-nt">${escapeHtml(sym)}</span>`;
    }
    return `<span class="tok-t">${escapeHtml(sym)}</span>`;
  }).join(' ');
}

/* ============================================================
   All Derivations Rendering
   ============================================================ */

function renderAllDerivations(start, allDerivations) {
  const container = allContainer;
  const placeholder = document.querySelector('.all-placeholder');
  container.hidden = false;
  if (placeholder) placeholder.hidden = true;
  container.innerHTML = '';

  if (!allDerivations.length) {
    container.innerHTML = '<div class="placeholder-block"><span class="placeholder-icon">🔍</span><p>No derivations found.</p></div>';
    return;
  }

  const header = document.createElement('div');
  header.style.cssText = 'color: var(--clr-text-muted); font-size: .82rem; margin-bottom: .5rem;';
  header.textContent = `Found ${allDerivations.length} derivation${allDerivations.length !== 1 ? 's' : ''} (showing up to 10):`;
  container.appendChild(header);

  allDerivations.forEach((steps, idx) => {
    const card = document.createElement('div');
    card.className = 'derivation-card';
    card.innerHTML = `
      <div class="derivation-card-header">
        <strong>Derivation ${idx + 1}</strong>
        <span style="color:var(--clr-text-muted);font-size:.8rem">${steps.length} step${steps.length !== 1 ? 's' : ''} ▾</span>
      </div>
      <div class="derivation-card-body">
        <div class="derivation-steps-list">
          <span class="tok-nt">${escapeHtml(start)}</span>
          ${steps.map(s => `<span class="derivation-arrow">⟹</span> ${formatSentential(s.sentential, null)}`).join('')}
        </div>
      </div>
    `;

    card.querySelector('.derivation-card-header').addEventListener('click', () => {
      card.classList.toggle('open');
    });

    container.appendChild(card);
  });
}

/* ============================================================
   Banner
   ============================================================ */

function showBanner(type, msg) {
  resultBanner.hidden = false;
  resultBanner.className = `result-banner ${type}`;
  resultBanner.innerHTML = msg;
}

/* ============================================================
   Reset
   ============================================================ */

resetBtn.addEventListener('click', () => {
  ruleEditor.innerHTML = '';
  ruleEditor.appendChild(createRuleRow('S → aS | b'));
  startSymbol.value = 'S';
  targetString.value = 'aab';
  maxSteps.value = 10;
  maxStepsRange.value = 10;
  resultBanner.hidden = true;
  treeViewport.innerHTML = `<div class="tree-placeholder">
    <span class="placeholder-icon">🌳</span>
    <p>Configure grammar and click <strong>Derive</strong> to see the derivation tree</p>
  </div>`;
  $('treeControls').hidden = true;
  stepsContainer.hidden = true;
  document.querySelector('.steps-placeholder') && (document.querySelector('.steps-placeholder').hidden = false);
  allContainer.hidden = true;
  document.querySelector('.all-placeholder') && (document.querySelector('.all-placeholder').hidden = false);
  grammarSummary.hidden = true;
  updateGrammarSummary();
});

/* ============================================================
   Zoom Controls
   ============================================================ */

$('zoomIn').addEventListener('click', () => panZoom?.zoom(1.25, treeViewport.getBoundingClientRect().left + treeViewport.offsetWidth / 2, treeViewport.getBoundingClientRect().top + treeViewport.offsetHeight / 2));
$('zoomOut').addEventListener('click', () => panZoom?.zoom(0.8, treeViewport.getBoundingClientRect().left + treeViewport.offsetWidth / 2, treeViewport.getBoundingClientRect().top + treeViewport.offsetHeight / 2));
$('zoomReset').addEventListener('click', () => panZoom?.reset());
$('exportSvgBtn').addEventListener('click', () => { if (currentSvg) exportSvg(currentSvg); });

/* ============================================================
   Theme Toggle
   ============================================================ */

const themeToggle = $('themeToggle');
let isDark = true;

themeToggle.addEventListener('click', () => {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  themeToggle.textContent = isDark ? '🌙' : '☀';
});

/* ============================================================
   Help Modal
   ============================================================ */

$('helpBtn').addEventListener('click', () => { $('helpModal').hidden = false; });
$('closeHelp').addEventListener('click', () => { $('helpModal').hidden = true; });
$('helpModal').addEventListener('click', e => {
  if (e.target === $('helpModal')) $('helpModal').hidden = true;
});

/* ============================================================
   Tooltip
   ============================================================ */

const tooltipPopup = $('tooltipPopup');

document.querySelectorAll('.tooltip-anchor').forEach(anchor => {
  anchor.addEventListener('mouseenter', e => {
    const text = e.target.dataset.tooltip;
    if (!text) return;
    tooltipPopup.textContent = text;
    tooltipPopup.hidden = false;
  });

  anchor.addEventListener('mousemove', e => {
    tooltipPopup.style.left = (e.clientX + 12) + 'px';
    tooltipPopup.style.top  = (e.clientY + 12) + 'px';
  });

  anchor.addEventListener('mouseleave', () => {
    tooltipPopup.hidden = true;
  });
});

/* ============================================================
   Keyboard Shortcuts
   ============================================================ */

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    deriveBtn.click();
  }
  if (e.key === 'Escape') {
    $('helpModal').hidden = true;
  }
});

/* ============================================================
   Utilities
   ============================================================ */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
   Init
   ============================================================ */

(function init() {
  // Load default grammar
  ruleEditor.appendChild(createRuleRow('S → aS | b'));
  updateGrammarSummary();
  $('treeControls').hidden = true;
})();

/* ============================================================
   Mobile PWA Install Prompt — in-website instructions only
   ============================================================ */

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
}

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

function showMobileInstallPrompt() {
  if (!isMobileDevice() || isStandaloneApp() ||
      sessionStorage.getItem('pwaInstallDismissedV2') === '1') return;

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));

  const overlay = document.createElement('div');
  overlay.id = 'pwaInstallPrompt';
  overlay.innerHTML = `
    <div class="pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
      <button class="pwa-close" aria-label="Close">×</button>
      <div class="pwa-icon">⟨G⟩</div>
      <h2 id="pwaInstallTitle">Install Grammar String Deriver</h2>
      <p>Get quick access from your home screen with an app-like experience.</p>

      <div class="pwa-platform-help">
        <div class="pwa-step">
          <span>1</span>
          <div>
            <strong>${isIOS ? 'Open the Share menu' : 'Open your browser menu'}</strong>
            <small>${isIOS ? 'Tap the Share button in Safari.' : 'Tap ⋮ in Chrome or your browser.'}</small>
          </div>
        </div>
        <div class="pwa-step">
          <span>2</span>
          <div>
            <strong>${isIOS ? 'Choose “Add to Home Screen”' : 'Choose “Install app” or “Add to Home screen”'}</strong>
            <small>${isIOS ? 'Then tap Add to finish.' : 'The exact wording may vary by browser.'}</small>
          </div>
        </div>
      </div>

      <button class="pwa-install-btn" id="pwaInstallBtn">✓ Got it</button>
      <button class="pwa-later" id="pwaLaterBtn">Maybe later</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    sessionStorage.setItem('pwaInstallDismissedV2', '1');
    overlay.remove();
  };

  overlay.querySelector('.pwa-close').addEventListener('click', close);
  overlay.querySelector('#pwaLaterBtn').addEventListener('click', close);
  overlay.querySelector('#pwaInstallBtn').addEventListener('click', close);
}

window.addEventListener('appinstalled', () => {
  const prompt = document.getElementById('pwaInstallPrompt');
  if (prompt) prompt.remove();
});

window.addEventListener('load', () => {
  setTimeout(showMobileInstallPrompt, 1200);
});
