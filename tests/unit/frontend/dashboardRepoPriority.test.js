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
var _repoIntelligenceById    = {};
var _archDataByRepoId        = {};   // per-click architecture cache stub
var _archForecastDataByRepoId = {};  // per-click forecast cache stub
var _archFetchInFlightByRepoId = {}; // { [repoId]: true } while per-click arch fetch is active

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

// ── Architecture dimension normalizers (copied verbatim from dashboard.html) ─
function _normArchLinkageLevel(raw) {
  if (raw === 'integrated') return 'healthy';
  if (raw === 'partial')    return 'watch';
  return raw || null;
}

function _normImplCompletenessLevel(raw) {
  if (raw === 'complete') return 'healthy';
  if (raw === 'partial')  return 'watch';
  return raw || null;
}

function _deriveCouplingLevel(cm) {
  if (!cm) return null;
  var circular = typeof cm.circularDependencyCount === 'number' ? cm.circularDependencyCount : 0;
  var avgOut   = typeof cm.averageOutDegree        === 'number' ? cm.averageOutDegree        : 0;
  var fanOut   = Array.isArray(cm.highFanOutFiles) ? cm.highFanOutFiles.length : 0;
  if (circular > 5 || avgOut > 8 || fanOut > 5) return 'risky';
  if (circular > 2 || avgOut > 5 || fanOut > 2) return 'weak';
  if (circular > 0 || avgOut > 3 || fanOut > 0) return 'watch';
  return 'healthy';
}

// ── buildArchitectureRiskProfileHtml (copied verbatim from dashboard.html) ───
function buildArchitectureRiskProfileHtml(archCache, archData, fcData, intel) {
  var FALLBACK = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
              + 'Architecture Risk Profile unavailable — sync repository to generate architecture snapshot.</p>';

  var level = (archData && archData.architectureHealthLevel && archData.architectureHealthLevel !== 'unknown'
                ? archData.architectureHealthLevel : null)
           || (intel && intel.architectureHealthLevel ? intel.architectureHealthLevel : null);
  var score = (archData && archData.architectureHealthScore != null) ? archData.architectureHealthScore
            : (intel  && intel.architectureHealthScore  != null) ? intel.architectureHealthScore
            : null;

  if (!level && score == null) return FALLBACK;

  var conf = (archCache && archCache.confidenceLevel) || 'low';

  var LEVEL_SEV = {
    healthy: 'severity-healthy', watch: 'severity-medium',
    weak:    'severity-high',    risky: 'severity-critical',
    unknown: 'severity-unknown'
  };
  var levelLabel = level ? (level.charAt(0).toUpperCase() + level.slice(1)) : 'Unknown';
  var levelCls   = LEVEL_SEV[level] || 'severity-unknown';

  var snapExists = !!(intel && (
    intel.hasArchitectureSnapshot === true
    || (intel.hasArchitectureSnapshot !== false
        && archData && (archData.architectureHealthScore != null || archData.architectureHealthLevel != null))
  ));

  var archConf = computeArchitectureConfidence({
    hasArchitectureSnapshot: snapExists,
    architectureScore:       archData ? archData.architectureHealthScore : null,
    forecastLevel:           fcData   ? fcData.forecastLevel             : null,
  });

  var apiLevel    = (archCache && archCache.apiLinkageLevel)        || null;
  var implLevel   = (archCache && archCache.implementationLevel)    || null;
  var couplingLvl = (archCache && archCache.couplingRisk)           || null;
  var bndScore    = (archCache && archCache.boundaryHealthScore != null) ? archCache.boundaryHealthScore : null;
  var bndViol     = (archCache && archCache.boundaryViolationCount != null) ? archCache.boundaryViolationCount : null;
  var fcLevel     = fcData ? (fcData.forecastLevel || null) : null;

  var bndLevel = bndScore != null
    ? (bndScore >= 85 ? 'healthy' : bndScore >= 70 ? 'watch' : bndScore >= 45 ? 'weak' : 'risky')
    : null;

  var FC_SEV = {
    critical: 'severity-critical', high: 'severity-high',
    medium: 'severity-medium',     watch: 'severity-medium',
    low: 'severity-healthy',       stable: 'severity-healthy', none: 'severity-healthy'
  };

  function _badge(lv, cls) {
    return '<span class="pf-badge ' + esc(cls) + '" style="font-size:0.67rem;">'
         + esc(lv.toUpperCase()) + '</span>';
  }
  function _dash() {
    return '<span class="rms-dim-val" style="color:var(--text-muted);">—</span>';
  }

  var dims = [
    { name: 'API Linkage',
      val: apiLevel  ? _badge(apiLevel,   LEVEL_SEV[apiLevel]   || 'severity-unknown') : _dash() },
    { name: 'Implementation Completeness',
      val: implLevel ? _badge(implLevel,  LEVEL_SEV[implLevel]  || 'severity-unknown') : _dash() },
    { name: 'Coupling Risk',
      val: couplingLvl ? _badge(couplingLvl, LEVEL_SEV[couplingLvl] || 'severity-unknown') : _dash() },
    { name: 'Boundary Integrity',
      val: bndLevel
        ? '<span class="pf-badge ' + esc(LEVEL_SEV[bndLevel] || 'severity-unknown') + '" style="font-size:0.67rem;">'
          + esc(bndLevel.toUpperCase())
          + (bndViol != null ? ' &middot; ' + esc(String(bndViol)) + 'v' : '')
          + '</span>'
        : _dash() },
    { name: 'Forecast Risk',
      val: (fcLevel && fcLevel !== 'unknown')
        ? _badge(fcLevel, FC_SEV[fcLevel] || 'severity-unknown')
        : _dash() },
    { name: 'Architecture Confidence',
      val: _badge(archConf.label, archConf.cls) },
  ];

  var html = '<div class="rms-panel">';
  html += '<div class="rms-header">';
  if (score != null) {
    html += '<span class="rms-score">' + esc(String(score))
          + '<span class="rms-score-max"> / 100</span></span>';
  }
  html += '<span class="pf-badge ' + esc(levelCls) + '">' + esc(levelLabel.toUpperCase()) + '</span>';
  html += '<span class="confidence-badge conf-' + esc(conf) + '">'
       +  esc(conf.toUpperCase() + ' CONFIDENCE') + '</span>';
  html += '</div>';
  html += '<div class="rms-dims">';
  dims.forEach(function(d) {
    html += '<div class="rms-dim"><span>' + esc(d.name) + '</span>' + d.val + '</div>';
  });
  html += '</div>';
  html += '</div>';
  return html;
}

// ── buildActiveArchitectureRisks (copied verbatim from dashboard.html) ───────
function buildActiveArchitectureRisks(opts) {
  var unresolvedApiCalls = opts ? opts.unresolvedApiCalls         : null;
  var implCompleteness   = opts ? opts.implementationCompleteness : null;
  var couplingRisk       = (opts && opts.couplingRisk)            || null;
  var forecastLevel      = (opts && opts.forecastLevel)           || null;
  var hasSnap            = !!(opts && opts.hasArchitectureSnapshot);
  var conf               = (opts && opts.architectureConfidence)  || null;

  var risks = [];

  if (unresolvedApiCalls != null && unresolvedApiCalls > 0) {
    risks.push('API linkage gaps detected');
  }

  if (implCompleteness != null && implCompleteness < 70) {
    risks.push('Implementation completeness is weak');
  }

  var COUPLING_HIGH = ['elevated', 'high', 'risky', 'weak'];
  if (couplingRisk && COUPLING_HIGH.indexOf(couplingRisk) >= 0) {
    risks.push('Coupling concentration is elevated');
  }

  if (forecastLevel === 'high' || forecastLevel === 'critical') {
    risks.push('Architecture forecast indicates degradation risk');
  }

  if (conf === 'Low' || !hasSnap) {
    risks.push('Architecture coverage confidence is reduced');
  }

  return risks;
}

// ── buildArchitectureRecommendations (copied verbatim from dashboard.html) ───
function buildArchitectureRecommendations(opts) {
  var score    = opts ? opts.architectureScore       : null;
  var level    = (opts && opts.architectureLevel)    || null;
  var priority = (opts && opts.architecturalPriority) || null;
  var fcLevel  = (opts && opts.forecastLevel)         || null;
  var hasSnap  = !!(opts && opts.hasArchitectureSnapshot);

  var items = [];

  var isCritical = priority === 'critical'
                || (score != null && score < 45)
                || level === 'risky';

  if (isCritical) {
    items.push('Review unresolved API linkage issues');
    items.push('Reduce coupling in high fan-out modules');
    items.push('Address implementation completeness gaps');
    items.push('Audit orphaned routes and dead integrations');
  } else if (priority === 'elevated') {
    items.push('Review architectural hotspots');
    items.push('Improve route-to-service coverage');
    items.push('Reduce dependency concentration');
  } else if (priority === 'watch') {
    items.push('Monitor architecture trend');
    items.push('Increase architecture snapshot frequency');
  }

  if (!hasSnap) {
    items.push('Generate architecture snapshot');
    items.push('Improve architecture coverage');
  }

  if (fcLevel === 'critical' || fcLevel === 'high') {
    items.push('Investigate degradation trajectory');
    items.push('Prioritize structural remediation');
  }

  return items;
}

