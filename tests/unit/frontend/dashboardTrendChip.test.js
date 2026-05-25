'use strict';

// Pure-logic unit tests for derivePredictiveTrend and trendChipHtml.
// These functions are embedded in frontend/dashboard.html but have no DOM
// dependency — logic is duplicated here verbatim so Jest (node env) can run
// them without a browser or jsdom.

// ── Minimal esc stub (matches dashboard implementation) ──────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── derivePredictiveTrend (copied verbatim from dashboard.html) ──────────────
function derivePredictiveTrend(repo, aq) {
  var traj    = (aq && aq.trajectory)     || (repo && repo.trajectory)     || null;
  var level   = (aq && aq.attentionLevel) || null;
  var reasons = (aq && aq.reasons)        || [];

  function hasReason(prefix) {
    for (var i = 0; i < reasons.length; i++) {
      if (reasons[i].indexOf(prefix) === 0) return true;
    }
    return false;
  }

  if (traj === 'escalating' || hasReason('Escalating operational trajectory'))
    return { label: 'Escalating', cls: 'severity-critical' };

  if (traj === 'deteriorating' || hasReason('Deteriorating operational trajectory'))
    return { label: 'Deteriorating', cls: 'severity-high' };

  var fc = (repo && repo.forecastLevel) || null;
  if (!fc) {
    if (hasReason('Critical forecast level'))    fc = 'critical';
    else if (hasReason('High forecast level'))   fc = 'high';
  }
  if (fc === 'critical') return { label: 'Forecast Crit', cls: 'severity-critical' };
  if (fc === 'high')     return { label: 'Forecast High', cls: 'severity-high' };

  var vol = (repo && repo.volatilityLevel) || null;
  if (!vol && (hasReason('Operational volatility elevated') || hasReason('Volatile operational trajectory')))
    vol = 'high';
  if (vol === 'high' || vol === 'critical') return { label: 'Volatile', cls: 'severity-medium' };

  if ((repo && repo.persistentRisk) || hasReason('Persistent operational risk'))
    return { label: 'Persistent', cls: 'severity-medium' };

  var pr = (repo && repo.prHealthStatus) || null;
  if (!pr) {
    if (hasReason('PR health critical'))         pr = 'critical';
    else if (hasReason('PR health at-risk'))     pr = 'at-risk';
  }
  if (pr === 'critical') return { label: 'PR Risk', cls: 'severity-critical' };
  if (pr === 'at-risk')  return { label: 'PR Risk', cls: 'severity-high' };

  if (traj === 'recovering' || traj === 'improving')
    return { label: 'Improving', cls: 'severity-healthy' };

  if (level && level !== 'healthy' && level !== 'low')
    return { label: 'Stable', cls: 'severity-neutral' };

  return null;
}

