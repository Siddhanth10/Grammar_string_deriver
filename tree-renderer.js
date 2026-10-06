/**
 * tree-renderer.js — SVG Derivation Tree Renderer
 *
 * Renders a DerivationNode tree as an interactive, zoomable SVG.
 * Supports pan & zoom, node highlighting, and SVG export.
 */

'use strict';

/* ============================================================
   Layout Engine — Reingold-Tilford inspired
   ============================================================ */

const NODE_RADIUS = 18;
const LEVEL_HEIGHT = 80;
const MIN_NODE_SEP = 52;
const H_MARGIN = 40;
const V_MARGIN = 40;

/**
 * Assigns x,y coordinates to each node using a bottom-up width calculation.
 * @param {DerivationNode} root
 * @returns {Map<number, {x: number, y: number}>} nodeId → position
 */
function layoutTree(root) {
  const positions = new Map();

  // Pass 1: calculate subtree widths
  function calcWidth(node) {
    if (node.isLeaf()) {
      node._width = MIN_NODE_SEP;
      return node._width;
    }
    let total = 0;
    for (const child of node.children) {
      total += calcWidth(child);
    }
    node._width = Math.max(total, MIN_NODE_SEP);
    return node._width;
  }

  // Pass 2: assign x positions
  function assignX(node, left) {
    if (node.isLeaf()) {
      node._x = left + node._width / 2;
      return;
    }
    let cursor = left;
    for (const child of node.children) {
      assignX(child, cursor);
      cursor += child._width;
    }
    // Parent centered over children
    const firstChild = node.children[0];
    const lastChild = node.children[node.children.length - 1];
    node._x = (firstChild._x + lastChild._x) / 2;
  }

  // Pass 3: assign y positions (depth-based)
  function assignY(node, depth) {
    node._y = depth * LEVEL_HEIGHT + V_MARGIN;
    for (const child of node.children) assignY(child, depth + 1);
  }

  calcWidth(root);
  assignX(root, H_MARGIN);
  assignY(root, 0);

  // Collect all positions
  function collectPositions(node) {
    positions.set(node.id, { x: node._x, y: node._y });
    for (const child of node.children) collectPositions(child);
  }
  collectPositions(root);

  return positions;
}

/* ============================================================
   SVG Renderer
   ============================================================ */

/**
 * Renders the derivation tree into the given container element.
 * @param {DerivationNode} root
 * @param {HTMLElement} container – the tree-viewport div
 * @param {string[]} highlightPath – array of node IDs to highlight (derivation path)
 */
function renderTree(root, container, highlightPath = []) {
  // Clear existing
  container.innerHTML = '';

  const positions = layoutTree(root);

  // Calculate SVG dimensions
  let maxX = 0, maxY = 0;
  for (const pos of positions.values()) {
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y > maxY) maxY = pos.y;
  }
  const svgWidth = maxX + H_MARGIN + NODE_RADIUS;
  const svgHeight = maxY + V_MARGIN + NODE_RADIUS;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', svgWidth);
  svg.setAttribute('height', svgHeight);
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute('aria-label', 'Derivation tree');
  svg.setAttribute('role', 'img');

  const highlightSet = new Set(highlightPath);

  // Draw edges first (behind nodes)
  const edgeGroup = document.createElementNS(svgNS, 'g');
  edgeGroup.setAttribute('class', 'edges');

  function drawEdges(node) {
    const parentPos = positions.get(node.id);
    for (const child of node.children) {
      const childPos = positions.get(child.id);
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', parentPos.x);
      line.setAttribute('y1', parentPos.y);
      line.setAttribute('x2', childPos.x);
      line.setAttribute('y2', childPos.y);
      const isHighlighted = highlightSet.has(String(node.id)) && highlightSet.has(String(child.id));
      line.setAttribute('class', `tree-edge${isHighlighted ? ' highlighted' : ''}`);
      edgeGroup.appendChild(line);
      drawEdges(child);
    }
  }
  drawEdges(root);
  svg.appendChild(edgeGroup);

  // Draw nodes
  const nodeGroup = document.createElementNS(svgNS, 'g');
  nodeGroup.setAttribute('class', 'nodes');

  function drawNode(node) {
    const pos = positions.get(node.id);
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', `tree-node ${getNodeClass(node)}`);
    g.setAttribute('data-id', node.id);
    g.setAttribute('data-symbol', node.symbol);

    // Circle
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', NODE_RADIUS);
    g.appendChild(circle);

    // Label
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', pos.x);
    text.setAttribute('y', pos.y);
    const label = node.symbol === 'ε' ? 'ε' : node.symbol;
    text.textContent = label.length > 3 ? label.slice(0, 3) : label;
    g.appendChild(text);

    // Tooltip
    if (node.ruleApplied) {
      const title = document.createElementNS(svgNS, 'title');
      title.textContent = `${node.symbol}${node.ruleApplied ? ' [' + node.ruleApplied + ']' : ''}`;
      g.appendChild(title);
    }

    nodeGroup.appendChild(g);

    for (const child of node.children) drawNode(child);
  }

  drawNode(root);
  svg.appendChild(nodeGroup);

  // Wrap in a div for transform control
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-svg-wrapper';
  wrapper.appendChild(svg);
  container.appendChild(wrapper);

  return svg;
}