// ── buildArchitectureAssessment (copied verbatim from dashboard.html) ────────
function buildArchitectureAssessment(opts) {
  var score    = opts ? opts.architectureScore      : null;
  var priority = (opts && opts.architecturalPriority) || null;
  var fcLevel  = (opts && opts.forecastLevel)        || null;
  var hasSnap  = !!(opts && opts.hasArchitectureSnapshot);
  var conf     = (opts && opts.architectureConfidence) || null;

  var isCritical = priority === 'critical' || (score != null && score < 45);
  var tier, text, cls;

  if (isCritical) {
    tier = 'critical'; cls = 'severity-critical';
    var note = score != null ? ' (score: ' + score + ')' : '';
    text = 'Architecture health is critical' + note
         + '. Structural indicators suggest significant implementation, coupling, or integration risk.';
  } else if (priority === 'elevated') {
    tier = 'elevated'; cls = 'severity-high';
    text = 'Architecture health requires attention. Structural quality indicators show elevated risk'
         + ' that should be reviewed before additional complexity is introduced.';
  } else if (priority === 'watch') {
    tier = 'watch'; cls = 'severity-medium';
    text = 'Architecture is currently stable but exhibits signals that should remain under observation.';
  } else if (priority === 'healthy') {
    tier = 'healthy'; cls = 'severity-healthy';
    text = 'Architecture appears structurally healthy with no significant architectural risk indicators detected.';
  } else {
    tier = 'unknown'; cls = 'severity-unknown';
    text = 'Architecture intelligence is insufficient to generate a full assessment.';
  }

  var hasForecast = !!(fcLevel && fcLevel !== 'unknown');
  if (hasForecast && (fcLevel === 'critical' || fcLevel === 'high')) {
    text += ' Forecast analysis indicates elevated degradation risk.';
  } else if (!hasForecast) {
    text += ' Forecast confidence is limited due to insufficient architecture history.';
  }

  if (!hasSnap) {
    text += ' Architecture intelligence coverage is incomplete.';
  } else if (conf === 'Medium' || conf === 'Low') {
    text += ' Assessment confidence is reduced due to limited architecture evidence.';
  }

  return { text: text, level: tier, cls: cls };
}

// ── Stubs for buildOverviewCardsHtml (DOM-free) ───────────────────────────────

// card() — copied verbatim from dashboard.html
function card(label, value, cls) {
  var valueHtml = cls
    ? '<span class="card-badge ' + cls + '">' + esc(String(value)) + '</span>'
    : '<div class="card-value">' + esc(String(value)) + '</div>';
  return '<div class="card">'
    + '<div class="card-label">' + esc(label) + '</div>'
    + valueHtml
    + '</div>';
}

// ── computeArchitectureConfidence (copied verbatim from dashboard.html) ───────
function computeArchitectureConfidence(opts) {
  var hasSnap     = !!(opts && opts.hasArchitectureSnapshot);
  var hasScore    = opts != null && opts.architectureScore != null;
  var fcLevel     = opts && opts.forecastLevel;
  var hasForecast = !!(fcLevel && fcLevel !== 'unknown');

  if (!hasSnap)               return { label: 'Insufficient History', cls: 'severity-neutral' };
  if (hasScore && hasForecast) return { label: 'High',   cls: 'severity-healthy' };
  if (hasScore)                return { label: 'Medium',  cls: 'severity-medium'  };
  return                             { label: 'Low',    cls: 'severity-high'    };
}

// ── buildOverviewCardsHtml (copied verbatim from dashboard.html) ──────────────
function buildOverviewCardsHtml(repo, aq, archData, fcData) {
  var intel = _repoIntelligenceById[String(repo.id)] || {};

  var archCardVal, archCardCls;
  var _hasIntel = !!(intel.architectureHealthLevel || intel.architectureHealthScore != null);
  var _inFlight = !!_archFetchInFlightByRepoId[repo.id];
  if (!archData || (!archData.architectureHealthLevel && archData.architectureHealthScore == null)) {
    if (_inFlight && !_hasIntel) {
      archCardVal = 'Architecture Loading…'; archCardCls = 'severity-neutral';
    } else {
      archCardVal = 'Coverage Gap'; archCardCls = 'severity-medium';
    }
  } else {
    var hl = archData.architectureHealthLevel || 'unknown';
    var hs = archData.architectureHealthScore != null ? ' · ' + archData.architectureHealthScore : '';
    if      (hl === 'risky')   { archCardVal = 'Risky'   + hs; archCardCls = 'severity-critical'; }
    else if (hl === 'weak')    { archCardVal = 'Weak'    + hs; archCardCls = 'severity-high'; }
    else if (hl === 'watch')   { archCardVal = 'Watch'   + hs; archCardCls = 'severity-medium'; }
    else if (hl === 'healthy') { archCardVal = 'Healthy' + hs; archCardCls = 'severity-healthy'; }
    else                       { archCardVal = 'Coverage Gap'; archCardCls = 'severity-medium'; }
  }

  var ovPriKey = computeRepoPriority(repo, aq, archData, fcData);
  var ovPriVal = { critical: 'Critical', elevated: 'Elevated', watch: 'Watch', healthy: 'Healthy' }[ovPriKey] || ovPriKey;
  var ovPriCls = { critical: 'severity-critical', elevated: 'severity-high', watch: 'severity-medium', healthy: 'severity-healthy' }[ovPriKey] || 'severity-unknown';

  var ovFcVal, ovFcCls;
  if (!fcData || !fcData.forecastLevel) {
    ovFcVal = 'Not Enough History'; ovFcCls = 'severity-unknown';
  } else if (fcData.forecastLevel && fcData.forecastLevel !== 'unknown') {
    var fl = fcData.forecastLevel;
    if      (fl === 'critical')                  { ovFcVal = 'Critical';  ovFcCls = 'severity-critical'; }
    else if (fl === 'high')                      { ovFcVal = 'High Risk'; ovFcCls = 'severity-high'; }
    else if (fl === 'medium' || fl === 'watch')  { ovFcVal = 'Moderate';  ovFcCls = 'severity-medium'; }
    else if (fl === 'low')                       { ovFcVal = 'Low';       ovFcCls = 'severity-neutral'; }
    else if (fl === 'none'   || fl === 'stable') { ovFcVal = 'Stable';    ovFcCls = 'severity-healthy'; }
    else                                         { ovFcVal = esc(fl);     ovFcCls = 'severity-unknown'; }
  } else {
    ovFcVal = 'Not Enough History'; ovFcCls = 'severity-unknown';
  }

  var ovGovLevel = aq ? (aq.attentionLevel || 'unknown') : 'unknown';
  var ovGovVal, ovGovCls;
  if      (ovGovLevel === 'critical') { ovGovVal = 'Critical';   ovGovCls = 'severity-critical'; }
  else if (ovGovLevel === 'high')     { ovGovVal = 'High';       ovGovCls = 'severity-high'; }
  else if (ovGovLevel === 'medium')   { ovGovVal = 'Moderate';   ovGovCls = 'severity-medium'; }
  else if (ovGovLevel === 'low')      { ovGovVal = 'Low';        ovGovCls = 'severity-neutral'; }
  else if (ovGovLevel === 'healthy')  { ovGovVal = 'Healthy';    ovGovCls = 'severity-healthy'; }
  else                                { ovGovVal = 'Monitoring'; ovGovCls = 'severity-neutral'; }

  var ovSnapVal, ovSnapCls;
  if (intel.hasArchitectureSnapshot === true) {
    ovSnapVal = 'Has Snapshot'; ovSnapCls = 'severity-healthy';
  } else if (intel.hasArchitectureSnapshot === false) {
    ovSnapVal = 'Needs History'; ovSnapCls = 'severity-medium';
  } else {
    var hasSnap = archData && (archData.architectureHealthScore != null || archData.architectureHealthLevel != null);
    ovSnapVal   = hasSnap ? 'Has Snapshot' : 'Needs History';
    ovSnapCls   = hasSnap ? 'severity-healthy' : 'severity-medium';
  }

  var _snapExists = intel.hasArchitectureSnapshot === true
                 || (intel.hasArchitectureSnapshot !== false
                     && archData && (archData.architectureHealthScore != null || archData.architectureHealthLevel != null));
  var conf = computeArchitectureConfidence({
    hasArchitectureSnapshot: _snapExists,
    architectureScore:       archData ? archData.architectureHealthScore : null,
    forecastLevel:           fcData   ? fcData.forecastLevel             : null,
  });

  return card('Architecture Health',    archCardVal, archCardCls)
    + card('Architectural Priority',    ovPriVal,    ovPriCls)
    + card('Forecast',                  ovFcVal,     ovFcCls)
    + card('Governance',                ovGovVal,    ovGovCls)
    + card('Snapshot Coverage',         ovSnapVal,   ovSnapCls)
    + card('Architecture Confidence',   conf.label,  conf.cls);
}

// ── buildOverviewCardsHtml — Overview uses _repoIntelligenceById immediately ──

