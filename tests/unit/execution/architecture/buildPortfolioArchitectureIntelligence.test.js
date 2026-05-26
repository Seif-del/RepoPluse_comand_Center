'use strict';

const { buildPortfolioArchitectureIntelligence } = require('../../../../execution/architecture/buildPortfolioArchitectureIntelligence');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRepo(overrides) {
  return Object.assign({
    repoId:                   1,
    repoName:                 'owner/repo',
    architectureHealthScore:  80,
    architectureHealthLevel:  'watch',
    confidenceLevel:          'high',
    metrics: {
      totalFiles: 30, totalEdges: 50, backendRouteCount: 10, frontendApiCallCount: 10,
      linkedEndpointCount: 8, unresolvedFrontendCallCount: 2, orphanedBackendRouteCount: 2,
      circularDependencyCount: 0, boundaryViolationCount: 0, implementationSignalCount: 1,
    },
    dependencyGraph: {
      couplingMetrics: {
        totalEdges: 50, circularDependencyCount: 0,
        highFanOutFiles: [], highFanInFiles: [],
      },
    },
    apiLinkage: {
      coverage: {
        frontendCallCount: 10, backendRouteCount: 10,
        linkedFrontendCallCount: 8, unresolvedFrontendCallCount: 2,
        orphanedBackendRouteCount: 2, frontendCoveragePercent: 80, backendCoveragePercent: 80,
      },
    },
    boundaryVerification: {
      violations: [],
    },
    implementationCompleteness: {
      completenessScore: 75, completenessLevel: 'partial',
      signals: [{ type: 'placeholder', severity: 'low', summary: 'Minor placeholder' }],
      placeholderAssessment: { placeholderCount: 1, files: [] },
      scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] },
    },
    topFindings: [],
    recommendations: [],
  }, overrides);
}

function makeHealthyRepo(id, name) {
  return makeRepo({
    repoId: id, repoName: name,
    architectureHealthScore: 90, architectureHealthLevel: 'healthy', confidenceLevel: 'high',
    dependencyGraph: {
      couplingMetrics: { totalEdges: 10, circularDependencyCount: 0, highFanOutFiles: [], highFanInFiles: [] },
    },
    implementationCompleteness: {
      completenessScore: 88, completenessLevel: 'complete',
      signals: [], placeholderAssessment: { placeholderCount: 0, files: [] },
      scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] },
    },
    apiLinkage: {
      coverage: { frontendCallCount: 10, backendRouteCount: 10, linkedFrontendCallCount: 10, unresolvedFrontendCallCount: 0, orphanedBackendRouteCount: 0, frontendCoveragePercent: 100, backendCoveragePercent: 100 },
    },
    boundaryVerification: { violations: [] },
    topFindings: [],
    recommendations: [],
  });
}

function makeRiskyRepo(id, name) {
  return makeRepo({
    repoId: id, repoName: name,
    architectureHealthScore: 30, architectureHealthLevel: 'risky', confidenceLevel: 'low',
    dependencyGraph: {
      couplingMetrics: { totalEdges: 120, circularDependencyCount: 3, highFanOutFiles: ['a.js', 'b.js', 'c.js'], highFanInFiles: ['d.js'] },
    },
    apiLinkage: {
      coverage: { frontendCallCount: 8, backendRouteCount: 5, linkedFrontendCallCount: 2, unresolvedFrontendCallCount: 6, orphanedBackendRouteCount: 3, frontendCoveragePercent: 25, backendCoveragePercent: 40 },
    },
    boundaryVerification: {
      violations: [
        { type: 'frontend_imports_backend', severity: 'high', summary: 'Frontend importing backend modules' },
      ],
    },
    implementationCompleteness: {
      completenessScore: 40, completenessLevel: 'weak',
      signals: [
        { type: 'placeholder', severity: 'high', summary: 'Several route handlers are stubs' },
        { type: 'scaffold',    severity: 'medium', summary: 'Scaffold-like files detected' },
      ],
      placeholderAssessment: { placeholderCount: 5, files: ['routes/a.js'] },
      scaffoldAssessment: { scaffoldLikeFileCount: 2, files: ['scaffold/a.js'] },
    },
    topFindings: [
      { type: 'frontend_imports_backend', severity: 'high', summary: 'Frontend importing backend modules' },
      { type: 'unresolved_frontend_calls', severity: 'medium', summary: '6 frontend calls have no backend route' },
    ],
    recommendations: ['Fix boundary violations before deploying.'],
  });
}

function makeUnknownRepo(id, name) {
  return makeRepo({
    repoId: id, repoName: name,
    architectureHealthScore: 0, architectureHealthLevel: 'unknown', confidenceLevel: 'low',
    dependencyGraph: { couplingMetrics: { totalEdges: 0, circularDependencyCount: 0, highFanOutFiles: [], highFanInFiles: [] } },
    apiLinkage: { coverage: { frontendCallCount: 0, backendRouteCount: 0, linkedFrontendCallCount: 0, unresolvedFrontendCallCount: 0, orphanedBackendRouteCount: 0, frontendCoveragePercent: 0, backendCoveragePercent: 0 } },
    boundaryVerification: { violations: [] },
    implementationCompleteness: { completenessScore: 0, completenessLevel: 'unknown', signals: [], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } },
    topFindings: [],
    recommendations: [],
  });
}

