'use strict';

// Tests for _archRiskDriversHtml (verbatim copy from dashboard.html).
// Portfolio Architecture Refinement #13 (2026-06-28):
//   "Primary Risk Drivers" → "Portfolio Risk Summary", max 3 bullets,
//   priority reordered (P1 critical repos, P2 implementation, P3 API gaps,
//   fallback coupling/boundary), healthy-state bullets removed.

// ── esc stub (matches dashboard implementation) ───────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── _archRiskDriversHtml (copied verbatim from dashboard.html) ────────────────
function _archRiskDriversHtml(data) {
  var drivers = [];
  var dist = data.distribution || {};

  // P1: Critical repositories requiring remediation
  var riskyCount = dist.risky || 0;
  if (riskyCount > 0) {
    var repoWord = riskyCount === 1 ? 'repository' : 'repositories';
    drivers.push({ sev: 'high', text: riskyCount + ' critical ' + repoWord + ' requiring remediation' });
  }

  // P2: Implementation completeness issues
  var integrity = data.implementationIntegrity;
  if (integrity) {
    var scaffoldFiles    = integrity.totalScaffoldLikeFiles  || 0;
    var placeholderHints = integrity.totalPlaceholderHints   || 0;
    var avgCompleteness  = Number(integrity.averageCompletenessScore || 0);
    if (scaffoldFiles > 0 || placeholderHints > 0 || avgCompleteness < 70) {
      drivers.push({ sev: 'medium', text: 'Implementation integrity weaknesses detected' });
    }
  }

  // P3: API integration gaps
  var api = data.apiIntegrationHealth;
  if (api) {
    var unresolved = api.totalUnresolvedFrontendCalls || 0;
    var il = (api.integrationLevel || '').toLowerCase();
    var isWeak = il === 'weak' || il === 'risky' || il === 'critical' || il === 'none' || il === 'below_average';
    var isPartial = il === 'partial' || il === 'watch' || il === 'medium';
    if (unresolved > 0 || isWeak) {
      drivers.push({ sev: 'high', text: 'API integration gaps detected' });
    } else if (isPartial) {
      drivers.push({ sev: 'medium', text: 'API integration gaps detected' });
    }
  }

  // Fallback: Portfolio Coupling
  var coupling = data.portfolioCoupling;
  if (coupling) {
    var circDeps = coupling.totalCircularDependencies    || 0;
    var reposCyc = coupling.reposWithCircularDependencies || 0;
    var avgEdges = coupling.averageEdgesPerRepo != null ? Number(coupling.averageEdgesPerRepo) : 0;
    if (circDeps > 0 || reposCyc > 0 || avgEdges >= 30) {
      drivers.push({ sev: (circDeps > 0 || reposCyc > 0) ? 'high' : 'medium', text: 'Portfolio coupling pressure detected' });
    }
  }

  // Fallback: Boundary violations (only when violations exist)
  var violations = data.systemicBoundaryViolations;
  if (Array.isArray(violations) && violations.length > 0) {
    drivers.push({ sev: 'high', text: 'Boundary violations contributing to portfolio risk' });
  }

  if (!drivers.length) return '';

  var html = '<div style="margin-bottom:14px;padding:10px 12px;background:var(--bg-panel,var(--bg-card));border:1px solid var(--border);border-radius:6px;">';
  html += '<div style="font-size:0.67rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:8px;">Portfolio Risk Summary</div>';
  html += '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:5px;">';
  drivers.slice(0, 3).forEach(function(d) {
    var dotColor = d.sev === 'healthy' ? 'var(--sev-healthy-text)'
                 : d.sev === 'medium'  ? 'var(--sev-medium-text)'
                 : d.sev === 'high'    ? 'var(--sev-high-text)'
                 : 'var(--text-muted)';
    html += '<li style="display:flex;align-items:center;gap:8px;font-size:0.77rem;color:var(--text-primary);">';
    html += '<span style="width:7px;height:7px;border-radius:50%;background:' + dotColor + ';flex-shrink:0;"></span>';
    html += esc(d.text);
    html += '</li>';
  });
  html += '</ul></div>';
  return html;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('_archRiskDriversHtml — section label', () => {
  test('renders Portfolio Risk Summary label', () => {
    const html = _archRiskDriversHtml({ distribution: { risky: 1 } });
    expect(html).toContain('Portfolio Risk Summary');
  });

  test('does not render Primary Risk Drivers label', () => {
    const html = _archRiskDriversHtml({ distribution: { risky: 1 } });
    expect(html).not.toContain('Primary Risk Drivers');
  });
});

describe('_archRiskDriversHtml — empty state', () => {
  test('returns empty string when no signals are active', () => {
    expect(_archRiskDriversHtml({
      distribution: { risky: 0 },
      implementationIntegrity: { totalScaffoldLikeFiles: 0, totalPlaceholderHints: 0, averageCompletenessScore: 80 },
      apiIntegrationHealth: { integrationLevel: 'healthy', totalUnresolvedFrontendCalls: 0 },
      portfolioCoupling: { totalCircularDependencies: 0, reposWithCircularDependencies: 0, averageEdgesPerRepo: 5 },
      systemicBoundaryViolations: [],
    })).toBe('');
  });

  test('returns empty string when data fields absent', () => {
    expect(_archRiskDriversHtml({})).toBe('');
  });
});

describe('_archRiskDriversHtml — P1: critical repositories', () => {
  test('shows bullet when risky count > 0', () => {
    const html = _archRiskDriversHtml({ distribution: { risky: 3 } });
    expect(html).toContain('requiring remediation');
  });

  test('uses singular "repository" for count = 1', () => {
    const html = _archRiskDriversHtml({ distribution: { risky: 1 } });
    expect(html).toContain('1 critical repository requiring remediation');
  });

  test('uses plural "repositories" for count > 1', () => {
    const html = _archRiskDriversHtml({ distribution: { risky: 4 } });
    expect(html).toContain('4 critical repositories requiring remediation');
  });

  test('no bullet when risky = 0', () => {
    const html = _archRiskDriversHtml({ distribution: { risky: 0 } });
    expect(html).not.toContain('requiring remediation');
  });

  test('no bullet when distribution absent', () => {
    const html = _archRiskDriversHtml({});
    expect(html).not.toContain('requiring remediation');
  });
});

describe('_archRiskDriversHtml — P2: implementation integrity', () => {
  test('shows bullet when scaffold files > 0', () => {
    const html = _archRiskDriversHtml({ implementationIntegrity: { totalScaffoldLikeFiles: 2 } });
    expect(html).toContain('Implementation integrity weaknesses detected');
  });

  test('shows bullet when placeholder hints > 0', () => {
    const html = _archRiskDriversHtml({ implementationIntegrity: { totalPlaceholderHints: 1 } });
    expect(html).toContain('Implementation integrity weaknesses detected');
  });

  test('shows bullet when avg completeness < 70', () => {
    const html = _archRiskDriversHtml({ implementationIntegrity: { averageCompletenessScore: 60 } });
    expect(html).toContain('Implementation integrity weaknesses detected');
  });

  test('no bullet when implementation is healthy', () => {
    const html = _archRiskDriversHtml({
      implementationIntegrity: { totalScaffoldLikeFiles: 0, totalPlaceholderHints: 0, averageCompletenessScore: 80 },
    });
    expect(html).not.toContain('Implementation integrity weaknesses detected');
  });

  test('no bullet when implementationIntegrity absent', () => {
    const html = _archRiskDriversHtml({});
    expect(html).not.toContain('Implementation integrity weaknesses detected');
  });
});

describe('_archRiskDriversHtml — P3: API integration gaps', () => {
  test('shows bullet when unresolved calls > 0', () => {
    const html = _archRiskDriversHtml({ apiIntegrationHealth: { totalUnresolvedFrontendCalls: 3 } });
    expect(html).toContain('API integration gaps detected');
  });

  test('shows bullet when integration level is weak', () => {
    const html = _archRiskDriversHtml({ apiIntegrationHealth: { integrationLevel: 'weak' } });
    expect(html).toContain('API integration gaps detected');
  });

  test('shows bullet when integration level is risky', () => {
    const html = _archRiskDriversHtml({ apiIntegrationHealth: { integrationLevel: 'risky' } });
    expect(html).toContain('API integration gaps detected');
  });

  test('shows bullet when integration level is none', () => {
    const html = _archRiskDriversHtml({ apiIntegrationHealth: { integrationLevel: 'none' } });
    expect(html).toContain('API integration gaps detected');
  });

  test('shows bullet when integration level is partial', () => {
    const html = _archRiskDriversHtml({ apiIntegrationHealth: { integrationLevel: 'partial' } });
    expect(html).toContain('API integration gaps detected');
  });

  test('no bullet when apiIntegrationHealth absent', () => {
    const html = _archRiskDriversHtml({});
    expect(html).not.toContain('API integration gaps detected');
  });

  test('no bullet when integration level is healthy and no unresolved calls', () => {
    const html = _archRiskDriversHtml({
      apiIntegrationHealth: { integrationLevel: 'healthy', totalUnresolvedFrontendCalls: 0 },
    });
    expect(html).not.toContain('API integration gaps detected');
  });
});

describe('_archRiskDriversHtml — fallback: portfolio coupling', () => {
  test('shows coupling bullet when circular deps > 0', () => {
    const html = _archRiskDriversHtml({ portfolioCoupling: { totalCircularDependencies: 2 } });
    expect(html).toContain('Portfolio coupling pressure detected');
  });

  test('shows coupling bullet when reposWithCircularDependencies > 0', () => {
    const html = _archRiskDriversHtml({ portfolioCoupling: { reposWithCircularDependencies: 1 } });
    expect(html).toContain('Portfolio coupling pressure detected');
  });

  test('shows coupling bullet when avgEdges >= 30', () => {
    const html = _archRiskDriversHtml({ portfolioCoupling: { averageEdgesPerRepo: 30 } });
    expect(html).toContain('Portfolio coupling pressure detected');
  });

  test('no coupling bullet when portfolioCoupling absent', () => {
    const html = _archRiskDriversHtml({});
    expect(html).not.toContain('Portfolio coupling pressure detected');
  });

  test('no coupling bullet when all coupling metrics are low', () => {
    const html = _archRiskDriversHtml({
      portfolioCoupling: { totalCircularDependencies: 0, reposWithCircularDependencies: 0, averageEdgesPerRepo: 10 },
    });
    expect(html).not.toContain('Portfolio coupling pressure detected');
  });
});

describe('_archRiskDriversHtml — fallback: boundary violations', () => {
  test('shows boundary bullet when violations exist', () => {
    const html = _archRiskDriversHtml({ systemicBoundaryViolations: [{ id: 1 }] });
    expect(html).toContain('Boundary violations contributing to portfolio risk');
  });

  test('no boundary bullet when violations array is empty', () => {
    const html = _archRiskDriversHtml({ systemicBoundaryViolations: [] });
    expect(html).not.toContain('Boundary violations');
  });

  test('no boundary bullet when violations absent', () => {
    const html = _archRiskDriversHtml({});
    expect(html).not.toContain('Boundary violations');
  });

  test('does not render healthy-state boundary bullet', () => {
    const html = _archRiskDriversHtml({ distribution: { risky: 2 } });
    expect(html).not.toContain('No significant boundary violations detected');
  });
});

describe('_archRiskDriversHtml — max 3 bullets', () => {
  test('renders at most 3 bullets even when all signals active', () => {
    const html = _archRiskDriversHtml({
      distribution: { risky: 3 },
      implementationIntegrity: { totalScaffoldLikeFiles: 2 },
      apiIntegrationHealth: { integrationLevel: 'weak' },
      portfolioCoupling: { totalCircularDependencies: 2 },
      systemicBoundaryViolations: [{ id: 1 }],
    });
    const bullets = (html.match(/<li /g) || []).length;
    expect(bullets).toBe(3);
  });

  test('P1+P2+P3 fill all 3 slots — coupling and boundary excluded', () => {
    const html = _archRiskDriversHtml({
      distribution: { risky: 2 },
      implementationIntegrity: { totalScaffoldLikeFiles: 1 },
      apiIntegrationHealth: { integrationLevel: 'weak' },
      portfolioCoupling: { totalCircularDependencies: 1 },
      systemicBoundaryViolations: [{ id: 1 }],
    });
    expect(html).toContain('requiring remediation');
    expect(html).toContain('Implementation integrity');
    expect(html).toContain('API integration gaps');
    expect(html).not.toContain('Portfolio coupling pressure');
    expect(html).not.toContain('Boundary violations');
  });
});

describe('_archRiskDriversHtml — priority order', () => {
  test('P1 appears before P2 in HTML output', () => {
    const html = _archRiskDriversHtml({
      distribution: { risky: 2 },
      implementationIntegrity: { totalScaffoldLikeFiles: 1 },
    });
    const p1Idx = html.indexOf('requiring remediation');
    const p2Idx = html.indexOf('Implementation integrity');
    expect(p1Idx).toBeGreaterThan(-1);
    expect(p1Idx).toBeLessThan(p2Idx);
  });

  test('coupling appears after P1 when P2 and P3 are absent', () => {
    const html = _archRiskDriversHtml({
      distribution: { risky: 1 },
      portfolioCoupling: { totalCircularDependencies: 1 },
    });
    const p1Idx = html.indexOf('requiring remediation');
    const cIdx  = html.indexOf('Portfolio coupling pressure');
    expect(p1Idx).toBeGreaterThan(-1);
    expect(p1Idx).toBeLessThan(cIdx);
  });
});
