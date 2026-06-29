'use strict';

// Tests for _archRepoRecommendationsHtml and _archRecommendationsHtml
// (verbatim copies from dashboard.html).
// Portfolio Architecture Refinement #15 (2026-06-28):
//   Replaced per-repo Priority #1/#2/#3 blocks with a single deduplicated
//   portfolio-level "Recommended Actions" list (max 5, ordered by impact).

// ── esc stub (matches dashboard implementation) ───────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── _archRecommendationsHtml (copied verbatim from dashboard.html) ─────────────
function _archRecommendationsHtml(recs) {
  if (!recs || !recs.length) return '';
  var html = '<div class="arch-sub-panel" style="margin-top:10px;">';
  html += '<div class="arch-sub-label">Recommended Actions</div>';
  html += '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px;">';
  recs.slice(0, 5).forEach(function(rec) {
    html += '<li class="arch-rec">' + esc(rec) + '</li>';
  });
  html += '</ul></div>';
  return html;
}

// ── _archRepoRecommendationsHtml (copied verbatim from dashboard.html) ────────
function _archRepoRecommendationsHtml(data) {
  var actions    = [];
  var dist       = data.distribution || {};
  var violations = Array.isArray(data.systemicBoundaryViolations) ? data.systemicBoundaryViolations : [];
  var integrity  = data.implementationIntegrity || null;
  var coupling   = data.portfolioCoupling       || null;
  var api        = data.apiIntegrationHealth    || null;

  // 1. Critical/high-risk repositories
  var riskyCount = dist.risky || 0;
  if (riskyCount > 0) {
    var repoW = riskyCount === 1 ? 'repository' : 'repositories';
    actions.push('Prioritize remediation for ' + riskyCount + ' critical ' + repoW + ' with Risky architecture health.');
  }

  // 2. Boundary violations
  if (violations.length > 0) {
    actions.push('Resolve ' + violations.length + ' boundary ' + (violations.length === 1 ? 'violation' : 'violations') + ' to reduce structural risk.');
  }

  // 3. Placeholder / scaffold implementations
  if (integrity && ((integrity.totalPlaceholderHints || 0) > 0 || (integrity.totalScaffoldLikeFiles || 0) > 0)) {
    actions.push('Replace placeholder implementations with production-ready code.');
  }

  // 4. Implementation completeness
  if (integrity && Number(integrity.averageCompletenessScore || 0) < 70) {
    actions.push('Increase portfolio implementation completeness above 70%.');
  }

  // 5. API integration gaps
  if (api) {
    var unresolved = api.totalUnresolvedFrontendCalls || 0;
    var il = (api.integrationLevel || '').toLowerCase();
    var apiWeak = il === 'weak' || il === 'risky' || il === 'critical' || il === 'none' || il === 'below_average';
    if (unresolved > 0) {
      actions.push('Link ' + unresolved + ' unresolved frontend ' + (unresolved === 1 ? 'call' : 'calls') + ' to backend route definitions.');
    } else if (apiWeak) {
      actions.push('Improve API integration coverage — frontend-to-backend route mappings are insufficient.');
    }
  }

  // 6. Coupling pressure
  if (coupling && ((coupling.totalCircularDependencies || 0) > 0 || Number(coupling.averageEdgesPerRepo || 0) >= 30)) {
    actions.push('Reduce dependency coupling by extracting shared interfaces or splitting high-coupling modules.');
  }

  if (!actions.length) return _archRecommendationsHtml(data.recommendations);

  var html = '<div class="arch-sub-panel" style="margin-top:10px;">';
  html += '<div class="arch-sub-label">Recommended Actions</div>';
  html += '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px;">';
  actions.slice(0, 5).forEach(function(action) {
    html += '<li class="arch-rec">' + esc(action) + '</li>';
  });
  html += '</ul></div>';
  return html;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('_archRepoRecommendationsHtml — section label', () => {
  test('renders "Recommended Actions" label', () => {
    const html = _archRepoRecommendationsHtml({ distribution: { risky: 1 } });
    expect(html).toContain('Recommended Actions');
  });

  test('does not render old "Recommendations" label', () => {
    const html = _archRepoRecommendationsHtml({ distribution: { risky: 1 } });
    expect(html).not.toContain('>Recommendations<');
  });
});

describe('_archRepoRecommendationsHtml — empty / no signals', () => {
  test('returns empty string when no signals and no fallback recs', () => {
    expect(_archRepoRecommendationsHtml({})).toBe('');
  });

  test('falls back to _archRecommendationsHtml when no signals but recs array present', () => {
    const html = _archRepoRecommendationsHtml({ recommendations: ['Do something.'] });
    expect(html).toContain('Do something.');
    expect(html).toContain('Recommended Actions');
  });

  test('returns empty string when recs array is empty and no signals', () => {
    expect(_archRepoRecommendationsHtml({ recommendations: [] })).toBe('');
  });
});

describe('_archRepoRecommendationsHtml — action 1: critical repositories', () => {
  test('includes critical repos action when dist.risky > 0', () => {
    const html = _archRepoRecommendationsHtml({ distribution: { risky: 3 } });
    expect(html).toContain('Prioritize remediation for 3 critical repositories');
  });

  test('uses singular "repository" when dist.risky = 1', () => {
    const html = _archRepoRecommendationsHtml({ distribution: { risky: 1 } });
    expect(html).toContain('1 critical repository with Risky architecture health.');
  });

  test('uses plural "repositories" when dist.risky > 1', () => {
    const html = _archRepoRecommendationsHtml({ distribution: { risky: 4 } });
    expect(html).toContain('4 critical repositories with Risky architecture health.');
  });

  test('no critical repos action when dist.risky = 0', () => {
    const html = _archRepoRecommendationsHtml({ distribution: { risky: 0 } });
    expect(html).not.toContain('Prioritize remediation');
  });

  test('no critical repos action when distribution absent', () => {
    expect(_archRepoRecommendationsHtml({})).not.toContain('Prioritize remediation');
  });
});

describe('_archRepoRecommendationsHtml — action 2: boundary violations', () => {
  test('includes boundary violations action when violations exist', () => {
    const html = _archRepoRecommendationsHtml({ systemicBoundaryViolations: [{ id: 1 }, { id: 2 }] });
    expect(html).toContain('Resolve 2 boundary violations to reduce structural risk.');
  });

  test('uses singular "violation" for one violation', () => {
    const html = _archRepoRecommendationsHtml({ systemicBoundaryViolations: [{ id: 1 }] });
    expect(html).toContain('Resolve 1 boundary violation to reduce structural risk.');
  });

  test('no violations action when array is empty', () => {
    const html = _archRepoRecommendationsHtml({ systemicBoundaryViolations: [] });
    expect(html).not.toContain('boundary violation');
  });
});

describe('_archRepoRecommendationsHtml — action 3: placeholder/scaffold', () => {
  test('includes placeholder action when totalPlaceholderHints > 0', () => {
    const html = _archRepoRecommendationsHtml({ implementationIntegrity: { totalPlaceholderHints: 3 } });
    expect(html).toContain('Replace placeholder implementations with production-ready code.');
  });

  test('includes placeholder action when totalScaffoldLikeFiles > 0', () => {
    const html = _archRepoRecommendationsHtml({ implementationIntegrity: { totalScaffoldLikeFiles: 1 } });
    expect(html).toContain('Replace placeholder implementations with production-ready code.');
  });

  test('no placeholder action when both are 0', () => {
    const html = _archRepoRecommendationsHtml({
      implementationIntegrity: { totalPlaceholderHints: 0, totalScaffoldLikeFiles: 0, averageCompletenessScore: 80 },
    });
    expect(html).not.toContain('Replace placeholder');
  });

  test('no placeholder action when implementationIntegrity absent', () => {
    expect(_archRepoRecommendationsHtml({})).not.toContain('Replace placeholder');
  });
});

describe('_archRepoRecommendationsHtml — action 4: implementation completeness', () => {
  test('includes completeness action when avgCompletenessScore < 70', () => {
    const html = _archRepoRecommendationsHtml({ implementationIntegrity: { averageCompletenessScore: 55 } });
    expect(html).toContain('Increase portfolio implementation completeness above 70%.');
  });

  test('no completeness action when avgCompletenessScore >= 70', () => {
    const html = _archRepoRecommendationsHtml({ implementationIntegrity: { averageCompletenessScore: 70 } });
    expect(html).not.toContain('Increase portfolio implementation completeness');
  });

  test('no completeness action when implementationIntegrity absent', () => {
    expect(_archRepoRecommendationsHtml({})).not.toContain('Increase portfolio implementation completeness');
  });
});

describe('_archRepoRecommendationsHtml — action 5: API integration gaps', () => {
  test('includes link action when unresolved calls > 0', () => {
    const html = _archRepoRecommendationsHtml({ apiIntegrationHealth: { totalUnresolvedFrontendCalls: 5 } });
    expect(html).toContain('Link 5 unresolved frontend calls to backend route definitions.');
  });

  test('uses singular "call" when unresolved = 1', () => {
    const html = _archRepoRecommendationsHtml({ apiIntegrationHealth: { totalUnresolvedFrontendCalls: 1 } });
    expect(html).toContain('Link 1 unresolved frontend call to backend route definitions.');
  });

  test('includes improve coverage action when integration level is weak', () => {
    const html = _archRepoRecommendationsHtml({ apiIntegrationHealth: { integrationLevel: 'weak', totalUnresolvedFrontendCalls: 0 } });
    expect(html).toContain('Improve API integration coverage');
  });

  test('includes improve coverage action when integration level is risky', () => {
    const html = _archRepoRecommendationsHtml({ apiIntegrationHealth: { integrationLevel: 'risky', totalUnresolvedFrontendCalls: 0 } });
    expect(html).toContain('Improve API integration coverage');
  });

  test('no API action when integration level is healthy and no unresolved calls', () => {
    const html = _archRepoRecommendationsHtml({ apiIntegrationHealth: { integrationLevel: 'healthy', totalUnresolvedFrontendCalls: 0 } });
    expect(html).not.toContain('frontend call');
    expect(html).not.toContain('API integration coverage');
  });

  test('no API action when apiIntegrationHealth absent', () => {
    expect(_archRepoRecommendationsHtml({})).not.toContain('frontend call');
  });
});

describe('_archRepoRecommendationsHtml — action 6: coupling pressure', () => {
  test('includes coupling action when totalCircularDependencies > 0', () => {
    const html = _archRepoRecommendationsHtml({ portfolioCoupling: { totalCircularDependencies: 2 } });
    expect(html).toContain('Reduce dependency coupling');
  });

  test('includes coupling action when avgEdgesPerRepo >= 30', () => {
    const html = _archRepoRecommendationsHtml({ portfolioCoupling: { averageEdgesPerRepo: 37.5 } });
    expect(html).toContain('Reduce dependency coupling');
  });

  test('no coupling action when portfolioCoupling absent', () => {
    expect(_archRepoRecommendationsHtml({})).not.toContain('Reduce dependency coupling');
  });

  test('no coupling action when all coupling metrics are low', () => {
    const html = _archRepoRecommendationsHtml({
      portfolioCoupling: { totalCircularDependencies: 0, averageEdgesPerRepo: 10 },
    });
    expect(html).not.toContain('Reduce dependency coupling');
  });
});

describe('_archRepoRecommendationsHtml — max 5 actions', () => {
  const allSignals = {
    distribution: { risky: 3 },
    systemicBoundaryViolations: [{ id: 1 }],
    implementationIntegrity: { totalPlaceholderHints: 2, averageCompletenessScore: 50 },
    apiIntegrationHealth: { totalUnresolvedFrontendCalls: 4 },
    portfolioCoupling: { totalCircularDependencies: 2 },
  };

  test('renders at most 5 action items even when all signals active', () => {
    const html = _archRepoRecommendationsHtml(allSignals);
    const items = (html.match(/class="arch-rec"/g) || []).length;
    expect(items).toBe(5);
  });

  test('coupling action is excluded when 5 higher-priority actions already fill the list', () => {
    const html = _archRepoRecommendationsHtml(allSignals);
    expect(html).not.toContain('Reduce dependency coupling');
  });

  test('critical repos action is always the first item', () => {
    const html = _archRepoRecommendationsHtml(allSignals);
    const critIdx    = html.indexOf('Prioritize remediation');
    const couplingIdx = html.indexOf('Reduce dependency coupling');
    expect(critIdx).toBeGreaterThan(-1);
    expect(couplingIdx).toBe(-1);
  });
});

describe('_archRepoRecommendationsHtml — old structure removed', () => {
  const data = {
    distribution: { risky: 2 },
    benchmarkedRepositories: [
      { repoName: 'org/repo-a', relativePosition: 'lagging', architectureHealthScore: 30 },
    ],
  };

  test('does not render Priority #1 header', () => {
    expect(_archRepoRecommendationsHtml(data)).not.toContain('Priority #1');
  });

  test('does not render Priority #2 header', () => {
    expect(_archRepoRecommendationsHtml(data)).not.toContain('Priority #2');
  });

  test('does not render DETECTED subsection', () => {
    expect(_archRepoRecommendationsHtml(data)).not.toContain('>Detected<');
  });

  test('does not render RECOMMENDED subsection heading', () => {
    expect(_archRepoRecommendationsHtml(data)).not.toContain('>Recommended<');
  });

  test('does not render repository name in output', () => {
    expect(_archRepoRecommendationsHtml(data)).not.toContain('org/repo-a');
  });
});

describe('_archRecommendationsHtml — fallback renderer', () => {
  test('returns empty string when recs is null', () => {
    expect(_archRecommendationsHtml(null)).toBe('');
  });

  test('returns empty string when recs is empty array', () => {
    expect(_archRecommendationsHtml([])).toBe('');
  });

  test('renders "Recommended Actions" label', () => {
    const html = _archRecommendationsHtml(['Fix the thing.']);
    expect(html).toContain('Recommended Actions');
  });

  test('renders supplied recommendation items', () => {
    const html = _archRecommendationsHtml(['Fix the thing.', 'Also this.']);
    expect(html).toContain('Fix the thing.');
    expect(html).toContain('Also this.');
  });

  test('caps output at 5 items', () => {
    const recs = ['a', 'b', 'c', 'd', 'e', 'f'];
    const html = _archRecommendationsHtml(recs);
    const items = (html.match(/class="arch-rec"/g) || []).length;
    expect(items).toBe(5);
  });

  test('does not render old "Recommendations" label', () => {
    const html = _archRecommendationsHtml(['Fix it.']);
    expect(html).not.toContain('>Recommendations<');
  });
});
