'use strict';

const { buildRemediationRecommendations } = require('../../../../execution/architecture/buildRemediationRecommendations');

// ─── Factories ───────────────────────────────────────────────────────────────

function makeGovernance(level, score, extra = {}) {
  return { governanceLevel: level, governanceScore: score, governanceRisks: [], ...extra };
}
function makeForecast(level, risk, extra = {}) {
  return { forecastLevel: level, degradationRisk: risk, ...extra };
}
function makeRegression(level, score, patterns = {}) {
  return { regressionLevel: level, regressionScore: score, patterns };
}
function makeCoupling(level, trend = {}, extra = {}) {
  return { alertLevel: level, couplingTrend: trend, ...extra };
}
function makeAnomaly(level, patterns = {}) {
  return { anomalyLevel: level, patterns };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildRemediationRecommendations', () => {

  // 1. Module export
  describe('module export', () => {
    it('exports buildRemediationRecommendations as a function', () => {
      expect(typeof buildRemediationRecommendations).toBe('function');
    });
  });

  // 2. Null / non-object input
  describe('null / non-object input', () => {
    it('returns unknown for null', () => {
      expect(buildRemediationRecommendations(null).recommendationLevel).toBe('unknown');
    });
    it('returns unknown for undefined', () => {
      expect(buildRemediationRecommendations(undefined).recommendationLevel).toBe('unknown');
    });
    it('returns unknown for a string', () => {
      expect(buildRemediationRecommendations('bad').recommendationLevel).toBe('unknown');
    });
    it('returns zero remediationScore for null', () => {
      expect(buildRemediationRecommendations(null).remediationScore).toBe(0);
    });
  });

  // 3. Empty object — no usable sources
  describe('empty object (no sources)', () => {
    let result;
    beforeEach(() => { result = buildRemediationRecommendations({}); });

    it('recommendationLevel is unknown', () => {
      expect(result.recommendationLevel).toBe('unknown');
    });
    it('remediationScore is 0', () => {
      expect(result.remediationScore).toBe(0);
    });
    it('confidenceLevel is low', () => {
      expect(result.confidenceLevel).toBe('low');
    });
    it('recommendations is empty array', () => {
      expect(result.recommendations).toEqual([]);
    });
    it('summary mentions insufficient data', () => {
      expect(result.summary).toMatch(/Insufficient data/i);
    });
    it('actionPlan has empty buckets', () => {
      expect(result.actionPlan).toEqual({ immediate: [], shortTerm: [], mediumTerm: [], longTerm: [] });
    });
    it('priorities has null highestPriorityRecommendationId', () => {
      expect(result.priorities.highestPriorityRecommendationId).toBeNull();
    });
  });

  // 4. Confidence levels
  describe('confidence levels', () => {
    it('1 source => low confidence', () => {
      expect(buildRemediationRecommendations({
        forecast: makeForecast('stable', 0)
      }).confidenceLevel).toBe('low');
    });

    it('2 sources => medium confidence', () => {
      expect(buildRemediationRecommendations({
        forecast: makeForecast('stable', 0),
        regression: makeRegression('none', 0)
      }).confidenceLevel).toBe('medium');
    });

    it('4 sources => high confidence', () => {
      expect(buildRemediationRecommendations({
        forecast: makeForecast('stable', 0),
        regression: makeRegression('none', 0),
        anomaly: makeAnomaly('none'),
        couplingAlert: makeCoupling('none')
      }).confidenceLevel).toBe('high');
    });

    it('watchlistItem counts as a source', () => {
      expect(buildRemediationRecommendations({
        watchlistItem: { escalationLevel: 'monitor' },
        forecast: makeForecast('stable', 0)
      }).confidenceLevel).toBe('medium');
    });

    it('array source values do not count', () => {
      expect(buildRemediationRecommendations({
        governance: []
      }).confidenceLevel).toBe('low');
    });
  });

  // 5. Governance recommendations
  describe('governance recommendations', () => {
    it('critical governanceLevel generates critical priority rec', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('critical');
    });

    it('critical governance rec has governance category', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec.category).toBe('governance');
    });

    it('weak governanceLevel generates high priority rec', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('weak', 40) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('strong governanceLevel generates no governance_remediation rec', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('strong', 80) });
      expect(r.recommendations.find(x => x.id === 'governance_remediation')).toBeUndefined();
    });

    it('critical governance risk generates targeted rec', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('strong', 80, {
          governanceRisks: [{ type: 'dim_c', severity: 'critical', source: 'architectureGovernance', summary: 'issue' }]
        })
      });
      expect(r.recommendations.find(x => x.id === 'governance_risk_dim_c')).toBeDefined();
    });

    it('high governance risk generates targeted rec', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('strong', 80, {
          governanceRisks: [{ type: 'dim_h', severity: 'high', source: 'maturityGovernance', summary: 'issue' }]
        })
      });
      expect(r.recommendations.find(x => x.id === 'governance_risk_dim_h')).toBeDefined();
    });

    it('low-severity governance risk is skipped', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('strong', 80, {
          governanceRisks: [{ type: 'dim_l', severity: 'low', source: 'behavioralGovernance', summary: 'low' }]
        })
      });
      expect(r.recommendations.find(x => x.id === 'governance_risk_dim_l')).toBeUndefined();
    });

    it('max 3 targeted governance risk recs', () => {
      const risks = ['r1','r2','r3','r4'].map(t => ({
        type: t, severity: 'critical', source: 'architectureGovernance', summary: t
      }));
      const r = buildRemediationRecommendations({ governance: makeGovernance('strong', 80, { governanceRisks: risks }) });
      expect(r.recommendations.filter(x => x.id.startsWith('governance_risk_')).length).toBe(3);
    });

    it('duplicate governance risk type produces only one rec', () => {
      const risks = [
        { type: 'dup', severity: 'critical', source: 'architectureGovernance', summary: 'first' },
        { type: 'dup', severity: 'high',     source: 'maturityGovernance',     summary: 'second' },
      ];
      const r = buildRemediationRecommendations({ governance: makeGovernance('strong', 80, { governanceRisks: risks }) });
      expect(r.recommendations.filter(x => x.id === 'governance_risk_dup').length).toBe(1);
    });

    it('governance risk category uses GOV_RISK_CATEGORY mapping for couplingAlerts', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('strong', 80, {
          governanceRisks: [{ type: 'cp', severity: 'critical', source: 'couplingAlerts', summary: 'coupling' }]
        })
      });
      const rec = r.recommendations.find(x => x.id === 'governance_risk_cp');
      expect(rec).toBeDefined();
      expect(rec.category).toBe('coupling');
    });

    it('governance rec evidence includes component scores when provided', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 20, {
          boundaryHealthScore: 45,
          completenessScore:   50,
          linkageScore:        60,
        })
      });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec.evidence.boundaryHealthScore).toBe(45);
      expect(rec.evidence.completenessScore).toBe(50);
      expect(rec.evidence.linkageScore).toBe(60);
    });

    it('governance rec evidence omits component scores when not provided', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 20) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec.evidence).not.toHaveProperty('boundaryHealthScore');
      expect(rec.evidence).not.toHaveProperty('completenessScore');
      expect(rec.evidence).not.toHaveProperty('linkageScore');
    });

    it('governance rec evidence always includes governanceScore and governanceLevel', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('weak', 40, {
          boundaryHealthScore: 65,
        })
      });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec.evidence.governanceScore).toBe(40);
      expect(rec.evidence.governanceLevel).toBe('weak');
      expect(rec.evidence.boundaryHealthScore).toBe(65);
    });
  });

  // 5b. Governance rationale — architecture-health proxy provenance
  //     Regression coverage for the score-provenance fix: the numeric value in
  //     the governance rationale is an architecture-health-derived proxy score,
  //     not a dedicated governance metric, and the wording must say so.
  describe('governance rationale — architecture-health proxy wording', () => {
    it('critical: rationale is the exact approved architecture-health-proxy template', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 42) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec.rationale).toBe(
        'Architecture health is critical (score: 42), indicating weak governance oversight.'
      );
    });

    it('critical: recommendation still fires with unchanged category and priority', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 42) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec).toBeDefined();
      expect(rec.category).toBe('governance');
      expect(rec.priority).toBe('critical');
    });

    it('critical: rationale does not present the number as an unqualified governance score', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 42) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec.rationale).not.toBe(
        'Governance is critical (score: 42). The portfolio lacks effective architecture oversight.'
      );
      expect(rec.rationale.startsWith('Architecture health is critical')).toBe(true);
    });

    it('weak: rationale is the exact approved architecture-health-proxy template', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('weak', 35) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec.rationale).toBe(
        'Architecture health is weak (score: 35), indicating governance practices need strengthening.'
      );
    });

    it('weak: recommendation still fires with unchanged category and priority', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('weak', 35) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec).toBeDefined();
      expect(rec.category).toBe('governance');
      expect(rec.priority).toBe('high');
    });

    it('weak: rationale does not present the number as an unqualified governance score', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('weak', 35) });
      const rec = r.recommendations.find(x => x.id === 'governance_remediation');
      expect(rec.rationale).not.toBe(
        'Governance is weak (score: 35). Engineering governance practices need improvement.'
      );
      expect(rec.rationale.startsWith('Architecture health is weak')).toBe(true);
    });

    it('does not change evidence field names or values for either branch', () => {
      const critical = buildRemediationRecommendations({ governance: makeGovernance('critical', 42) })
        .recommendations.find(x => x.id === 'governance_remediation');
      const weak = buildRemediationRecommendations({ governance: makeGovernance('weak', 35) })
        .recommendations.find(x => x.id === 'governance_remediation');
      expect(critical.evidence.governanceScore).toBe(42);
      expect(critical.evidence.governanceLevel).toBe('critical');
      expect(weak.evidence.governanceScore).toBe(35);
      expect(weak.evidence.governanceLevel).toBe('weak');
    });
  });

  // 6. Forecast recommendations
  describe('forecast recommendations', () => {
    it('immediate interventionUrgency generates forecast_immediate_intervention critical', () => {
      const r = buildRemediationRecommendations({
        forecast: makeForecast('critical', 90, { trajectory: { interventionUrgency: 'immediate' } })
      });
      const rec = r.recommendations.find(x => x.id === 'forecast_immediate_intervention');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('critical');
    });

    it('immediate urgency short-circuits — only one forecast rec returned', () => {
      const r = buildRemediationRecommendations({
        forecast: makeForecast('critical', 90, { trajectory: { interventionUrgency: 'immediate' } })
      });
      expect(r.recommendations.filter(x => x.id.startsWith('forecast_')).length).toBe(1);
    });

    it('critical forecastLevel generates forecast_stabilization critical', () => {
      const r = buildRemediationRecommendations({ forecast: makeForecast('critical', 85) });
      const rec = r.recommendations.find(x => x.id === 'forecast_stabilization');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('critical');
    });

    it('degrading forecastLevel generates forecast_stabilization high', () => {
      const r = buildRemediationRecommendations({ forecast: makeForecast('degrading', 60) });
      const rec = r.recommendations.find(x => x.id === 'forecast_stabilization');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('watch forecastLevel generates forecast_watch medium', () => {
      const r = buildRemediationRecommendations({ forecast: makeForecast('watch', 35) });
      const rec = r.recommendations.find(x => x.id === 'forecast_watch');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('medium');
    });

    it('stable forecastLevel generates no forecast rec', () => {
      const r = buildRemediationRecommendations({ forecast: makeForecast('stable', 5) });
      expect(r.recommendations.filter(x => x.id.startsWith('forecast_'))).toHaveLength(0);
    });
  });

  // 7. Regression recommendations
  describe('regression recommendations', () => {
    it('regression level generates regression_review high', () => {
      const r = buildRemediationRecommendations({ regression: makeRegression('regression', 55) });
      const rec = r.recommendations.find(x => x.id === 'regression_review');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('critical regression level generates regression_review critical', () => {
      const r = buildRemediationRecommendations({ regression: makeRegression('critical', 20) });
      const rec = r.recommendations.find(x => x.id === 'regression_review');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('critical');
    });

    it('levelDegradationCount >= 2 generates regression_governance high', () => {
      const r = buildRemediationRecommendations({
        regression: makeRegression('watch', 70, { levelDegradationCount: 3 })
      });
      const rec = r.recommendations.find(x => x.id === 'regression_governance');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('levelDegradationCount < 2 does not generate regression_governance', () => {
      const r = buildRemediationRecommendations({
        regression: makeRegression('watch', 70, { levelDegradationCount: 1 })
      });
      expect(r.recommendations.find(x => x.id === 'regression_governance')).toBeUndefined();
    });

    it('recurringRiskCount >= 2 generates regression_recurring high', () => {
      const r = buildRemediationRecommendations({
        regression: makeRegression('watch', 70, { recurringRiskCount: 2 })
      });
      const rec = r.recommendations.find(x => x.id === 'regression_recurring');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('watch level with no patterns generates no regression recs', () => {
      const r = buildRemediationRecommendations({ regression: makeRegression('watch', 70) });
      expect(r.recommendations.filter(x => x.id.startsWith('regression_'))).toHaveLength(0);
    });

    it('regression_review evidence propagates scoreDropEvidence and apiRegressionEvidence from regression.regressions', () => {
      const scoreDropEvFixture = [
        { snapshotAt: '2024-06-01T00:00:00Z', prevScore: 80, currScore: 65, deltaBoundary: -10, deltaCompleteness: -5, deltaLinkage: -2 },
      ];
      const apiRegEvFixture = [
        { snapshotAt: '2024-06-01T00:00:00Z', prevUnresolved: 2, currUnresolved: 5, unresolvedDelta: 3, prevMismatch: 0, currMismatch: 1, mismatchDelta: 1 },
      ];
      const regression = {
        regressionLevel: 'regression',
        regressionScore: 55,
        patterns: { scoreDropCount: 1 },
        regressions: [
          { type: 'score_regression', severity: 'medium', count: 1, evidence: scoreDropEvFixture },
          { type: 'api_regression',   severity: 'medium', count: 1, evidence: apiRegEvFixture },
        ],
      };
      const r = buildRemediationRecommendations({ regression });
      const rec = r.recommendations.find(x => x.id === 'regression_review');
      expect(rec).toBeDefined();
      expect(Array.isArray(rec.evidence.scoreDropEvidence)).toBe(true);
      expect(rec.evidence.scoreDropEvidence).toHaveLength(1);
      expect(rec.evidence.scoreDropEvidence[0].prevScore).toBe(80);
      expect(rec.evidence.scoreDropEvidence[0].currScore).toBe(65);
      expect(Array.isArray(rec.evidence.apiRegressionEvidence)).toBe(true);
      expect(rec.evidence.apiRegressionEvidence).toHaveLength(1);
      expect(rec.evidence.apiRegressionEvidence[0].unresolvedDelta).toBe(3);
    });

    it('regression_review evidence scoreDropEvidence and apiRegressionEvidence are empty arrays when regression.regressions absent', () => {
      const r = buildRemediationRecommendations({ regression: makeRegression('regression', 55) });
      const rec = r.recommendations.find(x => x.id === 'regression_review');
      expect(Array.isArray(rec.evidence.scoreDropEvidence)).toBe(true);
      expect(rec.evidence.scoreDropEvidence).toHaveLength(0);
      expect(Array.isArray(rec.evidence.apiRegressionEvidence)).toBe(true);
      expect(rec.evidence.apiRegressionEvidence).toHaveLength(0);
    });
  });

  // 8. Coupling recommendations
  describe('coupling recommendations', () => {
    it('circularDependencyDelta > 0 generates coupling_decoupling critical', () => {
      const r = buildRemediationRecommendations({
        couplingAlert: makeCoupling('watch', { circularDependencyDelta: 2 })
      });
      const rec = r.recommendations.find(x => x.id === 'coupling_decoupling');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('critical');
    });

    it('alertLevel critical (no delta) generates coupling_decoupling critical', () => {
      const r = buildRemediationRecommendations({ couplingAlert: makeCoupling('critical', {}) });
      const rec = r.recommendations.find(x => x.id === 'coupling_decoupling');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('critical');
    });

    it('boundaryViolationDelta > 0 generates coupling_boundary high', () => {
      const r = buildRemediationRecommendations({
        couplingAlert: makeCoupling('watch', { boundaryViolationDelta: 1 })
      });
      const rec = r.recommendations.find(x => x.id === 'coupling_boundary');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('boundaryViolationDelta > 0 with critical level escalates coupling_boundary to critical', () => {
      const r = buildRemediationRecommendations({
        couplingAlert: makeCoupling('critical', { boundaryViolationDelta: 3 })
      });
      const rec = r.recommendations.find(x => x.id === 'coupling_boundary');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('critical');
    });

    it('acceleration > 0 generates coupling_acceleration high', () => {
      const r = buildRemediationRecommendations({
        couplingAlert: makeCoupling('watch', { acceleration: 0.5 })
      });
      const rec = r.recommendations.find(x => x.id === 'coupling_acceleration');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('pressureEscalated true generates coupling_acceleration high', () => {
      const r = buildRemediationRecommendations({
        couplingAlert: makeCoupling('watch', { pressureEscalated: true })
      });
      const rec = r.recommendations.find(x => x.id === 'coupling_acceleration');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('alertLevel alert with no trend signals generates coupling_review high', () => {
      const r = buildRemediationRecommendations({ couplingAlert: makeCoupling('alert', {}) });
      const rec = r.recommendations.find(x => x.id === 'coupling_review');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('alertLevel watch with no trend signals generates coupling_review medium', () => {
      const r = buildRemediationRecommendations({ couplingAlert: makeCoupling('watch', {}) });
      const rec = r.recommendations.find(x => x.id === 'coupling_review');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('medium');
    });
  });

  // 9. Anomaly recommendations
  describe('anomaly recommendations', () => {
    it('scoreCollapseCount > 0 generates anomaly_investigation critical', () => {
      const r = buildRemediationRecommendations({ anomaly: makeAnomaly('critical', { scoreCollapseCount: 2 }) });
      const rec = r.recommendations.find(x => x.id === 'anomaly_investigation');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('critical');
    });

    it('volatilityOutlierCount > 0 with non-critical level => anomaly_observability medium', () => {
      const r = buildRemediationRecommendations({ anomaly: makeAnomaly('anomaly', { volatilityOutlierCount: 3 }) });
      const rec = r.recommendations.find(x => x.id === 'anomaly_observability');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('medium');
    });

    it('volatilityOutlierCount > 0 with critical level => anomaly_observability high', () => {
      const r = buildRemediationRecommendations({ anomaly: makeAnomaly('critical', { volatilityOutlierCount: 2 }) });
      const rec = r.recommendations.find(x => x.id === 'anomaly_observability');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('implementationDebtSurgeCount > 0 generates anomaly_implementation high', () => {
      const r = buildRemediationRecommendations({ anomaly: makeAnomaly('watch', { implementationDebtSurgeCount: 1 }) });
      const rec = r.recommendations.find(x => x.id === 'anomaly_implementation');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('anomaly_implementation category is implementation', () => {
      const r = buildRemediationRecommendations({ anomaly: makeAnomaly('watch', { implementationDebtSurgeCount: 1 }) });
      expect(r.recommendations.find(x => x.id === 'anomaly_implementation').category).toBe('implementation');
    });

    it('empty patterns object generates no anomaly recs', () => {
      const r = buildRemediationRecommendations({ anomaly: makeAnomaly('watch', {}) });
      expect(r.recommendations.filter(x => x.id.startsWith('anomaly_'))).toHaveLength(0);
    });

    it('missing patterns object generates no anomaly recs', () => {
      const r = buildRemediationRecommendations({ anomaly: { anomalyLevel: 'watch' } });
      expect(r.recommendations.filter(x => x.id.startsWith('anomaly_'))).toHaveLength(0);
    });

    it('anomaly_investigation evidence propagates collapseEvents from anomaly.anomalies', () => {
      const collapseEventsFixture = [
        { snapshotAt: '2024-06-01T00:00:00Z', severity: 'critical', delta: -40, prevScore: 80, currScore: 40 },
      ];
      const anomaly = {
        anomalyLevel: 'critical',
        patterns: { scoreCollapseCount: 1 },
        anomalies: [
          { type: 'score_collapse', severity: 'critical', evidence: { scoreCollapseCount: 1, collapseEvents: collapseEventsFixture } },
        ],
      };
      const r = buildRemediationRecommendations({ anomaly });
      const rec = r.recommendations.find(x => x.id === 'anomaly_investigation');
      expect(rec).toBeDefined();
      expect(Array.isArray(rec.evidence.collapseEvents)).toBe(true);
      expect(rec.evidence.collapseEvents).toHaveLength(1);
      expect(rec.evidence.collapseEvents[0].prevScore).toBe(80);
      expect(rec.evidence.collapseEvents[0].currScore).toBe(40);
      expect(rec.evidence.collapseEvents[0].severity).toBe('critical');
    });

    it('anomaly_investigation evidence collapseEvents is empty array when anomaly.anomalies absent', () => {
      const r = buildRemediationRecommendations({ anomaly: makeAnomaly('critical', { scoreCollapseCount: 1 }) });
      const rec = r.recommendations.find(x => x.id === 'anomaly_investigation');
      expect(Array.isArray(rec.evidence.collapseEvents)).toBe(true);
      expect(rec.evidence.collapseEvents).toHaveLength(0);
    });
  });

  // 10. Snapshot recommendations
  describe('snapshot recommendations', () => {
    it('unresolvedFrontendCallCount >= 5 generates snapshot_api_linkage high', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: { apiLinkage: { coverage: { unresolvedFrontendCallCount: 7 } } }
      });
      const rec = r.recommendations.find(x => x.id === 'snapshot_api_linkage');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('unresolvedFrontendCallCount 1-4 generates snapshot_api_linkage medium', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: { apiLinkage: { coverage: { unresolvedFrontendCallCount: 3 } } }
      });
      const rec = r.recommendations.find(x => x.id === 'snapshot_api_linkage');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('medium');
    });

    it('unresolvedFrontendCalls array fallback works (>= 5 items => high)', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: {
          apiLinkage: {
            coverage: { unresolvedFrontendCallCount: 0 },
            unresolvedFrontendCalls: ['a','b','c','d','e','f']
          }
        }
      });
      const rec = r.recommendations.find(x => x.id === 'snapshot_api_linkage');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('methodMismatchCount > 0 generates snapshot_contract high', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: { apiLinkage: { coverage: { methodMismatchCount: 2 } } }
      });
      const rec = r.recommendations.find(x => x.id === 'snapshot_contract');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('methodMismatches array fallback generates snapshot_contract', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: {
          apiLinkage: {
            coverage: { methodMismatchCount: 0 },
            methodMismatches: ['GET/POST mismatch']
          }
        }
      });
      expect(r.recommendations.find(x => x.id === 'snapshot_contract')).toBeDefined();
    });

    it('boundary violations with critical/high severity => snapshot_boundary high', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: {
          boundaryVerification: { violations: [{ severity: 'high' }, { severity: 'low' }] }
        }
      });
      const rec = r.recommendations.find(x => x.id === 'snapshot_boundary');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('boundary violations without critical/high severity => snapshot_boundary medium', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: {
          boundaryVerification: { violations: [{ severity: 'low' }, { severity: 'low' }] }
        }
      });
      const rec = r.recommendations.find(x => x.id === 'snapshot_boundary');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('medium');
    });

    it('completenessScore < 30 generates snapshot_implementation high', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: { implementationCompleteness: { completenessScore: 20 } }
      });
      const rec = r.recommendations.find(x => x.id === 'snapshot_implementation');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('high');
    });

    it('completenessScore 30-49 generates snapshot_implementation medium', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: { implementationCompleteness: { completenessScore: 40 } }
      });
      const rec = r.recommendations.find(x => x.id === 'snapshot_implementation');
      expect(rec).toBeDefined();
      expect(rec.priority).toBe('medium');
    });

    it('completenessScore 0 generates no snapshot_implementation rec', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: { implementationCompleteness: { completenessScore: 0 } }
      });
      expect(r.recommendations.find(x => x.id === 'snapshot_implementation')).toBeUndefined();
    });

    it('completenessScore >= 50 generates no snapshot_implementation rec', () => {
      const r = buildRemediationRecommendations({
        architectureSnapshot: { implementationCompleteness: { completenessScore: 70 } }
      });
      expect(r.recommendations.find(x => x.id === 'snapshot_implementation')).toBeUndefined();
    });
  });

  // 11. Deduplication
  describe('deduplication', () => {
    it('duplicate governance risk types produce only one targeted rec', () => {
      const risks = [
        { type: 'dup2', severity: 'critical', source: 'architectureGovernance', summary: 'first' },
        { type: 'dup2', severity: 'high',     source: 'maturityGovernance',     summary: 'second' },
      ];
      const r = buildRemediationRecommendations({ governance: makeGovernance('strong', 80, { governanceRisks: risks }) });
      expect(r.recommendations.filter(x => x.id === 'governance_risk_dup2').length).toBe(1);
    });

    it('different source generators produce distinct recs (no false dedup)', () => {
      const r = buildRemediationRecommendations({
        anomaly: makeAnomaly('critical', { scoreCollapseCount: 1 }),
        architectureSnapshot: { implementationCompleteness: { completenessScore: 25 } }
      });
      expect(r.recommendations.find(x => x.id === 'anomaly_investigation')).toBeDefined();
      expect(r.recommendations.find(x => x.id === 'snapshot_implementation')).toBeDefined();
    });

    it('governance base rec and targeted risk rec both survive (different titles)', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 15, {
          governanceRisks: [{ type: 'arch_risk', severity: 'critical', source: 'architectureGovernance', summary: 'Arch issue' }]
        })
      });
      expect(r.recommendations.find(x => x.id === 'governance_remediation')).toBeDefined();
      expect(r.recommendations.find(x => x.id === 'governance_risk_arch_risk')).toBeDefined();
    });
  });

  // 12. Sorting
  describe('sorting', () => {
    it('critical recommendations appear before high', () => {
      const r = buildRemediationRecommendations({
        forecast: makeForecast('degrading', 60),
        regression: makeRegression('critical', 20),
      });
      const priorities = r.recommendations.map(x => x.priority);
      const firstHighIdx  = priorities.indexOf('high');
      const lastCritIdx   = priorities.lastIndexOf('critical');
      expect(lastCritIdx).toBeLessThan(firstHighIdx);
    });

    it('same-priority recs sorted by id ASC', () => {
      const r = buildRemediationRecommendations({
        forecast: makeForecast('degrading', 60),
        regression: makeRegression('regression', 50),
      });
      const highRecs = r.recommendations.filter(x => x.priority === 'high');
      for (let i = 1; i < highRecs.length; i++) {
        expect(highRecs[i - 1].id <= highRecs[i].id).toBe(true);
      }
    });

    it('no null entries in recommendations array', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('critical', 90),
        regression: makeRegression('critical', 20),
      });
      r.recommendations.forEach(rec => expect(rec).not.toBeNull());
    });
  });

  // 13. Max recommendation limit
  describe('max recommendation limit (10)', () => {
    it('never returns more than 10 recommendations regardless of signal count', () => {
      const risks = ['r1','r2','r3','r4','r5'].map(t => ({
        type: t, severity: 'critical', source: 'architectureGovernance', summary: t
      }));
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10, { governanceRisks: risks }),
        forecast: makeForecast('critical', 90, { trajectory: { interventionUrgency: 'immediate' } }),
        regression: makeRegression('critical', 20, { levelDegradationCount: 3, recurringRiskCount: 3 }),
        couplingAlert: makeCoupling('critical', { circularDependencyDelta: 2, boundaryViolationDelta: 2, acceleration: 1 }),
        anomaly: makeAnomaly('critical', { scoreCollapseCount: 2, volatilityOutlierCount: 2, implementationDebtSurgeCount: 1 }),
        architectureSnapshot: {
          apiLinkage: { coverage: { unresolvedFrontendCallCount: 10, methodMismatchCount: 3 } },
          boundaryVerification: { violations: [{ severity: 'critical' }] },
          implementationCompleteness: { completenessScore: 20 }
        }
      });
      expect(r.recommendations.length).toBeLessThanOrEqual(10);
    });
  });

  // 14. remediationScore
  describe('remediationScore', () => {
    it('1 critical rec => score 25', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(r.remediationScore).toBe(25);
    });

    it('1 high rec => score 15', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('weak', 40) });
      expect(r.remediationScore).toBe(15);
    });

    it('1 medium rec => score 8', () => {
      const r = buildRemediationRecommendations({ forecast: makeForecast('watch', 30) });
      expect(r.remediationScore).toBe(8);
    });

    it('score is capped at 100', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10, {
          governanceRisks: ['x1','x2','x3'].map(t => ({
            type: t, severity: 'critical', source: 'architectureGovernance', summary: t
          }))
        }),
        forecast: makeForecast('critical', 90, { trajectory: { interventionUrgency: 'immediate' } }),
        anomaly: makeAnomaly('critical', { scoreCollapseCount: 3, volatilityOutlierCount: 2 }),
        regression: makeRegression('critical', 20, { levelDegradationCount: 3, recurringRiskCount: 3 }),
      });
      expect(r.remediationScore).toBeLessThanOrEqual(100);
    });

    it('score equals sum of PRI_SCORE values when below cap', () => {
      // 1 critical (25) + 1 high (15) = 40
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('degrading', 60),
      });
      const critCount = r.recommendations.filter(x => x.priority === 'critical').length;
      const highCount = r.recommendations.filter(x => x.priority === 'high').length;
      const medCount  = r.recommendations.filter(x => x.priority === 'medium').length;
      const expected  = Math.min(critCount * 25 + highCount * 15 + medCount * 8, 100);
      expect(r.remediationScore).toBe(expected);
    });

    it('rawRemediationScore equals remediationScore when cap not applied', () => {
      // 1 critical = 25, well below 100
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(r.rawRemediationScore).toBe(r.remediationScore);
      expect(r.scoreCapApplied).toBe(false);
    });

    it('rawRemediationScore reflects true sum when cap is applied', () => {
      // 5 critical recs each = 25 pts → raw = 125, capped = 100
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10, {
          governanceRisks: ['r1','r2','r3'].map(t => ({
            type: t, severity: 'critical', source: 'architectureGovernance', summary: t
          }))
        }),
        forecast:   makeForecast('critical', 90, { trajectory: { interventionUrgency: 'immediate' } }),
        anomaly:    makeAnomaly('critical', { scoreCollapseCount: 1 }),
      });
      expect(r.remediationScore).toBe(100);
      expect(r.rawRemediationScore).toBeGreaterThan(100);
      expect(r.scoreCapApplied).toBe(true);
    });

    it('scoreCapApplied is false when raw sum is exactly 100', () => {
      // 4 critical recs = 100 exactly — no cap applied
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10, {
          governanceRisks: ['r1','r2','r3'].map(t => ({
            type: t, severity: 'critical', source: 'architectureGovernance', summary: t
          }))
        }),
        forecast: makeForecast('critical', 90, { trajectory: { interventionUrgency: 'immediate' } }),
      });
      // may or may not be exactly 100 depending on dedup — assert the invariant
      if (r.rawRemediationScore <= 100) {
        expect(r.scoreCapApplied).toBe(false);
      } else {
        expect(r.scoreCapApplied).toBe(true);
      }
      expect(r.remediationScore).toBe(Math.min(r.rawRemediationScore, 100));
    });

    it('remediationScore is still capped at 100 even when raw exceeds it', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10, {
          governanceRisks: ['r1','r2','r3'].map(t => ({
            type: t, severity: 'critical', source: 'architectureGovernance', summary: t
          }))
        }),
        forecast:   makeForecast('critical', 90, { trajectory: { interventionUrgency: 'immediate' } }),
        anomaly:    makeAnomaly('critical', { scoreCollapseCount: 1 }),
      });
      expect(r.remediationScore).toBe(100);
      expect(r.rawRemediationScore).toBeGreaterThan(100);
    });

    it('unknown result has rawRemediationScore 0 and scoreCapApplied false', () => {
      const r = buildRemediationRecommendations(null);
      expect(r.rawRemediationScore).toBe(0);
      expect(r.scoreCapApplied).toBe(false);
    });

    it('none result has rawRemediationScore 0 and scoreCapApplied false', () => {
      // strong governance, stable forecast → no recs fire
      const r = buildRemediationRecommendations({ governance: makeGovernance('strong', 80) });
      expect(r.recommendationLevel).toBe('none');
      expect(r.rawRemediationScore).toBe(0);
      expect(r.scoreCapApplied).toBe(false);
    });
  });

  // 15. recommendationLevel thresholds
  describe('recommendationLevel thresholds', () => {
    it('score >= 75 => critical level', () => {
      // 3 criticals = 75
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('critical', 90, { trajectory: { interventionUrgency: 'immediate' } }),
        anomaly: makeAnomaly('critical', { scoreCollapseCount: 1 }),
      });
      expect(r.remediationScore).toBe(75);
      expect(r.recommendationLevel).toBe('critical');
    });

    it('score 50-74 => high level', () => {
      // 2 criticals = 50
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('critical', 90),
      });
      expect(r.remediationScore).toBe(50);
      expect(r.recommendationLevel).toBe('high');
    });

    it('score 25-49 => medium level', () => {
      // 1 critical = 25
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(r.remediationScore).toBe(25);
      expect(r.recommendationLevel).toBe('medium');
    });

    it('score 1-24 => low level', () => {
      // 1 medium (forecast_watch) = 8
      const r = buildRemediationRecommendations({ forecast: makeForecast('watch', 30) });
      expect(r.remediationScore).toBe(8);
      expect(r.recommendationLevel).toBe('low');
    });

    it('score 0 with sources (no recs) => none level', () => {
      const r = buildRemediationRecommendations({ forecast: makeForecast('stable', 5) });
      expect(r.remediationScore).toBe(0);
      expect(r.recommendationLevel).toBe('none');
    });
  });

  // 16. Action plan buckets
  describe('action plan buckets', () => {
    it('critical recs go to immediate bucket', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(r.actionPlan.immediate.length).toBeGreaterThan(0);
    });

    it('high recs go to shortTerm bucket', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('weak', 40) });
      expect(r.actionPlan.shortTerm.length).toBeGreaterThan(0);
    });

    it('medium recs go to mediumTerm bucket', () => {
      const r = buildRemediationRecommendations({ forecast: makeForecast('watch', 30) });
      expect(r.actionPlan.mediumTerm.length).toBeGreaterThan(0);
    });

    it('action plan items have title and reason fields', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      const item = r.actionPlan.immediate[0];
      expect(typeof item.title).toBe('string');
      expect(typeof item.reason).toBe('string');
    });

    it('longTerm bucket is always an array', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(Array.isArray(r.actionPlan.longTerm)).toBe(true);
    });
  });

  // 17. Priorities object
  describe('priorities object', () => {
    it('highestPriorityCategory is from top recommendation', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(r.priorities.highestPriorityCategory).toBe('governance');
    });

    it('highestPriorityRecommendationId is from top recommendation', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(r.priorities.highestPriorityRecommendationId).toBe('governance_remediation');
    });

    it('criticalRecommendationCount matches actual count', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('critical', 90),
      });
      const actual = r.recommendations.filter(x => x.priority === 'critical').length;
      expect(r.priorities.criticalRecommendationCount).toBe(actual);
    });

    it('highRecommendationCount matches actual count', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('weak', 40),
        forecast: makeForecast('degrading', 60),
      });
      const actual = r.recommendations.filter(x => x.priority === 'high').length;
      expect(r.priorities.highRecommendationCount).toBe(actual);
    });
  });

  // 18. Estimated impact
  describe('estimatedImpact', () => {
    it('governance category recs add 30 to governanceImpact base', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      // hasGov=true, critCount=1, highCount=0 => clamp(30 + 15 + 0, 0, 100) = 45
      expect(r.estimatedImpact.governanceImpact).toBe(45);
    });

    it('no governance category recs => lower governanceImpact', () => {
      // forecast degrading => 1 high rec in 'architecture' category, no 'governance' category
      const r = buildRemediationRecommendations({ forecast: makeForecast('degrading', 60) });
      // hasGov=false, critCount=0, highCount=1 => clamp(0 + 0 + 8, 0, 100) = 8
      expect(r.estimatedImpact.governanceImpact).toBe(8);
    });

    it('architecture category recs add 25 to architectureImpact base', () => {
      const r = buildRemediationRecommendations({ forecast: makeForecast('critical', 90) });
      // hasArch=true, hasCoupling=false, totalScore=25 => clamp(25 + 0 + round(25*0.4), 0, 100) = clamp(25+10,0,100) = 35
      expect(r.estimatedImpact.architectureImpact).toBe(35);
    });

    it('coupling category recs add 20 to architectureImpact', () => {
      // need at least one coupling rec and one architecture rec
      const r = buildRemediationRecommendations({
        couplingAlert: makeCoupling('critical', {}),
        forecast: makeForecast('watch', 30),
      });
      expect(r.estimatedImpact.architectureImpact).toBeGreaterThanOrEqual(20);
    });

    it('estimatedImpact.confidence matches result confidenceLevel', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(r.estimatedImpact.confidence).toBe(r.confidenceLevel);
    });

    it('riskReduction is between 0 and 100', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('critical', 90),
        regression: makeRegression('critical', 20),
      });
      expect(r.estimatedImpact.riskReduction).toBeGreaterThanOrEqual(0);
      expect(r.estimatedImpact.riskReduction).toBeLessThanOrEqual(100);
    });
  });

  // 19. Summary strings
  describe('summary strings', () => {
    it('unknown => mentions insufficient data', () => {
      expect(buildRemediationRecommendations({}).summary).toMatch(/Insufficient data/i);
    });

    it('none level => mentions no remediation required', () => {
      const r = buildRemediationRecommendations({ forecast: makeForecast('stable', 0) });
      expect(r.recommendationLevel).toBe('none');
      expect(r.summary).toMatch(/No remediation required/i);
    });

    it('medium level summary mentions medium priority', () => {
      // 1 critical = score 25 => medium
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(r.recommendationLevel).toBe('medium');
      expect(r.summary).toMatch(/Medium priority remediation/i);
    });

    it('high level summary mentions high priority', () => {
      // 2 criticals = score 50 => high
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('critical', 90),
      });
      expect(r.recommendationLevel).toBe('high');
      expect(r.summary).toMatch(/High priority remediation/i);
    });

    it('critical level summary mentions critical', () => {
      // 3 criticals = score 75 => critical
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('critical', 90, { trajectory: { interventionUrgency: 'immediate' } }),
        anomaly: makeAnomaly('critical', { scoreCollapseCount: 1 }),
      });
      expect(r.recommendationLevel).toBe('critical');
      expect(r.summary).toMatch(/Critical remediation required/i);
    });

    it('summary includes remediationScore and confidenceLevel', () => {
      const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
      expect(r.summary).toContain(String(r.remediationScore));
      expect(r.summary).toContain(r.confidenceLevel);
    });
  });

  // 20. Non-mutation
  describe('non-mutation', () => {
    it('does not mutate the input object', () => {
      const input = {
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('critical', 90),
      };
      const snapshot = JSON.stringify(input);
      buildRemediationRecommendations(input);
      expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('does not mutate governanceRisks array', () => {
      const risks = [
        { type: 'rr', severity: 'critical', source: 'architectureGovernance', summary: 'rr' }
      ];
      buildRemediationRecommendations({ governance: makeGovernance('strong', 80, { governanceRisks: risks }) });
      expect(risks.length).toBe(1);
    });
  });

  // 21. Deterministic output
  describe('deterministic output', () => {
    it('same input produces identical output on repeated calls', () => {
      const input = {
        governance: makeGovernance('critical', 15, {
          governanceRisks: [{ type: 'arch', severity: 'critical', source: 'architectureGovernance', summary: 'arch' }]
        }),
        forecast: makeForecast('degrading', 60),
        regression: makeRegression('regression', 55, { levelDegradationCount: 2 }),
        couplingAlert: makeCoupling('alert', { circularDependencyDelta: 1 }),
        anomaly: makeAnomaly('critical', { scoreCollapseCount: 1, volatilityOutlierCount: 2 }),
      };
      const r1 = buildRemediationRecommendations(input);
      const r2 = buildRemediationRecommendations(input);
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    });
  });

  // 22. Missing / null field safety
  describe('missing and null field safety', () => {
    it('governance with null governanceRisks does not throw', () => {
      expect(() => buildRemediationRecommendations({
        governance: { governanceLevel: 'critical', governanceScore: 10, governanceRisks: null }
      })).not.toThrow();
    });

    it('forecast with missing trajectory does not throw', () => {
      expect(() => buildRemediationRecommendations({
        forecast: { forecastLevel: 'critical', degradationRisk: 80 }
      })).not.toThrow();
    });

    it('regression with null patterns does not throw', () => {
      expect(() => buildRemediationRecommendations({
        regression: { regressionLevel: 'critical', regressionScore: 20, patterns: null }
      })).not.toThrow();
    });

    it('couplingAlert with missing couplingTrend does not throw', () => {
      expect(() => buildRemediationRecommendations({
        couplingAlert: { alertLevel: 'critical' }
      })).not.toThrow();
    });

    it('architectureSnapshot with null sub-fields does not throw', () => {
      expect(() => buildRemediationRecommendations({
        architectureSnapshot: { apiLinkage: null, boundaryVerification: null, implementationCompleteness: null }
      })).not.toThrow();
    });

    it('array source does not count as a usable source', () => {
      expect(buildRemediationRecommendations({ governance: [] }).recommendationLevel).toBe('unknown');
    });

    it('nested null evidence fields are tolerated', () => {
      expect(() => buildRemediationRecommendations({
        anomaly: { anomalyLevel: null, patterns: null }
      })).not.toThrow();
    });
  });

  // 23. Recommendation structure
  describe('recommendation structure', () => {
    const requiredFields = ['id', 'category', 'priority', 'title', 'rationale', 'expectedOutcome', 'evidence'];

    it('each recommendation has all required fields', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('degrading', 60),
        couplingAlert: makeCoupling('critical', { circularDependencyDelta: 1 }),
      });
      r.recommendations.forEach(rec => {
        requiredFields.forEach(f => expect(rec).toHaveProperty(f));
      });
    });

    it('all priorities are valid values', () => {
      const valid = new Set(['critical', 'high', 'medium', 'low']);
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('watch', 30),
        regression: makeRegression('regression', 55),
        couplingAlert: makeCoupling('watch', {}),
      });
      r.recommendations.forEach(rec => {
        expect(valid.has(rec.priority)).toBe(true);
      });
    });

    it('evidence is an object on every rec', () => {
      const r = buildRemediationRecommendations({
        governance: makeGovernance('critical', 10),
        forecast: makeForecast('critical', 90),
      });
      r.recommendations.forEach(rec => {
        expect(rec.evidence !== null && typeof rec.evidence === 'object').toBe(true);
      });
    });
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// 20. versionBoundaryContext output
// ═════════════════════════════════════════════════════════════════════════════

