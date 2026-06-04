'use strict';

// Pure-logic unit tests for computeRepoPriority and buildRepoPriorityReasons.
// Both functions are embedded in frontend/dashboard.html but have no DOM
// dependency — logic is duplicated here verbatim so Jest (node env) can run
// these without a browser or jsdom.
//
// Both depend on derivePredictiveTrend, also copied verbatim.

// Minimal esc stub — no HTML escaping needed for unit tests.
function esc(s) { return String(s); }

// ── derivePredictiveTrend (copied verbatim from dashboard.html) ───────────────
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

// ── computeRepoPriority (copied verbatim from dashboard.html) ─────────────────
function computeRepoPriority(repo, aq, archData, fcData) {
  var archSev;
  if (archData !== undefined) {
    if (archData && archData.architectureHealthLevel) {
      var hl = archData.architectureHealthLevel;
      archSev = hl === 'risky'   ? 1.00
              : hl === 'weak'    ? 0.67
              : hl === 'watch'   ? 0.33
              : hl === 'healthy' ? 0.00
              :                    0.33;
    } else {
      archSev = 0.33;
    }
  } else {
    var s = repo ? repo.score : null;
    if (s == null)    { archSev = 0.33; }
    else if (s >= 70) { archSev = 1.00; }
    else if (s >= 45) { archSev = 0.67; }
    else if (s >= 20) { archSev = 0.33; }
    else              { archSev = 0;    }
  }

  var aqLevel = aq ? (aq.attentionLevel || 'unknown') : 'unknown';
  var govSev  = aqLevel === 'critical' ? 1.00
    : aqLevel === 'high'   ? 0.67
    : aqLevel === 'medium' ? 0.33
    : 0;

  var fcSev;
  if (fcData !== undefined) {
    if (fcData && fcData.forecastLevel && fcData.forecastLevel !== 'unknown') {
      var fl = fcData.forecastLevel;
      fcSev = fl === 'critical'                  ? 1.00
            : fl === 'high'                      ? 0.67
            : (fl === 'medium' || fl === 'watch') ? 0.33
            :                                      0.00;
    } else {
      fcSev = 0;
    }
  } else {
    var trend  = derivePredictiveTrend(repo, aq);
    var tLabel = trend ? (trend.label || '') : '';
    fcSev = (tLabel === 'Escalating' || tLabel === 'Forecast Crit') ? 1.00
      : (tLabel === 'Deteriorating' || tLabel === 'Forecast High') ? 0.67
      : (tLabel === 'Volatile' || tLabel === 'Persistent' || tLabel === 'PR Risk') ? 0.33
      : 0;
  }

  var wlSev;
  var wle = archData && archData.watchlistEscalationLevel;
  if (wle) {
    wlSev = wle === 'critical' ? 1.00
          : wle === 'urgent'   ? 0.67
          : wle === 'elevated' ? 0.33
          : wle === 'monitor'  ? 0.17
          :                      0;
  } else {
    wlSev = aqLevel === 'critical' ? 1.00
      : aqLevel === 'high'   ? 0.67
      : aqLevel === 'medium' ? 0.33
      : 0;
  }

  var repoLabel = repo ? (repo.label || '') : '';
  var opSev = repoLabel === 'critical'  ? 1.00
    : repoLabel === 'at-risk' ? 0.67
    : 0;

  var score = archSev * 0.50 + govSev * 0.20 + fcSev * 0.20 + wlSev * 0.05 + opSev * 0.05;

  if (score >= 0.50) return 'critical';
  if (score >= 0.25) return 'elevated';
  if (score >= 0.10) return 'watch';
  return 'healthy';
}

// ── buildRepoPriorityReasons (copied verbatim from dashboard.html) ────────────
function buildRepoPriorityReasons(repo, aq, archData, fcData) {
  var items = [];

  if (archData !== undefined) {
    if (archData && archData.architectureHealthLevel) {
      var hl = archData.architectureHealthLevel;
      if      (hl === 'risky')   items.push({ label: 'Architecture Risky',  cls: 'severity-critical' });
      else if (hl === 'weak')    items.push({ label: 'Architecture Weak',   cls: 'severity-high' });
      else if (hl === 'watch')   items.push({ label: 'Architecture Watch',  cls: 'severity-medium' });
      else if (hl === 'healthy') { /* healthy → no arch reason */ }
      else                       items.push({ label: 'Coverage Gap',         cls: 'severity-medium' }); // unknown
    } else {
      items.push({ label: 'Coverage Gap', cls: 'severity-medium' });
    }
  } else {
    var s = repo ? repo.score : null;
    if (s == null) {
      items.push({ label: 'Coverage Gap', cls: 'severity-medium' });
    } else if (s >= 70) {
      items.push({ label: 'Architecture Risky', cls: 'severity-critical' });
    } else if (s >= 45) {
      items.push({ label: 'Architecture Weak', cls: 'severity-high' });
    } else if (s >= 20) {
      items.push({ label: 'Architecture Watch', cls: 'severity-medium' });
    }
  }

  var aqLevel = aq ? (aq.attentionLevel || 'unknown') : 'unknown';
  if (aqLevel === 'critical') {
    items.push({ label: 'Governance Critical', cls: 'severity-critical' });
  } else if (aqLevel === 'high') {
    items.push({ label: 'Governance Elevated', cls: 'severity-high' });
  } else if (aqLevel === 'medium') {
    items.push({ label: 'Governance Moderate', cls: 'severity-medium' });
  }

  if (fcData !== undefined) {
    if (fcData && fcData.forecastLevel && fcData.forecastLevel !== 'unknown') {
      var fl = fcData.forecastLevel;
      if      (fl === 'critical')                  items.push({ label: 'Forecast Critical',  cls: 'severity-critical' });
      else if (fl === 'high')                      items.push({ label: 'Forecast Degrading', cls: 'severity-high' });
      else if (fl === 'medium' || fl === 'watch')  items.push({ label: 'Forecast Watch',     cls: 'severity-medium' });
    }
  } else {
    var fcTrend  = derivePredictiveTrend(repo, aq);
    var fcTLabel = fcTrend ? (fcTrend.label || '') : '';
    if (fcTLabel === 'Escalating' || fcTLabel === 'Forecast Crit') {
      items.push({ label: 'Forecast Critical', cls: 'severity-critical' });
    } else if (fcTLabel === 'Deteriorating' || fcTLabel === 'Forecast High') {
      items.push({ label: 'Forecast Degrading', cls: 'severity-high' });
    } else if (fcTLabel === 'Volatile' || fcTLabel === 'Persistent' || fcTLabel === 'PR Risk') {
      items.push({ label: 'Forecast Watch', cls: 'severity-medium' });
    }
  }

  if (archData && archData.watchlistEscalationLevel) {
    var wle2 = archData.watchlistEscalationLevel;
    if      (wle2 === 'critical') items.push({ label: 'Watchlist Critical', cls: 'severity-critical' });
    else if (wle2 === 'urgent')   items.push({ label: 'Watchlist Urgent',   cls: 'severity-high' });
    else if (wle2 === 'elevated') items.push({ label: 'Watchlist Elevated', cls: 'severity-medium' });
  }

  if (items.length === 0) {
    var repoLabel = repo ? (repo.label || '') : '';
    if (repoLabel === 'critical') {
      items.push({ label: 'Operational Critical', cls: 'severity-critical' });
    } else if (repoLabel === 'at-risk') {
      items.push({ label: 'Operational At-Risk', cls: 'severity-high' });
    }
  }

  if (items.length === 0) {
    items.push({ label: 'No Significant Issues', cls: 'severity-healthy' });
  }

  var visible  = items.slice(0, 3);
  var overflow = items.length - 3;
  return '<div class="tbl-reasons">'
    + visible.map(function(it) {
        return '<span class="reason-tag ' + it.cls + '" title="' + esc(it.label) + '">'
          + esc(it.label) + '</span>';
      }).join('')
    + (overflow > 0 ? '<span class="reason-tag-more">+' + overflow + '</span>' : '')
    + '</div>';
}