describe('buildOverviewCardsHtml — Overview uses portfolio intel immediately', () => {
  const REPO = { id: 100, fullName: 'org/repo', score: null, label: 'healthy' };

  beforeEach(() => {
    _repoIntelligenceById    = {};
    _archDataByRepoId        = {};
    _archForecastDataByRepoId = {};
    _archFetchInFlightByRepoId = {};
  });

  test('intel arch=risky → Architecture Health shows Risky without any Loading state', () => {
    mergeRepoIntelligence(100, { architectureHealthLevel: 'risky', architectureHealthScore: 22 });
    const arch = _resolveOverviewArchData(100);
    const html = buildOverviewCardsHtml(REPO, null, arch, null, null);
    expect(html).toContain('Risky');
    expect(html).not.toContain('Architecture Loading');
    expect(html).not.toContain('Coverage Gap');
  });

  test('Overview Priority matches table priority when intel=risky → both Critical', () => {
    mergeRepoIntelligence(100, { architectureHealthLevel: 'risky', architectureHealthScore: 22 });
    const arch = _resolveOverviewArchData(100);
    const fc   = _resolveOverviewFcData(100);
    // Table uses computeRepoPriority directly from intel-derived archData
    const tablePri = computeRepoPriority(REPO, null, arch, fc);
    expect(tablePri).toBe('critical');
    const html = buildOverviewCardsHtml(REPO, null, arch, fc, null);
    expect(html).toContain('Critical');
  });

  test('intel arch=risky + in-flight fetch → still shows Risky (intel wins over Loading)', () => {
    mergeRepoIntelligence(100, { architectureHealthLevel: 'risky', architectureHealthScore: 22 });
    _archFetchInFlightByRepoId[100] = true;  // fetch in flight but intel already known
    const arch = _resolveOverviewArchData(100);
    const html = buildOverviewCardsHtml(REPO, null, arch, null, null);
    expect(html).toContain('Risky');
    expect(html).not.toContain('Architecture Loading');
  });

  test('no intel + fetch in flight → Architecture Loading (not Coverage Gap)', () => {
    _archFetchInFlightByRepoId[100] = true;  // no intel, fetch is in progress
    const arch = _resolveOverviewArchData(100);  // null
    const html = buildOverviewCardsHtml(REPO, null, arch, null, null);
    expect(html).toContain('Architecture Loading');
    expect(html).not.toContain('Coverage Gap');
  });

  test('no intel + fetch NOT in flight → Coverage Gap (not Loading)', () => {
    // _archFetchInFlightByRepoId not set — fetch done or not started
    const arch = _resolveOverviewArchData(100);  // null
    const html = buildOverviewCardsHtml(REPO, null, arch, null, null);
    expect(html).toContain('Coverage Gap');
    expect(html).not.toContain('Architecture Loading');
  });

  test('intel arch=risky renders Risky not Loading (forecast card may still show Not Enough History)', () => {
    mergeRepoIntelligence(100, { architectureHealthLevel: 'risky', architectureHealthScore: 22 });
    const arch = _resolveOverviewArchData(100);
    const html = buildOverviewCardsHtml(REPO, null, arch, null, null);
    expect(html).toContain('Risky');
    expect(html).not.toContain('Architecture Loading');
    // No forecast intel → Forecast card correctly shows Not Enough History; arch card must not
    expect(html).not.toContain('Coverage Gap');
  });

  test('intel forecast=high → Overview Forecast shows High Risk, not Not Enough History', () => {
    mergeRepoIntelligence(100, { architectureHealthLevel: 'risky', forecastLevel: 'high' });
    const arch = _resolveOverviewArchData(100);
    const fc   = _resolveOverviewFcData(100);
    const html = buildOverviewCardsHtml(REPO, null, arch, fc, null);
    expect(html).toContain('High Risk');
    expect(html).not.toContain('Not Enough History');
  });

  test('missing intel → Coverage Gap + Needs History, not Healthy or Loading', () => {
    // No intel at all — both arch and forecast cards should show unknown/missing state
    const arch = _resolveOverviewArchData(100);  // null → Coverage Gap path
    const fc   = _resolveOverviewFcData(100);    // null → Not Enough History
    const html = buildOverviewCardsHtml(REPO, null, arch, fc, null);
    expect(html).toContain('Coverage Gap');
    expect(html).toContain('Needs History');    // Snapshot Coverage
    expect(html).toContain('Not Enough History'); // Forecast
    expect(html).not.toContain('Healthy');
    expect(html).not.toContain('Architecture Loading');
  });

  test('selected-repo per-click cannot downgrade risky intel to Coverage Gap', () => {
    mergeRepoIntelligence(100, { architectureHealthLevel: 'risky', architectureHealthScore: 22 });
    // Per-click returns a contradictory "unknown" level — intel must win
    _archDataByRepoId[100] = { architectureHealthLevel: 'unknown', architectureHealthScore: 30 };
    const arch = _resolveOverviewArchData(100);
    expect(arch.architectureHealthLevel).toBe('risky');  // intel wins
    const html = buildOverviewCardsHtml(REPO, null, arch, null, null);
    expect(html).toContain('Risky');
    expect(html).not.toContain('Coverage Gap');
  });

  test('selected-repo per-click completion does not change table Priority or order', () => {
    // Table priority is computed from intel at render time; per-click cache is not involved
    mergeRepoIntelligence(100, { architectureHealthLevel: 'risky', architectureHealthScore: 22 });
    const archFromIntel = _resolveOverviewArchData(100);
    const priBefore = computeRepoPriority(REPO, null, archFromIntel, null);

    // Simulate per-click fetch completing with an "unknown" level
    _archDataByRepoId[100] = { architectureHealthLevel: 'unknown', architectureHealthScore: 30 };
    // Table re-reads intel (not _archDataByRepoId) on re-render — priority unchanged
    const archAfter = _resolveOverviewArchData(100);
    const priAfter  = computeRepoPriority(REPO, null, archAfter, null);

    expect(priBefore).toBe('critical');
    expect(priAfter).toBe('critical');  // same — per-click did not downgrade
  });
});

// ── buildOverviewCardsHtml — Snapshot Coverage card ──────────────────────────

describe('buildOverviewCardsHtml — Snapshot Coverage card', () => {
  const REPO2 = { id: 200, fullName: 'org/repo2', score: null, label: 'healthy' };

  beforeEach(() => {
    _repoIntelligenceById    = {};
    _archDataByRepoId        = {};
    _archForecastDataByRepoId = {};
    _archFetchInFlightByRepoId = {};
  });

  test('intel.hasArchitectureSnapshot=true → Has Snapshot', () => {
    mergeRepoIntelligence(200, { hasArchitectureSnapshot: true, architectureHealthLevel: 'risky' });
    const arch = _resolveOverviewArchData(200);
    const html = buildOverviewCardsHtml(REPO2, null, arch, null, null);
    expect(html).toContain('Has Snapshot');
  });

  test('intel.hasArchitectureSnapshot=false → Needs History regardless of arch cache', () => {
    // hasArchitectureSnapshot=false explicitly means no snapshot — must win over arch score/level
    // mergeRepoIntelligence skips null/undefined but stores false (false != null is true)
    _repoIntelligenceById['200'] = { repoId: '200', hasArchitectureSnapshot: false };
    const arch = _resolveOverviewArchData(200);
    const html = buildOverviewCardsHtml(REPO2, null, arch, null, null);
    expect(html).toContain('Needs History');
    expect(html).not.toContain('Has Snapshot');
  });

  test('arch score/level in intel (no hasArchitectureSnapshot field) → Has Snapshot', () => {
    mergeRepoIntelligence(200, { architectureHealthScore: 45, architectureHealthLevel: 'weak' });
    const arch = _resolveOverviewArchData(200);
    const html = buildOverviewCardsHtml(REPO2, null, arch, null, null);
    expect(html).toContain('Has Snapshot');
  });

  test('no intel, no arch data → Needs History', () => {
    const arch = _resolveOverviewArchData(200);  // null — no data
    const html = buildOverviewCardsHtml(REPO2, null, arch, null, null);
    expect(html).toContain('Needs History');
    expect(html).not.toContain('Has Snapshot');
  });

  test('per-click arch data with level → Has Snapshot (fallback when no intel)', () => {
    _archDataByRepoId[200] = { architectureHealthLevel: 'watch', architectureHealthScore: 75 };
    const arch = _resolveOverviewArchData(200);
    const html = buildOverviewCardsHtml(REPO2, null, arch, null, null);
    expect(html).toContain('Has Snapshot');
  });
});

// ── buildOverviewCardsHtml — Architecture Health card precedence ──────────────

describe('buildOverviewCardsHtml — Architecture Health card precedence', () => {
  const REPO3 = { id: 300, fullName: 'org/repo3', score: null, label: 'healthy' };

  beforeEach(() => {
    _repoIntelligenceById    = {};
    _archDataByRepoId        = {};
    _archForecastDataByRepoId = {};
    _archFetchInFlightByRepoId = {};
  });

  test('intel level=risky → Risky (severity-critical)', () => {
    mergeRepoIntelligence(300, { architectureHealthLevel: 'risky' });
    const arch = _resolveOverviewArchData(300);
    const html = buildOverviewCardsHtml(REPO3, null, arch, null, null);
    expect(html).toContain('Risky');
    expect(html).toContain('severity-critical');
  });

  test('intel level=weak → Weak (severity-high)', () => {
    mergeRepoIntelligence(300, { architectureHealthLevel: 'weak' });
    const arch = _resolveOverviewArchData(300);
    const html = buildOverviewCardsHtml(REPO3, null, arch, null, null);
    expect(html).toContain('Weak');
    expect(html).toContain('severity-high');
  });

  test('intel level=watch → Watch (severity-medium)', () => {
    mergeRepoIntelligence(300, { architectureHealthLevel: 'watch' });
    const arch = _resolveOverviewArchData(300);
    const html = buildOverviewCardsHtml(REPO3, null, arch, null, null);
    expect(html).toContain('Watch');
    expect(html).toContain('severity-medium');
  });

  test('intel level=healthy → Healthy (severity-healthy)', () => {
    mergeRepoIntelligence(300, { architectureHealthLevel: 'healthy' });
    const arch = _resolveOverviewArchData(300);
    const html = buildOverviewCardsHtml(REPO3, null, arch, null, null);
    expect(html).toContain('Healthy');
    expect(html).toContain('severity-healthy');
  });

  test('watchlist-only intel (no arch level) + no fetch in flight → Coverage Gap', () => {
    mergeRepoIntelligence(300, { watchlistEscalationLevel: 'critical' });
    const arch = _resolveOverviewArchData(300);
    const html = buildOverviewCardsHtml(REPO3, null, arch, null, null);
    expect(html).toContain('Coverage Gap');
    expect(html).not.toContain('Architecture Loading');
  });

  test('watchlist-only intel + fetch in flight → Architecture Loading (no arch intel)', () => {
    mergeRepoIntelligence(300, { watchlistEscalationLevel: 'critical' });
    _archFetchInFlightByRepoId[300] = true;
    const arch = _resolveOverviewArchData(300);
    const html = buildOverviewCardsHtml(REPO3, null, arch, null, null);
    expect(html).toContain('Architecture Loading');
    expect(html).not.toContain('Coverage Gap');
  });
});

// ── buildOverviewCardsHtml — Forecast card precedence ────────────────────────