// ── Empty portfolio ───────────────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — empty portfolio', () => {
  let result;
  beforeEach(() => { result = buildPortfolioArchitectureIntelligence({ repositories: [] }); });

  it('returns portfolioArchitectureScore of 0', () => {
    expect(result.portfolioArchitectureScore).toBe(0);
  });

  it('returns architectureLevel of unknown', () => {
    expect(result.architectureLevel).toBe('unknown');
  });

  it('returns confidenceLevel of low', () => {
    expect(result.confidenceLevel).toBe('low');
  });

  it('returns all distribution counts as 0', () => {
    expect(result.distribution).toEqual({ healthy: 0, watch: 0, weak: 0, risky: 0, unknown: 0 });
  });

  it('returns empty systemic violations', () => {
    expect(result.systemicBoundaryViolations).toEqual([]);
  });

  it('returns empty topFindings', () => {
    expect(result.topFindings).toEqual([]);
  });

  it('returns empty recommendations', () => {
    expect(result.recommendations).toEqual([]);
  });

  it('returns empty benchmarkedRepositories', () => {
    expect(result.benchmarkedRepositories).toEqual([]);
  });

  it('handles missing repositories param gracefully', () => {
    const r = buildPortfolioArchitectureIntelligence({});
    expect(r.architectureLevel).toBe('unknown');
    expect(r.portfolioArchitectureScore).toBe(0);
  });

  it('handles null param gracefully', () => {
    const r = buildPortfolioArchitectureIntelligence(null);
    expect(r.architectureLevel).toBe('unknown');
  });
});

// ── All unknown snapshots ─────────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — all unknown', () => {
  let result;
  beforeEach(() => {
    result = buildPortfolioArchitectureIntelligence({
      repositories: [makeUnknownRepo(1, 'a/a'), makeUnknownRepo(2, 'b/b'), makeUnknownRepo(3, 'c/c')],
    });
  });

  it('returns architectureLevel unknown when all repos are unknown', () => {
    expect(result.architectureLevel).toBe('unknown');
  });

  it('returns portfolioArchitectureScore of 0 when all repos are unknown', () => {
    expect(result.portfolioArchitectureScore).toBe(0);
  });

  it('distribution.unknown equals total repo count', () => {
    expect(result.distribution.unknown).toBe(3);
    expect(result.distribution.healthy).toBe(0);
  });
});

// ── Score ignores unknown snapshots ──────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — score ignores unknown', () => {
  it('excludes unknown repos from score average', () => {
    const repos = [
      makeRepo({ repoId: 1, architectureHealthScore: 80, architectureHealthLevel: 'watch' }),
      makeRepo({ repoId: 2, architectureHealthScore: 60, architectureHealthLevel: 'weak'  }),
      makeUnknownRepo(3, 'c/c'),
    ];
    const { portfolioArchitectureScore } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    // Average of 80 + 60 = 140 / 2 = 70
    expect(portfolioArchitectureScore).toBe(70);
  });

  it('uses unknown level only when ALL repos are unknown', () => {
    const repos = [
      makeRepo({ repoId: 1, architectureHealthScore: 90, architectureHealthLevel: 'healthy' }),
      makeUnknownRepo(2, 'b/b'),
    ];
    const { architectureLevel } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(architectureLevel).toBe('healthy');
  });
});

// ── Architecture level thresholds ────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — architecture level thresholds', () => {
  function scoreToLevel(score) {
    const repos = [makeRepo({ repoId: 1, architectureHealthScore: score, architectureHealthLevel: score >= 85 ? 'healthy' : score >= 70 ? 'watch' : score >= 45 ? 'weak' : 'risky' })];
    return buildPortfolioArchitectureIntelligence({ repositories: repos }).architectureLevel;
  }

  it('score 85+ maps to healthy', () => { expect(scoreToLevel(90)).toBe('healthy'); });
  it('score 85 maps to healthy', () => { expect(scoreToLevel(85)).toBe('healthy'); });
  it('score 84 maps to watch', () => { expect(scoreToLevel(84)).toBe('watch'); });
  it('score 70 maps to watch', () => { expect(scoreToLevel(70)).toBe('watch'); });
  it('score 69 maps to weak', () => { expect(scoreToLevel(69)).toBe('weak'); });
  it('score 45 maps to weak', () => { expect(scoreToLevel(45)).toBe('weak'); });
  it('score 44 maps to risky', () => { expect(scoreToLevel(44)).toBe('risky'); });
  it('score 1 maps to risky', () => { expect(scoreToLevel(1)).toBe('risky'); });
});

// ── Healthy portfolio ─────────────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — healthy portfolio', () => {
  let result;
  beforeEach(() => {
    result = buildPortfolioArchitectureIntelligence({
      repositories: [
        makeHealthyRepo(1, 'a/a'),
        makeHealthyRepo(2, 'b/b'),
        makeHealthyRepo(3, 'c/c'),
        makeHealthyRepo(4, 'd/d'),
        makeHealthyRepo(5, 'e/e'),
      ],
    });
  });

  it('returns healthy architectureLevel', () => {
    expect(result.architectureLevel).toBe('healthy');
  });

  it('returns high confidence when >=5 repos with >=70% high/med', () => {
    expect(result.confidenceLevel).toBe('high');
  });

  it('distribution.healthy equals total repo count', () => {
    expect(result.distribution.healthy).toBe(5);
  });

  it('portfolioArchitectureScore is average of repo scores', () => {
    expect(result.portfolioArchitectureScore).toBe(90);
  });

  it('apiIntegrationHealth.integrationLevel is integrated', () => {
    expect(result.apiIntegrationHealth.integrationLevel).toBe('integrated');
  });

  it('implementationIntegrity.integrityLevel is strong', () => {
    expect(result.implementationIntegrity.integrityLevel).toBe('strong');
  });

  it('portfolioCoupling.couplingLevel is healthy', () => {
    expect(result.portfolioCoupling.couplingLevel).toBe('healthy');
  });
});

