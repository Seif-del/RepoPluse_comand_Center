'use strict';

// Tests for _archCouplingHtml (verbatim copy from dashboard.html).
// Portfolio Architecture Refinement #14 (2026-06-28):
//   Removed secondary coupling-level badge; healthMsg now explains the cause
//   (circular deps vs high dependency density vs generic).

// ── esc stub (matches dashboard implementation) ───────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── _archMetric (copied verbatim from dashboard.html) ─────────────────────────
function _archMetric(val, label) {
  return '<div class="arch-metric">'
    + '<div class="arch-metric-val">' + esc(String(val)) + '</div>'
    + '<div class="arch-metric-lbl">' + esc(label) + '</div>'
    + '</div>';
}

// ── _archCouplingHtml (copied verbatim from dashboard.html) ───────────────────
function _archCouplingHtml(coupling) {
  var html = '<div class="arch-sub-panel">';
  html += '<div class="arch-sub-label">Portfolio Coupling</div>';
  if (!coupling) {
    html += '<p style="font-size:0.79rem;color:var(--text-muted);font-style:italic;">No coupling data available.</p>';
    return html + '</div>';
  }

  // ── Health-first interpretation
  var circDeps  = coupling.totalCircularDependencies   || 0;
  var reposCyc  = coupling.reposWithCircularDependencies || 0;
  var avgEdges  = coupling.averageEdgesPerRepo != null ? Number(coupling.averageEdgesPerRepo) : 0;
  var cl = (coupling.couplingLevel || '').toLowerCase();
  var healthSev, healthLabel, healthMsg;
  if (cl === 'high' || cl === 'risky' || cl === 'critical') {
    healthSev   = 'high';
    healthLabel = 'Risky';
    healthMsg   = (circDeps > 0 || reposCyc > 0)
      ? 'Circular dependency cycles detected — high coupling risk.'
      : (avgEdges >= 30
          ? 'High dependency density detected — ' + avgEdges.toFixed(1) + ' average edges per repository.'
          : 'High coupling risk detected — review dependency structure.');
  } else if (cl === 'watch' || cl === 'medium' || cl === 'moderate') {
    healthSev   = 'medium';
    healthLabel = 'Watch';
    healthMsg   = (circDeps > 0 || reposCyc > 0)
      ? 'Circular dependency risk detected — coupling elevated.'
      : (avgEdges >= 30
          ? 'High dependency density detected — ' + avgEdges.toFixed(1) + ' average edges per repository.'
          : 'Portfolio coupling elevated — monitor dependency structure.');
  } else {
    healthSev   = 'healthy';
    healthLabel = 'Healthy';
    healthMsg   = 'No major portfolio coupling risks detected.';
  }
  html += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;flex-wrap:wrap;">';
  html += '<span style="font-size:0.70rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);">Coupling Health:</span>';
  html += '<span class="aq-badge severity-' + esc(healthSev) + '">' + esc(healthLabel) + '</span>';
  html += '<span style="font-size:0.72rem;color:var(--text-muted);">' + esc(healthMsg) + '</span>';
  html += '</div>';
  if (circDeps === 0) {
    html += '<div style="font-size:0.72rem;color:var(--sev-healthy-text);margin-bottom:6px;">No circular dependency cycles detected.</div>';
  }

  // ── Raw metrics
  html += '<div class="arch-metric-grid">';
  html += _archMetric(coupling.totalEdges || 0, 'Dep Edges');
  html += _archMetric(circDeps, 'Circular Deps');
  html += _archMetric(reposCyc, 'Repos w/ Cycles');
  if (coupling.averageEdgesPerRepo != null) {
    html += _archMetric(Number(coupling.averageEdgesPerRepo).toFixed(1), 'Avg Edges/Repo');
  }
  html += '</div>';
  return html + '</div>';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('_archCouplingHtml — no data', () => {
  test('renders "No coupling data available." when coupling is null', () => {
    expect(_archCouplingHtml(null)).toContain('No coupling data available.');
  });

  test('still renders Portfolio Coupling label when coupling is null', () => {
    expect(_archCouplingHtml(null)).toContain('Portfolio Coupling');
  });

  test('does not throw when coupling is null', () => {
    expect(() => _archCouplingHtml(null)).not.toThrow();
  });
});

describe('_archCouplingHtml — section label', () => {
  test('always renders "Portfolio Coupling" section label', () => {
    expect(_archCouplingHtml({ couplingLevel: 'watch' })).toContain('Portfolio Coupling');
  });
});

describe('_archCouplingHtml — Healthy state', () => {
  test('renders "Healthy" badge for healthy level', () => {
    const html = _archCouplingHtml({ couplingLevel: 'healthy' });
    expect(html).toContain('>Healthy<');
  });

  test('shows "No major portfolio coupling risks detected." for healthy level', () => {
    const html = _archCouplingHtml({ couplingLevel: 'healthy' });
    expect(html).toContain('No major portfolio coupling risks detected.');
  });

  test('does not render pf-badge class for healthy level', () => {
    const html = _archCouplingHtml({ couplingLevel: 'healthy' });
    expect(html).not.toContain('pf-badge');
  });
});

describe('_archCouplingHtml — Watch + circular deps', () => {
  test('renders "Watch" badge when watch + circDeps > 0', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', totalCircularDependencies: 2 });
    expect(html).toContain('>Watch<');
  });

  test('shows circular dependency risk message when watch + circDeps > 0', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', totalCircularDependencies: 2 });
    expect(html).toContain('Circular dependency risk detected — coupling elevated.');
  });

  test('shows circular dependency risk message when watch + reposCyc > 0', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', reposWithCircularDependencies: 1 });
    expect(html).toContain('Circular dependency risk detected — coupling elevated.');
  });
});

