'use strict';

// predictChangeRisk
// Deterministic change-risk prediction for proposed or incoming code changes.
// NOT an LLM integration — all logic is rule-based and deterministic.
//
// Input:  { change, repository, architectureSnapshot, governance, forecast,
//            anomaly, regression, couplingAlert, watchlistItem }
//
// Output: changeRiskScore, changeRiskLevel, confidenceLevel, summary,
//         riskFactors, impactedAreas, recommendedReview, mitigationChecklist,
//         releaseGuidance
//
// Pure function — no I/O, no AI/LLM, no mutation of input, deterministic output.

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeNum(v)  { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
function _safeStr(v)  { return typeof v === 'string' ? v : ''; }
function _safeArray(v){ return Array.isArray(v) ? v : []; }
function _isObj(v)    { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function _safeBool(v) { return v === true; }
function _clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function _lc(s)       { return _safeStr(s).toLowerCase(); }

// ── Intelligence source counting ──────────────────────────────────────────────

const INTEL_FIELDS = [
  'repository', 'architectureSnapshot', 'governance', 'forecast',
  'anomaly', 'regression', 'couplingAlert', 'watchlistItem',
];

function _intelSources(input) {
  let n = 0;
  for (const f of INTEL_FIELDS) {
    if (_isObj(input[f])) n++;
  }
  return n;
}

// ── Change validity ───────────────────────────────────────────────────────────

function _hasChangeData(change) {
  if (!_isObj(change)) return false;
  if (_safeArray(change.filesChanged).length > 0) return true;
  return _safeBool(change.hasAuthChanged)       ||
         _safeBool(change.hasApiChanged)        ||
         _safeBool(change.hasMigrationChanged)  ||
         _safeBool(change.hasDependencyChanged) ||
         _safeBool(change.hasConfigChanged)     ||
         _safeBool(change.hasTestsChanged)      ||
         _safeBool(change.hasFrontendChanged)   ||
         _safeBool(change.hasBackendChanged)    ||
         _safeNum(change.commitCount) > 0;
}

function _hasFileDetails(change) {
  return _isObj(change) && _safeArray(change.filesChanged).length > 0;
}

// ── Confidence ────────────────────────────────────────────────────────────────

function _confidenceLevel(change, intelCount) {
  if (_hasFileDetails(change) && intelCount >= 3) return 'high';
  if (_hasFileDetails(change) && intelCount >= 1) return 'medium';
  return 'low';
}

// ── Path classification ───────────────────────────────────────────────────────

const PATH_RULES = {
  api:          [/\/api\//i, /routes?\//i, /\/fetch\//i, /client\./i, /swagger/i],
  database:     [/migrat/i, /\.sql$/i, /\/db\//i, /database/i, /schema/i],
  auth:         [/\/auth\//i, /session/i, /token/i, /oauth/i, /\/login/i, /\/logout/i, /password/i],
  frontend:     [/\/frontend\//i, /\/components?\//i, /\/pages?\//i, /dashboard/i,
                 /\.jsx$/i, /\.tsx$/i, /\.html$/i, /\.css$/i, /\.scss$/i],
  backend:      [/\/backend\//i, /server\./i, /\/routes?\//i, /\/middleware\//i, /\/execution\//i],
  dependencies: [/package\.json$/i, /package-lock\.json$/i, /yarn\.lock$/i, /pnpm-lock/i],
  tests:        [/\/tests?\//i, /\.spec\./i, /__tests__/i, /\.test\./i],
  architecture: [/\/execution\/architecture\//i, /\/architecture\//i],
};

const HOTSPOT_PATTERNS = [/routes?\//i, /services?\//i, /models?\//i, /execution\/architecture\//i];

function _classifyPath(path) {
  const areas = new Set();
  for (const [area, patterns] of Object.entries(PATH_RULES)) {
    for (const pat of patterns) {
      if (pat.test(path)) { areas.add(area); break; }
    }
  }
  return areas;
}

function _isHotspot(path) {
  return HOTSPOT_PATTERNS.some(function(p) { return p.test(path); });
}

// ── Risk factor helpers ───────────────────────────────────────────────────────

function _factor(type, severity, summary, evidence) {
  return { type, severity, summary, evidence };
}

// ── Change-level risk scoring ─────────────────────────────────────────────────

function _changeRiskPoints(change) {
  const factors = [];
  let score = 0;

  const files  = _safeArray(change.filesChanged);
  const fCount = files.length;
  const churn  = files.reduce(function(s, f) {
    return s + _safeNum(f.additions) + _safeNum(f.deletions);
  }, 0);

  // File count — exclusive tiers
  if (fCount > 50) {
    score += 25;
    factors.push(_factor('large_changeset', 'high',
      fCount + ' files changed — large changeset increases integration risk.',
      { filesChanged: fCount }));
  } else if (fCount > 20) {
    score += 15;
    factors.push(_factor('large_changeset', 'medium',
      fCount + ' files changed — moderately large changeset.',
      { filesChanged: fCount }));
  }

  // Churn — exclusive tiers
  if (churn > 1500) {
    score += 30;
    factors.push(_factor('high_churn', 'critical',
      churn + ' line changes — very high churn significantly increases defect probability.',
      { totalChurn: churn }));
  } else if (churn > 500) {
    score += 15;
    factors.push(_factor('high_churn', 'medium',
      churn + ' line changes — elevated churn increases review burden.',
      { totalChurn: churn }));
  }

  // Commit count
  if (_safeNum(change.commitCount) > 5) {
    score += 8;
    factors.push(_factor('many_commits', 'low',
      change.commitCount + ' commits — larger commit history requires more thorough review.',
      { commitCount: change.commitCount }));
  }

  // Author count
  if (_safeNum(change.authorCount) > 2) {
    score += 8;
    factors.push(_factor('multiple_authors', 'low',
      change.authorCount + ' authors — multi-author changes risk coordination gaps.',
      { authorCount: change.authorCount }));
  }

  // No tests while code changed
  const hasCode = fCount > 0 && !files.every(function(f) {
    const p = _lc(_safeStr(f.path));
    return p.includes('test') || p.includes('spec') || p.includes('__tests__');
  });
  if (hasCode && !_safeBool(change.hasTestsChanged)) {
    score += 12;
    factors.push(_factor('no_test_coverage', 'high',
      'Code changed without test updates — regression risk unverified.',
      { hasTestsChanged: false }));
  }

  // Config
  if (_safeBool(change.hasConfigChanged)) {
    score += 10;
    factors.push(_factor('config_change', 'medium',
      'Configuration changes affect runtime behavior and may cause environment-specific failures.',
      { hasConfigChanged: true }));
  }

  // Migration
  if (_safeBool(change.hasMigrationChanged)) {
    score += 18;
    factors.push(_factor('database_migration', 'high',
      'Database migration detected — irreversible schema changes require careful planning.',
      { hasMigrationChanged: true }));
  }

  // Dependency
  if (_safeBool(change.hasDependencyChanged)) {
    score += 16;
    factors.push(_factor('dependency_change', 'high',
      'Dependency changes introduce external supply-chain and compatibility risk.',
      { hasDependencyChanged: true }));
  }

  // Auth
  if (_safeBool(change.hasAuthChanged)) {
    score += 25;
    factors.push(_factor('auth_change', 'critical',
      'Authentication/authorization changes carry critical security implications.',
      { hasAuthChanged: true }));
  }

  // API
  if (_safeBool(change.hasApiChanged)) {
    score += 18;
    factors.push(_factor('api_change', 'high',
      'API changes may break client contracts and downstream integrations.',
      { hasApiChanged: true }));
  }

  // Full-stack (frontend + backend both changed)
  if (_safeBool(change.hasFrontendChanged) && _safeBool(change.hasBackendChanged)) {
    score += 12;
    factors.push(_factor('full_stack_change', 'medium',
      'Full-stack change spans frontend and backend — synchronization and contract alignment required.',
      { hasFrontendChanged: true, hasBackendChanged: true }));
  }

  // Deleted files
  const deletedCount = files.filter(function(f) {
    return _safeStr(f.status) === 'deleted';
  }).length;
  if (deletedCount > 0) {
    score += 10;
    factors.push(_factor('deleted_files', 'medium',
      deletedCount + ' file(s) deleted — deletion may break dependent consumers.',
      { deletedCount }));
  }

  // Architecture hotspot files
  const hotspotFiles = files.filter(function(f) { return _isHotspot(_safeStr(f.path)); });
  if (hotspotFiles.length > 0) {
    score += 15;
    factors.push(_factor('hotspot_files', 'high',
      hotspotFiles.length + ' file(s) in architecture hotspot locations (routes/services/models/architecture).',
      { hotspotCount: hotspotFiles.length,
        examples: hotspotFiles.slice(0, 3).map(function(f) { return f.path; }) }));
  }

  return { score, factors };
}

// ── Intelligence risk scoring ─────────────────────────────────────────────────

function _intelRiskPoints(input) {
  const factors = [];
  let score = 0;

  // Governance
  const gov = input.governance;
  if (_isObj(gov)) {
    const gl = _safeStr(gov.governanceLevel);
    if (gl === 'critical') {
      score += 20;
      factors.push(_factor('governance_critical', 'critical',
        'Portfolio governance is critical — changes in a critically governed portfolio carry elevated systemic risk.',
        { governanceLevel: gl, governanceScore: _safeNum(gov.governanceScore) }));
    } else if (gl === 'weak') {
      score += 12;
      factors.push(_factor('governance_weak', 'high',
        'Portfolio governance is weak — insufficient engineering controls increase change risk.',
        { governanceLevel: gl, governanceScore: _safeNum(gov.governanceScore) }));
    }
  }

  // Forecast
  const fc = input.forecast;
  if (_isObj(fc)) {
    const fl = _safeStr(fc.forecastLevel);
    if (fl === 'critical') {
      score += 20;
      factors.push(_factor('forecast_critical', 'critical',
        'Architecture forecast is critical — changes into a degrading system amplify risk.',
        { forecastLevel: fl, degradationRisk: _safeNum(fc.degradationRisk) }));
    } else if (fl === 'degrading') {
      score += 12;
      factors.push(_factor('forecast_degrading', 'high',
        'Architecture forecast is degrading — changes against a declining trajectory require extra scrutiny.',
        { forecastLevel: fl, degradationRisk: _safeNum(fc.degradationRisk) }));
    }
  }

  // Anomaly
  const an = input.anomaly;
  if (_isObj(an)) {
    const al = _safeStr(an.anomalyLevel);
    if (al === 'critical') {
      score += 18;
      factors.push(_factor('anomaly_critical', 'critical',
        'Active critical architecture anomaly — changes during anomaly state risk compounding instability.',
        { anomalyLevel: al }));
    } else if (al === 'anomaly') {
      score += 10;
      factors.push(_factor('anomaly_active', 'high',
        'Active architecture anomaly detected — heightened instability in the repository.',
        { anomalyLevel: al }));
    }
  }

  // Regression
  const rg = input.regression;
  if (_isObj(rg)) {
    const rl = _safeStr(rg.regressionLevel);
    if (rl === 'critical') {
      score += 18;
      factors.push(_factor('regression_critical', 'critical',
        'Active critical architecture regression — changes risk accelerating structural deterioration.',
        { regressionLevel: rl, regressionScore: _safeNum(rg.regressionScore) }));
    } else if (rl === 'regression') {
      score += 10;
      factors.push(_factor('regression_active', 'high',
        'Active architecture regression — repository is undergoing structural deterioration.',
        { regressionLevel: rl, regressionScore: _safeNum(rg.regressionScore) }));
    }
  }

  // Coupling alert
  const ca = input.couplingAlert;
  if (_isObj(ca)) {
    const cl = _safeStr(ca.alertLevel);
    if (cl === 'critical') {
      score += 18;
      factors.push(_factor('coupling_critical', 'critical',
        'Critical coupling alert active — changes risk worsening dependency entanglement.',
        { alertLevel: cl, couplingGrowthScore: _safeNum(ca.couplingGrowthScore) }));
    } else if (cl === 'alert') {
      score += 10;
      factors.push(_factor('coupling_alert', 'high',
        'Coupling alert active — dependency structure is under pressure.',
        { alertLevel: cl }));
    }
  }

  // Watchlist
  const wi = input.watchlistItem;
  if (_isObj(wi)) {
    const el = _safeStr(wi.escalationLevel);
    if (el === 'critical') {
      score += 20;
      factors.push(_factor('watchlist_critical', 'critical',
        'Repository is on the critical watchlist — changes require board-level review.',
        { escalationLevel: el, priorityScore: _safeNum(wi.priorityScore) }));
    } else if (el === 'urgent') {
      score += 12;
      factors.push(_factor('watchlist_urgent', 'high',
        'Repository is on the urgent watchlist — elevated scrutiny required for all changes.',
        { escalationLevel: el, priorityScore: _safeNum(wi.priorityScore) }));
    }
  }

  return { score, factors };
}

// ── Impacted areas ────────────────────────────────────────────────────────────

function _impactedAreas(change, input) {
  const areas = {
    architecture: false,
    api:          false,
    database:     false,
    auth:         false,
    frontend:     false,
    backend:      false,
    dependencies: false,
    tests:        false,
    governance:   false,
  };

  if (!_isObj(change)) return areas;

  // Explicit boolean flags
  if (_safeBool(change.hasApiChanged))        areas.api          = true;
  if (_safeBool(change.hasAuthChanged))       areas.auth         = true;
  if (_safeBool(change.hasMigrationChanged))  areas.database     = true;
  if (_safeBool(change.hasDependencyChanged)) areas.dependencies = true;
  if (_safeBool(change.hasFrontendChanged))   areas.frontend     = true;
  if (_safeBool(change.hasBackendChanged))    areas.backend      = true;
  if (_safeBool(change.hasTestsChanged))      areas.tests        = true;

  // Path-based inference
  for (const file of _safeArray(change.filesChanged)) {
    const classified = _classifyPath(_safeStr(file.path));
    for (const area of classified) {
      areas[area] = true;
    }
  }

  // Governance-related intelligence sources → governance area
  const govFields = ['governance', 'forecast', 'anomaly', 'regression', 'couplingAlert', 'watchlistItem'];
  if (govFields.some(function(f) { return _isObj(input[f]); })) {
    areas.governance = true;
  }

  return areas;
}

// ── Recommended review ────────────────────────────────────────────────────────

const REVIEW_RANK = { standard: 1, senior: 2, architecture: 3, security: 4, release_board: 5 };

function _recommendedReview(score, change, areas, input) {
  let level = 'standard';
  const rationale  = [];
  const reviewers  = [];

  function _escalate(l) {
    if ((REVIEW_RANK[l] || 0) > (REVIEW_RANK[level] || 0)) level = l;
  }

  // Auth → security
  if (areas.auth || _safeBool(change.hasAuthChanged)) {
    _escalate('security');
    rationale.push('Authentication/authorization code changed');
    reviewers.push('Security engineer');
  }

  // Migration + high/critical score → release_board
  if ((_safeBool(change.hasMigrationChanged) || areas.database) && score >= 50) {
    _escalate('release_board');
    rationale.push('Database migration in a high-risk change');
    reviewers.push('Release manager', 'DBA');
  }

  // Architecture / API boundary / coupling / regression signal → architecture review
  const archSignal =
    areas.architecture ||
    areas.api ||
    (_isObj(input.couplingAlert) &&
     ['critical','alert'].includes(_safeStr(input.couplingAlert.alertLevel))) ||
    (_isObj(input.regression) &&
     ['critical','regression'].includes(_safeStr(input.regression.regressionLevel)));

  if (archSignal) {
    _escalate('architecture');
    rationale.push('Architecture or API boundary affected');
    reviewers.push('Architecture reviewer');
  }

  // High risk → senior
  if (score >= 50) {
    _escalate('senior');
    rationale.push('High risk score (' + score + ') requires senior review');
    reviewers.push('Senior engineer');
  }

  if (rationale.length === 0) {
    rationale.push('Low risk change — standard review sufficient');
  }

  // Deduplicate reviewers
  const seen = new Set();
  const dedupedReviewers = reviewers.filter(function(r) {
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });

  return {
    requiredReviewLevel: level,
    reviewers:  dedupedReviewers,
    rationale:  rationale.join('; '),
  };
}

// ── Mitigation checklist ──────────────────────────────────────────────────────

function _mitigationChecklist(score, change, areas) {
  const items = [];

  function _add(item, reason, priority) {
    items.push({ item, reason, priority });
  }

  // No tests while code exists
  const files   = _safeArray(change.filesChanged);
  const hasCode = files.length > 0 && !files.every(function(f) {
    const p = _lc(_safeStr(f.path));
    return p.includes('test') || p.includes('spec') || p.includes('__tests__');
  });
  if (hasCode && !_safeBool(change.hasTestsChanged) && !areas.tests) {
    _add('Add or update tests for changed code',
         'Code was modified without test coverage updates — regression risk unverified',
         'high');
  }

  // Auth → security review
  if (areas.auth || _safeBool(change.hasAuthChanged)) {
    _add('Conduct security and authentication review',
         'Auth changes carry critical security implications',
         'critical');
  }

  // Migration / database → rollback plan
  if (_safeBool(change.hasMigrationChanged) || areas.database) {
    _add('Document and test migration rollback procedure',
         'Database schema changes are irreversible without a tested rollback plan',
         'critical');
  }

  // Dependency → audit
  if (_safeBool(change.hasDependencyChanged) || areas.dependencies) {
    _add('Audit new/changed dependencies for vulnerabilities',
         'Dependency changes introduce supply-chain and compatibility risk',
         'high');
  }

  // API → contract validation
  if (_safeBool(change.hasApiChanged) || areas.api) {
    _add('Validate API contracts against consumers',
         'API changes risk breaking downstream integrations',
         'high');
  }

  // Architecture files touched
  if (areas.architecture) {
    _add('Architecture review before merge',
         'Architecture-sensitive files modified — structural impact assessment needed',
         'high');
  }

  // High/critical risk → staging + rollback
  if (score >= 50) {
    _add('Validate in staging environment before production',
         'High risk score requires staging validation to catch integration failures',
         'high');
    _add('Prepare and document rollback plan',
         'High risk changes require a ready rollback strategy',
         'high');
  }

  // Config
  if (_safeBool(change.hasConfigChanged)) {
    _add('Verify configuration changes across all environments',
         'Config changes can cause environment-specific failures',
         'medium');
  }

  return items;
}

// ── Release guidance ──────────────────────────────────────────────────────────

function _releaseGuidance(score, change, areas) {
  const criticalArea =
    areas.auth         || _safeBool(change.hasAuthChanged)       ||
    areas.database     || _safeBool(change.hasMigrationChanged)  ||
    areas.dependencies || _safeBool(change.hasDependencyChanged);

  const canFastTrack =
    score < 25 &&
    (_safeBool(change.hasTestsChanged) || areas.tests) &&
    !criticalArea;

  return {
    canFastTrack,
    requiresStaging:            score >= 25,
    requiresRollbackPlan:       score >= 50,
    requiresSecurityReview:     areas.auth || _safeBool(change.hasAuthChanged),
    requiresMigrationPlan:      _safeBool(change.hasMigrationChanged) || areas.database,
    requiresArchitectureReview: areas.architecture && score >= 50,
  };
}

// ── Level and summary ─────────────────────────────────────────────────────────

function _changeRiskLevel(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function _summary(level, score, factorCount, confidenceLevel) {
  if (level === 'unknown') {
    return 'Insufficient change data — risk cannot be assessed.';
  }
  const factorStr = factorCount === 1 ? '1 risk factor' : factorCount + ' risk factors';
  if (level === 'critical') {
    return 'Critical change risk — ' + factorStr + ' identified (score: ' + score +
           ', ' + confidenceLevel + ' confidence). Board-level review recommended.';
  }
  if (level === 'high') {
    return 'High change risk — ' + factorStr + ' identified (score: ' + score +
           ', ' + confidenceLevel + ' confidence). Senior and architecture review required.';
  }
  if (level === 'medium') {
    return 'Medium change risk — ' + factorStr + ' identified (score: ' + score +
           ', ' + confidenceLevel + ' confidence). Thorough review recommended.';
  }
  return 'Low change risk — ' + factorStr + ' identified (score: ' + score +
         ', ' + confidenceLevel + ' confidence). Standard review sufficient.';
}

// ── Unknown result ────────────────────────────────────────────────────────────

function _emptyAreas() {
  return {
    architecture: false, api: false, database: false, auth: false,
    frontend: false, backend: false, dependencies: false, tests: false, governance: false,
  };
}

function _unknownResult() {
  return {
    changeRiskScore:     0,
    changeRiskLevel:     'unknown',
    confidenceLevel:     'low',
    summary:             'Insufficient change data — risk cannot be assessed.',
    riskFactors:         [],
    impactedAreas:       _emptyAreas(),
    recommendedReview:   { requiredReviewLevel: 'standard', reviewers: [], rationale: 'Insufficient change data' },
    mitigationChecklist: [],
    releaseGuidance:     {
      canFastTrack:               false,
      requiresStaging:            false,
      requiresRollbackPlan:       false,
      requiresSecurityReview:     false,
      requiresMigrationPlan:      false,
      requiresArchitectureReview: false,
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function predictChangeRisk(input) {
  if (!_isObj(input)) return _unknownResult();

  const change = input.change;
  if (!_hasChangeData(change)) return _unknownResult();

  const intelCount      = _intelSources(input);
  const confidenceLevel = _confidenceLevel(change, intelCount);

  const changeResult = _changeRiskPoints(change);
  const intelResult  = _intelRiskPoints(input);

  const changeRiskScore = _clamp(changeResult.score + intelResult.score, 0, 100);
  const allFactors      = changeResult.factors.concat(intelResult.factors);
  const changeRiskLevel = _changeRiskLevel(changeRiskScore);

  const areas    = _impactedAreas(change, input);
  const review   = _recommendedReview(changeRiskScore, change, areas, input);
  const checklist = _mitigationChecklist(changeRiskScore, change, areas);
  const guidance  = _releaseGuidance(changeRiskScore, change, areas);
  const summary   = _summary(changeRiskLevel, changeRiskScore, allFactors.length, confidenceLevel);

  return {
    changeRiskScore,
    changeRiskLevel,
    confidenceLevel,
    summary,
    riskFactors:         allFactors,
    impactedAreas:       areas,
    recommendedReview:   review,
    mitigationChecklist: checklist,
    releaseGuidance:     guidance,
  };
}

module.exports = { predictChangeRisk };