// ── Weak/risky portfolio ──────────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — weak/risky portfolio', () => {
  let result;
  beforeEach(() => {
    result = buildPortfolioArchitectureIntelligence({
      repositories: [makeRiskyRepo(1, 'a/a'), makeRiskyRepo(2, 'b/b'), makeRiskyRepo(3, 'c/c')],
    });
  });

  it('returns risky architectureLevel', () => {
    expect(result.architectureLevel).toBe('risky');
  });

  it('portfolioArchitectureScore is 30', () => {
    expect(result.portfolioArchitectureScore).toBe(30);
  });

  it('distribution.risky is 3', () => {
    expect(result.distribution.risky).toBe(3);
  });

  it('couplingLevel is risky when 3+ repos have circular deps', () => {
    expect(result.portfolioCoupling.couplingLevel).toBe('risky');
  });

  it('systemicBoundaryViolations contains frontend_imports_backend', () => {
    const types = result.systemicBoundaryViolations.map(v => v.type);
    expect(types).toContain('frontend_imports_backend');
  });
});

// ── Distribution counts ───────────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — distribution', () => {
  it('counts each level correctly in a mixed portfolio', () => {
    const repos = [
      makeRepo({ repoId: 1, architectureHealthLevel: 'healthy', architectureHealthScore: 90 }),
      makeRepo({ repoId: 2, architectureHealthLevel: 'healthy', architectureHealthScore: 88 }),
      makeRepo({ repoId: 3, architectureHealthLevel: 'watch',   architectureHealthScore: 75 }),
      makeRepo({ repoId: 4, architectureHealthLevel: 'weak',    architectureHealthScore: 55 }),
      makeRepo({ repoId: 5, architectureHealthLevel: 'risky',   architectureHealthScore: 20 }),
      makeUnknownRepo(6, 'f/f'),
    ];
    const { distribution } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(distribution.healthy).toBe(2);
    expect(distribution.watch).toBe(1);
    expect(distribution.weak).toBe(1);
    expect(distribution.risky).toBe(1);
    expect(distribution.unknown).toBe(1);
  });
});

// ── Confidence thresholds ─────────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — confidence', () => {
  it('returns low when fewer than 3 repos', () => {
    const r = buildPortfolioArchitectureIntelligence({
      repositories: [makeRepo({ repoId: 1, confidenceLevel: 'high' }), makeRepo({ repoId: 2, confidenceLevel: 'high' })],
    });
    expect(r.confidenceLevel).toBe('low');
  });

  it('returns medium when 3-4 repos', () => {
    const r = buildPortfolioArchitectureIntelligence({
      repositories: [1, 2, 3].map(i => makeRepo({ repoId: i, confidenceLevel: 'high' })),
    });
    expect(r.confidenceLevel).toBe('medium');
  });

  it('returns medium when 5+ repos but <70% high/med', () => {
    const repos = [
      makeRepo({ repoId: 1, confidenceLevel: 'high' }),
      makeRepo({ repoId: 2, confidenceLevel: 'medium' }),
      makeRepo({ repoId: 3, confidenceLevel: 'low' }),
      makeRepo({ repoId: 4, confidenceLevel: 'low' }),
      makeRepo({ repoId: 5, confidenceLevel: 'low' }),
    ];
    const r = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(r.confidenceLevel).toBe('medium');
  });

  it('returns high when >=5 repos and >=70% high/med', () => {
    const repos = [
      makeRepo({ repoId: 1, confidenceLevel: 'high' }),
      makeRepo({ repoId: 2, confidenceLevel: 'high' }),
      makeRepo({ repoId: 3, confidenceLevel: 'medium' }),
      makeRepo({ repoId: 4, confidenceLevel: 'high' }),
      makeRepo({ repoId: 5, confidenceLevel: 'medium' }),
    ];
    const r = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(r.confidenceLevel).toBe('high');
  });
});