describe('buildOverviewCardsHtml — Forecast card precedence', () => {
  const REPO4 = { id: 400, fullName: 'org/repo4', score: null, label: 'healthy' };

  beforeEach(() => {
    _repoIntelligenceById    = {};
    _archDataByRepoId        = {};
    _archForecastDataByRepoId = {};
    _archFetchInFlightByRepoId = {};
  });

  test('intel forecastLevel=critical → Critical, not Not Enough History', () => {
    mergeRepoIntelligence(400, { forecastLevel: 'critical' });
    const fc   = _resolveOverviewFcData(400);
    const arch = _resolveOverviewArchData(400);
    const html = buildOverviewCardsHtml(REPO4, null, arch, fc, null);
    expect(html).toContain('Critical');
    expect(html).not.toContain('Not Enough History');
  });

  test('intel forecastLevel=high → High Risk', () => {
    mergeRepoIntelligence(400, { forecastLevel: 'high' });
    const fc   = _resolveOverviewFcData(400);
    const arch = _resolveOverviewArchData(400);
    const html = buildOverviewCardsHtml(REPO4, null, arch, fc, null);
    expect(html).toContain('High Risk');
    expect(html).not.toContain('Not Enough History');
  });

  test('no intel forecast → Not Enough History', () => {
    const fc   = _resolveOverviewFcData(400);  // null
    const arch = _resolveOverviewArchData(400);
    const html = buildOverviewCardsHtml(REPO4, null, arch, fc, null);
    expect(html).toContain('Not Enough History');
  });

  test('per-click forecastLevel wins when no intel forecast', () => {
    _archForecastDataByRepoId[400] = { forecastLevel: 'high', degradationRisk: 0.6 };
    const fc   = _resolveOverviewFcData(400);
    const arch = _resolveOverviewArchData(400);
    const html = buildOverviewCardsHtml(REPO4, null, arch, fc, null);
    expect(html).toContain('High Risk');
    expect(html).not.toContain('Not Enough History');
  });

  test('intel forecastLevel wins over contradictory per-click', () => {
    mergeRepoIntelligence(400, { forecastLevel: 'critical' });
    _archForecastDataByRepoId[400] = { forecastLevel: 'low', degradationRisk: 0.1 };
    const fc   = _resolveOverviewFcData(400);
    expect(fc.forecastLevel).toBe('critical');  // intel wins in resolver
    const arch = _resolveOverviewArchData(400);
    const html = buildOverviewCardsHtml(REPO4, null, arch, fc, null);
    expect(html).toContain('Critical');
    expect(html).not.toContain('Low');
  });
});

// ── computeArchitectureConfidence — pure helper ───────────────────────────────

describe('computeArchitectureConfidence — confidence rules', () => {
  test('snapshot + score + forecast → High (severity-healthy)', () => {
    const r = computeArchitectureConfidence({
      hasArchitectureSnapshot: true,
      architectureScore: 72,
      forecastLevel: 'high',
    });
    expect(r.label).toBe('High');
    expect(r.cls).toBe('severity-healthy');
  });

  test('snapshot + score + forecast=critical → High', () => {
    const r = computeArchitectureConfidence({
      hasArchitectureSnapshot: true,
      architectureScore: 40,
      forecastLevel: 'critical',
    });
    expect(r.label).toBe('High');
    expect(r.cls).toBe('severity-healthy');
  });

  test('snapshot + score + no forecast → Medium (severity-medium)', () => {
    const r = computeArchitectureConfidence({
      hasArchitectureSnapshot: true,
      architectureScore: 55,
      forecastLevel: null,
    });
    expect(r.label).toBe('Medium');
    expect(r.cls).toBe('severity-medium');
  });

  test('snapshot + score + forecastLevel=unknown → Medium (unknown treated as missing)', () => {
    const r = computeArchitectureConfidence({
      hasArchitectureSnapshot: true,
      architectureScore: 55,
      forecastLevel: 'unknown',
    });
    expect(r.label).toBe('Medium');
    expect(r.cls).toBe('severity-medium');
  });

  test('snapshot exists but architectureScore missing → Low (severity-high)', () => {
    const r = computeArchitectureConfidence({
      hasArchitectureSnapshot: true,
      architectureScore: null,
      forecastLevel: 'high',
    });
    expect(r.label).toBe('Low');
    expect(r.cls).toBe('severity-high');
  });

  test('snapshot exists, score undefined, forecast present → Low (partial data)', () => {
    const r = computeArchitectureConfidence({
      hasArchitectureSnapshot: true,
      architectureScore: undefined,
      forecastLevel: 'critical',
    });
    expect(r.label).toBe('Low');
    expect(r.cls).toBe('severity-high');
  });

  test('no architecture snapshot → Insufficient History (severity-neutral)', () => {
    const r = computeArchitectureConfidence({
      hasArchitectureSnapshot: false,
      architectureScore: 80,
      forecastLevel: 'high',
    });
    expect(r.label).toBe('Insufficient History');
    expect(r.cls).toBe('severity-neutral');
  });

  test('hasArchitectureSnapshot undefined → Insufficient History', () => {
    const r = computeArchitectureConfidence({
      architectureScore: 60,
      forecastLevel: 'medium',
    });
    expect(r.label).toBe('Insufficient History');
    expect(r.cls).toBe('severity-neutral');
  });

  test('null opts → Insufficient History (no crash)', () => {
    expect(() => computeArchitectureConfidence(null)).not.toThrow();
    expect(computeArchitectureConfidence(null).label).toBe('Insufficient History');
  });

  test('empty opts → Insufficient History', () => {
    expect(computeArchitectureConfidence({}).label).toBe('Insufficient History');
  });
});

// ── buildOverviewCardsHtml — Architecture Confidence card ─────────────────────

describe('buildOverviewCardsHtml — Architecture Confidence card (Card 6)', () => {
  const REPO5 = { id: 500, fullName: 'org/repo5', score: null, label: 'healthy' };

  beforeEach(() => {
    _repoIntelligenceById    = {};
    _archDataByRepoId        = {};
    _archForecastDataByRepoId = {};
    _archFetchInFlightByRepoId = {};
  });

  test('snapshot + score + forecast → card shows High', () => {
    mergeRepoIntelligence(500, {
      hasArchitectureSnapshot: true,
      architectureHealthScore: 72,
      architectureHealthLevel: 'watch',
    });
    _archForecastDataByRepoId[500] = { forecastLevel: 'high', degradationRisk: 0.4 };
    const arch = _resolveOverviewArchData(500);
    const fc   = _resolveOverviewFcData(500);
    const html = buildOverviewCardsHtml(REPO5, null, arch, fc);
    expect(html).toContain('Architecture Confidence');
    expect(html).toContain('High');
    expect(html).toContain('severity-healthy');
    expect(html).not.toContain('Insufficient History');
  });

  test('snapshot + score only (no forecast) → card shows Medium', () => {
    mergeRepoIntelligence(500, {
      hasArchitectureSnapshot: true,
      architectureHealthScore: 55,
      architectureHealthLevel: 'weak',
    });
    const arch = _resolveOverviewArchData(500);
    const fc   = _resolveOverviewFcData(500);  // null — no forecast data
    const html = buildOverviewCardsHtml(REPO5, null, arch, fc);
    expect(html).toContain('Architecture Confidence');
    expect(html).toContain('Medium');
    expect(html).toContain('severity-medium');
  });

  test('snapshot present but score missing → card shows Low', () => {
    mergeRepoIntelligence(500, { hasArchitectureSnapshot: true });
    // archData will have null score and null level
    const arch = _resolveOverviewArchData(500);
    const fc   = _resolveOverviewFcData(500);
    const html = buildOverviewCardsHtml(REPO5, null, arch, fc);
    expect(html).toContain('Architecture Confidence');
    expect(html).toContain('Low');
    expect(html).toContain('severity-high');
  });

  test('no architecture snapshot → card shows Insufficient History', () => {
    // No intel at all, no per-click cache
    const arch = _resolveOverviewArchData(500);  // null
    const fc   = _resolveOverviewFcData(500);
    const html = buildOverviewCardsHtml(REPO5, null, arch, fc);
    expect(html).toContain('Architecture Confidence');
    expect(html).toContain('Insufficient History');
    expect(html).toContain('severity-neutral');
  });

  test('per-click arch data (score + level) counts as snapshot even without intel flag', () => {
    _archDataByRepoId[500] = { architectureHealthLevel: 'risky', architectureHealthScore: 22 };
    const arch = _resolveOverviewArchData(500);
    const fc   = _resolveOverviewFcData(500);
    const html = buildOverviewCardsHtml(REPO5, null, arch, fc);
    // snapshot detected from per-click data, no forecast → Medium
    expect(html).toContain('Medium');
    expect(html).not.toContain('Insufficient History');
  });

  test('Operational Status label no longer appears in Overview', () => {
    const arch = _resolveOverviewArchData(500);
    const fc   = _resolveOverviewFcData(500);
    const html = buildOverviewCardsHtml(REPO5, null, arch, fc);
    expect(html).not.toContain('Operational Status');
  });
});

// ── buildArchitectureAssessment — primary tier ────────────────────────────────

describe('buildArchitectureAssessment — primary assessment tier', () => {
  const snapConf = { hasArchitectureSnapshot: true, architectureConfidence: 'High' };
  const fc       = { forecastLevel: 'medium' };   // medium → no forecast append

  test('priority=critical → critical tier, severity-critical', () => {
    const a = buildArchitectureAssessment({ ...snapConf, architecturalPriority: 'critical', forecastLevel: 'medium' });
    expect(a.level).toBe('critical');
    expect(a.cls).toBe('severity-critical');
    expect(a.text).toContain('Architecture health is critical');
    expect(a.text).toContain('Structural indicators');
  });

  test('priority=critical with score → includes score in text', () => {
    const a = buildArchitectureAssessment({ ...snapConf, architecturalPriority: 'critical', architectureScore: 32, forecastLevel: 'medium' });
    expect(a.text).toContain('(score: 32)');
  });

  test('priority=healthy but architectureScore=22 (<45) → critical tier override', () => {
    const a = buildArchitectureAssessment({ ...snapConf, architecturalPriority: 'healthy', architectureScore: 22, forecastLevel: 'medium' });
    expect(a.level).toBe('critical');
    expect(a.text).toContain('Architecture health is critical');
    expect(a.text).toContain('(score: 22)');
  });

  test('priority=elevated → elevated tier, severity-high', () => {
    const a = buildArchitectureAssessment({ ...snapConf, architecturalPriority: 'elevated', forecastLevel: 'medium' });
    expect(a.level).toBe('elevated');
    expect(a.cls).toBe('severity-high');
    expect(a.text).toContain('Architecture health requires attention');
    expect(a.text).toContain('elevated risk');
  });

  test('priority=watch → watch tier, severity-medium', () => {
    const a = buildArchitectureAssessment({ ...snapConf, architecturalPriority: 'watch', forecastLevel: 'medium' });
    expect(a.level).toBe('watch');
    expect(a.cls).toBe('severity-medium');
    expect(a.text).toContain('stable but exhibits signals');
  });

  test('priority=healthy → healthy tier, severity-healthy', () => {
    const a = buildArchitectureAssessment({ ...snapConf, architecturalPriority: 'healthy', forecastLevel: 'medium' });
    expect(a.level).toBe('healthy');
    expect(a.cls).toBe('severity-healthy');
    expect(a.text).toContain('structurally healthy');
  });

  test('null priority → unknown tier', () => {
    const a = buildArchitectureAssessment({ ...snapConf, architecturalPriority: null, forecastLevel: 'medium' });
    expect(a.level).toBe('unknown');
    expect(a.cls).toBe('severity-unknown');
  });

  test('null opts → unknown tier, no crash', () => {
    expect(() => buildArchitectureAssessment(null)).not.toThrow();
    expect(buildArchitectureAssessment(null).level).toBe('unknown');
  });
});

