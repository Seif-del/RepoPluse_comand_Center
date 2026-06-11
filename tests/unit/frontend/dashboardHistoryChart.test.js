'use strict';

// ── renderChart — compact empty-state tests ───────────────────────────────────
//
// renderChart is a DOM-mutating function that cannot be imported directly.
// Tests drive a verbatim copy of the sparse-state and restore logic using
// the same hand-rolled DOM mock pattern as dashboardPortfolioTabs.test.js.
//
// What is tested:
//   1. Sparse state (0 points) — SVG hidden, compact <p> appended, padding collapsed
//   2. Sparse state (1 point)  — same, with "1 snapshot" count text
//   3. Idempotency             — repeated sparse calls do not add duplicate <p>
//   4. Normal-path restore     — SVG shown, <p> removed, padding restored
//   5. Clean normal path       — first render with ≥2 points, no mutation needed

// ── Minimal DOM mock ──────────────────────────────────────────────────────────

function makeEl(id) {
  var _style  = {};
  var _children = [];
  var _innerHTML = '';
  var _textContent = '';

  var el = {
    id:        id,
    _style:    _style,
    get style()       { return _style; },
    get innerHTML()   { return _innerHTML; },
    set innerHTML(v)  { _innerHTML = v; _children = []; },
    get textContent() { return _textContent; },
    set textContent(v){ _textContent = v; },
    _children: _children,
    appendChild: function(child) {
      _children.push(child);
      return child;
    },
    removeChild: function(child) {
      var idx = _children.indexOf(child);
      if (idx !== -1) _children.splice(idx, 1);
    },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
  };
  return el;
}

// Registry-backed getElementById stub
function buildDom(opts) {
  opts = opts || {};
  var svg        = makeEl('history-chart');
  var chartPanel = makeEl('history-chart-panel');
  var countEl    = makeEl('chart-count');
  var ctxEl      = makeEl('chart-context');

  // Pre-populate an existing empty-msg if the test needs to start in sparse state
  var emptyMsg = null;
  if (opts.existingEmptyMsg) {
    emptyMsg = makeEl('history-chart-empty');
    chartPanel._children.push(emptyMsg);
    // Simulate SVG already hidden and panel already collapsed
    svg._style.display = 'none';
    chartPanel._style.padding = '10px 20px';
  }

  var registry = {
    'history-chart':       svg,
    'history-chart-panel': chartPanel,
    'chart-count':         countEl,
    'chart-context':       ctxEl,
    'history-chart-empty': emptyMsg,
  };

  var doc = {
    _registry: registry,
    getElementById: function(id) { return registry[id] || null; },
    createElement: function(tag) {
      var el = makeEl('__new__');
      el._tag = tag;
      return el;
    },
  };

  return { doc, svg, chartPanel, countEl, ctxEl, registry };
}

// ── Verbatim copy of the sparse-state + restore logic from renderChart ────────
// (document injected as parameter; rest of the function — actual SVG drawing —
//  is not needed for these tests and is omitted.)

function runRenderChartLogic(points, doc) {
  var svg     = doc.getElementById('history-chart');
  var countEl = doc.getElementById('chart-count');
  var ctxEl   = doc.getElementById('chart-context');

  if (points.length < 2) {
    if (countEl) countEl.textContent = points.length === 1 ? '1 snapshot' : '0 snapshots';
    if (ctxEl)   ctxEl.innerHTML = '';
    svg.style.display = 'none';
    var chartPanel = doc.getElementById('history-chart-panel');
    if (chartPanel && !doc.getElementById('history-chart-empty')) {
      var emptyMsg = doc.createElement('p');
      emptyMsg.id = 'history-chart-empty';
      emptyMsg.style.cssText = 'font-size:0.82rem;color:var(--text-muted);font-style:italic;margin:0;padding:4px 0;';
      emptyMsg.textContent = 'Not enough history to show a trend yet.';
      chartPanel.appendChild(emptyMsg);
      chartPanel.style.padding = '10px 20px';
    }
    return { earlyReturn: true };
  }

  // Normal path restore
  svg.style.display = '';
  var _emptyMsg = doc.getElementById('history-chart-empty');
  if (_emptyMsg) { _emptyMsg.parentNode = doc.getElementById('history-chart-panel'); _emptyMsg.parentNode.removeChild(_emptyMsg); }
  var _chartPanel = doc.getElementById('history-chart-panel');
  if (_chartPanel) { _chartPanel.style.padding = '16px 20px 8px'; }

  if (countEl) countEl.textContent = points.length + ' snapshot' + (points.length !== 1 ? 's' : '');
  return { earlyReturn: false };
}