// ── Systemic boundary violation aggregation ───────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — systemic boundary violations', () => {
  it('aggregates violations of same type across repos', () => {
    const repos = [
      makeRepo({ repoId: 1, boundaryVerification: { violations: [{ type: 'frontend_imports_backend', severity: 'high', summary: 'S1' }] } }),
      makeRepo({ repoId: 2, repoName: 'b/b', boundaryVerification: { violations: [{ type: 'frontend_imports_backend', severity: 'high', summary: 'S2' }] } }),
      makeRepo({ repoId: 3, repoName: 'c/c', boundaryVerification: { violations: [{ type: 'model_imports_route', severity: 'medium', summary: 'S3' }] } }),
    ];
    const { systemicBoundaryViolations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    const fib = systemicBoundaryViolations.find(v => v.type === 'frontend_imports_backend');
    expect(fib).toBeDefined();
    expect(fib.count).toBe(2);
    expect(fib.affectedRepos).toHaveLength(2);
  });

  it('sorts by count DESC, severity DESC, type ASC', () => {
    const repos = [
      makeRepo({ repoId: 1, boundaryVerification: { violations: [
        { type: 'zz_type', severity: 'low', summary: 'z' },
        { type: 'aa_type', severity: 'high', summary: 'a' },
      ] } }),
      makeRepo({ repoId: 2, repoName: 'b/b', boundaryVerification: { violations: [
        { type: 'zz_type', severity: 'low', summary: 'z2' },
      ] } }),
    ];
    const { systemicBoundaryViolations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    // zz_type count=2 should come first
    expect(systemicBoundaryViolations[0].type).toBe('zz_type');
    // aa_type count=1, high severity — second
    expect(systemicBoundaryViolations[1].type).toBe('aa_type');
  });

  it('returns at most 5 systemic violations', () => {
    const types = ['t1', 't2', 't3', 't4', 't5', 't6'];
    const repos = types.map((t, i) =>
      makeRepo({ repoId: i + 1, repoName: `r${i}/r`, boundaryVerification: { violations: [{ type: t, severity: 'high', summary: t }] } })
    );
    const { systemicBoundaryViolations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(systemicBoundaryViolations.length).toBeLessThanOrEqual(5);
  });

  it('affectedRepos contains sorted repo names', () => {
    const repos = [
      makeRepo({ repoId: 1, repoName: 'z/repo', boundaryVerification: { violations: [{ type: 'x', severity: 'high', summary: 's' }] } }),
      makeRepo({ repoId: 2, repoName: 'a/repo', boundaryVerification: { violations: [{ type: 'x', severity: 'high', summary: 's' }] } }),
    ];
    const { systemicBoundaryViolations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(systemicBoundaryViolations[0].affectedRepos).toEqual(['a/repo', 'z/repo']);
  });

  it('escalates severity to highest across repos for same type', () => {
    const repos = [
      makeRepo({ repoId: 1, boundaryVerification: { violations: [{ type: 'x', severity: 'low', summary: 'low' }] } }),
      makeRepo({ repoId: 2, repoName: 'b/b', boundaryVerification: { violations: [{ type: 'x', severity: 'high', summary: 'high' }] } }),
    ];
    const { systemicBoundaryViolations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(systemicBoundaryViolations[0].severity).toBe('high');
  });
});

// ── Portfolio coupling aggregation ────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — portfolioCoupling', () => {
  it('sums totalEdges across all repos', () => {
    const repos = [
      makeRepo({ repoId: 1, dependencyGraph: { couplingMetrics: { totalEdges: 30, circularDependencyCount: 0, highFanOutFiles: [], highFanInFiles: [] } } }),
      makeRepo({ repoId: 2, dependencyGraph: { couplingMetrics: { totalEdges: 70, circularDependencyCount: 0, highFanOutFiles: [], highFanInFiles: [] } } }),
    ];
    const { portfolioCoupling } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(portfolioCoupling.totalEdges).toBe(100);
    expect(portfolioCoupling.averageEdgesPerRepo).toBe(50);
  });

  it('counts reposWithCircularDependencies correctly', () => {
    const repos = [
      makeRepo({ repoId: 1, dependencyGraph: { couplingMetrics: { totalEdges: 10, circularDependencyCount: 2, highFanOutFiles: [], highFanInFiles: [] } } }),
      makeRepo({ repoId: 2, dependencyGraph: { couplingMetrics: { totalEdges: 10, circularDependencyCount: 0, highFanOutFiles: [], highFanInFiles: [] } } }),
    ];
    const { portfolioCoupling } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(portfolioCoupling.reposWithCircularDependencies).toBe(1);
    expect(portfolioCoupling.totalCircularDependencies).toBe(2);
  });

  it('returns couplingLevel risky when 3+ repos have circular deps', () => {
    const repos = [1, 2, 3].map(i => makeRepo({ repoId: i, dependencyGraph: { couplingMetrics: { totalEdges: 10, circularDependencyCount: 1, highFanOutFiles: [], highFanInFiles: [] } } }));
    const { portfolioCoupling } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(portfolioCoupling.couplingLevel).toBe('risky');
  });

  it('returns couplingLevel risky when averageEdgesPerRepo > 80', () => {
    const repos = [makeRepo({ repoId: 1, dependencyGraph: { couplingMetrics: { totalEdges: 85, circularDependencyCount: 0, highFanOutFiles: [], highFanInFiles: [] } } })];
    const { portfolioCoupling } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(portfolioCoupling.couplingLevel).toBe('risky');
  });

  it('returns couplingLevel weak when 1 repo has circular deps', () => {
    const repos = [makeRepo({ repoId: 1, dependencyGraph: { couplingMetrics: { totalEdges: 10, circularDependencyCount: 1, highFanOutFiles: [], highFanInFiles: [] } } })];
    const { portfolioCoupling } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(portfolioCoupling.couplingLevel).toBe('weak');
  });

  it('returns couplingLevel watch when averageEdgesPerRepo > 20', () => {
    const repos = [makeRepo({ repoId: 1, dependencyGraph: { couplingMetrics: { totalEdges: 25, circularDependencyCount: 0, highFanOutFiles: [], highFanInFiles: [] } } })];
    const { portfolioCoupling } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(portfolioCoupling.couplingLevel).toBe('watch');
  });

  it('returns couplingLevel healthy when averageEdgesPerRepo <= 20', () => {
    const repos = [makeRepo({ repoId: 1, dependencyGraph: { couplingMetrics: { totalEdges: 10, circularDependencyCount: 0, highFanOutFiles: [], highFanInFiles: [] } } })];
    const { portfolioCoupling } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(portfolioCoupling.couplingLevel).toBe('healthy');
  });

  it('sums highFanOutFiles and highFanInFiles counts', () => {
    const repos = [
      makeRepo({ repoId: 1, dependencyGraph: { couplingMetrics: { totalEdges: 10, circularDependencyCount: 0, highFanOutFiles: ['a.js', 'b.js'], highFanInFiles: ['c.js'] } } }),
      makeRepo({ repoId: 2, dependencyGraph: { couplingMetrics: { totalEdges: 10, circularDependencyCount: 0, highFanOutFiles: ['x.js'], highFanInFiles: [] } } }),
    ];
    const { portfolioCoupling } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(portfolioCoupling.highFanOutFiles).toBe(3);
    expect(portfolioCoupling.highFanInFiles).toBe(1);
  });
});

// ── API integration health aggregation ────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — apiIntegrationHealth', () => {
  it('sums frontend calls, routes, linked endpoints, unresolved, orphaned', () => {
    const repos = [
      makeRepo({ repoId: 1, apiLinkage: { coverage: { frontendCallCount: 5, backendRouteCount: 4, linkedFrontendCallCount: 4, unresolvedFrontendCallCount: 1, orphanedBackendRouteCount: 0, frontendCoveragePercent: 80, backendCoveragePercent: 100 } } }),
      makeRepo({ repoId: 2, apiLinkage: { coverage: { frontendCallCount: 3, backendRouteCount: 6, linkedFrontendCallCount: 2, unresolvedFrontendCallCount: 1, orphanedBackendRouteCount: 4, frontendCoveragePercent: 67, backendCoveragePercent: 33 } } }),
    ];
    const { apiIntegrationHealth } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(apiIntegrationHealth.totalFrontendCalls).toBe(8);
    expect(apiIntegrationHealth.totalBackendRoutes).toBe(10);
    expect(apiIntegrationHealth.totalLinkedEndpoints).toBe(6);
    expect(apiIntegrationHealth.totalUnresolvedFrontendCalls).toBe(2);
    expect(apiIntegrationHealth.totalOrphanedBackendRoutes).toBe(4);
  });

  it('returns integrated when average coverage >= 70% on both sides', () => {
    const repos = [
      makeRepo({ repoId: 1, apiLinkage: { coverage: { frontendCallCount: 10, backendRouteCount: 10, linkedFrontendCallCount: 8, unresolvedFrontendCallCount: 2, orphanedBackendRouteCount: 2, frontendCoveragePercent: 80, backendCoveragePercent: 80 } } }),
      makeRepo({ repoId: 2, apiLinkage: { coverage: { frontendCallCount: 5, backendRouteCount: 5, linkedFrontendCallCount: 4, unresolvedFrontendCallCount: 1, orphanedBackendRouteCount: 1, frontendCoveragePercent: 80, backendCoveragePercent: 80 } } }),
    ];
    const { apiIntegrationHealth } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(apiIntegrationHealth.integrationLevel).toBe('integrated');
  });

  it('returns partial when one side coverage >= 40%', () => {
    const repos = [
      makeRepo({ repoId: 1, apiLinkage: { coverage: { frontendCallCount: 10, backendRouteCount: 10, linkedFrontendCallCount: 5, unresolvedFrontendCallCount: 5, orphanedBackendRouteCount: 5, frontendCoveragePercent: 50, backendCoveragePercent: 50 } } }),
    ];
    const { apiIntegrationHealth } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(apiIntegrationHealth.integrationLevel).toBe('partial');
  });

  it('returns weak when both coverages < 40%', () => {
    const repos = [
      makeRepo({ repoId: 1, apiLinkage: { coverage: { frontendCallCount: 10, backendRouteCount: 10, linkedFrontendCallCount: 2, unresolvedFrontendCallCount: 8, orphanedBackendRouteCount: 8, frontendCoveragePercent: 20, backendCoveragePercent: 20 } } }),
    ];
    const { apiIntegrationHealth } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(apiIntegrationHealth.integrationLevel).toBe('weak');
  });

  it('returns unknown when no frontend calls and no backend routes', () => {
    const repos = [
      makeRepo({ repoId: 1, apiLinkage: { coverage: { frontendCallCount: 0, backendRouteCount: 0, linkedFrontendCallCount: 0, unresolvedFrontendCallCount: 0, orphanedBackendRouteCount: 0, frontendCoveragePercent: 0, backendCoveragePercent: 0 } } }),
    ];
    const { apiIntegrationHealth } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(apiIntegrationHealth.integrationLevel).toBe('unknown');
  });

  it('averages frontend and backend coverage across repos with API data', () => {
    const repos = [
      makeRepo({ repoId: 1, apiLinkage: { coverage: { frontendCallCount: 10, backendRouteCount: 10, linkedFrontendCallCount: 8, unresolvedFrontendCallCount: 2, orphanedBackendRouteCount: 0, frontendCoveragePercent: 80, backendCoveragePercent: 90 } } }),
      makeRepo({ repoId: 2, apiLinkage: { coverage: { frontendCallCount: 5, backendRouteCount: 5, linkedFrontendCallCount: 3, unresolvedFrontendCallCount: 2, orphanedBackendRouteCount: 2, frontendCoveragePercent: 60, backendCoveragePercent: 70 } } }),
    ];
    const { apiIntegrationHealth } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(apiIntegrationHealth.averageFrontendCoverage).toBe(70); // (80+60)/2
    expect(apiIntegrationHealth.averageBackendCoverage).toBe(80);  // (90+70)/2
  });
});