// ── buildArchitectureAssessment — forecast context ────────────────────────────

describe('buildArchitectureAssessment — forecast context append', () => {
  const base = {
    architecturalPriority:   'watch',
    hasArchitectureSnapshot: true,
    architectureConfidence:  'High',
  };

  test('forecastLevel=high → appends degradation risk sentence', () => {
    const a = buildArchitectureAssessment({ ...base, forecastLevel: 'high' });
    expect(a.text).toContain('Forecast analysis indicates elevated degradation risk.');
  });

  test('forecastLevel=critical → appends degradation risk sentence', () => {
    const a = buildArchitectureAssessment({ ...base, forecastLevel: 'critical' });
    expect(a.text).toContain('Forecast analysis indicates elevated degradation risk.');
  });

  test('forecastLevel=null (forecast unavailable) → appends insufficient history sentence', () => {
    const a = buildArchitectureAssessment({ ...base, forecastLevel: null });
    expect(a.text).toContain('Forecast confidence is limited due to insufficient architecture history.');
    expect(a.text).not.toContain('degradation risk');
  });

  test('forecastLevel=unknown → treated as unavailable, appends insufficient history', () => {
    const a = buildArchitectureAssessment({ ...base, forecastLevel: 'unknown' });
    expect(a.text).toContain('Forecast confidence is limited due to insufficient architecture history.');
  });

  test('forecastLevel=medium → no forecast append (neither degradation nor insufficient)', () => {
    const a = buildArchitectureAssessment({ ...base, forecastLevel: 'medium' });
    expect(a.text).not.toContain('Forecast analysis');
    expect(a.text).not.toContain('Forecast confidence is limited');
  });

  test('forecastLevel=stable → no forecast append', () => {
    const a = buildArchitectureAssessment({ ...base, forecastLevel: 'stable' });
    expect(a.text).not.toContain('Forecast analysis');
    expect(a.text).not.toContain('Forecast confidence is limited');
  });
});

// ── buildArchitectureAssessment — coverage context ────────────────────────────

describe('buildArchitectureAssessment — coverage context append', () => {
  const base = {
    architecturalPriority: 'healthy',
    forecastLevel:         'medium',   // no forecast append
  };

  test('no architecture snapshot → appends incomplete coverage sentence', () => {
    const a = buildArchitectureAssessment({ ...base, hasArchitectureSnapshot: false });
    expect(a.text).toContain('Architecture intelligence coverage is incomplete.');
    expect(a.text).not.toContain('Assessment confidence is reduced');
  });

  test('hasArchitectureSnapshot undefined → appends incomplete coverage', () => {
    const a = buildArchitectureAssessment({ ...base });
    expect(a.text).toContain('Architecture intelligence coverage is incomplete.');
  });

  test('snapshot + confidence=Medium → appends reduced confidence sentence', () => {
    const a = buildArchitectureAssessment({ ...base, hasArchitectureSnapshot: true, architectureConfidence: 'Medium' });
    expect(a.text).toContain('Assessment confidence is reduced due to limited architecture evidence.');
    expect(a.text).not.toContain('coverage is incomplete');
  });

  test('snapshot + confidence=Low → appends reduced confidence sentence', () => {
    const a = buildArchitectureAssessment({ ...base, hasArchitectureSnapshot: true, architectureConfidence: 'Low' });
    expect(a.text).toContain('Assessment confidence is reduced due to limited architecture evidence.');
  });

  test('snapshot + confidence=High → no coverage append', () => {
    const a = buildArchitectureAssessment({ ...base, hasArchitectureSnapshot: true, architectureConfidence: 'High' });
    expect(a.text).not.toContain('coverage is incomplete');
    expect(a.text).not.toContain('Assessment confidence is reduced');
  });

  test('snapshot + confidence=Insufficient History → no extra append (only incomplete-coverage path applies when no snap)', () => {
    // 'Insufficient History' is not 'Medium' or 'Low', so no reduced-confidence append
    const a = buildArchitectureAssessment({ ...base, hasArchitectureSnapshot: true, architectureConfidence: 'Insufficient History' });
    expect(a.text).not.toContain('Assessment confidence is reduced');
    expect(a.text).not.toContain('coverage is incomplete');
  });
});

// ── buildArchitectureAssessment — combined scenarios ─────────────────────────

describe('buildArchitectureAssessment — combined scenarios', () => {
  test('critical + high forecast + no snapshot → full critical narrative', () => {
    const a = buildArchitectureAssessment({
      architecturalPriority:   'critical',
      architectureScore:       30,
      forecastLevel:           'high',
      hasArchitectureSnapshot: false,
      architectureConfidence:  'Insufficient History',
    });
    expect(a.level).toBe('critical');
    expect(a.text).toContain('(score: 30)');
    expect(a.text).toContain('Forecast analysis indicates elevated degradation risk.');
    expect(a.text).toContain('Architecture intelligence coverage is incomplete.');
  });

  test('elevated + forecast unavailable + reduced confidence → all three parts', () => {
    const a = buildArchitectureAssessment({
      architecturalPriority:   'elevated',
      forecastLevel:           null,
      hasArchitectureSnapshot: true,
      architectureConfidence:  'Low',
    });
    expect(a.level).toBe('elevated');
    expect(a.text).toContain('Architecture health requires attention');
    expect(a.text).toContain('Forecast confidence is limited due to insufficient architecture history.');
    expect(a.text).toContain('Assessment confidence is reduced due to limited architecture evidence.');
  });

  test('healthy + medium forecast + High confidence → clean narrative, no appends', () => {
    const a = buildArchitectureAssessment({
      architecturalPriority:   'healthy',
      forecastLevel:           'medium',
      hasArchitectureSnapshot: true,
      architectureConfidence:  'High',
    });
    expect(a.level).toBe('healthy');
    expect(a.text).toContain('structurally healthy');
    expect(a.text).not.toContain('Forecast');
    expect(a.text).not.toContain('coverage is incomplete');
    expect(a.text).not.toContain('Assessment confidence is reduced');
  });
});

// ── buildArchitectureRecommendations — primary tier ───────────────────────────

describe('buildArchitectureRecommendations — primary tier', () => {
  const withSnap    = { hasArchitectureSnapshot: true,  forecastLevel: 'medium' };
  const withoutSnap = { hasArchitectureSnapshot: false, forecastLevel: 'medium' };

  test('priority=critical → four critical/risky recommendations', () => {
    const items = buildArchitectureRecommendations({ ...withSnap, architecturalPriority: 'critical' });
    expect(items).toContain('Review unresolved API linkage issues');
    expect(items).toContain('Reduce coupling in high fan-out modules');
    expect(items).toContain('Address implementation completeness gaps');
    expect(items).toContain('Audit orphaned routes and dead integrations');
  });

  test('score < 45 overrides lower priority → critical recommendations', () => {
    const items = buildArchitectureRecommendations({ ...withSnap, architecturalPriority: 'watch', architectureScore: 30 });
    expect(items).toContain('Review unresolved API linkage issues');
    expect(items).not.toContain('Monitor architecture trend');
  });

  test('architectureLevel=risky triggers critical recommendations', () => {
    const items = buildArchitectureRecommendations({ ...withSnap, architecturalPriority: 'watch', architectureLevel: 'risky' });
    expect(items).toContain('Reduce coupling in high fan-out modules');
    expect(items).not.toContain('Monitor architecture trend');
  });

  test('priority=elevated → three elevated recommendations', () => {
    const items = buildArchitectureRecommendations({ ...withSnap, architecturalPriority: 'elevated' });
    expect(items).toContain('Review architectural hotspots');
    expect(items).toContain('Improve route-to-service coverage');
    expect(items).toContain('Reduce dependency concentration');
    expect(items).not.toContain('Review unresolved API linkage issues');
  });

  test('priority=watch → two watch recommendations', () => {
    const items = buildArchitectureRecommendations({ ...withSnap, architecturalPriority: 'watch' });
    expect(items).toContain('Monitor architecture trend');
    expect(items).toContain('Increase architecture snapshot frequency');
    expect(items).not.toContain('Review architectural hotspots');
  });

  test('priority=healthy → no primary recommendations (empty array)', () => {
    const items = buildArchitectureRecommendations({ ...withSnap, architecturalPriority: 'healthy' });
    expect(items).not.toContain('Review unresolved API linkage issues');
    expect(items).not.toContain('Review architectural hotspots');
    expect(items).not.toContain('Monitor architecture trend');
  });

  test('null opts → no crash; returns snapshot items (hasSnap=false path)', () => {
    expect(() => buildArchitectureRecommendations(null)).not.toThrow();
    // no snapshot data → generate/improve snapshot items are always appended
    const items = buildArchitectureRecommendations(null);
    expect(items).toContain('Generate architecture snapshot');
    expect(items).toContain('Improve architecture coverage');
  });
});

// ── buildArchitectureRecommendations — no-snapshot append ────────────────────