// Restore helper needs parentNode — wire it for the mock that has an existing emptyMsg
function buildDomWithRestore(opts) {
  var d = buildDom(opts);
  if (d.registry['history-chart-empty']) {
    d.registry['history-chart-empty'].parentNode = d.chartPanel;
  }
  return d;
}

// ── Tests — sparse state: 0 points ───────────────────────────────────────────

describe('renderChart sparse state — 0 points', () => {
  var d;
  beforeEach(() => { d = buildDom(); });

  test('svg.style.display set to "none"', () => {
    runRenderChartLogic([], d.doc);
    expect(d.svg.style.display).toBe('none');
  });

  test('chart-count receives "0 snapshots"', () => {
    runRenderChartLogic([], d.doc);
    expect(d.countEl.textContent).toBe('0 snapshots');
  });

  test('chart-context innerHTML cleared', () => {
    d.ctxEl.innerHTML = 'some prior content';
    runRenderChartLogic([], d.doc);
    expect(d.ctxEl.innerHTML).toBe('');
  });

  test('empty-state <p> appended to history-chart-panel', () => {
    runRenderChartLogic([], d.doc);
    expect(d.chartPanel._children.length).toBe(1);
  });

  test('empty-state element has id "history-chart-empty"', () => {
    runRenderChartLogic([], d.doc);
    expect(d.chartPanel._children[0].id).toBe('history-chart-empty');
  });

  test('empty-state element text is "Not enough history to show a trend yet."', () => {
    runRenderChartLogic([], d.doc);
    expect(d.chartPanel._children[0].textContent).toBe('Not enough history to show a trend yet.');
  });

  test('panel-body padding collapsed to "10px 20px"', () => {
    runRenderChartLogic([], d.doc);
    expect(d.chartPanel.style.padding).toBe('10px 20px');
  });

  test('function returns early (does not proceed to chart drawing)', () => {
    var result = runRenderChartLogic([], d.doc);
    expect(result.earlyReturn).toBe(true);
  });
});

// ── Tests — sparse state: 1 point ────────────────────────────────────────────

describe('renderChart sparse state — 1 point', () => {
  var d;
  var ONE_POINT = [{ score: 55, at: '2026-06-01T10:00:00Z' }];
  beforeEach(() => { d = buildDom(); });

  test('svg.style.display set to "none"', () => {
    runRenderChartLogic(ONE_POINT, d.doc);
    expect(d.svg.style.display).toBe('none');
  });

  test('chart-count receives "1 snapshot"', () => {
    runRenderChartLogic(ONE_POINT, d.doc);
    expect(d.countEl.textContent).toBe('1 snapshot');
  });

  test('empty-state <p> created with correct text', () => {
    runRenderChartLogic(ONE_POINT, d.doc);
    expect(d.chartPanel._children.length).toBe(1);
    expect(d.chartPanel._children[0].textContent).toBe('Not enough history to show a trend yet.');
  });

  test('panel padding collapsed', () => {
    runRenderChartLogic(ONE_POINT, d.doc);
    expect(d.chartPanel.style.padding).toBe('10px 20px');
  });
});

// ── Tests — idempotency ───────────────────────────────────────────────────────

describe('renderChart sparse state — idempotency', () => {
  test('calling twice with 0 points does not create a second empty-state <p>', () => {
    var d = buildDom();
    runRenderChartLogic([], d.doc);

    // After first call, register the created element so getElementById finds it
    d.registry['history-chart-empty'] = d.chartPanel._children[0];

    runRenderChartLogic([], d.doc);
    expect(d.chartPanel._children.length).toBe(1);
  });

  test('calling twice with 1 point does not double the empty-state message', () => {
    var d = buildDom();
    var ONE = [{ score: 40, at: '2026-06-01T10:00:00Z' }];
    runRenderChartLogic(ONE, d.doc);
    d.registry['history-chart-empty'] = d.chartPanel._children[0];
    runRenderChartLogic(ONE, d.doc);
    expect(d.chartPanel._children.length).toBe(1);
  });
});

// ── Tests — normal-path restore ───────────────────────────────────────────────