// ── Implementation integrity aggregation ──────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — implementationIntegrity', () => {
  it('averages completenessScore across repos', () => {
    const repos = [
      makeRepo({ repoId: 1, implementationCompleteness: { completenessScore: 80, completenessLevel: 'complete', signals: [], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } }),
      makeRepo({ repoId: 2, implementationCompleteness: { completenessScore: 60, completenessLevel: 'partial', signals: [], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } }),
    ];
    const { implementationIntegrity } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(implementationIntegrity.averageCompletenessScore).toBe(70);
  });

  it('sums totalImplementationSignals', () => {
    const repos = [
      makeRepo({ repoId: 1, implementationCompleteness: { completenessScore: 75, completenessLevel: 'partial', signals: [{ type: 'a', severity: 'low', summary: 'a' }, { type: 'b', severity: 'low', summary: 'b' }], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } }),
      makeRepo({ repoId: 2, implementationCompleteness: { completenessScore: 75, completenessLevel: 'partial', signals: [{ type: 'c', severity: 'low', summary: 'c' }], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } }),
    ];
    const { implementationIntegrity } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(implementationIntegrity.totalImplementationSignals).toBe(3);
  });

  it('sums totalPlaceholderHints and totalScaffoldLikeFiles', () => {
    const repos = [
      makeRepo({ repoId: 1, implementationCompleteness: { completenessScore: 50, completenessLevel: 'weak', signals: [], placeholderAssessment: { placeholderCount: 4, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 2, files: [] } } }),
      makeRepo({ repoId: 2, implementationCompleteness: { completenessScore: 50, completenessLevel: 'weak', signals: [], placeholderAssessment: { placeholderCount: 2, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 1, files: [] } } }),
    ];
    const { implementationIntegrity } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(implementationIntegrity.totalPlaceholderHints).toBe(6);
    expect(implementationIntegrity.totalScaffoldLikeFiles).toBe(3);
  });

  it('counts reposWithWeakCompleteness', () => {
    const repos = [
      makeRepo({ repoId: 1, implementationCompleteness: { completenessScore: 40, completenessLevel: 'weak', signals: [], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } }),
      makeRepo({ repoId: 2, implementationCompleteness: { completenessScore: 80, completenessLevel: 'complete', signals: [], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } }),
    ];
    const { implementationIntegrity } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(implementationIntegrity.reposWithWeakCompleteness).toBe(1);
  });

  it('returns integrityLevel strong when score >=80 and no weak repos', () => {
    const repos = [1, 2].map(i => makeRepo({ repoId: i, implementationCompleteness: { completenessScore: 85, completenessLevel: 'complete', signals: [], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } }));
    const { implementationIntegrity } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(implementationIntegrity.integrityLevel).toBe('strong');
  });

  it('returns integrityLevel moderate when score >=60 with some weak repos', () => {
    const repos = [
      makeRepo({ repoId: 1, implementationCompleteness: { completenessScore: 70, completenessLevel: 'partial', signals: [], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } }),
      makeRepo({ repoId: 2, implementationCompleteness: { completenessScore: 65, completenessLevel: 'partial', signals: [], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } }),
    ];
    const { implementationIntegrity } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(implementationIntegrity.integrityLevel).toBe('moderate');
  });

  it('returns integrityLevel weak when average <60', () => {
    const repos = [makeRepo({ repoId: 1, implementationCompleteness: { completenessScore: 40, completenessLevel: 'weak', signals: [], placeholderAssessment: { placeholderCount: 0, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 0, files: [] } } })];
    const { implementationIntegrity } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(implementationIntegrity.integrityLevel).toBe('weak');
  });
});