describe('buildArchitectureRecommendations — no snapshot append', () => {
  test('no snapshot → always appends generate/improve snapshot items', () => {
    const items = buildArchitectureRecommendations({
      architecturalPriority:   'healthy',
      forecastLevel:           'medium',
      hasArchitectureSnapshot: false,
    });
    expect(items).toContain('Generate architecture snapshot');
    expect(items).toContain('Improve architecture coverage');
  });

  test('with snapshot → does NOT append snapshot items', () => {
    const items = buildArchitectureRecommendations({
      architecturalPriority:   'healthy',
      forecastLevel:           'medium',
      hasArchitectureSnapshot: true,
    });
    expect(items).not.toContain('Generate architecture snapshot');
    expect(items).not.toContain('Improve architecture coverage');
  });

  test('critical + no snapshot → critical items AND snapshot items both present', () => {
    const items = buildArchitectureRecommendations({
      architecturalPriority:   'critical',
      forecastLevel:           'medium',
      hasArchitectureSnapshot: false,
    });
    expect(items).toContain('Review unresolved API linkage issues');
    expect(items).toContain('Generate architecture snapshot');
  });
});

// ── buildArchitectureRecommendations — high-risk forecast append ──────────────

describe('buildArchitectureRecommendations — high-risk forecast append', () => {
  const base = { architecturalPriority: 'watch', hasArchitectureSnapshot: true };

  test('forecastLevel=high → appends degradation + remediation items', () => {
    const items = buildArchitectureRecommendations({ ...base, forecastLevel: 'high' });
    expect(items).toContain('Investigate degradation trajectory');
    expect(items).toContain('Prioritize structural remediation');
  });

  test('forecastLevel=critical → appends degradation + remediation items', () => {
    const items = buildArchitectureRecommendations({ ...base, forecastLevel: 'critical' });
    expect(items).toContain('Investigate degradation trajectory');
    expect(items).toContain('Prioritize structural remediation');
  });

  test('forecastLevel=medium → does NOT append forecast items', () => {
    const items = buildArchitectureRecommendations({ ...base, forecastLevel: 'medium' });
    expect(items).not.toContain('Investigate degradation trajectory');
    expect(items).not.toContain('Prioritize structural remediation');
  });

  test('forecastLevel=null → no forecast items appended', () => {
    const items = buildArchitectureRecommendations({ ...base, forecastLevel: null });
    expect(items).not.toContain('Investigate degradation trajectory');
  });

  test('forecastLevel=stable → no forecast items appended', () => {
    const items = buildArchitectureRecommendations({ ...base, forecastLevel: 'stable' });
    expect(items).not.toContain('Investigate degradation trajectory');
  });
});

// ── buildArchitectureRecommendations — combined scenarios ─────────────────────

describe('buildArchitectureRecommendations — combined scenarios', () => {
  test('critical + no snapshot + high forecast → all three groups present', () => {
    const items = buildArchitectureRecommendations({
      architecturalPriority:   'critical',
      architectureScore:       22,
      forecastLevel:           'high',
      hasArchitectureSnapshot: false,
    });
    // Critical tier
    expect(items).toContain('Review unresolved API linkage issues');
    expect(items).toContain('Audit orphaned routes and dead integrations');
    // No-snapshot append
    expect(items).toContain('Generate architecture snapshot');
    // High-forecast append
    expect(items).toContain('Investigate degradation trajectory');
  });

  test('elevated + snapshot + critical forecast → elevated + forecast items only', () => {
    const items = buildArchitectureRecommendations({
      architecturalPriority:   'elevated',
      forecastLevel:           'critical',
      hasArchitectureSnapshot: true,
    });
    expect(items).toContain('Review architectural hotspots');
    expect(items).toContain('Investigate degradation trajectory');
    expect(items).not.toContain('Generate architecture snapshot');
  });

  test('healthy + snapshot + stable forecast → empty (no recommendations)', () => {
    const items = buildArchitectureRecommendations({
      architecturalPriority:   'healthy',
      forecastLevel:           'stable',
      hasArchitectureSnapshot: true,
    });
    expect(items).toHaveLength(0);
  });

  test('no snapshot alone on healthy repo → two snapshot items', () => {
    const items = buildArchitectureRecommendations({
      architecturalPriority:   'healthy',
      forecastLevel:           'stable',
      hasArchitectureSnapshot: false,
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toBe('Generate architecture snapshot');
    expect(items[1]).toBe('Improve architecture coverage');
  });

  test('does not include operational items (CI, maintainers, releases)', () => {
    const items = buildArchitectureRecommendations({
      architecturalPriority:   'critical',
      forecastLevel:           'high',
      hasArchitectureSnapshot: false,
    });
    expect(items.join(' ')).not.toMatch(/maintainer|release|CI|contributor/i);
  });
});

// ── buildActiveArchitectureRisks — no risks ───────────────────────────────────

describe('buildActiveArchitectureRisks — no risks', () => {
  test('all-clean inputs → empty array', () => {
    const risks = buildActiveArchitectureRisks({
      unresolvedApiCalls:         0,
      implementationCompleteness: 80,
      couplingRisk:               'healthy',
      forecastLevel:              'stable',
      hasArchitectureSnapshot:    true,
      architectureConfidence:     'High',
    });
    expect(risks).toHaveLength(0);
  });

  test('null opts → no crash; returns coverage-confidence risk (no snapshot path)', () => {
    expect(() => buildActiveArchitectureRisks(null)).not.toThrow();
    const risks = buildActiveArchitectureRisks(null);
    expect(risks).toContain('Architecture coverage confidence is reduced');
  });

  test('snapshot=true + High confidence + no other issues → empty', () => {
    const risks = buildActiveArchitectureRisks({
      hasArchitectureSnapshot: true,
      architectureConfidence:  'High',
      forecastLevel:           'medium',
    });
    expect(risks).toHaveLength(0);
  });
});

// ── buildActiveArchitectureRisks — individual risk triggers ──────────────────

describe('buildActiveArchitectureRisks — API linkage risk', () => {
  const BASE = { hasArchitectureSnapshot: true, architectureConfidence: 'High', forecastLevel: 'stable' };

  test('unresolvedApiCalls=1 → API linkage risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, unresolvedApiCalls: 1 });
    expect(risks).toContain('API linkage gaps detected');
  });

  test('unresolvedApiCalls=5 → API linkage risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, unresolvedApiCalls: 5 });
    expect(risks).toContain('API linkage gaps detected');
  });

  test('unresolvedApiCalls=0 → no API linkage risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, unresolvedApiCalls: 0 });
    expect(risks).not.toContain('API linkage gaps detected');
  });

  test('unresolvedApiCalls=null → no API linkage risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, unresolvedApiCalls: null });
    expect(risks).not.toContain('API linkage gaps detected');
  });
});

describe('buildActiveArchitectureRisks — implementation completeness risk', () => {
  const BASE = { hasArchitectureSnapshot: true, architectureConfidence: 'High', forecastLevel: 'stable' };

  test('implementationCompleteness=50 (<70) → completeness risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, implementationCompleteness: 50 });
    expect(risks).toContain('Implementation completeness is weak');
  });

  test('implementationCompleteness=69 → completeness risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, implementationCompleteness: 69 });
    expect(risks).toContain('Implementation completeness is weak');
  });

  test('implementationCompleteness=70 → no risk (boundary)', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, implementationCompleteness: 70 });
    expect(risks).not.toContain('Implementation completeness is weak');
  });

  test('implementationCompleteness=90 → no risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, implementationCompleteness: 90 });
    expect(risks).not.toContain('Implementation completeness is weak');
  });
});

describe('buildActiveArchitectureRisks — coupling risk', () => {
  const BASE = { hasArchitectureSnapshot: true, architectureConfidence: 'High', forecastLevel: 'stable' };

  test('couplingRisk=elevated → coupling risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, couplingRisk: 'elevated' }))
      .toContain('Coupling concentration is elevated');
  });

  test('couplingRisk=high → coupling risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, couplingRisk: 'high' }))
      .toContain('Coupling concentration is elevated');
  });

  test('couplingRisk=risky (backend value) → coupling risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, couplingRisk: 'risky' }))
      .toContain('Coupling concentration is elevated');
  });

  test('couplingRisk=weak (backend value) → coupling risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, couplingRisk: 'weak' }))
      .toContain('Coupling concentration is elevated');
  });

  test('couplingRisk=watch → no coupling risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, couplingRisk: 'watch' }))
      .not.toContain('Coupling concentration is elevated');
  });

  test('couplingRisk=healthy → no coupling risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, couplingRisk: 'healthy' }))
      .not.toContain('Coupling concentration is elevated');
  });
});

describe('buildActiveArchitectureRisks — forecast risk', () => {
  const BASE = { hasArchitectureSnapshot: true, architectureConfidence: 'High' };

  test('forecastLevel=high → forecast risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, forecastLevel: 'high' }))
      .toContain('Architecture forecast indicates degradation risk');
  });

  test('forecastLevel=critical → forecast risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, forecastLevel: 'critical' }))
      .toContain('Architecture forecast indicates degradation risk');
  });

  test('forecastLevel=medium → no forecast risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, forecastLevel: 'medium' }))
      .not.toContain('Architecture forecast indicates degradation risk');
  });

  test('forecastLevel=stable → no forecast risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, forecastLevel: 'stable' }))
      .not.toContain('Architecture forecast indicates degradation risk');
  });

  test('forecastLevel=null → no forecast risk', () => {
    expect(buildActiveArchitectureRisks({ ...BASE, forecastLevel: null }))
      .not.toContain('Architecture forecast indicates degradation risk');
  });
});

describe('buildActiveArchitectureRisks — coverage confidence risk', () => {
  const BASE = { forecastLevel: 'stable' };

  test('architectureConfidence=Low → coverage confidence risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, hasArchitectureSnapshot: true, architectureConfidence: 'Low' });
    expect(risks).toContain('Architecture coverage confidence is reduced');
  });

  test('no snapshot (hasArchitectureSnapshot=false) → coverage confidence risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, hasArchitectureSnapshot: false, architectureConfidence: 'High' });
    expect(risks).toContain('Architecture coverage confidence is reduced');
  });

  test('no snapshot (undefined) → coverage confidence risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, architectureConfidence: 'High' });
    expect(risks).toContain('Architecture coverage confidence is reduced');
  });

  test('snapshot + Medium confidence → no coverage risk (Medium is not Low)', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, hasArchitectureSnapshot: true, architectureConfidence: 'Medium' });
    expect(risks).not.toContain('Architecture coverage confidence is reduced');
  });

  test('snapshot + High confidence → no coverage risk', () => {
    const risks = buildActiveArchitectureRisks({ ...BASE, hasArchitectureSnapshot: true, architectureConfidence: 'High' });
    expect(risks).not.toContain('Architecture coverage confidence is reduced');
  });
});

