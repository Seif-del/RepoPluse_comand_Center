'use strict';

// ── Portfolio tab structure and _switchPortfolioTab tests ─────────────────────
//
// These tests verify:
//   1. Static HTML structure — correct elements, attributes, initial active state
//   2. _switchPortfolioTab — toggles active class on buttons and panels correctly
//
// Approach: structure tests parse the actual dashboard.html to assert markup;
// switcher tests drive _switchPortfolioTab (copied verbatim) via a minimal
// hand-rolled DOM mock — no jsdom dependency required.

const fs   = require('fs');
const path = require('path');

const DASHBOARD_PATH = path.join(__dirname, '../../../frontend/dashboard.html');
const html = fs.readFileSync(DASHBOARD_PATH, 'utf8');

// ── Static HTML structure tests ───────────────────────────────────────────────

describe('portfolio tab structure — HTML', () => {
  test('section-portfolio-tabs wrapper exists', () => {
    expect(html).toContain('id="section-portfolio-tabs"');
  });

  test('portfolio-tab-bar exists with role="tablist"', () => {
    expect(html).toContain('id="portfolio-tab-bar"');
    expect(html).toContain('role="tablist"');
  });

  test('exactly 4 portfolio tab buttons present', () => {
    const matches = html.match(/data-ptab=/g) || [];
    expect(matches.length).toBe(4);
  });

  test('tab button labels are correct', () => {
    expect(html).toContain('>Portfolio Architecture<');
    expect(html).toContain('>Portfolio Forecast<');
    expect(html).toContain('>Engineering Governance<');
    expect(html).toContain('>Architecture Watchlists<');
  });

  test('all four buttons have role="tab"', () => {
    const tabBarSection = html.slice(
      html.indexOf('id="portfolio-tab-bar"'),
      html.indexOf('</div>', html.indexOf('id="portfolio-tab-bar"')) + 6
    );
    const roleTabCount = (tabBarSection.match(/role="tab"/g) || []).length;
    expect(roleTabCount).toBe(4);
  });

  test('first button (Portfolio Architecture) has active class by default', () => {
    const architectureBtn = /class="repo-tab-btn active"[^>]*data-ptab="architecture"/.test(html)
      || /data-ptab="architecture"[^>]*class="repo-tab-btn active"/.test(html);
    expect(architectureBtn).toBe(true);
  });

  test('non-default tab buttons do not start with active class', () => {
    expect(html).toContain('data-ptab="forecast"');
    expect(html).toContain('data-ptab="governance"');
    expect(html).toContain('data-ptab="watchlists"');
    // None of the non-architecture buttons should be the active one at parse time
    expect(html).not.toMatch(/class="repo-tab-btn active"[^>]*data-ptab="forecast"/);
    expect(html).not.toMatch(/class="repo-tab-btn active"[^>]*data-ptab="governance"/);
    expect(html).not.toMatch(/class="repo-tab-btn active"[^>]*data-ptab="watchlists"/);
  });

  test('exactly 4 tab panels present (data-ppanel)', () => {
    const matches = html.match(/data-ppanel=/g) || [];
    expect(matches.length).toBe(4);
  });

  test('architecture panel has active class by default', () => {
    expect(html).toMatch(/class="repo-tab-panel active"[^>]*data-ppanel="architecture"/);
  });

  test('non-default panels do not have active class', () => {
    expect(html).not.toMatch(/class="repo-tab-panel active"[^>]*data-ppanel="forecast"/);
    expect(html).not.toMatch(/class="repo-tab-panel active"[^>]*data-ppanel="governance"/);
    expect(html).not.toMatch(/class="repo-tab-panel active"[^>]*data-ppanel="watchlists"/);
  });

  test('all four inner container IDs are preserved', () => {
    expect(html).toContain('id="portfolio-architecture-panel"');
    expect(html).toContain('id="portfolio-forecast"');
    expect(html).toContain('id="portfolio-governance-panel"');
    expect(html).toContain('id="portfolio-watchlists-panel"');
  });

  test('inner container IDs are nested inside their respective panels', () => {
    const archPanel  = html.indexOf('data-ppanel="architecture"');
    const archInner  = html.indexOf('id="portfolio-architecture-panel"');
    const fcPanel    = html.indexOf('data-ppanel="forecast"');
    const fcInner    = html.indexOf('id="portfolio-forecast"');
    const govPanel   = html.indexOf('data-ppanel="governance"');
    const govInner   = html.indexOf('id="portfolio-governance-panel"');
    const wlPanel    = html.indexOf('data-ppanel="watchlists"');
    const wlInner    = html.indexOf('id="portfolio-watchlists-panel"');

    expect(archInner).toBeGreaterThan(archPanel);
    expect(fcInner).toBeGreaterThan(fcPanel);
    expect(govInner).toBeGreaterThan(govPanel);
    expect(wlInner).toBeGreaterThan(wlPanel);
    // Each inner container comes before the next panel
    expect(archInner).toBeLessThan(fcPanel);
    expect(fcInner).toBeLessThan(govPanel);
    expect(govInner).toBeLessThan(wlPanel);
  });

  test('summary-cards div is above the portfolio tab wrapper', () => {
    const summaryCards = html.indexOf('id="summary-cards"');
    const portfolioTabs = html.indexOf('id="section-portfolio-tabs"');
    expect(summaryCards).toBeGreaterThan(-1);
    expect(portfolioTabs).toBeGreaterThan(-1);
    expect(summaryCards).toBeLessThan(portfolioTabs);
  });

  test('old separate section IDs are gone', () => {
    expect(html).not.toContain('id="section-portfolio-architecture"');
    expect(html).not.toContain('id="section-portfolio-forecast"');
    expect(html).not.toContain('id="section-portfolio-governance"');
    expect(html).not.toContain('id="section-portfolio-watchlists"');
  });
});