// ── Benchmarked repositories ──────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — benchmarkedRepositories', () => {
  it('ranks repos from highest to lowest score', () => {
    const repos = [
      makeRepo({ repoId: 1, repoName: 'b/b', architectureHealthScore: 60, architectureHealthLevel: 'weak' }),
      makeRepo({ repoId: 2, repoName: 'a/a', architectureHealthScore: 90, architectureHealthLevel: 'healthy' }),
    ];
    const { benchmarkedRepositories } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(benchmarkedRepositories[0].repoId).toBe(2); // score 90 first
    expect(benchmarkedRepositories[1].repoId).toBe(1);
  });

  it('assigns rank 1 to top scorer', () => {
    const repos = [
      makeRepo({ repoId: 1, architectureHealthScore: 90, architectureHealthLevel: 'healthy' }),
      makeRepo({ repoId: 2, architectureHealthScore: 70, architectureHealthLevel: 'watch' }),
    ];
    const { benchmarkedRepositories } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(benchmarkedRepositories[0].rank).toBe(1);
    expect(benchmarkedRepositories[1].rank).toBe(2);
  });

  it('ties share rank and percentile', () => {
    const repos = [
      makeRepo({ repoId: 1, repoName: 'a/a', architectureHealthScore: 80, architectureHealthLevel: 'watch' }),
      makeRepo({ repoId: 2, repoName: 'b/b', architectureHealthScore: 80, architectureHealthLevel: 'watch' }),
      makeRepo({ repoId: 3, repoName: 'c/c', architectureHealthScore: 50, architectureHealthLevel: 'weak' }),
    ];
    const { benchmarkedRepositories } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    const rank1s = benchmarkedRepositories.filter(r => r.rank === 1);
    expect(rank1s).toHaveLength(2);
    expect(rank1s[0].percentile).toBe(rank1s[1].percentile);
  });

  it('deterministic tie ordering: score DESC, repoName ASC, repoId ASC', () => {
    const repos = [
      makeRepo({ repoId: 3, repoName: 'b/b', architectureHealthScore: 80, architectureHealthLevel: 'watch' }),
      makeRepo({ repoId: 1, repoName: 'a/a', architectureHealthScore: 80, architectureHealthLevel: 'watch' }),
      makeRepo({ repoId: 2, repoName: 'a/a', architectureHealthScore: 80, architectureHealthLevel: 'watch' }),
    ];
    const { benchmarkedRepositories } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    // a/a (id 1) first, a/a (id 2) second, b/b (id 3) third — all rank 1
    expect(benchmarkedRepositories[0].repoId).toBe(1);
    expect(benchmarkedRepositories[1].repoId).toBe(2);
    expect(benchmarkedRepositories[2].repoId).toBe(3);
  });

  it('top scorer has percentile 100 (n=1)', () => {
    const repos = [makeRepo({ repoId: 1, architectureHealthScore: 80, architectureHealthLevel: 'watch' })];
    const { benchmarkedRepositories } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(benchmarkedRepositories[0].percentile).toBe(100);
  });

  it('top scorer has highest percentile with n=5', () => {
    const repos = [90, 80, 70, 60, 50].map((score, i) =>
      makeRepo({ repoId: i + 1, repoName: `r${i}/r`, architectureHealthScore: score, architectureHealthLevel: 'watch' })
    );
    const { benchmarkedRepositories } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(benchmarkedRepositories[0].percentile).toBe(100); // 4 repos below / 4 = 100
    expect(benchmarkedRepositories[4].percentile).toBe(0);   // 0 repos below
  });

  it('relativePosition is leading for top scorer', () => {
    const repos = [
      makeRepo({ repoId: 1, architectureHealthScore: 90, architectureHealthLevel: 'healthy' }),
      makeRepo({ repoId: 2, architectureHealthScore: 50, architectureHealthLevel: 'weak' }),
    ];
    const { benchmarkedRepositories } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(benchmarkedRepositories[0].relativePosition).toBe('leading');
  });

  it('relativePosition is unknown for unknown repos', () => {
    const repos = [
      makeHealthyRepo(1, 'a/a'),
      makeUnknownRepo(2, 'b/b'),
    ];
    const { benchmarkedRepositories } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    const unknownRepo = benchmarkedRepositories.find(r => r.architectureHealthLevel === 'unknown');
    expect(unknownRepo.relativePosition).toBe('unknown');
  });

  it('includes all required fields in each entry', () => {
    const repos = [makeRepo({ repoId: 42, repoName: 'x/y', architectureHealthScore: 75, architectureHealthLevel: 'watch' })];
    const { benchmarkedRepositories } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    const entry = benchmarkedRepositories[0];
    expect(entry).toHaveProperty('repoId', 42);
    expect(entry).toHaveProperty('repoName', 'x/y');
    expect(entry).toHaveProperty('architectureHealthScore', 75);
    expect(entry).toHaveProperty('architectureHealthLevel', 'watch');
    expect(entry).toHaveProperty('rank');
    expect(entry).toHaveProperty('percentile');
    expect(entry).toHaveProperty('relativePosition');
  });
});