// ── Portfolio intelligence helpers (copied verbatim from dashboard.html) ─────
var _repoIntelligenceById   = {};
var _archDataByRepoId        = {};   // per-click architecture cache stub
var _archForecastDataByRepoId = {};  // per-click forecast cache stub

function _archLevelFromScore(score) {
  if (score == null) return null;
  if (score >= 85) return 'healthy';
  if (score >= 70) return 'watch';
  if (score >= 45) return 'weak';
  return 'risky';
}

function mergeRepoIntelligence(repoId, patch) {
  var id    = String(repoId);
  var entry = _repoIntelligenceById[id] || { repoId: id };
  var keys  = Object.keys(patch);
  for (var ki = 0; ki < keys.length; ki++) {
    var k = keys[ki];
    if (patch[k] != null) entry[k] = patch[k];
  }
  _repoIntelligenceById[id] = entry;
}

// ── _resolveOverviewArchData (copied verbatim from dashboard.html) ────────────
function _resolveOverviewArchData(repoId) {
  var intel        = _repoIntelligenceById[String(repoId)] || null;
  var perClickArch = _archDataByRepoId[repoId]             || null;

  var level = (intel && intel.architectureHealthLevel)
           || (intel && intel.architectureHealthScore != null ? _archLevelFromScore(intel.architectureHealthScore) : null)
           || (perClickArch && perClickArch.architectureHealthLevel && perClickArch.architectureHealthLevel !== 'unknown'
               ? perClickArch.architectureHealthLevel : null)
           || (perClickArch && perClickArch.architectureHealthScore != null ? _archLevelFromScore(perClickArch.architectureHealthScore) : null)
           || null;

  var score = (intel && intel.architectureHealthScore != null)            ? intel.architectureHealthScore
            : (perClickArch && perClickArch.architectureHealthScore != null) ? perClickArch.architectureHealthScore
            : null;

  var wle = intel ? (intel.watchlistEscalationLevel || null) : null;
  var wlr = intel ? (intel.watchlistReasons         || null) : null;

  if (!intel && !perClickArch) return null;

  return {
    architectureHealthLevel:  level,
    architectureHealthScore:  score,
    watchlistEscalationLevel: wle,
    watchlistReasons:         wlr,
  };
}

// ── _resolveOverviewFcData (copied verbatim from dashboard.html) ──────────────
function _resolveOverviewFcData(repoId) {
  var intel      = _repoIntelligenceById[String(repoId)] || null;
  var perClickFc = _archForecastDataByRepoId[repoId]     || null;

  var level = (intel && intel.forecastLevel && intel.forecastLevel !== 'unknown') ? intel.forecastLevel
            : (perClickFc && perClickFc.forecastLevel && perClickFc.forecastLevel !== 'unknown') ? perClickFc.forecastLevel
            : null;

  if (!level && !perClickFc) return null;

  return {
    forecastLevel:   level || null,
    degradationRisk: (perClickFc && perClickFc.degradationRisk) || 0,
    confidenceLevel: (perClickFc && perClickFc.confidenceLevel) || null,
    snapshotCount:   (perClickFc && perClickFc.snapshotCount)   || null,
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────
function noAq()   { return null; }
function aqOf(level, extras) { return Object.assign({ attentionLevel: level, attentionScore: 0, trajectory: null, reasons: [] }, extras || {}); }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeRepoPriority — architecture dimension (50%)', () => {
  test('score >= 70 → Critical (risky tier)', () => {
    // arch 1.00 * 0.50 = 0.50 → exactly at Critical threshold
    expect(computeRepoPriority({ score: 70 }, noAq())).toBe('critical');
  });

  test('score 80 → Critical', () => {
    expect(computeRepoPriority({ score: 80 }, noAq())).toBe('critical');
  });

  test('score 100 → Critical', () => {
    expect(computeRepoPriority({ score: 100 }, noAq())).toBe('critical');
  });

  test('score 45 → Elevated (weak tier, 0.67*0.50 = 0.335 > 0.25)', () => {
    expect(computeRepoPriority({ score: 45 }, noAq())).toBe('elevated');
  });

  test('score 60 → Elevated (weak tier)', () => {
    expect(computeRepoPriority({ score: 60 }, noAq())).toBe('elevated');
  });

  test('score 20 → Watch (watch tier, 0.33*0.50 = 0.165 > 0.10)', () => {
    expect(computeRepoPriority({ score: 20 }, noAq())).toBe('watch');
  });

  test('score 35 → Watch', () => {
    expect(computeRepoPriority({ score: 35 }, noAq())).toBe('watch');
  });

  test('score 10 → Healthy (< 20, healthy tier)', () => {
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, noAq())).toBe('healthy');
  });

  test('score 0 → Healthy', () => {
    expect(computeRepoPriority({ score: 0, label: 'healthy' }, noAq())).toBe('healthy');
  });

  test('score null → Watch (insufficient architecture history)', () => {
    expect(computeRepoPriority({ score: null }, noAq())).toBe('watch');
  });

  test('score undefined → Watch (insufficient architecture history)', () => {
    expect(computeRepoPriority({}, noAq())).toBe('watch');
  });

  test('null repo → Watch (insufficient history; no crash)', () => {
    expect(() => computeRepoPriority(null, noAq())).not.toThrow();
    expect(computeRepoPriority(null, noAq())).toBe('watch');
  });
});

describe('computeRepoPriority — governance/attention dimension (20%)', () => {
  // Architecture healthy (score < 20), only governance+watchlist contribute.
  test('aq=critical, score=10 → Elevated (gov 1.0*0.20 + wl 1.0*0.05 = 0.25 → exactly Elevated threshold)', () => {
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, aqOf('critical'))).toBe('elevated');
  });

  test('aq=high, score=10 → Watch (gov 0.67*0.20 + wl 0.67*0.05 = 0.134+0.034 = 0.168 < 0.25)', () => {
    // 0.134 + 0.0335 = 0.1675 → Watch (below Elevated threshold)
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, aqOf('high'))).toBe('watch');
  });

  test('aq=medium, score=10 → Healthy (gov 0.33*0.20 + wl 0.33*0.05 = 0.066+0.017 = 0.083 < 0.10)', () => {
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, aqOf('medium'))).toBe('healthy');
  });

  test('aq=low, score=10 → Healthy', () => {
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, aqOf('low'))).toBe('healthy');
  });

  test('aq=healthy, score=10 → Healthy', () => {
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, aqOf('healthy'))).toBe('healthy');
  });

  test('null aq, score=10 → Healthy', () => {
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, null)).toBe('healthy');
  });
});