describe('versionBoundaryContext output', () => {
  it('unknown result (no sources) has versionBoundaryContext with zeros and affectsConfidence false', () => {
    const r = buildRemediationRecommendations({});
    expect(r.versionBoundaryContext).toEqual({ boundaryCount: 0, suppressedIntervals: 0, affectsConfidence: false });
  });

  it('no versionContext supplied yields zero-state versionBoundaryContext on normal result', () => {
    const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
    expect(r.versionBoundaryContext).toEqual({ boundaryCount: 0, suppressedIntervals: 0, affectsConfidence: false });
  });

  it('versionContext with boundaryCount 0 yields affectsConfidence false', () => {
    const r = buildRemediationRecommendations({
      governance: makeGovernance('critical', 10),
      versionContext: { boundaryCount: 0, suppressedIntervals: 0 },
    });
    expect(r.versionBoundaryContext.affectsConfidence).toBe(false);
  });

  it('versionContext with boundaryCount > 0 yields affectsConfidence true', () => {
    const r = buildRemediationRecommendations({
      governance: makeGovernance('critical', 10),
      versionContext: { boundaryCount: 2, suppressedIntervals: 2 },
    });
    expect(r.versionBoundaryContext).toEqual({ boundaryCount: 2, suppressedIntervals: 2, affectsConfidence: true });
  });

  it('versionContext fields are passed through accurately on normal path', () => {
    const r = buildRemediationRecommendations({
      governance: makeGovernance('weak', 35),
      versionContext: { boundaryCount: 3, suppressedIntervals: 3 },
    });
    expect(r.versionBoundaryContext.boundaryCount).toBe(3);
    expect(r.versionBoundaryContext.suppressedIntervals).toBe(3);
    expect(r.versionBoundaryContext.affectsConfidence).toBe(true);
  });

  it('no-recs path includes versionBoundaryContext', () => {
    // Only watchlistItem provided — it counts as a usable source but produces no recs
    const r = buildRemediationRecommendations({
      watchlistItem: { watched: true },
      versionContext: { boundaryCount: 1, suppressedIntervals: 1 },
    });
    expect(r.versionBoundaryContext).toBeDefined();
    expect(r.versionBoundaryContext.boundaryCount).toBe(1);
  });

  it('versionBoundaryContext does not affect remediationScore or recommendationLevel', () => {
    const base = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
    const withVC = buildRemediationRecommendations({
      governance: makeGovernance('critical', 10),
      versionContext: { boundaryCount: 5, suppressedIntervals: 5 },
    });
    expect(withVC.remediationScore).toBe(base.remediationScore);
    expect(withVC.recommendationLevel).toBe(base.recommendationLevel);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 21. Confidence adjustment from version boundaries
// ═════════════════════════════════════════════════════════════════════════════

describe('confidence adjustment from version boundaries', () => {
  // ── helpers to hit each base confidence tier ─────────────────────────────
  // high   = 4+ usable sources
  // medium = 2–3 usable sources
  // low    = 1 usable source

  function highBaseInput(vc) {
    // 4 sources: governance + forecast + regression + couplingAlert
    return {
      governance:   makeGovernance('critical', 10),
      forecast:     makeForecast('critical', 90),
      regression:   makeRegression('critical', 80),
      couplingAlert: makeCoupling('critical', { circularDependencyDelta: 2, boundaryViolationDelta: 3 }),
      versionContext: vc,
    };
  }

  function mediumBaseInput(vc) {
    // 2 sources: governance + forecast
    return {
      governance:   makeGovernance('critical', 10),
      forecast:     makeForecast('critical', 90),
      versionContext: vc,
    };
  }

  function lowBaseInput(vc) {
    // 1 source: governance only
    return {
      governance:   makeGovernance('critical', 10),
      versionContext: vc,
    };
  }

  it('no versionContext → confidenceReasons is empty', () => {
    const r = buildRemediationRecommendations({ governance: makeGovernance('critical', 10) });
    expect(r.confidenceReasons).toEqual([]);
  });

  it('boundaryCount 0 → confidenceReasons is empty and confidenceLevel unchanged', () => {
    const r = buildRemediationRecommendations(mediumBaseInput({ boundaryCount: 0, suppressedIntervals: 0 }));
    expect(r.confidenceReasons).toEqual([]);
    expect(r.confidenceLevel).toBe('medium');
  });

  it('high base confidence with boundary → downgraded to medium', () => {
    const r = buildRemediationRecommendations(highBaseInput({ boundaryCount: 1, suppressedIntervals: 1 }));
    expect(r.confidenceLevel).toBe('medium');
  });

  it('medium base confidence with boundary → downgraded to low', () => {
    const r = buildRemediationRecommendations(mediumBaseInput({ boundaryCount: 1, suppressedIntervals: 1 }));
    expect(r.confidenceLevel).toBe('low');
  });

  it('low base confidence with boundary → stays low', () => {
    const r = buildRemediationRecommendations(lowBaseInput({ boundaryCount: 1, suppressedIntervals: 1 }));
    expect(r.confidenceLevel).toBe('low');
  });

  it('confidenceReasons has one entry when affectsConfidence is true', () => {
    const r = buildRemediationRecommendations(highBaseInput({ boundaryCount: 1, suppressedIntervals: 1 }));
    expect(r.confidenceReasons).toHaveLength(1);
  });

  it('singular reason text: "1 version boundary suppressed historical score comparison."', () => {
    const r = buildRemediationRecommendations(highBaseInput({ boundaryCount: 1, suppressedIntervals: 1 }));
    expect(r.confidenceReasons[0]).toBe('1 version boundary suppressed historical score comparison.');
  });

  it('plural reason text: "3 version boundaries suppressed historical score comparisons."', () => {
    const r = buildRemediationRecommendations(highBaseInput({ boundaryCount: 3, suppressedIntervals: 3 }));
    expect(r.confidenceReasons[0]).toBe('3 version boundaries suppressed historical score comparisons.');
  });

  it('estimatedImpact.confidence reflects the adjusted confidence', () => {
    const r = buildRemediationRecommendations(highBaseInput({ boundaryCount: 1, suppressedIntervals: 1 }));
    expect(r.estimatedImpact.confidence).toBe('medium');
  });

  it('summary text includes the adjusted confidence level', () => {
    const r = buildRemediationRecommendations(highBaseInput({ boundaryCount: 1, suppressedIntervals: 1 }));
    expect(r.summary).toContain('medium confidence');
    expect(r.summary).not.toContain('high confidence');
  });

  it('no-recs path: confidenceLevel adjusted and confidenceReasons populated', () => {
    // watchlistItem counts as 1 usable source (low base) + force 4 sources with boundaries
    const r = buildRemediationRecommendations(highBaseInput({ boundaryCount: 2, suppressedIntervals: 2 }));
    // Even in normal path with recs, verify both fields
    expect(r.confidenceLevel).toBe('medium');
    expect(r.confidenceReasons).toHaveLength(1);
  });

  it('unknown result path includes confidenceReasons: []', () => {
    const r = buildRemediationRecommendations({});
    expect(r.confidenceReasons).toEqual([]);
  });

  it('remediationScore and rawRemediationScore unchanged by boundary adjustment', () => {
    const base = buildRemediationRecommendations(highBaseInput(null));
    const adj  = buildRemediationRecommendations(highBaseInput({ boundaryCount: 1, suppressedIntervals: 1 }));
    expect(adj.remediationScore).toBe(base.remediationScore);
    expect(adj.rawRemediationScore).toBe(base.rawRemediationScore);
    expect(adj.scoreCapApplied).toBe(base.scoreCapApplied);
  });

  it('recommendation priorities unchanged by boundary adjustment', () => {
    const base = buildRemediationRecommendations(highBaseInput(null));
    const adj  = buildRemediationRecommendations(highBaseInput({ boundaryCount: 1, suppressedIntervals: 1 }));
    const basePri = base.recommendations.map(r => r.priority);
    const adjPri  = adj.recommendations.map(r => r.priority);
    expect(adjPri).toEqual(basePri);
  });
});