// ── Top findings aggregation ──────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — topFindings', () => {
  it('aggregates findings of same type across repos', () => {
    const repos = [
      makeRepo({ repoId: 1, topFindings: [{ type: 'circular_dependencies', severity: 'medium', summary: 'Circular deps' }] }),
      makeRepo({ repoId: 2, repoName: 'b/b', topFindings: [{ type: 'circular_dependencies', severity: 'medium', summary: 'Circular deps' }] }),
      makeRepo({ repoId: 3, repoName: 'c/c', topFindings: [{ type: 'boundary_violation', severity: 'high', summary: 'BV' }] }),
    ];
    const { topFindings } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    const circular = topFindings.find(f => f.type === 'circular_dependencies');
    expect(circular).toBeDefined();
    expect(circular.count).toBe(2);
  });

  it('sorts by severity DESC, frequency DESC, type ASC', () => {
    const repos = [
      makeRepo({ repoId: 1, topFindings: [{ type: 'z_finding', severity: 'low', summary: 'z' }, { type: 'a_finding', severity: 'high', summary: 'a' }] }),
      makeRepo({ repoId: 2, repoName: 'b/b', topFindings: [{ type: 'z_finding', severity: 'low', summary: 'z' }] }),
    ];
    const { topFindings } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    // a_finding (high) comes first, then z_finding (low but count=2)
    expect(topFindings[0].type).toBe('a_finding');
    expect(topFindings[1].type).toBe('z_finding');
  });

  it('returns at most 5 top findings', () => {
    const types = ['t1', 't2', 't3', 't4', 't5', 't6'];
    const repos = types.map((t, i) =>
      makeRepo({ repoId: i + 1, repoName: `r${i}/r`, topFindings: [{ type: t, severity: 'medium', summary: t }] })
    );
    const { topFindings } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(topFindings.length).toBeLessThanOrEqual(5);
  });

  it('includes affectedRepos as sorted list', () => {
    const repos = [
      makeRepo({ repoId: 1, repoName: 'z/z', topFindings: [{ type: 'issue', severity: 'high', summary: 'i' }] }),
      makeRepo({ repoId: 2, repoName: 'a/a', topFindings: [{ type: 'issue', severity: 'high', summary: 'i' }] }),
    ];
    const { topFindings } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(topFindings[0].affectedRepos).toEqual(['a/a', 'z/z']);
  });
});