// ── trendChipHtml (copied verbatim from dashboard.html) ─────────────────────
function trendChipHtml(trend) {
  if (!trend) return '';
  return '<span class="trend-chip ' + trend.cls
    + '" title="Predictive trend: ' + esc(trend.label) + '">'
    + esc(trend.label) + '</span>';
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('derivePredictiveTrend', () => {
  // ── Priority 1: Escalating ────────────────────────────────────────────────
  test('returns Escalating when aq.trajectory is escalating', () => {
    const result = derivePredictiveTrend({}, { trajectory: 'escalating', attentionLevel: 'critical', reasons: [] });
    expect(result).toEqual({ label: 'Escalating', cls: 'severity-critical' });
  });

  test('returns Escalating when repo.trajectory is escalating and no aq', () => {
    const result = derivePredictiveTrend({ trajectory: 'escalating' }, null);
    expect(result).toEqual({ label: 'Escalating', cls: 'severity-critical' });
  });

  test('returns Escalating when reason prefix matches', () => {
    const aq = { trajectory: null, attentionLevel: 'high', reasons: ['Escalating operational trajectory (3 snapshots)'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Escalating', cls: 'severity-critical' });
  });

  // ── Priority 2: Deteriorating ─────────────────────────────────────────────
  test('returns Deteriorating when trajectory is deteriorating', () => {
    const aq = { trajectory: 'deteriorating', attentionLevel: 'high', reasons: [] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Deteriorating', cls: 'severity-high' });
  });

  test('returns Deteriorating from reason string fallback', () => {
    const aq = { trajectory: null, attentionLevel: 'high', reasons: ['Deteriorating operational trajectory'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Deteriorating', cls: 'severity-high' });
  });

  // Escalating outranks Deteriorating even when both signals exist
  test('Escalating outranks Deteriorating', () => {
    const aq = {
      trajectory: 'escalating',
      attentionLevel: 'critical',
      reasons: ['Escalating operational trajectory', 'Deteriorating operational trajectory'],
    };
    expect(derivePredictiveTrend({}, aq).label).toBe('Escalating');
  });

  // ── Priority 3: Forecast ──────────────────────────────────────────────────
  test('returns Forecast Crit from repo.forecastLevel critical', () => {
    const repo = { forecastLevel: 'critical' };
    const aq   = { trajectory: null, attentionLevel: 'high', reasons: [] };
    expect(derivePredictiveTrend(repo, aq)).toEqual({ label: 'Forecast Crit', cls: 'severity-critical' });
  });

  test('returns Forecast High from repo.forecastLevel high', () => {
    const repo = { forecastLevel: 'high' };
    const aq   = { trajectory: null, attentionLevel: 'high', reasons: [] };
    expect(derivePredictiveTrend(repo, aq)).toEqual({ label: 'Forecast High', cls: 'severity-high' });
  });

  test('returns Forecast Crit from reason fallback when repo.forecastLevel absent', () => {
    const aq = { trajectory: null, attentionLevel: 'high', reasons: ['Critical forecast level'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Forecast Crit', cls: 'severity-critical' });
  });

  test('returns Forecast High from reason fallback', () => {
    const aq = { trajectory: null, attentionLevel: 'medium', reasons: ['High forecast level'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Forecast High', cls: 'severity-high' });
  });

  // ── Priority 4: Volatile ──────────────────────────────────────────────────
  test('returns Volatile from repo.volatilityLevel high', () => {
    const repo = { volatilityLevel: 'high' };
    const aq   = { trajectory: null, attentionLevel: 'medium', reasons: [] };
    expect(derivePredictiveTrend(repo, aq)).toEqual({ label: 'Volatile', cls: 'severity-medium' });
  });

  test('returns Volatile from Operational volatility elevated reason', () => {
    const aq = { trajectory: null, attentionLevel: 'medium', reasons: ['Operational volatility elevated'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Volatile', cls: 'severity-medium' });
  });

  test('returns Volatile from Volatile operational trajectory reason (no traj field)', () => {
    const aq = { trajectory: null, attentionLevel: 'medium', reasons: ['Volatile operational trajectory'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Volatile', cls: 'severity-medium' });
  });

  // ── Priority 5: Persistent ────────────────────────────────────────────────
  test('returns Persistent from repo.persistentRisk true', () => {
    const repo = { persistentRisk: true };
    const aq   = { trajectory: null, attentionLevel: 'high', reasons: [] };
    expect(derivePredictiveTrend(repo, aq)).toEqual({ label: 'Persistent', cls: 'severity-medium' });
  });

  test('returns Persistent from reason fallback', () => {
    const aq = { trajectory: null, attentionLevel: 'high', reasons: ['Persistent operational risk'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Persistent', cls: 'severity-medium' });
  });

  // ── Priority 6: PR Risk ───────────────────────────────────────────────────
  test('returns PR Risk critical from repo.prHealthStatus critical', () => {
    const repo = { prHealthStatus: 'critical' };
    const aq   = { trajectory: null, attentionLevel: 'critical', reasons: [] };
    expect(derivePredictiveTrend(repo, aq)).toEqual({ label: 'PR Risk', cls: 'severity-critical' });
  });

  test('returns PR Risk high from repo.prHealthStatus at-risk', () => {
    const repo = { prHealthStatus: 'at-risk' };
    const aq   = { trajectory: null, attentionLevel: 'high', reasons: [] };
    expect(derivePredictiveTrend(repo, aq)).toEqual({ label: 'PR Risk', cls: 'severity-high' });
  });

  test('returns PR Risk critical from reason fallback', () => {
    const aq = { trajectory: null, attentionLevel: 'critical', reasons: ['PR health critical'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'PR Risk', cls: 'severity-critical' });
  });

  test('returns PR Risk high from PR health at-risk reason', () => {
    const aq = { trajectory: null, attentionLevel: 'high', reasons: ['PR health at-risk'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'PR Risk', cls: 'severity-high' });
  });

  // ── Priority 7: Improving ─────────────────────────────────────────────────
  test('returns Improving for recovering trajectory', () => {
    const aq = { trajectory: 'recovering', attentionLevel: 'medium', reasons: [] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Improving', cls: 'severity-healthy' });
  });

  test('returns Improving for improving trajectory on repo object', () => {
    expect(derivePredictiveTrend({ trajectory: 'improving' }, null)).toEqual({ label: 'Improving', cls: 'severity-healthy' });
  });

  // ── Priority 8: Stable ────────────────────────────────────────────────────
  test('returns Stable for medium-level repo with no specific signals', () => {
    const aq = { trajectory: null, attentionLevel: 'medium', reasons: ['No recent commits'] };
    const result = derivePredictiveTrend({}, aq);
    expect(result).toEqual({ label: 'Stable', cls: 'severity-neutral' });
  });

  test('returns Stable for high-level repo with only structural reasons', () => {
    const aq = { trajectory: null, attentionLevel: 'high', reasons: ['High bus-factor risk'] };
    expect(derivePredictiveTrend({}, aq)).toEqual({ label: 'Stable', cls: 'severity-neutral' });
  });

  // ── Priority 9: No chip ───────────────────────────────────────────────────
  test('returns null for healthy repo with no signals', () => {
    const aq = { trajectory: null, attentionLevel: 'healthy', reasons: [] };
    expect(derivePredictiveTrend({}, aq)).toBeNull();
  });

  test('returns null for low-level repo with structural-only reasons', () => {
    const aq = { trajectory: null, attentionLevel: 'low', reasons: ['No releases found'] };
    expect(derivePredictiveTrend({}, aq)).toBeNull();
  });

  test('returns null when both repo and aq are null', () => {
    expect(derivePredictiveTrend(null, null)).toBeNull();
  });

  test('returns null when aq is missing but repo has no signals', () => {
    expect(derivePredictiveTrend({ score: 10, label: 'healthy' }, null)).toBeNull();
  });

  // ── Escalating beats everything else ─────────────────────────────────────
  test('Escalating beats forecast critical', () => {
    const repo = { forecastLevel: 'critical' };
    const aq   = { trajectory: 'escalating', attentionLevel: 'critical', reasons: [] };
    expect(derivePredictiveTrend(repo, aq).label).toBe('Escalating');
  });

  test('Deteriorating beats Forecast High', () => {
    const repo = { forecastLevel: 'high' };
    const aq   = { trajectory: 'deteriorating', attentionLevel: 'high', reasons: [] };
    expect(derivePredictiveTrend(repo, aq).label).toBe('Deteriorating');
  });
});

describe('trendChipHtml', () => {
  test('returns empty string for null trend', () => {
    expect(trendChipHtml(null)).toBe('');
  });

  test('renders chip with correct class for severity-critical', () => {
    const html = trendChipHtml({ label: 'Escalating', cls: 'severity-critical' });
    expect(html).toContain('trend-chip severity-critical');
    expect(html).toContain('Escalating');
    expect(html).toContain('title="Predictive trend: Escalating"');
  });

  test('renders chip with correct class for severity-high', () => {
    const html = trendChipHtml({ label: 'Deteriorating', cls: 'severity-high' });
    expect(html).toContain('trend-chip severity-high');
    expect(html).toContain('Deteriorating');
  });

  test('renders chip for Stable with severity-neutral', () => {
    const html = trendChipHtml({ label: 'Stable', cls: 'severity-neutral' });
    expect(html).toContain('trend-chip severity-neutral');
    expect(html).toContain('Stable');
  });

  test('renders chip for Improving with severity-healthy', () => {
    const html = trendChipHtml({ label: 'Improving', cls: 'severity-healthy' });
    expect(html).toContain('trend-chip severity-healthy');
    expect(html).toContain('Improving');
  });

  test('escapes special characters in label', () => {
    const html = trendChipHtml({ label: 'A<B>', cls: 'severity-neutral' });
    expect(html).toContain('A&lt;B&gt;');
    expect(html).not.toContain('<B>');
  });

  test('chip is a span element', () => {
    const html = trendChipHtml({ label: 'Volatile', cls: 'severity-medium' });
    expect(html).toMatch(/^<span /);
    expect(html).toMatch(/<\/span>$/);
  });
});