describe('computeRepoPriority — forecast dimension (20%)', () => {
  const mediumAq = aqOf('medium', { trajectory: null, reasons: [] });

  test('Escalating trend → pushes score up (escalating = 1.0 * 0.20)', () => {
    const escalatingAq = aqOf('medium', { trajectory: 'escalating', reasons: [] });
    // score=10: arch=0, gov=0.33*0.20=0.066, fc=1.0*0.20=0.20, wl=0.33*0.05=0.0165 → total 0.2825 → Elevated
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, escalatingAq)).toBe('elevated');
  });

  test('Deteriorating trend → elevated tier (0.67 * 0.20)', () => {
    const detAq = aqOf('medium', { trajectory: 'deteriorating', reasons: [] });
    // arch=0, gov=0.0825, fc=0.134, wl=0.033 → 0.249 → Watch (just under Elevated)
    const result = computeRepoPriority({ score: 10, label: 'healthy' }, detAq);
    expect(['watch', 'elevated']).toContain(result);
  });

  test('Volatile trend → watch tier (0.33 * 0.20)', () => {
    const volAq = aqOf('low', { trajectory: 'volatile', reasons: ['Volatile operational trajectory'] });
    // arch=0.33*0.50=0.165 (null score → watch tier), gov=0, fc=0.33*0.20=0.066, wl=0 → total 0.231 → Watch
    expect(computeRepoPriority({ score: null }, volAq)).toBe('watch');
  });

  test('No trend → no forecast contribution', () => {
    // score=10, no aq → Healthy
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, aqOf('low', { trajectory: null, reasons: [] }))).toBe('healthy');
  });
});

describe('computeRepoPriority — combined signal escalation', () => {
  test('arch risky + aq=critical → Critical (well above threshold)', () => {
    // arch=1.0*0.50=0.50, gov=1.0*0.20=0.20, wl=1.0*0.05=0.05 → 0.75
    expect(computeRepoPriority({ score: 75 }, aqOf('critical'))).toBe('critical');
  });

  test('arch elevated + aq=critical → Critical (0.335+0.20+0.05=0.585)', () => {
    expect(computeRepoPriority({ score: 50 }, aqOf('critical'))).toBe('critical');
  });

  test('arch elevated + aq=high → Critical (0.335+0.134+0.034=0.503 ≥ 0.50)', () => {
    expect(computeRepoPriority({ score: 50 }, aqOf('high'))).toBe('critical');
  });

  test('arch watch + aq=critical → Elevated (0.165+0.20+0.05=0.415 < 0.50)', () => {
    // 0.33*0.50 + 1.0*0.20 + 1.0*0.05 = 0.165+0.20+0.05 = 0.415 → Elevated (below new Critical threshold)
    expect(computeRepoPriority({ score: 30 }, aqOf('critical'))).toBe('elevated');
  });

  test('arch watch + aq=high → Elevated (0.165+0.134+0.034=0.333)', () => {
    expect(computeRepoPriority({ score: 30 }, aqOf('high'))).toBe('elevated');
  });

  test('arch watch + aq=medium → Watch (0.165+0.066+0.017=0.248 < 0.25)', () => {
    // 0.33*0.50=0.165, 0.33*0.20=0.066, 0.33*0.05=0.0165 → 0.2475 → Watch (< 0.25)
    expect(computeRepoPriority({ score: 30 }, aqOf('medium'))).toBe('watch');
  });

  test('arch healthy + aq=healthy, label=healthy → Healthy', () => {
    expect(computeRepoPriority({ score: 5, label: 'healthy' }, aqOf('healthy'))).toBe('healthy');
  });

  test('arch risky + aq=critical + escalating trend → Critical', () => {
    const aq = aqOf('critical', { trajectory: 'escalating', reasons: [] });
    expect(computeRepoPriority({ score: 75 }, aq)).toBe('critical');
  });
});

describe('computeRepoPriority — operational risk dimension (5%)', () => {
  test('label=critical contributes 0.05 to score', () => {
    // score=10 (arch=0), no aq, label=critical: op=1.0*0.05=0.05 < 0.10 → Healthy
    expect(computeRepoPriority({ score: 10, label: 'critical' }, noAq())).toBe('healthy');
  });

  test('label=at-risk + score=null → Watch (arch 0.132 + op 0.034 = 0.166)', () => {
    expect(computeRepoPriority({ score: null, label: 'at-risk' }, noAq())).toBe('watch');
  });

  test('label=at-risk + aq=critical → Elevated (0+0.20+0+0.05+0.034=0.284)', () => {
    // score=10: arch=0, gov=1.0*0.20=0.20, fc=0, wl=1.0*0.05=0.05, op=0.67*0.05=0.0335 → 0.2835 → Elevated
    const result = computeRepoPriority({ score: 10, label: 'at-risk' }, aqOf('critical'));
    expect(result).toBe('elevated');
  });
});

describe('computeRepoPriority — architecture null / insufficient history', () => {
  test('null score alone → Watch (insufficient architecture history)', () => {
    expect(computeRepoPriority({ score: null, label: 'healthy' }, noAq())).toBe('watch');
  });

  test('null repo → Watch (no crash)', () => {
    expect(computeRepoPriority(null, null)).toBe('watch');
  });

  test('null score + null aq → Watch', () => {
    expect(computeRepoPriority({ score: null }, null)).toBe('watch');
  });

  test('null score + aq=low → Watch (arch 0.132 dominates)', () => {
    expect(computeRepoPriority({ score: null }, aqOf('low'))).toBe('watch');
  });

  test('null score + aq=critical → Elevated (0.165+0.20+0.05=0.415 < 0.50)', () => {
    // Insufficient arch history: 0.33*0.50=0.165; gov=0.20; wl=0.05 → 0.415 → Elevated (not Critical)
    expect(computeRepoPriority({ score: null }, aqOf('critical'))).toBe('elevated');
  });
});

describe('computeRepoPriority — sort ordering (Priority severity first)', () => {
  // Verify the implied sort order of priority values
  const PRIORITY_ORDER = { critical: 0, elevated: 1, watch: 2, healthy: 3 };

  test('critical sorts before elevated', () => {
    expect(PRIORITY_ORDER['critical']).toBeLessThan(PRIORITY_ORDER['elevated']);
  });
  test('elevated sorts before watch', () => {
    expect(PRIORITY_ORDER['elevated']).toBeLessThan(PRIORITY_ORDER['watch']);
  });
  test('watch sorts before healthy', () => {
    expect(PRIORITY_ORDER['watch']).toBeLessThan(PRIORITY_ORDER['healthy']);
  });

  test('3 repos sort by priority then score', () => {
    const repos = [
      { score: 50, label: 'at-risk' },  // score 50 >= 45 → arch elevated tier (0.67*0.50=0.335) → elevated
      { score: 75, label: 'critical' }, // score 75 >= 70 → arch risky tier (1.0*0.50=0.50) → critical
      { score: 10, label: 'healthy' },  // score 10 < 20 → arch healthy tier (0) → healthy
    ];
    const withPri = repos.map(function(r) {
      return { r: r, pri: computeRepoPriority(r, null) };
    });
    withPri.sort(function(a, b) {
      var pd = (PRIORITY_ORDER[a.pri] != null ? PRIORITY_ORDER[a.pri] : 3)
             - (PRIORITY_ORDER[b.pri] != null ? PRIORITY_ORDER[b.pri] : 3);
      if (pd !== 0) return pd;
      return (b.r.score != null ? b.r.score : 0) - (a.r.score != null ? a.r.score : 0);
    });
    expect(withPri[0].pri).toBe('critical');
    expect(withPri[1].pri).toBe('elevated');
    expect(withPri[2].pri).toBe('healthy');
  });

  test('same priority level sorted by score descending', () => {
    const repos = [
      { score: 30, label: 'healthy' }, // watch (score 30)
      { score: 40, label: 'healthy' }, // watch (score 40)
    ];
    const withPri = repos.map(function(r) {
      return { r: r, pri: computeRepoPriority(r, null) };
    });
    withPri.sort(function(a, b) {
      var pd = (PRIORITY_ORDER[a.pri] != null ? PRIORITY_ORDER[a.pri] : 3)
             - (PRIORITY_ORDER[b.pri] != null ? PRIORITY_ORDER[b.pri] : 3);
      if (pd !== 0) return pd;
      return (b.r.score != null ? b.r.score : 0) - (a.r.score != null ? a.r.score : 0);
    });
    // Same priority (watch), score 40 should come first
    expect(withPri[0].r.score).toBe(40);
    expect(withPri[1].r.score).toBe(30);
  });
});