describe('_archCouplingHtml — Watch + high density', () => {
  test('renders "Watch" badge when watch + avgEdges >= 30', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 37.5 });
    expect(html).toContain('>Watch<');
  });

  test('shows "High dependency density detected" when watch + avgEdges >= 30', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 37.5 });
    expect(html).toContain('High dependency density detected');
  });

  test('includes the avgEdges value in message when watch + avgEdges >= 30', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 37.5 });
    expect(html).toContain('37.5 average edges per repository.');
  });

  test('avgEdges exactly 30 triggers density message', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 30 });
    expect(html).toContain('High dependency density detected');
  });
});

describe('_archCouplingHtml — Watch + low density, no circular deps', () => {
  test('shows generic monitor message when watch + avgEdges < 30 + no circDeps', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 10 });
    expect(html).toContain('Portfolio coupling elevated — monitor dependency structure.');
  });

  test('generic monitor message does not mention density', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 10 });
    expect(html).not.toContain('density');
  });
});

describe('_archCouplingHtml — Risky + circular deps', () => {
  test('renders "Risky" badge when risky + circDeps > 0', () => {
    const html = _archCouplingHtml({ couplingLevel: 'risky', totalCircularDependencies: 3 });
    expect(html).toContain('>Risky<');
  });

  test('shows "Circular dependency cycles detected — high coupling risk." when risky + circDeps > 0', () => {
    const html = _archCouplingHtml({ couplingLevel: 'risky', totalCircularDependencies: 3 });
    expect(html).toContain('Circular dependency cycles detected — high coupling risk.');
  });

  test('high level alias also shows circular dep message when circDeps > 0', () => {
    const html = _archCouplingHtml({ couplingLevel: 'high', totalCircularDependencies: 1 });
    expect(html).toContain('Circular dependency cycles detected — high coupling risk.');
  });
});

describe('_archCouplingHtml — Risky + high density', () => {
  test('shows "High dependency density detected" when risky + avgEdges >= 30 + no circDeps', () => {
    const html = _archCouplingHtml({ couplingLevel: 'risky', averageEdgesPerRepo: 45 });
    expect(html).toContain('High dependency density detected');
  });

  test('includes avgEdges value in message when risky + high density', () => {
    const html = _archCouplingHtml({ couplingLevel: 'risky', averageEdgesPerRepo: 45 });
    expect(html).toContain('45.0 average edges per repository.');
  });
});

describe('_archCouplingHtml — Risky + no specific cause', () => {
  test('shows generic risky message when risky + no circDeps + avgEdges < 30', () => {
    const html = _archCouplingHtml({ couplingLevel: 'risky', averageEdgesPerRepo: 10 });
    expect(html).toContain('High coupling risk detected — review dependency structure.');
  });
});

describe('_archCouplingHtml — no secondary coupling badge', () => {
  test('watch state does not render pf-badge class', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 37.5 });
    expect(html).not.toContain('pf-badge');
  });

  test('risky state does not render pf-badge class', () => {
    const html = _archCouplingHtml({ couplingLevel: 'risky', totalCircularDependencies: 2 });
    expect(html).not.toContain('pf-badge');
  });

  test('healthy state does not render pf-badge class', () => {
    const html = _archCouplingHtml({ couplingLevel: 'healthy' });
    expect(html).not.toContain('pf-badge');
  });
});

describe('_archCouplingHtml — zero circular deps indicator', () => {
  test('renders "No circular dependency cycles detected." when circDeps = 0', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 37.5 });
    expect(html).toContain('No circular dependency cycles detected.');
  });

  test('does not render "No circular dependency cycles detected." when circDeps > 0', () => {
    const html = _archCouplingHtml({ couplingLevel: 'risky', totalCircularDependencies: 2 });
    expect(html).not.toContain('No circular dependency cycles detected.');
  });
});

describe('_archCouplingHtml — raw metrics', () => {
  const base = {
    couplingLevel: 'watch',
    totalEdges: 412,
    totalCircularDependencies: 0,
    reposWithCircularDependencies: 0,
    averageEdgesPerRepo: 37.5,
  };

  test('renders "Dep Edges" metric label', () => {
    expect(_archCouplingHtml(base)).toContain('Dep Edges');
  });

  test('renders "Circular Deps" metric label', () => {
    expect(_archCouplingHtml(base)).toContain('Circular Deps');
  });

  test('renders "Repos w/ Cycles" metric label', () => {
    expect(_archCouplingHtml(base)).toContain('Repos w/ Cycles');
  });

  test('renders "Avg Edges/Repo" metric label when averageEdgesPerRepo present', () => {
    expect(_archCouplingHtml(base)).toContain('Avg Edges/Repo');
  });

  test('omits "Avg Edges/Repo" when averageEdgesPerRepo is null', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: null });
    expect(html).not.toContain('Avg Edges/Repo');
  });

  test('totalEdges value appears in output', () => {
    expect(_archCouplingHtml(base)).toContain('412');
  });
});

describe('_archCouplingHtml — avgEdges message formatting', () => {
  test('avgEdges = 37.5 formats to "37.5" in message', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 37.5 });
    expect(html).toContain('37.5 average edges per repository.');
  });

  test('avgEdges = 30 formats to "30.0" in message', () => {
    const html = _archCouplingHtml({ couplingLevel: 'watch', averageEdgesPerRepo: 30 });
    expect(html).toContain('30.0 average edges per repository.');
  });
});