// ── _switchPortfolioTab — logic tests (minimal DOM mock) ─────────────────────
//
// The project runs Jest in node environment (no jsdom installed).
// We build a minimal mock that provides only what _switchPortfolioTab uses:
//   getElementById, querySelectorAll, classList.toggle, dataset.*

function makeClassList(initial) {
  var classes = new Set(initial || []);
  return {
    toggle: function(cls, force) {
      if (force === true)       classes.add(cls);
      else if (force === false) classes.delete(cls);
      else if (classes.has(cls)) classes.delete(cls);
      else                      classes.add(cls);
    },
    contains: function(cls) { return classes.has(cls); },
  };
}

function makeElement(id, dataKey, dataVal, initialClasses) {
  return {
    _id:      id,
    dataset:  Object.defineProperty({}, dataKey, { value: dataVal, enumerable: true }),
    classList: makeClassList(initialClasses || []),
    _children: [],
    querySelectorAll: function(sel) {
      // Only the selectors _switchPortfolioTab actually uses:
      // '.repo-tab-btn' and '.repo-tab-panel'
      var cls = sel.replace(/^\./, '');
      return this._children.filter(function(c) { return c.classList.contains(cls); });
    },
  };
}

function buildMockDom() {
  var btnArch = makeElement('btn-arch', 'ptab', 'architecture', ['repo-tab-btn', 'active']);
  var btnFc   = makeElement('btn-fc',   'ptab', 'forecast',     ['repo-tab-btn']);
  var btnGov  = makeElement('btn-gov',  'ptab', 'governance',   ['repo-tab-btn']);
  var btnWl   = makeElement('btn-wl',   'ptab', 'watchlists',   ['repo-tab-btn']);

  var panArch = makeElement('pan-arch', 'ppanel', 'architecture', ['repo-tab-panel', 'active']);
  var panFc   = makeElement('pan-fc',   'ppanel', 'forecast',     ['repo-tab-panel']);
  var panGov  = makeElement('pan-gov',  'ppanel', 'governance',   ['repo-tab-panel']);
  var panWl   = makeElement('pan-wl',   'ppanel', 'watchlists',   ['repo-tab-panel']);

  var bar = makeElement('portfolio-tab-bar', '_', '_', []);
  bar._children = [btnArch, btnFc, btnGov, btnWl];

  var section = makeElement('section-portfolio-tabs', '_', '_', []);
  section._children = [panArch, panFc, panGov, panWl];

  var registry = {
    'portfolio-tab-bar':    bar,
    'section-portfolio-tabs': section,
  };

  return {
    registry: registry,
    getElementById: function(id) { return registry[id] || null; },
    btn:  { architecture: btnArch, forecast: btnFc, governance: btnGov, watchlists: btnWl },
    pan:  { architecture: panArch, forecast: panFc, governance: panGov, watchlists: panWl },
  };
}

// Verbatim copy of _switchPortfolioTab from dashboard.html,
// with document injected as a parameter for testability.
function _switchPortfolioTab(tab, doc) {
  var bar = doc.getElementById('portfolio-tab-bar');
  if (!bar) return;
  Array.prototype.forEach.call(bar.querySelectorAll('.repo-tab-btn'), function(btn) {
    btn.classList.toggle('active', btn.dataset.ptab === tab);
  });
  var section = doc.getElementById('section-portfolio-tabs');
  if (!section) return;
  Array.prototype.forEach.call(section.querySelectorAll('.repo-tab-panel'), function(panel) {
    panel.classList.toggle('active', panel.dataset.ppanel === tab);
  });
}