describe('computeRepoPriority — recalibrated weighting (50/20/20/5/5)', () => {
  test('architecture critical alone forces Critical (1.0*0.50=0.50 ≥ threshold)', () => {
    // Only arch signal; no gov/watchlist/forecast/op.
    expect(computeRepoPriority({ score: 70 }, noAq())).toBe('critical');
  });

  test('governance critical alone does not force Critical (gov+wl max = 0.20+0.05=0.25 → Elevated)', () => {
    // score < 20 → archSev=0; aq=critical: govSev=0.20, wlSev=0.05 → total 0.25 → Elevated only
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, aqOf('critical'))).toBe('elevated');
  });

  test('forecast critical alone does not force Critical or Elevated (fc=1.0*0.20=0.20 → Watch)', () => {
    // score=10 (arch=0); aq attentionLevel=healthy → gov=0, wl=0; trajectory escalating → fc=0.20
    const escalatingHealthyAq = aqOf('healthy', { trajectory: 'escalating', reasons: [] });
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, escalatingHealthyAq)).toBe('watch');
  });

  test('architecture weak (0.67) outranks low operational noise alone', () => {
    // arch elevated: 0.67*0.50=0.335 → Elevated
    expect(computeRepoPriority({ score: 50 }, noAq())).toBe('elevated');
    // op only (label=at-risk, score < 20): 0.67*0.05=0.034 → Healthy
    expect(computeRepoPriority({ score: 10, label: 'at-risk' }, noAq())).toBe('healthy');
  });

  test('watchlist-only high (aq=high, score < 20) does not reach Elevated → Watch', () => {
    // gov=0.67*0.20=0.134, wl=0.67*0.05=0.034, total=0.168 → Watch
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, aqOf('high'))).toBe('watch');
  });

  test('watchlist-only medium (aq=medium, score < 20) stays Healthy', () => {
    // gov=0.33*0.20=0.066, wl=0.33*0.05=0.017, total=0.083 → Healthy (< 0.10)
    expect(computeRepoPriority({ score: 10, label: 'healthy' }, aqOf('medium'))).toBe('healthy');
  });

  test('null architecture alone maps to Watch, not Critical', () => {
    // Insufficient history: archSev=0.33 → 0.33*0.50=0.165 → Watch
    expect(computeRepoPriority({ score: null }, noAq())).toBe('watch');
  });

  test('null architecture + aq=critical stays Elevated (not Critical)', () => {
    // arch=0.165 + gov=0.20 + wl=0.05 = 0.415 → Elevated (below 0.50 Critical threshold)
    expect(computeRepoPriority({ score: null }, aqOf('critical'))).toBe('elevated');
  });
});

// ── buildRepoPriorityReasons ──────────────────────────────────────────────────

describe('buildRepoPriorityReasons — architecture dimension', () => {
  test('score >= 70 → "Architecture Risky" (severity-critical)', () => {
    const out = buildRepoPriorityReasons({ score: 70 }, noAq());
    expect(out).toContain('Architecture Risky');
    expect(out).toContain('severity-critical');
  });

  test('score 50 → "Architecture Weak" (severity-high)', () => {
    const out = buildRepoPriorityReasons({ score: 50 }, noAq());
    expect(out).toContain('Architecture Weak');
    expect(out).toContain('severity-high');
  });

  test('score 30 → "Architecture Watch" (severity-medium)', () => {
    const out = buildRepoPriorityReasons({ score: 30 }, noAq());
    expect(out).toContain('Architecture Watch');
    expect(out).toContain('severity-medium');
  });

  test('score 10 (healthy) → "No Significant Issues" (severity-healthy)', () => {
    const out = buildRepoPriorityReasons({ score: 10, label: 'healthy' }, noAq());
    expect(out).toContain('No Significant Issues');
    expect(out).toContain('severity-healthy');
  });

  test('score null → "Coverage Gap" instead of generic operational reasons', () => {
    const out = buildRepoPriorityReasons({ score: null }, noAq());
    expect(out).toContain('Coverage Gap');
    expect(out).not.toContain('Architecture Risky');
  });

  test('null repo → "Coverage Gap" (no crash)', () => {
    expect(() => buildRepoPriorityReasons(null, noAq())).not.toThrow();
    const out = buildRepoPriorityReasons(null, noAq());
    expect(out).toContain('Coverage Gap');
  });
});

describe('buildRepoPriorityReasons — governance dimension', () => {
  test('aq=critical, healthy arch → "Governance Critical"', () => {
    const out = buildRepoPriorityReasons({ score: 10, label: 'healthy' }, aqOf('critical'));
    expect(out).toContain('Governance Critical');
    expect(out).toContain('severity-critical');
  });

  test('aq=high → "Governance Elevated"', () => {
    const out = buildRepoPriorityReasons({ score: 10, label: 'healthy' }, aqOf('high'));
    expect(out).toContain('Governance Elevated');
    expect(out).toContain('severity-high');
  });

  test('aq=medium → "Governance Moderate"', () => {
    const out = buildRepoPriorityReasons({ score: 10, label: 'healthy' }, aqOf('medium'));
    expect(out).toContain('Governance Moderate');
    expect(out).toContain('severity-medium');
  });

  test('aq=low → no governance reason → "No Significant Issues"', () => {
    const out = buildRepoPriorityReasons({ score: 10, label: 'healthy' }, aqOf('low'));
    expect(out).not.toContain('Governance');
    expect(out).toContain('No Significant Issues');
  });
});

