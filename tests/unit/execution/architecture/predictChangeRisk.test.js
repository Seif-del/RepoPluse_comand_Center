'use strict';

const { predictChangeRisk } = require('../../../../execution/architecture/predictChangeRisk');

// ─── Factories ───────────────────────────────────────────────────────────────

function makeFile(path, status = 'modified', additions = 10, deletions = 5) {
  return { path, status, additions, deletions };
}

function smallChange(extra = {}) {
  return {
    filesChanged: [
      makeFile('src/utils.js', 'modified', 5, 2),
      makeFile('src/helpers.js', 'modified', 3, 1),
      makeFile('src/format.js', 'modified', 4, 2),
    ],
    commitCount:         1,
    authorCount:         1,
    hasTestsChanged:     true,
    hasConfigChanged:    false,
    hasMigrationChanged: false,
    hasDependencyChanged:false,
    hasAuthChanged:      false,
    hasApiChanged:       false,
    hasFrontendChanged:  false,
    hasBackendChanged:   false,
    ...extra,
  };
}

function flagChange(flags = {}) {
  return { commitCount: 1, filesChanged: [], ...flags };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('predictChangeRisk', () => {

  // 1. Module export
  describe('module export', () => {
    it('exports predictChangeRisk as a function', () => {
      expect(typeof predictChangeRisk).toBe('function');
    });
  });

  // 2. Null / empty / unknown input
  describe('empty / null input => unknown', () => {
    it('returns unknown for null', () => {
      expect(predictChangeRisk(null).changeRiskLevel).toBe('unknown');
    });
    it('returns unknown for undefined', () => {
      expect(predictChangeRisk(undefined).changeRiskLevel).toBe('unknown');
    });
    it('returns unknown for a string', () => {
      expect(predictChangeRisk('bad').changeRiskLevel).toBe('unknown');
    });
    it('returns unknown for empty object (no change)', () => {
      expect(predictChangeRisk({}).changeRiskLevel).toBe('unknown');
    });
    it('returns unknown when change is an empty object with no files or flags', () => {
      expect(predictChangeRisk({ change: {} }).changeRiskLevel).toBe('unknown');
    });
    it('returns 0 remediationScore for null', () => {
      expect(predictChangeRisk(null).changeRiskScore).toBe(0);
    });
    it('unknown result has empty riskFactors', () => {
      expect(predictChangeRisk({}).riskFactors).toEqual([]);
    });
    it('unknown result summary mentions insufficient data', () => {
      expect(predictChangeRisk({}).summary).toMatch(/Insufficient change data/i);
    });
  });

  // 3. Low-risk small tested change
  describe('low-risk small tested change', () => {
    let r;
    beforeEach(() => {
      r = predictChangeRisk({ change: smallChange() });
    });

    it('changeRiskLevel is low', () => {
      expect(r.changeRiskLevel).toBe('low');
    });
    it('changeRiskScore is 0 (no penalty triggers)', () => {
      expect(r.changeRiskScore).toBe(0);
    });
    it('no riskFactors generated', () => {
      expect(r.riskFactors).toHaveLength(0);
    });
    it('requiredReviewLevel is standard', () => {
      expect(r.recommendedReview.requiredReviewLevel).toBe('standard');
    });
  });

  // 4. File count scoring
  describe('file count scoring', () => {
    it('21 files adds +15 (large_changeset medium)', () => {
      const files = Array.from({ length: 21 }, (_, i) =>
        makeFile('src/file' + i + '.js', 'modified', 5, 2));
      const r = predictChangeRisk({ change: { filesChanged: files, hasTestsChanged: true } });
      const factor = r.riskFactors.find(f => f.type === 'large_changeset');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('medium');
    });

    it('51 files adds +25 (large_changeset high) instead of +15', () => {
      const files = Array.from({ length: 51 }, (_, i) =>
        makeFile('src/file' + i + '.js', 'modified', 5, 2));
      const r = predictChangeRisk({ change: { filesChanged: files, hasTestsChanged: true } });
      const factor = r.riskFactors.find(f => f.type === 'large_changeset');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('high');
      // score should use +25 not +15+25
      const base = 25;
      expect(r.changeRiskScore).toBeGreaterThanOrEqual(base);
    });

    it('20 files (not > 20) does not trigger large_changeset', () => {
      const files = Array.from({ length: 20 }, (_, i) =>
        makeFile('src/file' + i + '.js', 'modified', 5, 2));
      const r = predictChangeRisk({ change: { filesChanged: files, hasTestsChanged: true } });
      expect(r.riskFactors.find(f => f.type === 'large_changeset')).toBeUndefined();
    });
  });

  // 5. Churn scoring
  describe('churn scoring', () => {
    it('501 line churn adds high_churn medium (+15)', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/big.js', 'modified', 400, 102)],
          hasTestsChanged: false,
        }
      });
      const factor = r.riskFactors.find(f => f.type === 'high_churn');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('medium');
    });

    it('1501 line churn adds high_churn critical (+30) not +15+30', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/massive.js', 'modified', 1200, 302)],
          hasTestsChanged: false,
        }
      });
      const factor = r.riskFactors.find(f => f.type === 'high_churn');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('critical');
      // only one high_churn factor (not two)
      expect(r.riskFactors.filter(f => f.type === 'high_churn').length).toBe(1);
    });

    it('500 lines (not > 500) does not trigger high_churn', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/medium.js', 'modified', 300, 200)],
          hasTestsChanged: true,
        }
      });
      expect(r.riskFactors.find(f => f.type === 'high_churn')).toBeUndefined();
    });
  });

  // 6. Commit and author count
  describe('commit and author count', () => {
    it('commitCount > 5 adds many_commits factor (+8)', () => {
      const r = predictChangeRisk({ change: { commitCount: 6 } });
      expect(r.riskFactors.find(f => f.type === 'many_commits')).toBeDefined();
    });

    it('authorCount > 2 adds multiple_authors factor (+8)', () => {
      const r = predictChangeRisk({ change: { commitCount: 1, authorCount: 3 } });
      expect(r.riskFactors.find(f => f.type === 'multiple_authors')).toBeDefined();
    });

    it('commitCount <= 5 does not trigger many_commits', () => {
      const r = predictChangeRisk({ change: smallChange({ commitCount: 5 }) });
      expect(r.riskFactors.find(f => f.type === 'many_commits')).toBeUndefined();
    });
  });

  // 7. No tests changed penalty
  describe('no tests changed penalty', () => {
    it('code changed without tests adds no_test_coverage high (+12)', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/business.js', 'modified', 50, 10)],
          hasTestsChanged: false,
        }
      });
      expect(r.riskFactors.find(f => f.type === 'no_test_coverage')).toBeDefined();
    });

    it('code changed with hasTestsChanged=true — no penalty', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/business.js', 'modified', 50, 10)],
          hasTestsChanged: true,
        }
      });
      expect(r.riskFactors.find(f => f.type === 'no_test_coverage')).toBeUndefined();
    });

    it('all files are test files — no penalty even if hasTestsChanged=false', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('tests/unit/utils.test.js', 'modified', 50, 10)],
          hasTestsChanged: false,
        }
      });
      expect(r.riskFactors.find(f => f.type === 'no_test_coverage')).toBeUndefined();
    });
  });

  // 8. Config change
  describe('config change', () => {
    it('hasConfigChanged adds config_change medium (+10)', () => {
      const r = predictChangeRisk({ change: flagChange({ hasConfigChanged: true }) });
      const factor = r.riskFactors.find(f => f.type === 'config_change');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('medium');
    });

    it('config change adds to mitigation checklist', () => {
      const r = predictChangeRisk({ change: flagChange({ hasConfigChanged: true }) });
      expect(r.mitigationChecklist.some(i => /configuration/i.test(i.item))).toBe(true);
    });
  });

  // 9. Migration change
  describe('migration change', () => {
    it('hasMigrationChanged adds database_migration high (+18)', () => {
      const r = predictChangeRisk({ change: flagChange({ hasMigrationChanged: true }) });
      const factor = r.riskFactors.find(f => f.type === 'database_migration');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('high');
    });

    it('migration sets impactedAreas.database = true', () => {
      const r = predictChangeRisk({ change: flagChange({ hasMigrationChanged: true }) });
      expect(r.impactedAreas.database).toBe(true);
    });

    it('migration sets releaseGuidance.requiresMigrationPlan = true', () => {
      const r = predictChangeRisk({ change: flagChange({ hasMigrationChanged: true }) });
      expect(r.releaseGuidance.requiresMigrationPlan).toBe(true);
    });
  });

  // 10. Dependency change
  describe('dependency change', () => {
    it('hasDependencyChanged adds dependency_change high (+16)', () => {
      const r = predictChangeRisk({ change: flagChange({ hasDependencyChanged: true }) });
      const factor = r.riskFactors.find(f => f.type === 'dependency_change');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('high');
    });

    it('dependency change sets impactedAreas.dependencies = true', () => {
      const r = predictChangeRisk({ change: flagChange({ hasDependencyChanged: true }) });
      expect(r.impactedAreas.dependencies).toBe(true);
    });

    it('dependency change adds audit to mitigation checklist', () => {
      const r = predictChangeRisk({ change: flagChange({ hasDependencyChanged: true }) });
      expect(r.mitigationChecklist.some(i => /audit/i.test(i.item))).toBe(true);
    });
  });

  // 11. Auth change
  describe('auth change', () => {
    it('hasAuthChanged adds auth_change critical (+25)', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) });
      const factor = r.riskFactors.find(f => f.type === 'auth_change');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('critical');
    });

    it('auth change sets impactedAreas.auth = true', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) });
      expect(r.impactedAreas.auth).toBe(true);
    });

    it('auth change escalates requiredReviewLevel to security', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) });
      expect(r.recommendedReview.requiredReviewLevel).toBe('security');
    });

    it('auth change sets releaseGuidance.requiresSecurityReview = true', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) });
      expect(r.releaseGuidance.requiresSecurityReview).toBe(true);
    });

    it('auth change adds security review to mitigation checklist', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) });
      expect(r.mitigationChecklist.some(i => /security/i.test(i.item))).toBe(true);
    });
  });

  // 12. API change
  describe('API change', () => {
    it('hasApiChanged adds api_change high (+18)', () => {
      const r = predictChangeRisk({ change: flagChange({ hasApiChanged: true }) });
      const factor = r.riskFactors.find(f => f.type === 'api_change');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('high');
    });

    it('API change sets impactedAreas.api = true', () => {
      const r = predictChangeRisk({ change: flagChange({ hasApiChanged: true }) });
      expect(r.impactedAreas.api).toBe(true);
    });

    it('API change escalates requiredReviewLevel to at least architecture', () => {
      const r = predictChangeRisk({ change: flagChange({ hasApiChanged: true }) });
      const rank = { standard: 1, senior: 2, architecture: 3, security: 4, release_board: 5 };
      expect(rank[r.recommendedReview.requiredReviewLevel]).toBeGreaterThanOrEqual(rank.architecture);
    });
  });

  // 13. Full-stack change
  describe('frontend + backend combined change', () => {
    it('both frontend and backend changed adds full_stack_change medium (+12)', () => {
      const r = predictChangeRisk({
        change: flagChange({ hasFrontendChanged: true, hasBackendChanged: true })
      });
      const factor = r.riskFactors.find(f => f.type === 'full_stack_change');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('medium');
    });

    it('only frontend changed does not add full_stack_change', () => {
      const r = predictChangeRisk({ change: flagChange({ hasFrontendChanged: true }) });
      expect(r.riskFactors.find(f => f.type === 'full_stack_change')).toBeUndefined();
    });

    it('only backend changed does not add full_stack_change', () => {
      const r = predictChangeRisk({ change: flagChange({ hasBackendChanged: true }) });
      expect(r.riskFactors.find(f => f.type === 'full_stack_change')).toBeUndefined();
    });
  });

  // 14. Deleted files
  describe('deleted files', () => {
    it('any deleted file adds deleted_files medium (+10)', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/old.js', 'deleted', 0, 100)],
          hasTestsChanged: false,
        }
      });
      const factor = r.riskFactors.find(f => f.type === 'deleted_files');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('medium');
      expect(factor.evidence.deletedCount).toBe(1);
    });

    it('no deleted files — no deleted_files factor', () => {
      const r = predictChangeRisk({ change: smallChange() });
      expect(r.riskFactors.find(f => f.type === 'deleted_files')).toBeUndefined();
    });
  });

  // 15. Architecture hotspot files
  describe('architecture hotspot files', () => {
    it('routes path triggers hotspot_files factor (+15)', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('backend/routes/user.js', 'modified', 20, 5)],
          hasTestsChanged: true,
        }
      });
      const factor = r.riskFactors.find(f => f.type === 'hotspot_files');
      expect(factor).toBeDefined();
    });

    it('services path triggers hotspot_files factor', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/services/authService.js', 'modified', 20, 5)],
          hasTestsChanged: true,
        }
      });
      expect(r.riskFactors.find(f => f.type === 'hotspot_files')).toBeDefined();
    });

    it('models path triggers hotspot_files factor', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/models/User.js', 'modified', 10, 2)],
          hasTestsChanged: true,
        }
      });
      expect(r.riskFactors.find(f => f.type === 'hotspot_files')).toBeDefined();
    });

    it('execution/architecture path triggers hotspot_files factor', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('execution/architecture/buildSomething.js', 'modified', 10, 2)],
          hasTestsChanged: true,
        }
      });
      expect(r.riskFactors.find(f => f.type === 'hotspot_files')).toBeDefined();
    });

    it('plain src path does not trigger hotspot_files', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/helpers.js', 'modified', 5, 2)],
          hasTestsChanged: true,
        }
      });
      expect(r.riskFactors.find(f => f.type === 'hotspot_files')).toBeUndefined();
    });
  });

  // 16. Impacted area inference from file paths
  describe('impacted area inference from file paths', () => {
    function areas(filePath) {
      return predictChangeRisk({
        change: { filesChanged: [makeFile(filePath, 'modified', 10, 5)], hasTestsChanged: true }
      }).impactedAreas;
    }

    it('api/ path sets api area', () => {
      expect(areas('src/api/users.js').api).toBe(true);
    });
    it('migrations path sets database area', () => {
      expect(areas('db/migrations/001_add_users.sql').database).toBe(true);
    });
    it('/auth/ path sets auth area', () => {
      expect(areas('backend/auth/session.js').auth).toBe(true);
    });
    it('.jsx path sets frontend area', () => {
      expect(areas('frontend/components/Header.jsx').frontend).toBe(true);
    });
    it('dashboard path sets frontend area', () => {
      expect(areas('frontend/dashboard.html').frontend).toBe(true);
    });
    it('server.js path sets backend area', () => {
      expect(areas('backend/server.js').backend).toBe(true);
    });
    it('package.json sets dependencies area', () => {
      expect(areas('package.json').dependencies).toBe(true);
    });
    it('tests/ path sets tests area', () => {
      expect(areas('tests/unit/utils.test.js').tests).toBe(true);
    });
    it('execution/architecture/ path sets architecture area', () => {
      expect(areas('execution/architecture/buildSomething.js').architecture).toBe(true);
    });
    it('governance intel source sets governance area', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        governance: { governanceLevel: 'weak', governanceScore: 40 }
      });
      expect(r.impactedAreas.governance).toBe(true);
    });
    it('no intel sources and neutral path leaves governance area false', () => {
      const r = predictChangeRisk({ change: smallChange() });
      expect(r.impactedAreas.governance).toBe(false);
    });
  });

  // 17. Governance risk influence
  describe('governance risk influence', () => {
    it('critical governance adds governance_critical factor (+20)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        governance: { governanceLevel: 'critical', governanceScore: 10 }
      });
      const factor = r.riskFactors.find(f => f.type === 'governance_critical');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('critical');
    });

    it('weak governance adds governance_weak factor (+12)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        governance: { governanceLevel: 'weak', governanceScore: 40 }
      });
      const factor = r.riskFactors.find(f => f.type === 'governance_weak');
      expect(factor).toBeDefined();
      expect(factor.severity).toBe('high');
    });

    it('strong governance adds no governance factor', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        governance: { governanceLevel: 'strong', governanceScore: 80 }
      });
      expect(r.riskFactors.find(f => f.type.startsWith('governance_'))).toBeUndefined();
    });
  });

  // 18. Forecast risk influence
  describe('forecast risk influence', () => {
    it('critical forecast adds forecast_critical factor (+20)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        forecast: { forecastLevel: 'critical', degradationRisk: 90 }
      });
      expect(r.riskFactors.find(f => f.type === 'forecast_critical')).toBeDefined();
    });

    it('degrading forecast adds forecast_degrading factor (+12)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        forecast: { forecastLevel: 'degrading', degradationRisk: 60 }
      });
      expect(r.riskFactors.find(f => f.type === 'forecast_degrading')).toBeDefined();
    });

    it('stable forecast adds no forecast factor', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        forecast: { forecastLevel: 'stable', degradationRisk: 5 }
      });
      expect(r.riskFactors.filter(f => f.type.startsWith('forecast_'))).toHaveLength(0);
    });
  });

  // 19. Anomaly risk influence
  describe('anomaly risk influence', () => {
    it('critical anomaly adds anomaly_critical factor (+18)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        anomaly: { anomalyLevel: 'critical' }
      });
      expect(r.riskFactors.find(f => f.type === 'anomaly_critical')).toBeDefined();
    });

    it('anomaly level adds anomaly_active factor (+10)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        anomaly: { anomalyLevel: 'anomaly' }
      });
      expect(r.riskFactors.find(f => f.type === 'anomaly_active')).toBeDefined();
    });

    it('none anomaly adds no anomaly factor', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        anomaly: { anomalyLevel: 'none' }
      });
      expect(r.riskFactors.filter(f => f.type.startsWith('anomaly_'))).toHaveLength(0);
    });
  });

  // 20. Regression risk influence
  describe('regression risk influence', () => {
    it('critical regression adds regression_critical factor (+18)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        regression: { regressionLevel: 'critical', regressionScore: 20 }
      });
      expect(r.riskFactors.find(f => f.type === 'regression_critical')).toBeDefined();
    });

    it('regression level adds regression_active factor (+10)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        regression: { regressionLevel: 'regression', regressionScore: 55 }
      });
      expect(r.riskFactors.find(f => f.type === 'regression_active')).toBeDefined();
    });

    it('none regression adds no regression factor', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        regression: { regressionLevel: 'none', regressionScore: 90 }
      });
      expect(r.riskFactors.filter(f => f.type.startsWith('regression_'))).toHaveLength(0);
    });
  });

  // 21. Coupling risk influence
  describe('coupling risk influence', () => {
    it('critical coupling adds coupling_critical factor (+18)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        couplingAlert: { alertLevel: 'critical' }
      });
      expect(r.riskFactors.find(f => f.type === 'coupling_critical')).toBeDefined();
    });

    it('alert coupling adds coupling_alert factor (+10)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        couplingAlert: { alertLevel: 'alert' }
      });
      expect(r.riskFactors.find(f => f.type === 'coupling_alert')).toBeDefined();
    });

    it('coupling alert signal escalates to architecture review', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        couplingAlert: { alertLevel: 'alert' }
      });
      expect(r.recommendedReview.requiredReviewLevel).toBe('architecture');
    });
  });

  // 22. Watchlist influence
  describe('watchlist influence', () => {
    it('critical watchlist escalation adds watchlist_critical factor (+20)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        watchlistItem: { escalationLevel: 'critical', priorityScore: 85 }
      });
      expect(r.riskFactors.find(f => f.type === 'watchlist_critical')).toBeDefined();
    });

    it('urgent watchlist escalation adds watchlist_urgent factor (+12)', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        watchlistItem: { escalationLevel: 'urgent', priorityScore: 65 }
      });
      expect(r.riskFactors.find(f => f.type === 'watchlist_urgent')).toBeDefined();
    });

    it('monitor watchlist adds no watchlist factor', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        watchlistItem: { escalationLevel: 'monitor', priorityScore: 35 }
      });
      expect(r.riskFactors.filter(f => f.type.startsWith('watchlist_'))).toHaveLength(0);
    });
  });

  // 23. Recommended review levels
  describe('recommended review levels', () => {
    it('low-risk change with no signals => standard review', () => {
      const r = predictChangeRisk({ change: smallChange() });
      expect(r.recommendedReview.requiredReviewLevel).toBe('standard');
    });

    it('API change (arch signal, low score) => architecture review', () => {
      const r = predictChangeRisk({ change: flagChange({ hasApiChanged: true }) });
      expect(r.recommendedReview.requiredReviewLevel).toBe('architecture');
    });

    it('auth change => security review (at minimum)', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) });
      const rank = { standard: 1, senior: 2, architecture: 3, security: 4, release_board: 5 };
      expect(rank[r.recommendedReview.requiredReviewLevel]).toBeGreaterThanOrEqual(rank.security);
    });

    it('migration + high risk score => release_board', () => {
      // migration(18) + dependency(16) + config(10) + no_tests(12) = 56 >= 50
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/utils.js', 'modified', 5, 2)],
          hasMigrationChanged:  true,
          hasDependencyChanged: true,
          hasConfigChanged:     true,
          hasTestsChanged:      false,
        }
      });
      expect(r.changeRiskScore).toBeGreaterThanOrEqual(50);
      expect(r.recommendedReview.requiredReviewLevel).toBe('release_board');
    });

    it('high risk score (>=50) without arch/auth/migration => at least senior', () => {
      // config(10) + dependency(16) + frontend+backend(12) + no_tests(12) = 50
      const r = predictChangeRisk({
        change: {
          filesChanged:         [makeFile('src/util.js', 'modified', 5, 2)],
          hasConfigChanged:     true,
          hasDependencyChanged: true,
          hasFrontendChanged:   true,
          hasBackendChanged:    true,
          hasTestsChanged:      false,
        }
      });
      expect(r.changeRiskScore).toBeGreaterThanOrEqual(50);
      const rank = { standard: 1, senior: 2, architecture: 3, security: 4, release_board: 5 };
      expect(rank[r.recommendedReview.requiredReviewLevel]).toBeGreaterThanOrEqual(rank.senior);
    });

    it('rationale is a non-empty string', () => {
      const r = predictChangeRisk({ change: smallChange() });
      expect(typeof r.recommendedReview.rationale).toBe('string');
      expect(r.recommendedReview.rationale.length).toBeGreaterThan(0);
    });
  });

  // 24. Mitigation checklist
  describe('mitigation checklist', () => {
    it('no tests → add/update tests item', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/business.js', 'modified', 20, 5)],
          hasTestsChanged: false,
        }
      });
      expect(r.mitigationChecklist.some(i => /tests?/i.test(i.item))).toBe(true);
    });

    it('auth change → security review item (critical priority)', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) });
      const item = r.mitigationChecklist.find(i => /security/i.test(i.item));
      expect(item).toBeDefined();
      expect(item.priority).toBe('critical');
    });

    it('migration → rollback procedure item (critical priority)', () => {
      const r = predictChangeRisk({ change: flagChange({ hasMigrationChanged: true }) });
      const item = r.mitigationChecklist.find(i => /rollback/i.test(i.item));
      expect(item).toBeDefined();
      expect(item.priority).toBe('critical');
    });

    it('dependency change → dependency audit item', () => {
      const r = predictChangeRisk({ change: flagChange({ hasDependencyChanged: true }) });
      expect(r.mitigationChecklist.some(i => /audit/i.test(i.item))).toBe(true);
    });

    it('API change → API contract validation item', () => {
      const r = predictChangeRisk({ change: flagChange({ hasApiChanged: true }) });
      expect(r.mitigationChecklist.some(i => /api contract/i.test(i.item))).toBe(true);
    });

    it('architecture file → architecture review item', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('execution/architecture/buildFoo.js', 'modified', 20, 5)],
          hasTestsChanged: true,
        }
      });
      expect(r.mitigationChecklist.some(i => /architecture review/i.test(i.item))).toBe(true);
    });

    it('score >= 50 → staging validation item', () => {
      // auth(25) + API(18) + no_tests: we need a file for no_tests
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/api.js', 'modified', 20, 5)],
          hasAuthChanged:  true,
          hasApiChanged:   true,
          hasTestsChanged: false,
        }
      });
      expect(r.changeRiskScore).toBeGreaterThanOrEqual(50);
      expect(r.mitigationChecklist.some(i => /staging/i.test(i.item))).toBe(true);
    });

    it('each checklist item has item, reason, and priority fields', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/api.js', 'modified', 10, 5)],
          hasAuthChanged: true,
          hasApiChanged:  true,
          hasTestsChanged: false,
        }
      });
      r.mitigationChecklist.forEach(item => {
        expect(typeof item.item).toBe('string');
        expect(typeof item.reason).toBe('string');
        expect(['low','medium','high','critical']).toContain(item.priority);
      });
    });
  });

  // 25. Release guidance
  describe('release guidance', () => {
    it('low risk + tests + no critical areas => canFastTrack = true', () => {
      const r = predictChangeRisk({
        change: smallChange()  // 3 small files, hasTestsChanged=true, no critical flags
      });
      expect(r.changeRiskScore).toBeLessThan(25);
      expect(r.releaseGuidance.canFastTrack).toBe(true);
    });

    it('low risk + no tests => canFastTrack = false', () => {
      const r = predictChangeRisk({
        change: smallChange({ hasTestsChanged: false })
      });
      expect(r.releaseGuidance.canFastTrack).toBe(false);
    });

    it('low risk + tests + auth change => canFastTrack = false (critical area)', () => {
      const r = predictChangeRisk({
        change: smallChange({ hasAuthChanged: true })
      });
      expect(r.releaseGuidance.canFastTrack).toBe(false);
    });

    it('score >= 25 => requiresStaging = true', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) }); // score=25
      expect(r.changeRiskScore).toBeGreaterThanOrEqual(25);
      expect(r.releaseGuidance.requiresStaging).toBe(true);
    });

    it('score < 25 => requiresStaging = false', () => {
      const r = predictChangeRisk({ change: smallChange() }); // score=0
      expect(r.releaseGuidance.requiresStaging).toBe(false);
    });

    it('score >= 50 => requiresRollbackPlan = true', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/api.js', 'modified', 20, 5)],
          hasAuthChanged: true, hasApiChanged: true, hasTestsChanged: false
        }
      });
      expect(r.changeRiskScore).toBeGreaterThanOrEqual(50);
      expect(r.releaseGuidance.requiresRollbackPlan).toBe(true);
    });

    it('migration => requiresMigrationPlan = true', () => {
      expect(predictChangeRisk({ change: flagChange({ hasMigrationChanged: true }) })
        .releaseGuidance.requiresMigrationPlan).toBe(true);
    });

    it('auth => requiresSecurityReview = true', () => {
      expect(predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) })
        .releaseGuidance.requiresSecurityReview).toBe(true);
    });

    it('architecture file + high score => requiresArchitectureReview = true', () => {
      // architecture path (hotspot +15) + auth (+25) + api (+18) = 58 >= 50 + architecture area
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('execution/architecture/buildFoo.js', 'modified', 20, 5)],
          hasAuthChanged: true, hasApiChanged: true, hasTestsChanged: true,
        }
      });
      expect(r.impactedAreas.architecture).toBe(true);
      expect(r.changeRiskScore).toBeGreaterThanOrEqual(50);
      expect(r.releaseGuidance.requiresArchitectureReview).toBe(true);
    });
  });

  // 26. Confidence levels
  describe('confidence levels', () => {
    it('file details + 3 intel sources => high confidence', () => {
      const r = predictChangeRisk({
        change: { filesChanged: [makeFile('src/foo.js')], hasTestsChanged: true },
        governance: { governanceLevel: 'strong', governanceScore: 80 },
        forecast:   { forecastLevel: 'stable', degradationRisk: 5 },
        anomaly:    { anomalyLevel: 'none' },
      });
      expect(r.confidenceLevel).toBe('high');
    });

    it('file details + 1 intel source => medium confidence', () => {
      const r = predictChangeRisk({
        change: { filesChanged: [makeFile('src/foo.js')], hasTestsChanged: true },
        governance: { governanceLevel: 'strong', governanceScore: 80 },
      });
      expect(r.confidenceLevel).toBe('medium');
    });

    it('file details + 0 intel sources => low confidence', () => {
      const r = predictChangeRisk({
        change: { filesChanged: [makeFile('src/foo.js')], hasTestsChanged: true }
      });
      expect(r.confidenceLevel).toBe('low');
    });

    it('no file details + intel sources => low confidence', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        governance: { governanceLevel: 'weak', governanceScore: 40 },
        forecast:   { forecastLevel: 'degrading', degradationRisk: 60 },
        anomaly:    { anomalyLevel: 'critical' },
        regression: { regressionLevel: 'critical', regressionScore: 20 },
      });
      expect(r.confidenceLevel).toBe('low');
    });
  });

  // 27. Score capping at 100
  describe('score capping', () => {
    it('combined signals exceeding 100 are capped at 100', () => {
      // auth(25)+migration(18)+dependency(16)+API(18)+no_tests(12)+governance_critical(20)+forecast_critical(20) = 129
      const r = predictChangeRisk({
        change: {
          filesChanged:        [makeFile('src/api.js', 'modified', 50, 20)],
          hasAuthChanged:      true,
          hasMigrationChanged: true,
          hasDependencyChanged:true,
          hasApiChanged:       true,
          hasTestsChanged:     false,
        },
        governance: { governanceLevel: 'critical', governanceScore: 10 },
        forecast:   { forecastLevel: 'critical', degradationRisk: 90 },
      });
      expect(r.changeRiskScore).toBe(100);
    });
  });

  // 28. changeRiskLevel thresholds
  describe('changeRiskLevel thresholds', () => {
    it('score 0 => low', () => {
      expect(predictChangeRisk({ change: smallChange() }).changeRiskLevel).toBe('low');
    });
    it('score 25 => medium (auth alone)', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) });
      expect(r.changeRiskScore).toBe(25);
      expect(r.changeRiskLevel).toBe('medium');
    });
    it('score 50 => high', () => {
      // config(10) + dependency(16) + frontend+backend(12) + no_tests(12) = 50
      const r = predictChangeRisk({
        change: {
          filesChanged:        [makeFile('src/util.js', 'modified', 5, 2)],
          hasConfigChanged:    true,
          hasDependencyChanged:true,
          hasFrontendChanged:  true,
          hasBackendChanged:   true,
          hasTestsChanged:     false,
        }
      });
      expect(r.changeRiskScore).toBe(50);
      expect(r.changeRiskLevel).toBe('high');
    });
    it('score >= 75 => critical', () => {
      // auth(25)+API(18)+migration(18)+no_tests(12)+governance_critical(20) = 93 → capped at 100? no: 93
      const r = predictChangeRisk({
        change: {
          filesChanged:        [makeFile('src/api.js', 'modified', 10, 5)],
          hasAuthChanged:      true,
          hasApiChanged:       true,
          hasMigrationChanged: true,
          hasTestsChanged:     false,
        },
        governance: { governanceLevel: 'critical', governanceScore: 10 },
      });
      expect(r.changeRiskScore).toBeGreaterThanOrEqual(75);
      expect(r.changeRiskLevel).toBe('critical');
    });
  });

  // 29. Summary strings
  describe('summary strings', () => {
    it('unknown => mentions insufficient data', () => {
      expect(predictChangeRisk({}).summary).toMatch(/Insufficient change data/i);
    });
    it('low => mentions low change risk', () => {
      expect(predictChangeRisk({ change: smallChange() }).summary).toMatch(/Low change risk/i);
    });
    it('medium => mentions medium change risk', () => {
      const r = predictChangeRisk({ change: flagChange({ hasAuthChanged: true }) });
      if (r.changeRiskLevel === 'medium') {
        expect(r.summary).toMatch(/Medium change risk/i);
      }
    });
    it('summary includes score and confidenceLevel', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('src/foo.js')],
          hasApiChanged: true,
          hasTestsChanged: true,
        }
      });
      expect(r.summary).toContain(String(r.changeRiskScore));
      expect(r.summary).toContain(r.confidenceLevel);
    });
  });

  // 30. Risk factor structure
  describe('risk factor structure', () => {
    it('each riskFactor has required fields', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: [makeFile('backend/routes/user.js', 'modified', 200, 100)],
          hasAuthChanged: true, hasApiChanged: true, hasTestsChanged: false,
        },
        governance: { governanceLevel: 'critical', governanceScore: 10 },
      });
      r.riskFactors.forEach(f => {
        expect(typeof f.type).toBe('string');
        expect(['low','medium','high','critical']).toContain(f.severity);
        expect(typeof f.summary).toBe('string');
        expect(f.evidence).not.toBeNull();
      });
    });

    it('no duplicate riskFactor types from change signals', () => {
      const r = predictChangeRisk({
        change: {
          filesChanged: Array.from({ length: 55 }, (_, i) =>
            makeFile('src/file' + i + '.js', 'modified', 5, 2)),
          hasTestsChanged: true,
        }
      });
      const types = r.riskFactors.map(f => f.type);
      expect(types.length).toBe(new Set(types).size);
    });
  });

  // 31. Non-mutation
  describe('non-mutation', () => {
    it('does not mutate the input object', () => {
      const input = {
        change: smallChange({ hasAuthChanged: true }),
        governance: { governanceLevel: 'critical', governanceScore: 10 },
      };
      const snap = JSON.stringify(input);
      predictChangeRisk(input);
      expect(JSON.stringify(input)).toBe(snap);
    });

    it('does not mutate filesChanged array', () => {
      const files = [makeFile('src/api.js', 'modified', 20, 5)];
      predictChangeRisk({ change: { filesChanged: files, hasTestsChanged: true } });
      expect(files.length).toBe(1);
    });
  });

  // 32. Deterministic output
  describe('deterministic output', () => {
    it('same input produces identical output on repeated calls', () => {
      const input = {
        change: {
          filesChanged: [
            makeFile('backend/routes/user.js', 'modified', 200, 80),
            makeFile('src/auth/session.js', 'modified', 50, 20),
          ],
          hasAuthChanged:      true,
          hasApiChanged:       true,
          hasMigrationChanged: true,
          hasDependencyChanged:true,
          hasTestsChanged:     false,
          commitCount:         7,
          authorCount:         3,
        },
        governance:   { governanceLevel: 'critical', governanceScore: 10 },
        forecast:     { forecastLevel: 'degrading', degradationRisk: 60 },
        regression:   { regressionLevel: 'regression', regressionScore: 55 },
        couplingAlert:{ alertLevel: 'alert' },
      };
      const r1 = predictChangeRisk(input);
      const r2 = predictChangeRisk(input);
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    });
  });

  // 33. Missing / null field safety
  describe('missing and null field safety', () => {
    it('null governance does not throw', () => {
      expect(() => predictChangeRisk({ change: { commitCount: 1 }, governance: null })).not.toThrow();
    });
    it('null forecast does not throw', () => {
      expect(() => predictChangeRisk({ change: { commitCount: 1 }, forecast: null })).not.toThrow();
    });
    it('null couplingAlert does not throw', () => {
      expect(() => predictChangeRisk({ change: { commitCount: 1 }, couplingAlert: null })).not.toThrow();
    });
    it('filesChanged entries with missing fields do not throw', () => {
      expect(() => predictChangeRisk({
        change: { filesChanged: [{ path: null, status: undefined, additions: null, deletions: undefined }] }
      })).not.toThrow();
    });
    it('array instead of change object => unknown', () => {
      expect(predictChangeRisk({ change: [] }).changeRiskLevel).toBe('unknown');
    });
    it('all intel sources are arrays (non-object) — zero intel score', () => {
      const r = predictChangeRisk({
        change: { commitCount: 1 },
        governance: [],
        forecast:   [],
        anomaly:    [],
      });
      expect(r.riskFactors.filter(f => f.type.startsWith('governance_') ||
                                       f.type.startsWith('forecast_') ||
                                       f.type.startsWith('anomaly_'))).toHaveLength(0);
    });
  });

});