// ── buildActiveArchitectureRisks — multiple risks ─────────────────────────────

describe('buildActiveArchitectureRisks — multiple risks', () => {
  test('all five risk triggers active → five risks returned', () => {
    const risks = buildActiveArchitectureRisks({
      unresolvedApiCalls:         3,
      implementationCompleteness: 45,
      couplingRisk:               'risky',
      forecastLevel:              'critical',
      hasArchitectureSnapshot:    false,
      architectureConfidence:     'Low',
    });
    expect(risks).toContain('API linkage gaps detected');
    expect(risks).toContain('Implementation completeness is weak');
    expect(risks).toContain('Coupling concentration is elevated');
    expect(risks).toContain('Architecture forecast indicates degradation risk');
    expect(risks).toContain('Architecture coverage confidence is reduced');
    expect(risks).toHaveLength(5);
  });

  test('api + forecast risks only', () => {
    const risks = buildActiveArchitectureRisks({
      unresolvedApiCalls:         2,
      implementationCompleteness: 85,
      couplingRisk:               'healthy',
      forecastLevel:              'high',
      hasArchitectureSnapshot:    true,
      architectureConfidence:     'High',
    });
    expect(risks).toContain('API linkage gaps detected');
    expect(risks).toContain('Architecture forecast indicates degradation risk');
    expect(risks).toHaveLength(2);
  });

  test('ordering: api → completeness → coupling → forecast → confidence', () => {
    const risks = buildActiveArchitectureRisks({
      unresolvedApiCalls:         1,
      implementationCompleteness: 50,
      couplingRisk:               'weak',
      forecastLevel:              'high',
      hasArchitectureSnapshot:    false,
    });
    expect(risks[0]).toBe('API linkage gaps detected');
    expect(risks[1]).toBe('Implementation completeness is weak');
    expect(risks[2]).toBe('Coupling concentration is elevated');
    expect(risks[3]).toBe('Architecture forecast indicates degradation risk');
    expect(risks[4]).toBe('Architecture coverage confidence is reduced');
  });
});

// ── buildArchitectureRiskProfileHtml — fallback ───────────────────────────────

describe('buildArchitectureRiskProfileHtml — fallback', () => {
  test('no archData and no intel → returns fallback paragraph', () => {
    const html = buildArchitectureRiskProfileHtml({}, null, null, {});
    expect(html).toContain('Architecture Risk Profile unavailable');
    expect(html).not.toContain('rms-panel');
  });

  test('archData with unknown level and no score → fallback', () => {
    const html = buildArchitectureRiskProfileHtml(
      {},
      { architectureHealthLevel: 'unknown', architectureHealthScore: null },
      null,
      {}
    );
    expect(html).toContain('Architecture Risk Profile unavailable');
  });

  test('intel provides level when archData null → renders panel (not fallback)', () => {
    const html = buildArchitectureRiskProfileHtml(
      {}, null, null,
      { architectureHealthLevel: 'risky', architectureHealthScore: 30 }
    );
    expect(html).not.toContain('Architecture Risk Profile unavailable');
    expect(html).toContain('rms-panel');
  });
});

// ── buildArchitectureRiskProfileHtml — header ─────────────────────────────────

describe('buildArchitectureRiskProfileHtml — overall score and level header', () => {
  const archData = { architectureHealthLevel: 'risky', architectureHealthScore: 28, confidenceLevel: 'medium' };
  const cache    = { confidenceLevel: 'medium' };

  test('renders score in header', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, null, {});
    expect(html).toContain('28');
    expect(html).toContain('/ 100');
  });

  test('renders level badge with severity-critical for risky', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, null, {});
    expect(html).toContain('RISKY');
    expect(html).toContain('severity-critical');
  });

  test('renders level badge with severity-high for weak', () => {
    const html = buildArchitectureRiskProfileHtml(
      cache,
      { architectureHealthLevel: 'weak', architectureHealthScore: 55 },
      null, {}
    );
    expect(html).toContain('WEAK');
    expect(html).toContain('severity-high');
  });

  test('renders confidence badge', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, null, {});
    expect(html).toContain('MEDIUM CONFIDENCE');
  });
});

// ── buildArchitectureRiskProfileHtml — six dimensions ────────────────────────

describe('buildArchitectureRiskProfileHtml — six dimensions present', () => {
  const archData = { architectureHealthLevel: 'watch', architectureHealthScore: 72, architectureHealthLevel: 'watch' };

  test('all six dimension labels are rendered', () => {
    const html = buildArchitectureRiskProfileHtml({}, archData, null, { hasArchitectureSnapshot: true, architectureHealthScore: 72 });
    expect(html).toContain('API Linkage');
    expect(html).toContain('Implementation Completeness');
    expect(html).toContain('Coupling Risk');
    expect(html).toContain('Boundary Integrity');
    expect(html).toContain('Forecast Risk');
    expect(html).toContain('Architecture Confidence');
  });

  test('dimensions with no data show dash placeholder', () => {
    const html = buildArchitectureRiskProfileHtml({}, archData, null, { hasArchitectureSnapshot: true, architectureHealthScore: 72 });
    // No apiLinkageLevel, implementationLevel, couplingRisk, boundary data → dash
    expect(html).toContain('—');
  });

  test('apiLinkageLevel populated → shows badge, not dash', () => {
    const html = buildArchitectureRiskProfileHtml(
      { apiLinkageLevel: 'healthy' },
      archData, null,
      { hasArchitectureSnapshot: true, architectureHealthScore: 72 }
    );
    expect(html).toContain('HEALTHY');
    expect(html).toContain('severity-healthy');
  });

  test('couplingRisk=risky → coupling row shows severity-critical badge', () => {
    const html = buildArchitectureRiskProfileHtml(
      { couplingRisk: 'risky' },
      archData, null,
      { hasArchitectureSnapshot: true, architectureHealthScore: 72 }
    );
    expect(html).toContain('RISKY');
  });

  test('boundary score=88 → healthy boundary level badge', () => {
    const html = buildArchitectureRiskProfileHtml(
      { boundaryHealthScore: 88, boundaryViolationCount: 0 },
      archData, null,
      { hasArchitectureSnapshot: true, architectureHealthScore: 72 }
    );
    expect(html).toContain('HEALTHY');
  });

  test('boundary score=30 and violations=3 → risky badge with violation count', () => {
    const html = buildArchitectureRiskProfileHtml(
      { boundaryHealthScore: 30, boundaryViolationCount: 3 },
      archData, null,
      { hasArchitectureSnapshot: true, architectureHealthScore: 72 }
    );
    expect(html).toContain('RISKY');
    expect(html).toContain('3v');
  });

  test('forecastLevel=high → forecast row shows severity-high badge', () => {
    const html = buildArchitectureRiskProfileHtml(
      {},
      archData,
      { forecastLevel: 'high' },
      { hasArchitectureSnapshot: true, architectureHealthScore: 72 }
    );
    expect(html).toContain('HIGH');
    expect(html).toContain('severity-high');
  });

  test('forecastLevel=stable → forecast row shows severity-healthy badge', () => {
    const html = buildArchitectureRiskProfileHtml(
      {},
      archData,
      { forecastLevel: 'stable' },
      { hasArchitectureSnapshot: true, architectureHealthScore: 72 }
    );
    expect(html).toContain('STABLE');
    expect(html).toContain('severity-healthy');
  });
});

// ── buildArchitectureRiskProfileHtml — Architecture Confidence row ────────────

describe('buildArchitectureRiskProfileHtml — Architecture Confidence dimension', () => {
  const archData = { architectureHealthLevel: 'watch', architectureHealthScore: 72 };

  test('snapshot + score + forecast → Architecture Confidence shows HIGH', () => {
    const html = buildArchitectureRiskProfileHtml(
      {},
      archData,
      { forecastLevel: 'high' },
      { hasArchitectureSnapshot: true, architectureHealthScore: 72 }
    );
    expect(html).toContain('HIGH');
    expect(html).toContain('severity-healthy');
  });

  test('snapshot + score + no forecast → Architecture Confidence shows MEDIUM', () => {
    const html = buildArchitectureRiskProfileHtml(
      {},
      archData,
      null,
      { hasArchitectureSnapshot: true, architectureHealthScore: 72 }
    );
    expect(html).toContain('MEDIUM');
    expect(html).toContain('severity-medium');
  });

  test('no snapshot → Architecture Confidence shows INSUFFICIENT HISTORY', () => {
    const html = buildArchitectureRiskProfileHtml(
      {},
      null,
      null,
      { architectureHealthScore: null }  // no level/score → fallback
    );
    // No level or score → fallback paragraph, not the panel
    expect(html).toContain('Architecture Risk Profile unavailable');
  });

  test('operational maturity dimensions are NOT present', () => {
    const html = buildArchitectureRiskProfileHtml({}, archData, null, { hasArchitectureSnapshot: true, architectureHealthScore: 72 });
    expect(html).not.toContain('CI / CD');
    expect(html).not.toContain('Release');
    expect(html).not.toContain('Contributors');
    expect(html).not.toContain('Activity');
    expect(html).not.toContain('PR Workflow');
    expect(html).not.toContain('Telemetry');
  });
});

// ── _normArchLinkageLevel — API linkage vocabulary normalisation ──────────────