describe('buildRepoPriorityReasons — forecast dimension', () => {
  test('escalating trajectory → "Forecast Critical"', () => {
    const out = buildRepoPriorityReasons({ score: 10 }, aqOf('low', { trajectory: 'escalating', reasons: [] }));
    expect(out).toContain('Forecast Critical');
    expect(out).toContain('severity-critical');
  });

  test('deteriorating trajectory → "Forecast Degrading"', () => {
    const out = buildRepoPriorityReasons({ score: 10 }, aqOf('low', { trajectory: 'deteriorating', reasons: [] }));
    expect(out).toContain('Forecast Degrading');
    expect(out).toContain('severity-high');
  });

  test('volatile trajectory → "Forecast Watch"', () => {
    const out = buildRepoPriorityReasons({ score: 10 }, aqOf('low', { trajectory: 'volatile', reasons: ['Volatile operational trajectory'] }));
    expect(out).toContain('Forecast Watch');
    expect(out).toContain('severity-medium');
  });

  test('Critical forecast level reason → "Forecast Critical"', () => {
    const out = buildRepoPriorityReasons({ score: 10 }, aqOf('low', { trajectory: null, reasons: ['Critical forecast level detected'] }));
    expect(out).toContain('Forecast Critical');
  });
});

describe('buildRepoPriorityReasons — priority ordering', () => {
  test('arch risky + gov critical + escalating → all three reasons present', () => {
    const aq = aqOf('critical', { trajectory: 'escalating', reasons: [] });
    const out = buildRepoPriorityReasons({ score: 75 }, aq);
    expect(out).toContain('Architecture Risky');
    expect(out).toContain('Governance Critical');
    expect(out).toContain('Forecast Critical');
  });

  test('architecture reason appears before governance in output', () => {
    const out = buildRepoPriorityReasons({ score: 50 }, aqOf('critical'));
    const archIdx = out.indexOf('Architecture Weak');
    const govIdx  = out.indexOf('Governance Critical');
    expect(archIdx).toBeGreaterThanOrEqual(0);
    expect(govIdx).toBeGreaterThanOrEqual(0);
    expect(archIdx).toBeLessThan(govIdx);
  });

  test('max 3 reasons shown — overflow suppressed via +N badge', () => {
    // arch + gov + forecast = 3 items → no overflow badge (exactly at limit)
    const aq = aqOf('critical', { trajectory: 'escalating', reasons: [] });
    const out = buildRepoPriorityReasons({ score: 75 }, aq);
    expect(out).not.toContain('reason-tag-more');
  });
});

describe('buildRepoPriorityReasons — operational fallback rules', () => {
  test('operational label=critical shown only when no arch/gov/forecast signal', () => {
    // score < 20 → no arch; no aq; no trend → only op signal
    const out = buildRepoPriorityReasons({ score: 10, label: 'critical' }, noAq());
    expect(out).toContain('Operational Critical');
  });

  test('operational label=at-risk shown when no other signals', () => {
    const out = buildRepoPriorityReasons({ score: 10, label: 'at-risk' }, noAq());
    expect(out).toContain('Operational At-Risk');
  });

  test('operational label suppressed when arch signal exists', () => {
    // arch risky + op critical → op should NOT appear
    const out = buildRepoPriorityReasons({ score: 75, label: 'critical' }, noAq());
    expect(out).toContain('Architecture Risky');
    expect(out).not.toContain('Operational Critical');
  });

  test('operational label suppressed when governance signal exists', () => {
    // healthy arch + aq=critical → governance shown, op NOT shown
    const out = buildRepoPriorityReasons({ score: 10, label: 'critical' }, aqOf('critical'));
    expect(out).toContain('Governance Critical');
    expect(out).not.toContain('Operational Critical');
  });

  test('null score + no aq + no label → "Coverage Gap" (not operational fallback)', () => {
    const out = buildRepoPriorityReasons({ score: null, label: 'healthy' }, noAq());
    expect(out).toContain('Coverage Gap');
    expect(out).not.toContain('Operational');
    expect(out).not.toContain('No Significant Issues');
  });
});

// ── computeRepoPriority — real architecture data (archData / fcData) ──────────

describe('computeRepoPriority — archData parameter (real architecture intelligence)', () => {
  test('archData=null → Coverage Gap tier (0.33*0.50=0.165) → Watch, not Healthy', () => {
    // repo.score=5 would give Healthy in legacy mode; archData=null fixes that
    expect(computeRepoPriority({ score: 5, label: 'healthy' }, noAq(), null, null)).toBe('watch');
  });

  test('archData=null → still Watch even with a "healthy" operational score', () => {
    expect(computeRepoPriority({ score: 0, label: 'healthy' }, noAq(), null, null)).toBe('watch');
  });

  test('archData.level=risky → Critical (1.00*0.50=0.50 ≥ threshold)', () => {
    expect(computeRepoPriority({}, noAq(), { architectureHealthLevel: 'risky' }, null)).toBe('critical');
  });

  test('archData.level=weak → Elevated (0.67*0.50=0.335)', () => {
    expect(computeRepoPriority({}, noAq(), { architectureHealthLevel: 'weak' }, null)).toBe('elevated');
  });

  test('archData.level=watch → Watch (0.33*0.50=0.165)', () => {
    expect(computeRepoPriority({}, noAq(), { architectureHealthLevel: 'watch' }, null)).toBe('watch');
  });

  test('archData.level=healthy → Healthy (0*0.50=0)', () => {
    expect(computeRepoPriority({}, noAq(), { architectureHealthLevel: 'healthy' }, null)).toBe('healthy');
  });

  test('archData.level=unknown → Coverage Gap tier → Watch', () => {
    expect(computeRepoPriority({}, noAq(), { architectureHealthLevel: 'unknown' }, null)).toBe('watch');
  });

  test('archData.level=risky + aq=critical → Critical (0.50+0.20+0.05=0.75)', () => {
    expect(computeRepoPriority({}, aqOf('critical'), { architectureHealthLevel: 'risky' }, null)).toBe('critical');
  });

  test('operational repo.score does not produce architecture health when archData provided', () => {
    // score=5 (healthy operational) + archData.level=risky → Critical (arch wins)
    expect(computeRepoPriority({ score: 5 }, noAq(), { architectureHealthLevel: 'risky' }, null)).toBe('critical');
  });
});

describe('computeRepoPriority — fcData parameter (real architecture forecast)', () => {
  test('fcData.forecastLevel=critical → fcSev=1.00 (0.20 contribution)', () => {
    // archData=null (0.165) + fc=1.0*0.20=0.20 → 0.365 → Elevated
    expect(computeRepoPriority({}, noAq(), null, { forecastLevel: 'critical' })).toBe('elevated');
  });

  test('fcData.forecastLevel=high → fcSev=0.67 (0.134 contribution)', () => {
    // arch=0.165 + fc=0.134 = 0.299 → Elevated
    expect(computeRepoPriority({}, noAq(), null, { forecastLevel: 'high' })).toBe('elevated');
  });

  test('fcData.forecastLevel=medium → fcSev=0.33 (0.066 contribution)', () => {
    // arch=0.165 + fc=0.066 = 0.231 → Watch
    expect(computeRepoPriority({}, noAq(), null, { forecastLevel: 'medium' })).toBe('watch');
  });

  test('fcData.forecastLevel=stable → fcSev=0 (no contribution)', () => {
    // arch=0.165 + fc=0 = 0.165 → Watch
    expect(computeRepoPriority({}, noAq(), null, { forecastLevel: 'stable' })).toBe('watch');
  });

  test('fcData=null → fcSev=0 (no forecast data loaded)', () => {
    expect(computeRepoPriority({}, noAq(), null, null)).toBe('watch');
  });

  test('archData.level=risky + fcData.level=critical → Critical (0.50+0.20=0.70)', () => {
    expect(computeRepoPriority(
      {}, noAq(),
      { architectureHealthLevel: 'risky' },
      { forecastLevel: 'critical' }
    )).toBe('critical');
  });

  test('archData.level=healthy + fcData.level=high → Elevated (0+0.134+...=0.134→Watch) no, 0+0.134=0.134 → Watch', () => {
    // arch healthy=0, fc high=0.67*0.20=0.134 → Watch (below Elevated)
    expect(computeRepoPriority(
      {}, noAq(),
      { architectureHealthLevel: 'healthy' },
      { forecastLevel: 'high' }
    )).toBe('watch');
  });
});