describe('_switchPortfolioTab — button active class', () => {
  var dom;
  beforeEach(function() { dom = buildMockDom(); });

  test('switching to forecast activates forecast button', () => {
    _switchPortfolioTab('forecast', dom);
    expect(dom.btn.forecast.classList.contains('active')).toBe(true);
  });

  test('switching to forecast deactivates architecture button', () => {
    _switchPortfolioTab('forecast', dom);
    expect(dom.btn.architecture.classList.contains('active')).toBe(false);
  });

  test('switching to governance activates only governance button', () => {
    _switchPortfolioTab('governance', dom);
    expect(dom.btn.governance.classList.contains('active')).toBe(true);
    expect(dom.btn.architecture.classList.contains('active')).toBe(false);
    expect(dom.btn.forecast.classList.contains('active')).toBe(false);
    expect(dom.btn.watchlists.classList.contains('active')).toBe(false);
  });

  test('switching to watchlists activates only watchlists button', () => {
    _switchPortfolioTab('watchlists', dom);
    expect(dom.btn.watchlists.classList.contains('active')).toBe(true);
    expect(dom.btn.architecture.classList.contains('active')).toBe(false);
  });

  test('switching back to architecture re-activates it', () => {
    _switchPortfolioTab('forecast', dom);
    _switchPortfolioTab('architecture', dom);
    expect(dom.btn.architecture.classList.contains('active')).toBe(true);
    expect(dom.btn.forecast.classList.contains('active')).toBe(false);
  });

  test('exactly one button is active after any switch', () => {
    _switchPortfolioTab('governance', dom);
    var active = dom.registry['portfolio-tab-bar']._children
      .filter(function(b) { return b.classList.contains('active'); });
    expect(active.length).toBe(1);
  });
});

describe('_switchPortfolioTab — panel active class', () => {
  var dom;
  beforeEach(function() { dom = buildMockDom(); });

  test('switching to forecast shows forecast panel', () => {
    _switchPortfolioTab('forecast', dom);
    expect(dom.pan.forecast.classList.contains('active')).toBe(true);
  });

  test('switching to forecast hides architecture panel', () => {
    _switchPortfolioTab('forecast', dom);
    expect(dom.pan.architecture.classList.contains('active')).toBe(false);
  });

  test('switching to governance shows only governance panel', () => {
    _switchPortfolioTab('governance', dom);
    expect(dom.pan.governance.classList.contains('active')).toBe(true);
    expect(dom.pan.architecture.classList.contains('active')).toBe(false);
    expect(dom.pan.forecast.classList.contains('active')).toBe(false);
    expect(dom.pan.watchlists.classList.contains('active')).toBe(false);
  });

  test('exactly one panel is active after any switch', () => {
    _switchPortfolioTab('watchlists', dom);
    var active = dom.registry['section-portfolio-tabs']._children
      .filter(function(p) { return p.classList.contains('active'); });
    expect(active.length).toBe(1);
  });

  test('switching back to architecture re-shows architecture panel', () => {
    _switchPortfolioTab('watchlists', dom);
    _switchPortfolioTab('architecture', dom);
    expect(dom.pan.architecture.classList.contains('active')).toBe(true);
    expect(dom.pan.watchlists.classList.contains('active')).toBe(false);
  });
});

describe('_switchPortfolioTab — edge cases', () => {
  var dom;
  beforeEach(function() { dom = buildMockDom(); });

  test('unknown tab name does not crash', () => {
    expect(() => _switchPortfolioTab('nonexistent', dom)).not.toThrow();
  });

  test('unknown tab name leaves all buttons inactive', () => {
    _switchPortfolioTab('nonexistent', dom);
    var active = dom.registry['portfolio-tab-bar']._children
      .filter(function(b) { return b.classList.contains('active'); });
    expect(active.length).toBe(0);
  });

  test('calling with no tab argument does not crash', () => {
    expect(() => _switchPortfolioTab(undefined, dom)).not.toThrow();
  });

  test('missing portfolio-tab-bar returns early without error', () => {
    var emptyDoc = { getElementById: function() { return null; } };
    expect(() => _switchPortfolioTab('architecture', emptyDoc)).not.toThrow();
  });

  test('missing section-portfolio-tabs returns early without error', () => {
    var partialDom = {
      getElementById: function(id) {
        return id === 'portfolio-tab-bar' ? dom.registry['portfolio-tab-bar'] : null;
      },
    };
    expect(() => _switchPortfolioTab('architecture', partialDom)).not.toThrow();
  });
});