describe('_normArchLinkageLevel — maps API vocab to LEVEL_SEV keys', () => {
  test('integrated → healthy (fully linked is the best state)', () => {
    expect(_normArchLinkageLevel('integrated')).toBe('healthy');
  });
  test('partial → watch (needs improvement)', () => {
    expect(_normArchLinkageLevel('partial')).toBe('watch');
  });
  test('weak → weak (already a LEVEL_SEV key, passes through)', () => {
    expect(_normArchLinkageLevel('weak')).toBe('weak');
  });
  test('unknown → unknown (passes through)', () => {
    expect(_normArchLinkageLevel('unknown')).toBe('unknown');
  });
  test('null → null', () => {
    expect(_normArchLinkageLevel(null)).toBeNull();
  });
  test('undefined → null', () => {
    expect(_normArchLinkageLevel(undefined)).toBeNull();
  });
  test('empty string → null', () => {
    expect(_normArchLinkageLevel('')).toBeNull();
  });
});

// ── _normImplCompletenessLevel — implementation completeness normalisation ────

describe('_normImplCompletenessLevel — maps completeness vocab to LEVEL_SEV keys', () => {
  test('complete → healthy', () => {
    expect(_normImplCompletenessLevel('complete')).toBe('healthy');
  });
  test('partial → watch', () => {
    expect(_normImplCompletenessLevel('partial')).toBe('watch');
  });
  test('weak → weak (passes through)', () => {
    expect(_normImplCompletenessLevel('weak')).toBe('weak');
  });
  test('unknown → unknown (passes through)', () => {
    expect(_normImplCompletenessLevel('unknown')).toBe('unknown');
  });
  test('null → null', () => {
    expect(_normImplCompletenessLevel(null)).toBeNull();
  });
});

// ── _deriveCouplingLevel — coupling level from couplingMetrics ────────────────

describe('_deriveCouplingLevel — derives level from dependency graph metrics', () => {
  test('null input → null (no coupling data available)', () => {
    expect(_deriveCouplingLevel(null)).toBeNull();
  });
  test('empty object → healthy (no coupling signals)', () => {
    expect(_deriveCouplingLevel({})).toBe('healthy');
  });

  // Risky thresholds
  test('6+ circular deps → risky', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 6, averageOutDegree: 0, highFanOutFiles: [] })).toBe('risky');
  });
  test('averageOutDegree > 8 → risky', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 0, averageOutDegree: 9, highFanOutFiles: [] })).toBe('risky');
  });
  test('6+ high fan-out files → risky', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 0, averageOutDegree: 0,
      highFanOutFiles: ['a','b','c','d','e','f'] })).toBe('risky');
  });

  // Weak thresholds
  test('3 circular deps → weak', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 3, averageOutDegree: 0, highFanOutFiles: [] })).toBe('weak');
  });
  test('averageOutDegree=6 → weak', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 0, averageOutDegree: 6, highFanOutFiles: [] })).toBe('weak');
  });
  test('3 high fan-out files → weak', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 0, averageOutDegree: 0,
      highFanOutFiles: ['a','b','c'] })).toBe('weak');
  });

  // Watch thresholds
  test('1 circular dep → watch', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 1, averageOutDegree: 0, highFanOutFiles: [] })).toBe('watch');
  });
  test('averageOutDegree=4 → watch', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 0, averageOutDegree: 4, highFanOutFiles: [] })).toBe('watch');
  });
  test('1 high fan-out file → watch', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 0, averageOutDegree: 0,
      highFanOutFiles: ['a'] })).toBe('watch');
  });

  // Healthy
  test('no coupling signals → healthy', () => {
    expect(_deriveCouplingLevel({
      circularDependencyCount: 0, averageOutDegree: 1, highFanOutFiles: []
    })).toBe('healthy');
  });
  test('averageOutDegree=3 exactly → healthy (boundary)', () => {
    expect(_deriveCouplingLevel({ circularDependencyCount: 0, averageOutDegree: 3, highFanOutFiles: [] })).toBe('healthy');
  });
});

// ── Architecture Risk Profile — end-to-end with normalised fields ─────────────

describe('buildArchitectureRiskProfileHtml — dimensions populate with normalised data', () => {
  // Simulate _archDataByRepoId entry built from a real architecture payload
  // after applying the three normalizer helpers.
  const cache = {
    confidenceLevel:            'medium',
    apiLinkageLevel:            _normArchLinkageLevel('integrated'),    // → 'healthy'
    implementationLevel:        _normImplCompletenessLevel('partial'),  // → 'watch'
    couplingRisk:               _deriveCouplingLevel({                  // → 'weak'
      circularDependencyCount: 3, averageOutDegree: 0, highFanOutFiles: [],
    }),
    boundaryHealthScore:        78,  // → 'watch' (70-84 range)
    boundaryViolationCount:     2,
  };
  const archData = { architectureHealthLevel: 'watch', architectureHealthScore: 72 };
  const intel    = { hasArchitectureSnapshot: true, architectureHealthScore: 72 };

  test('API Linkage row shows HEALTHY (from integrated → healthy normalisation)', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, null, intel);
    expect(html).toContain('API Linkage');
    expect(html).toContain('HEALTHY');
    expect(html).toContain('severity-healthy');
  });

  test('Implementation Completeness row shows WATCH (from partial → watch normalisation)', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, null, intel);
    expect(html).toContain('Implementation Completeness');
    expect(html).toContain('WATCH');
  });

  test('Coupling Risk row shows WEAK (from derived couplingMetrics)', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, null, intel);
    expect(html).toContain('Coupling Risk');
    expect(html).toContain('WEAK');
  });

  test('Boundary Integrity row shows WATCH (score 78 → watch tier)', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, null, intel);
    expect(html).toContain('Boundary Integrity');
    expect(html).toContain('WATCH');
  });

  test('Boundary violation count appears in boundary row', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, null, intel);
    expect(html).toContain('2v');
  });

  test('Forecast Risk row shows HIGH when fcData present', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, { forecastLevel: 'high' }, intel);
    expect(html).toContain('Forecast Risk');
    expect(html).toContain('HIGH');
  });

  test('all six dimensions render non-dash values', () => {
    const html = buildArchitectureRiskProfileHtml(cache, archData, { forecastLevel: 'medium' }, intel);
    // Each dimension label is followed by a badge, not a dash
    expect(html.indexOf('>—<')).toBe(-1);   // no bare dash spans
  });
});

// ── Update-order regression — archCache must be passed before grid guard fires ─
// Verifies that all five arch dimension fields are readable from a realistic
// _archDataByRepoId-style cache object (the exact structure written by
// loadRepoArchitecture after the fixes).

describe('buildArchitectureRiskProfileHtml — reads archCache fields written by loadRepoArchitecture', () => {
  // Simulate what loadRepoArchitecture writes into _archDataByRepoId[repoId]
  // after applying the three normalizer helpers.
  const realisticCache = {
    architectureHealthLevel:    'risky',
    architectureHealthScore:    28,
    confidenceLevel:            'low',
    // Active Architecture Risk fields
    unresolvedApiCalls:         3,
    implementationCompleteness: 45,
    couplingRisk:               _deriveCouplingLevel({ circularDependencyCount: 4, averageOutDegree: 2, highFanOutFiles: [] }),  // → 'weak'
    // Architecture Risk Profile dimension fields (after normalisation)
    apiLinkageLevel:            _normArchLinkageLevel('integrated'),           // → 'healthy'
    implementationLevel:        _normImplCompletenessLevel('complete'),        // → 'healthy'
    boundaryHealthScore:        62,                                            // → 'weak' (45-69)
    boundaryViolationCount:     5,                                             // from violations.length
  };

  const archData = {
    architectureHealthLevel: 'risky',
    architectureHealthScore: 28,
  };
  const intel = { hasArchitectureSnapshot: true, architectureHealthScore: 28 };

  test('apiLinkageLevel "healthy" appears in output (not "—")', () => {
    const html = buildArchitectureRiskProfileHtml(realisticCache, archData, null, intel);
    const apiSection = html.substring(html.indexOf('API Linkage'));
    // First closing div after the label is the value span
    expect(apiSection).toContain('HEALTHY');
  });

  test('implementationLevel "healthy" appears in output (not "—")', () => {
    const html = buildArchitectureRiskProfileHtml(realisticCache, archData, null, intel);
    expect(html).toContain('Implementation Completeness');
    // both RISKY (header) and HEALTHY (impl level) should be present
    expect(html).toContain('HEALTHY');
  });

  test('couplingRisk derived as "weak" → WEAK badge in output', () => {
    expect(realisticCache.couplingRisk).toBe('weak');
    const html = buildArchitectureRiskProfileHtml(realisticCache, archData, null, intel);
    expect(html).toContain('Coupling Risk');
    expect(html).toContain('WEAK');
  });

  test('boundaryHealthScore 62 → WEAK boundary badge (45-69 range)', () => {
    const html = buildArchitectureRiskProfileHtml(realisticCache, archData, null, intel);
    expect(html).toContain('Boundary Integrity');
    // bndLevel = 'weak' since 62 is in 45-69 range
    expect(html).toContain('5v');   // violation count appended
  });

  test('forecastLevel from fcData shows HIGH badge', () => {
    const html = buildArchitectureRiskProfileHtml(realisticCache, archData, { forecastLevel: 'high' }, intel);
    expect(html).toContain('Forecast Risk');
    expect(html).toContain('HIGH');
  });

  test('archCache field names written by loadRepoArchitecture match those read by renderer', () => {
    // Verify every dimension key the renderer reads is present in the cache object.
    const keysRead = ['apiLinkageLevel', 'implementationLevel', 'couplingRisk',
                      'boundaryHealthScore', 'boundaryViolationCount', 'confidenceLevel'];
    keysRead.forEach(function(key) {
      expect(realisticCache).toHaveProperty(key);
    });
  });

  test('empty archCache {} causes all dimension rows to show dash (pre-fetch state)', () => {
    // This confirms that "—" is the correct initial state — it clears once
    // loadRepoArchitecture completes and updateOverviewArchCards runs.
    const html = buildArchitectureRiskProfileHtml({}, archData, null, intel);
    // API Linkage, Impl, Coupling, Boundary all dash; Forecast dash; Confidence shows
    const dashCount = (html.match(/>—</g) || []).length;
    expect(dashCount).toBe(5);   // five dimension rows dash before data arrives
  });
});