// ── buildRepoPriorityReasons — real architecture data ────────────────────────

describe('buildRepoPriorityReasons — archData parameter', () => {
  test('archData=null → Coverage Gap (not Healthy, not operational)', () => {
    const out = buildRepoPriorityReasons({ score: 5, label: 'healthy' }, noAq(), null, null);
    expect(out).toContain('Coverage Gap');
    expect(out).not.toContain('No Significant Issues');
    expect(out).not.toContain('Operational');
  });

  test('archData.level=risky overrides low repo.score → Architecture Risky', () => {
    // repo.score=5 (healthy operational) — archData must win
    const out = buildRepoPriorityReasons({ score: 5 }, noAq(), { architectureHealthLevel: 'risky' }, null);
    expect(out).toContain('Architecture Risky');
    expect(out).toContain('severity-critical');
    expect(out).not.toContain('Coverage Gap');
  });

  test('archData.level=weak → Architecture Weak', () => {
    const out = buildRepoPriorityReasons({}, noAq(), { architectureHealthLevel: 'weak' }, null);
    expect(out).toContain('Architecture Weak');
    expect(out).toContain('severity-high');
  });

  test('archData.level=healthy → no arch reason → No Significant Issues', () => {
    const out = buildRepoPriorityReasons({}, noAq(), { architectureHealthLevel: 'healthy' }, null);
    expect(out).not.toContain('Architecture');
    expect(out).not.toContain('Coverage Gap');
    expect(out).toContain('No Significant Issues');
  });
});

describe('buildRepoPriorityReasons — fcData parameter', () => {
  test('fcData.forecastLevel=critical → Forecast Critical', () => {
    const out = buildRepoPriorityReasons({}, noAq(), { architectureHealthLevel: 'healthy' }, { forecastLevel: 'critical' });
    expect(out).toContain('Forecast Critical');
    expect(out).toContain('severity-critical');
  });

  test('fcData.forecastLevel=high → Forecast Degrading', () => {
    const out = buildRepoPriorityReasons({}, noAq(), { architectureHealthLevel: 'healthy' }, { forecastLevel: 'high' });
    expect(out).toContain('Forecast Degrading');
    expect(out).toContain('severity-high');
  });

  test('fcData.forecastLevel=watch → Forecast Watch', () => {
    const out = buildRepoPriorityReasons({}, noAq(), { architectureHealthLevel: 'healthy' }, { forecastLevel: 'watch' });
    expect(out).toContain('Forecast Watch');
  });

  test('fcData.forecastLevel=stable → no forecast reason', () => {
    const out = buildRepoPriorityReasons({}, noAq(), { architectureHealthLevel: 'healthy' }, { forecastLevel: 'stable' });
    expect(out).not.toContain('Forecast');
    expect(out).toContain('No Significant Issues');
  });

  test('fcData=null → no forecast reason emitted', () => {
    const out = buildRepoPriorityReasons({}, noAq(), { architectureHealthLevel: 'healthy' }, null);
    expect(out).not.toContain('Forecast');
  });

  test('archData.level=risky + fcData.level=critical → both Architecture Risky and Forecast Critical', () => {
    const out = buildRepoPriorityReasons({}, noAq(), { architectureHealthLevel: 'risky' }, { forecastLevel: 'critical' });
    expect(out).toContain('Architecture Risky');
    expect(out).toContain('Forecast Critical');
  });

  test('archData=null + fcData.level=critical → Coverage Gap + Forecast Critical', () => {
    const out = buildRepoPriorityReasons({}, noAq(), null, { forecastLevel: 'critical' });
    expect(out).toContain('Coverage Gap');
    expect(out).toContain('Forecast Critical');
  });
});

// ── _archLevelFromScore ───────────────────────────────────────────────────────

describe('_archLevelFromScore — backend threshold parity', () => {
  test('null → null', () => expect(_archLevelFromScore(null)).toBeNull());
  test('score 90 → healthy',  () => expect(_archLevelFromScore(90)).toBe('healthy'));
  test('score 85 → healthy',  () => expect(_archLevelFromScore(85)).toBe('healthy'));
  test('score 84 → watch',    () => expect(_archLevelFromScore(84)).toBe('watch'));
  test('score 70 → watch',    () => expect(_archLevelFromScore(70)).toBe('watch'));
  test('score 69 → weak',     () => expect(_archLevelFromScore(69)).toBe('weak'));
  test('score 45 → weak',     () => expect(_archLevelFromScore(45)).toBe('weak'));
  test('score 44 → risky',    () => expect(_archLevelFromScore(44)).toBe('risky'));
  test('score 22 → risky',    () => expect(_archLevelFromScore(22)).toBe('risky'));
  test('score 0  → risky',    () => expect(_archLevelFromScore(0)).toBe('risky'));
});

// ── mergeRepoIntelligence ─────────────────────────────────────────────────────

describe('mergeRepoIntelligence — merge behavior', () => {
  beforeEach(() => { _repoIntelligenceById = {}; });

  test('initialises missing entry', () => {
    mergeRepoIntelligence(42, { architectureHealthLevel: 'risky' });
    expect(_repoIntelligenceById['42'].architectureHealthLevel).toBe('risky');
  });

  test('merges multiple fields', () => {
    mergeRepoIntelligence(1, { architectureHealthLevel: 'weak', forecastLevel: 'high' });
    expect(_repoIntelligenceById['1'].architectureHealthLevel).toBe('weak');
    expect(_repoIntelligenceById['1'].forecastLevel).toBe('high');
  });

  test('does NOT overwrite known non-null value with null', () => {
    mergeRepoIntelligence(1, { architectureHealthLevel: 'risky' });
    mergeRepoIntelligence(1, { architectureHealthLevel: null });
    expect(_repoIntelligenceById['1'].architectureHealthLevel).toBe('risky');
  });

  test('does NOT overwrite known value with undefined', () => {
    mergeRepoIntelligence(1, { forecastLevel: 'critical' });
    mergeRepoIntelligence(1, { forecastLevel: undefined });
    expect(_repoIntelligenceById['1'].forecastLevel).toBe('critical');
  });

  test('overwrites with a new non-null value', () => {
    mergeRepoIntelligence(1, { forecastLevel: 'high' });
    mergeRepoIntelligence(1, { forecastLevel: 'critical' });
    expect(_repoIntelligenceById['1'].forecastLevel).toBe('critical');
  });

  test('string and number repoIds both resolve to the same entry', () => {
    mergeRepoIntelligence(7,   { architectureHealthLevel: 'weak' });
    mergeRepoIntelligence('7', { forecastLevel: 'high' });
    expect(_repoIntelligenceById['7'].architectureHealthLevel).toBe('weak');
    expect(_repoIntelligenceById['7'].forecastLevel).toBe('high');
  });
});