describe('renderChart normal path — restore after sparse state', () => {
  var TWO_POINTS = [
    { score: 42, at: '2026-06-01T10:00:00Z' },
    { score: 38, at: '2026-06-02T10:00:00Z' },
  ];

  test('svg.style.display reset to ""', () => {
    var d = buildDomWithRestore({ existingEmptyMsg: true });
    runRenderChartLogic(TWO_POINTS, d.doc);
    expect(d.svg.style.display).toBe('');
  });

  test('history-chart-empty element removed from panel', () => {
    var d = buildDomWithRestore({ existingEmptyMsg: true });
    runRenderChartLogic(TWO_POINTS, d.doc);
    expect(d.chartPanel._children.length).toBe(0);
  });

  test('panel-body padding restored to "16px 20px 8px"', () => {
    var d = buildDomWithRestore({ existingEmptyMsg: true });
    runRenderChartLogic(TWO_POINTS, d.doc);
    expect(d.chartPanel.style.padding).toBe('16px 20px 8px');
  });

  test('chart-count shows correct snapshot count after restore', () => {
    var d = buildDomWithRestore({ existingEmptyMsg: true });
    runRenderChartLogic(TWO_POINTS, d.doc);
    expect(d.countEl.textContent).toBe('2 snapshots');
  });

  test('does not early-return on normal path', () => {
    var d = buildDomWithRestore({ existingEmptyMsg: true });
    var result = runRenderChartLogic(TWO_POINTS, d.doc);
    expect(result.earlyReturn).toBe(false);
  });
});

// ── Tests — clean normal path (first render with enough data) ─────────────────

describe('renderChart normal path — clean first render', () => {
  var POINTS = [
    { score: 50, at: '2026-06-01T10:00:00Z' },
    { score: 45, at: '2026-06-02T10:00:00Z' },
    { score: 40, at: '2026-06-03T10:00:00Z' },
  ];

  test('svg.style.display is "" (untouched)', () => {
    var d = buildDom();
    runRenderChartLogic(POINTS, d.doc);
    expect(d.svg.style.display).toBe('');
  });

  test('chart-count shows "3 snapshots"', () => {
    var d = buildDom();
    runRenderChartLogic(POINTS, d.doc);
    expect(d.countEl.textContent).toBe('3 snapshots');
  });

  test('no empty-state element created', () => {
    var d = buildDom();
    runRenderChartLogic(POINTS, d.doc);
    expect(d.chartPanel._children.length).toBe(0);
  });

  test('panel padding set to full value (restore runs unconditionally on normal path)', () => {
    var d = buildDom();
    runRenderChartLogic(POINTS, d.doc);
    expect(d.chartPanel.style.padding).toBe('16px 20px 8px');
  });

  test('does not early-return', () => {
    var d = buildDom();
    var result = runRenderChartLogic(POINTS, d.doc);
    expect(result.earlyReturn).toBe(false);
  });

  test('"1 snapshot" singular for exactly 1 — handled by sparse path, not here', () => {
    // Verify 2 points produces plural "snapshots"
    var d = buildDom();
    runRenderChartLogic(POINTS.slice(0, 2), d.doc);
    expect(d.countEl.textContent).toBe('2 snapshots');
  });
});

// ── Tests — HTML structure ────────────────────────────────────────────────────

describe('renderChart — HTML structure assertions', () => {
  const fs   = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '../../../frontend/dashboard.html'), 'utf8');

  test('history-chart-panel id exists on panel-body div', () => {
    expect(html).toContain('id="history-chart-panel"');
  });

  test('history-chart SVG is inside history-chart-panel', () => {
    const panelIdx = html.indexOf('id="history-chart-panel"');
    const svgIdx   = html.indexOf('id="history-chart"');
    expect(panelIdx).toBeGreaterThan(-1);
    expect(svgIdx).toBeGreaterThan(panelIdx);
  });

  test('sparse-state branch hides svg (style.display check present in source)', () => {
    expect(html).toContain("svg.style.display = 'none'");
  });

  test('normal-path restore resets svg display (source check)', () => {
    expect(html).toContain("svg.style.display = ''");
  });

  test('history-chart-empty guard prevents duplicates (source check)', () => {
    expect(html).toContain("!document.getElementById('history-chart-empty')");
  });

  test('empty-state text matches expected string', () => {
    expect(html).toContain('Not enough history to show a trend yet.');
  });
});