function getNodeClass(node) {
  if (!node.parent) return 'start';
  if (node.symbol === 'ε') return 'epsilon';
  if (isNonTerminal(node.symbol)) return 'nonterminal';
  return 'terminal';
}

/* ============================================================
   Pan & Zoom Controller
   ============================================================ */

class PanZoom {
  constructor(viewport) {
    this.viewport = viewport;
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._bindEvents();
  }

  _bindEvents() {
    const vp = this.viewport;

    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom(delta, e.clientX, e.clientY);
    }, { passive: false });

    vp.addEventListener('mousedown', e => {
      if (e.button === 0) {
        this._dragging = true;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
        vp.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', e => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this.tx += dx;
      this.ty += dy;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this._apply();
    });

    window.addEventListener('mouseup', () => {
      this._dragging = false;
      vp.style.cursor = 'grab';
    });

    // Touch support
    let lastTouchDist = null;
    vp.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this._dragging = true;
        this._lastX = e.touches[0].clientX;
        this._lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        lastTouchDist = getTouchDist(e.touches);
      }
    }, { passive: true });

    vp.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && this._dragging) {
        const dx = e.touches[0].clientX - this._lastX;
        const dy = e.touches[0].clientY - this._lastY;
        this.tx += dx;
        this.ty += dy;
        this._lastX = e.touches[0].clientX;
        this._lastY = e.touches[0].clientY;
        this._apply();
      } else if (e.touches.length === 2) {
        const dist = getTouchDist(e.touches);
        if (lastTouchDist) {
          const delta = dist / lastTouchDist;
          this.zoom(delta, (e.touches[0].clientX + e.touches[1].clientX) / 2,
                          (e.touches[0].clientY + e.touches[1].clientY) / 2);
        }
        lastTouchDist = dist;
      }
    }, { passive: true });

    vp.addEventListener('touchend', () => {
      this._dragging = false;
      lastTouchDist = null;
    });
  }

  zoom(factor, cx, cy) {
    const rect = this.viewport.getBoundingClientRect();
    const mouseX = cx - rect.left;
    const mouseY = cy - rect.top;
    const newScale = Math.min(Math.max(this.scale * factor, 0.2), 4);
    const scaleChange = newScale / this.scale;
    this.tx = mouseX - scaleChange * (mouseX - this.tx);
    this.ty = mouseY - scaleChange * (mouseY - this.ty);
    this.scale = newScale;
    this._apply();
    this._notifyZoom();
  }

  setZoom(scale) {
    this.scale = scale;
    this._apply();
    this._notifyZoom();
  }

  reset() {
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this._apply();
    this._notifyZoom();
  }

  _apply() {
    const wrapper = this.viewport.querySelector('.tree-svg-wrapper');
    if (wrapper) {
      wrapper.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    }
  }

  _notifyZoom() {
    const label = document.getElementById('zoomLabel');
    if (label) label.textContent = Math.round(this.scale * 100) + '%';
  }
}

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/* ============================================================
   SVG Export
   ============================================================ */

function exportSvg(svg) {
  const serializer = new XMLSerializer();
  let svgStr = serializer.serializeToString(svg);

  // Embed CSS
  const style = `<style>
    .tree-edge { stroke: #2e3250; stroke-width: 2; fill: none; }
    .tree-edge.highlighted { stroke: #6c63ff; stroke-width: 2.5; }
    .tree-node circle { stroke-width: 2.5; }
    .tree-node text { font-family: monospace; font-size: 13px; dominant-baseline: middle; text-anchor: middle; fill: #fff; }
    .start circle { fill: #6c63ff; stroke: #9f9aff; }
    .nonterminal circle { fill: #00aaff; stroke: #55ccff; }
    .terminal circle { fill: #00d9a6; stroke: #55ffcc; }
    .terminal text { fill: #001a0f; }
    .epsilon circle { fill: #888; stroke: #aaa; }
  </style>`;

  svgStr = svgStr.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg"`);
  svgStr = svgStr.replace('</svg>', style + '</svg>');

  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'derivation-tree.svg';
  a.click();
  URL.revokeObjectURL(url);
}