// ── computeRepoPriority — watchlist escalation from archData ─────────────────

describe('computeRepoPriority — watchlist escalation via archData', () => {
  test('archData.watchlistEscalationLevel=critical → wlSev=1.00 (0.05 contribution)', () => {
    // arch=healthy(0), gov=0, fc=0 (null), wl=1.0*0.05=0.05 → Healthy (below 0.10)
    expect(computeRepoPriority(
      {}, noAq(),
      { architectureHealthLevel: 'healthy', watchlistEscalationLevel: 'critical' },
      null
    )).toBe('healthy');
  });

  test('arch=null + watchlist=critical → Watch (arch 0.165 + wl 0.05 = 0.215)', () => {
    // archData null → archSev=0.33, wle=critical → wlSev=1.0
    expect(computeRepoPriority(
      {}, noAq(),
      { architectureHealthLevel: null, watchlistEscalationLevel: 'critical' },
      null
    )).toBe('watch');
  });

  test('arch=risky + watchlist=critical → score 0.50+0.05=0.55 → Critical', () => {
    expect(computeRepoPriority(
      {}, noAq(),
      { architectureHealthLevel: 'risky', watchlistEscalationLevel: 'critical' },
      null
    )).toBe('critical');
  });

  test('watchlist=urgent → wlSev=0.67 (0.034 contribution)', () => {
    // arch=healthy(0), wl=0.67*0.05=0.034 → Healthy
    expect(computeRepoPriority(
      {}, noAq(),
      { architectureHealthLevel: 'healthy', watchlistEscalationLevel: 'urgent' },
      null
    )).toBe('healthy');
  });

  test('no archData.watchlistEscalationLevel → falls back to aqLevel', () => {
    // govSev from aq=critical + wlSev from aq=critical → 0.20+0.05=0.25 → Elevated
    expect(computeRepoPriority(
      {}, aqOf('critical'),
      { architectureHealthLevel: 'healthy', watchlistEscalationLevel: null },
      null
    )).toBe('elevated');
  });
});

// ── buildRepoPriorityReasons — watchlist escalation ──────────────────────────

describe('buildRepoPriorityReasons — watchlist escalation', () => {
  test('watchlistEscalationLevel=critical emits Watchlist Critical', () => {
    const out = buildRepoPriorityReasons(
      {}, noAq(),
      { architectureHealthLevel: 'healthy', watchlistEscalationLevel: 'critical' },
      null
    );
    expect(out).toContain('Watchlist Critical');
    expect(out).toContain('severity-critical');
  });

  test('watchlistEscalationLevel=urgent emits Watchlist Urgent', () => {
    const out = buildRepoPriorityReasons(
      {}, noAq(),
      { architectureHealthLevel: 'healthy', watchlistEscalationLevel: 'urgent' },
      null
    );
    expect(out).toContain('Watchlist Urgent');
    expect(out).toContain('severity-high');
  });

  test('watchlistEscalationLevel=elevated emits Watchlist Elevated', () => {
    const out = buildRepoPriorityReasons(
      {}, noAq(),
      { architectureHealthLevel: 'healthy', watchlistEscalationLevel: 'elevated' },
      null
    );
    expect(out).toContain('Watchlist Elevated');
    expect(out).toContain('severity-medium');
  });

  test('watchlist=monitor → no watchlist reason emitted', () => {
    const out = buildRepoPriorityReasons(
      {}, noAq(),
      { architectureHealthLevel: 'healthy', watchlistEscalationLevel: 'monitor' },
      null
    );
    expect(out).not.toContain('Watchlist');
  });

  test('arch=risky overrides display order before watchlist', () => {
    const out = buildRepoPriorityReasons(
      {}, noAq(),
      { architectureHealthLevel: 'risky', watchlistEscalationLevel: 'critical' },
      null
    );
    const archIdx = out.indexOf('Architecture Risky');
    const wlIdx   = out.indexOf('Watchlist Critical');
    expect(archIdx).toBeGreaterThanOrEqual(0);
    expect(wlIdx).toBeGreaterThanOrEqual(0);
    expect(archIdx).toBeLessThan(wlIdx);
  });

  test('null archData → Coverage Gap, no watchlist reason', () => {
    const out = buildRepoPriorityReasons({}, noAq(), null, null);
    expect(out).toContain('Coverage Gap');
    expect(out).not.toContain('Watchlist');
  });
});

// ── portfolio intelligence → table priority hydration ────────────────────────

describe('portfolio intel → computeRepoPriority (table context simulation)', () => {
  test('missing intel → Coverage Gap tier (Watch), not Healthy', () => {
    // No intel, no archData passed (null) → archSev=0.33 → Watch
    expect(computeRepoPriority({ score: 5, label: 'healthy' }, noAq(), null, null)).toBe('watch');
  });

  test('portfolio arch score 22 → risky level → Critical', () => {
    const archData = {
      architectureHealthLevel: _archLevelFromScore(22),  // → 'risky'
      architectureHealthScore: 22,
    };
    expect(computeRepoPriority({}, noAq(), archData, null)).toBe('critical');
  });

  test('portfolio arch score 75 → watch level → Watch (0.33*0.50=0.165)', () => {
    // 75 is in 70-84 range → 'watch' level → archSev=0.33 → score=0.165 → Watch
    const archData = { architectureHealthLevel: _archLevelFromScore(75), architectureHealthScore: 75 };
    expect(_archLevelFromScore(75)).toBe('watch');
    expect(computeRepoPriority({}, noAq(), archData, null)).toBe('watch');
  });

  test('portfolio arch score 60 → weak level → Elevated (0.67*0.50=0.335)', () => {
    // 60 is in 45-69 range → 'weak' level → archSev=0.67 → score=0.335 → Elevated
    const archData = { architectureHealthLevel: _archLevelFromScore(60), architectureHealthScore: 60 };
    expect(_archLevelFromScore(60)).toBe('weak');
    expect(computeRepoPriority({}, noAq(), archData, null)).toBe('elevated');
  });

  test('portfolio forecast=critical contributes forecast dimension', () => {
    // archData=null (no arch intel), fcData.forecastLevel=critical
    // archSev=0.33, fcSev=1.0*0.20=0.20 → 0.165+0.20=0.365 → Elevated
    expect(computeRepoPriority({}, noAq(), null, { forecastLevel: 'critical' })).toBe('elevated');
  });

  test('portfolio forecast alone without arch does not create Healthy (still Coverage Gap)', () => {
    // No intel at all → archSev=0.33 → Watch regardless of fc=none
    expect(computeRepoPriority({}, noAq(), null, { forecastLevel: 'none' })).toBe('watch');
  });

  test('clicking repo does not change priority when portfolio intel already has arch data', () => {
    // Portfolio intel sets arch=risky → Critical
    const archData = { architectureHealthLevel: 'risky', architectureHealthScore: 20 };
    const before = computeRepoPriority({}, noAq(), archData, null);
    // Simulated per-click load would NOT change archData in the table (table uses intel, not click cache)
    const after  = computeRepoPriority({}, noAq(), archData, null);
    expect(before).toBe('critical');
    expect(after).toBe('critical');
  });
});

// ── _resolveOverviewArchData ──────────────────────────────────────────────────