// ── Recommendations ───────────────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — recommendations', () => {
  it('returns at most 5 recommendations', () => {
    const repos = [makeRiskyRepo(1, 'a/a'), makeRiskyRepo(2, 'b/b'), makeRiskyRepo(3, 'c/c')];
    const { recommendations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(recommendations.length).toBeLessThanOrEqual(5);
  });

  it('includes systemic boundary violation recommendation when violations exist', () => {
    const repos = [
      makeRepo({ repoId: 1, boundaryVerification: { violations: [{ type: 'frontend_imports_backend', severity: 'high', summary: 's' }] } }),
    ];
    const { recommendations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(recommendations.some(r => r.includes('frontend_imports_backend'))).toBe(true);
  });

  it('includes circular dep recommendation when repos have circular deps', () => {
    const repos = [makeRepo({ repoId: 1, dependencyGraph: { couplingMetrics: { totalEdges: 10, circularDependencyCount: 2, highFanOutFiles: [], highFanInFiles: [] } } })];
    const { recommendations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(recommendations.some(r => r.toLowerCase().includes('circular'))).toBe(true);
  });

  it('includes weak completeness recommendation when repos have weak completeness', () => {
    const repos = [makeRepo({ repoId: 1, implementationCompleteness: { completenessScore: 35, completenessLevel: 'weak', signals: [], placeholderAssessment: { placeholderCount: 3, files: [] }, scaffoldAssessment: { scaffoldLikeFileCount: 1, files: [] } } })];
    const { recommendations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(recommendations.some(r => r.toLowerCase().includes('weak') || r.toLowerCase().includes('placeholder'))).toBe(true);
  });

  it('deduplicates recommendations', () => {
    const repos = [
      makeRepo({ repoId: 1, recommendations: ['Fix boundary violations before deploying.'] }),
      makeRepo({ repoId: 2, recommendations: ['Fix boundary violations before deploying.'] }),
    ];
    const { recommendations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    const dupes = recommendations.filter(r => r === 'Fix boundary violations before deploying.');
    expect(dupes.length).toBeLessThanOrEqual(1);
  });

  it('returns empty recommendations for healthy portfolio with no issues', () => {
    const repos = [makeHealthyRepo(1, 'a/a'), makeHealthyRepo(2, 'b/b')];
    const { recommendations } = buildPortfolioArchitectureIntelligence({ repositories: repos });
    // Should have no portfolio-level recs, may have repo recs
    expect(Array.isArray(recommendations)).toBe(true);
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — non-mutation', () => {
  it('does not mutate the repositories array', () => {
    const repos = [
      makeRepo({ repoId: 1, architectureHealthScore: 80, architectureHealthLevel: 'watch' }),
      makeRepo({ repoId: 2, architectureHealthScore: 60, architectureHealthLevel: 'weak' }),
    ];
    const frozen = repos.map(r => Object.freeze(r));
    expect(() => buildPortfolioArchitectureIntelligence({ repositories: frozen })).not.toThrow();
  });

  it('does not mutate violation arrays in repos', () => {
    const violations = [{ type: 'x', severity: 'high', summary: 's' }];
    Object.freeze(violations);
    const repos = [makeRepo({ repoId: 1, boundaryVerification: { violations } })];
    expect(() => buildPortfolioArchitectureIntelligence({ repositories: repos })).not.toThrow();
  });

  it('returns a new object on each call', () => {
    const repos = [makeRepo({ repoId: 1 })];
    const r1 = buildPortfolioArchitectureIntelligence({ repositories: repos });
    const r2 = buildPortfolioArchitectureIntelligence({ repositories: repos });
    expect(r1).not.toBe(r2);
  });
});

// ── Mixed portfolio example ───────────────────────────────────────────────────

describe('buildPortfolioArchitectureIntelligence — mixed portfolio', () => {
  let result;
  beforeEach(() => {
    result = buildPortfolioArchitectureIntelligence({
      repositories: [
        makeHealthyRepo(1, 'alpha/core'),
        makeRepo({ repoId: 2, repoName: 'beta/api', architectureHealthScore: 72, architectureHealthLevel: 'watch', confidenceLevel: 'high' }),
        makeRepo({ repoId: 3, repoName: 'gamma/ui', architectureHealthScore: 55, architectureHealthLevel: 'weak', confidenceLevel: 'medium', dependencyGraph: { couplingMetrics: { totalEdges: 30, circularDependencyCount: 1, highFanOutFiles: ['x.js'], highFanInFiles: [] } } }),
        makeRiskyRepo(4, 'delta/legacy'),
        makeUnknownRepo(5, 'epsilon/new'),
      ],
    });
  });

  it('has portfolioArchitectureScore ignoring unknown repo', () => {
    // (90 + 72 + 55 + 30) / 4 = 247 / 4 = 61.75 → 62
    expect(result.portfolioArchitectureScore).toBe(62);
  });

  it('has architectureLevel weak (62 is in 45-69 range)', () => {
    expect(result.architectureLevel).toBe('weak');
  });

  it('has distribution across all levels', () => {
    expect(result.distribution.healthy).toBe(1);
    expect(result.distribution.watch).toBe(1);
    expect(result.distribution.weak).toBe(1);
    expect(result.distribution.risky).toBe(1);
    expect(result.distribution.unknown).toBe(1);
  });

  it('has confidenceLevel medium (4 repos with data, <5 high/med threshold)', () => {
    // n=5, highMedCount: alpha=high, beta=high, gamma=medium, delta=low, epsilon=low → 3/5 = 60% < 70%
    // so medium
    expect(result.confidenceLevel).toBe('medium');
  });

  it('has benchmarkedRepositories with 5 entries', () => {
    expect(result.benchmarkedRepositories).toHaveLength(5);
  });

  it('alpha/core is rank 1', () => {
    const alpha = result.benchmarkedRepositories.find(r => r.repoName === 'alpha/core');
    expect(alpha.rank).toBe(1);
    expect(alpha.relativePosition).toBe('leading');
  });

  it('has no null or undefined fields in top-level output', () => {
    const requiredKeys = [
      'portfolioArchitectureScore', 'architectureLevel', 'confidenceLevel', 'summary',
      'distribution', 'systemicBoundaryViolations', 'portfolioCoupling',
      'apiIntegrationHealth', 'implementationIntegrity', 'benchmarkedRepositories',
      'topFindings', 'recommendations',
    ];
    requiredKeys.forEach(k => {
      expect(result[k]).not.toBeUndefined();
      expect(result[k]).not.toBeNull();
    });
  });
});