describe('_resolveOverviewArchData — source precedence', () => {
  beforeEach(() => {
    _repoIntelligenceById    = {};
    _archDataByRepoId        = {};
    _archForecastDataByRepoId = {};
  });

  test('no intel + no per-click → null (Coverage Gap / Loading)', () => {
    expect(_resolveOverviewArchData(1)).toBeNull();
  });

  test('intel with architectureHealthLevel → returns it without per-click', () => {
    mergeRepoIntelligence(1, { architectureHealthLevel: 'risky', architectureHealthScore: 22 });
    const d = _resolveOverviewArchData(1);
    expect(d).not.toBeNull();
    expect(d.architectureHealthLevel).toBe('risky');
    expect(d.architectureHealthScore).toBe(22);
  });

  test('intel with score only → derives level via _archLevelFromScore', () => {
    mergeRepoIntelligence(2, { architectureHealthScore: 22 });
    const d = _resolveOverviewArchData(2);
    expect(d.architectureHealthLevel).toBe('risky');   // 22 < 45 → risky
    expect(d.architectureHealthScore).toBe(22);
  });

  test('intel without arch data but exists → returns object with null level (Coverage Gap, not Loading)', () => {
    mergeRepoIntelligence(3, { watchlistEscalationLevel: 'critical' });
    const d = _resolveOverviewArchData(3);
    expect(d).not.toBeNull();                          // object, not null → no "Loading..."
    expect(d.architectureHealthLevel).toBeNull();      // Coverage Gap
    expect(d.architectureHealthScore).toBeNull();
    expect(d.watchlistEscalationLevel).toBe('critical');
  });

  test('no intel but per-click arch exists → uses per-click', () => {
    _archDataByRepoId[5] = { architectureHealthLevel: 'weak', architectureHealthScore: 60 };
    const d = _resolveOverviewArchData(5);
    expect(d.architectureHealthLevel).toBe('weak');
    expect(d.architectureHealthScore).toBe(60);
  });

  test('intel level wins over per-click level', () => {
    mergeRepoIntelligence(6, { architectureHealthLevel: 'risky', architectureHealthScore: 22 });
    _archDataByRepoId[6] = { architectureHealthLevel: 'weak', architectureHealthScore: 60 };
    const d = _resolveOverviewArchData(6);
    expect(d.architectureHealthLevel).toBe('risky');   // intel wins
    expect(d.architectureHealthScore).toBe(22);        // intel score wins
  });

  test('intel level "unknown" from per-click is ignored', () => {
    _archDataByRepoId[7] = { architectureHealthLevel: 'unknown', architectureHealthScore: 30 };
    const d = _resolveOverviewArchData(7);
    // Per-click has 'unknown' level — should derive from score instead
    expect(d.architectureHealthLevel).toBe('risky');   // 30 < 45 → risky via score derivation
  });

  test('watchlistEscalationLevel from intel propagated', () => {
    mergeRepoIntelligence(8, { architectureHealthLevel: 'weak', watchlistEscalationLevel: 'critical' });
    const d = _resolveOverviewArchData(8);
    expect(d.watchlistEscalationLevel).toBe('critical');
  });
});

// ── _resolveOverviewFcData ────────────────────────────────────────────────────

describe('_resolveOverviewFcData — source precedence', () => {
  beforeEach(() => {
    _repoIntelligenceById    = {};
    _archDataByRepoId        = {};
    _archForecastDataByRepoId = {};
  });

  test('no intel + no per-click → null (Not Enough History)', () => {
    expect(_resolveOverviewFcData(1)).toBeNull();
  });

  test('intel forecastLevel → returned immediately', () => {
    mergeRepoIntelligence(1, { forecastLevel: 'high' });
    const d = _resolveOverviewFcData(1);
    expect(d).not.toBeNull();
    expect(d.forecastLevel).toBe('high');
  });

  test('intel forecastLevel unknown → not used; falls back to per-click', () => {
    mergeRepoIntelligence(2, { forecastLevel: 'unknown' });
    _archForecastDataByRepoId[2] = { forecastLevel: 'critical', degradationRisk: 0.8 };
    const d = _resolveOverviewFcData(2);
    expect(d.forecastLevel).toBe('critical');
  });

  test('no intel forecastLevel but per-click exists → uses per-click', () => {
    _archForecastDataByRepoId[3] = { forecastLevel: 'high', degradationRisk: 0.5, confidenceLevel: 'medium' };
    const d = _resolveOverviewFcData(3);
    expect(d.forecastLevel).toBe('high');
    expect(d.confidenceLevel).toBe('medium');
  });

  test('intel forecastLevel wins over per-click forecastLevel', () => {
    mergeRepoIntelligence(4, { forecastLevel: 'critical' });
    _archForecastDataByRepoId[4] = { forecastLevel: 'low', degradationRisk: 0.1 };
    const d = _resolveOverviewFcData(4);
    expect(d.forecastLevel).toBe('critical');          // intel wins
  });
});

// ── Overview Priority alignment with table ────────────────────────────────────

describe('Overview Priority matches table Priority via _resolveOverviewArchData', () => {
  beforeEach(() => {
    _repoIntelligenceById    = {};
    _archDataByRepoId        = {};
    _archForecastDataByRepoId = {};
  });

  test('architecture risky in intel → Overview archData.level=risky → computeRepoPriority=Critical', () => {
    mergeRepoIntelligence(10, { architectureHealthLevel: 'risky', architectureHealthScore: 22 });
    const archData = _resolveOverviewArchData(10);
    expect(computeRepoPriority({}, noAq(), archData, null)).toBe('critical');
  });

  test('architecture weak in intel → Overview archData.level=weak → computeRepoPriority=Elevated', () => {
    mergeRepoIntelligence(11, { architectureHealthLevel: 'weak', architectureHealthScore: 55 });
    const archData = _resolveOverviewArchData(11);
    expect(computeRepoPriority({}, noAq(), archData, null)).toBe('elevated');
  });

  test('no intel → _resolveOverviewArchData=null → computeRepoPriority uses Coverage Gap (watch)', () => {
    const archData = _resolveOverviewArchData(99);
    expect(archData).toBeNull();
    expect(computeRepoPriority({}, noAq(), archData, null)).toBe('watch');
  });

  test('intel+forecast → Overview Priority consistent with table Priority', () => {
    mergeRepoIntelligence(12, { architectureHealthLevel: 'watch', forecastLevel: 'critical' });
    const archData = _resolveOverviewArchData(12);
    const fcData   = _resolveOverviewFcData(12);
    // arch=0.33*0.50=0.165, fc=1.0*0.20=0.20 → 0.365 → Elevated
    expect(computeRepoPriority({}, noAq(), archData, fcData)).toBe('elevated');
  });

  test('per-click cannot override intel level → table and Overview Priority stay aligned', () => {
    mergeRepoIntelligence(13, { architectureHealthLevel: 'risky' });
    // Simulate per-click returning a "better" looking (but contradictory) value
    _archDataByRepoId[13] = { architectureHealthLevel: 'healthy', architectureHealthScore: 90 };
    const archData = _resolveOverviewArchData(13);
    // Intel 'risky' wins
    expect(archData.architectureHealthLevel).toBe('risky');
    expect(computeRepoPriority({}, noAq(), archData, null)).toBe('critical');
  });
});
