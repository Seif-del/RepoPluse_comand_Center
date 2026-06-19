'use strict';

// Integration tests: FR-009 repository filter SQL against a real PostgreSQL database.
//
// Proves the three WHERE-clause predicates in GET /api/repos that unit tests cannot cover
// because db.query is mocked end-to-end in the unit suite:
//
//   riskLevel  →  rs.label = $2                        (via LATERAL join on risk_scores)
//   search     →  github_full_name ILIKE '%' || $3 || '%'
//   activeSince →  last_synced_at bounds / IS NULL handling (timestamptz params)
//
// Opt-in only — self-skip when TEST_INTEGRATION is not set.
// Run (single file, no coverage):
//   $env:TEST_INTEGRATION = "true"; npx jest tests/integration/repoFilters.db.integration.test.js --no-coverage
//
// Requires a PostgreSQL test database with migrations 0001–0007 applied.
// Set TEST_DATABASE_URL (preferred) or DATABASE_URL — URL must contain
// "test", "local", or "localhost" or the safety guard throws.
//
// No SMTP server, Slack webhook, or GitHub token required.

const {
  requireIntegrationEnv,
  createTestPool,
  closeTestPool,
} = require('./helpers/dbTestHelper');

const { upsertUser } = require('../../execution/auth/upsertUser');

// ─── Opt-in guard ─────────────────────────────────────────────────────────────
const INTEGRATION_URL     = requireIntegrationEnv();
const describeIntegration = INTEGRATION_URL ? describe : describe.skip;

// ─── Shared state ─────────────────────────────────────────────────────────────
let pool;
let testUserId;

// ─── SQL — copied verbatim from backend/routes/repoRoutes.js GET / ────────────
// If the production query changes, update this copy so the test remains
// a faithful mirror of what the route actually executes.
const REPOS_SQL = `
  SELECT
    r.id,
    r.github_full_name AS "fullName",
    r.is_active        AS "isActive",
    r.linked_at        AS "linkedAt",
    r.last_synced_at   AS "lastSyncedAt",
    r.project_status   AS "projectStatus",
    rs.score,
    rs.label,
    rs.trend,
    rs.factors,
    rs.snapshot_at     AS "scoredAt",
    rsp.prev_score     AS "prevScore",
    rm.ci_status                  AS "ciStatus",
    rm.latest_release_name        AS "latestReleaseName",
    rm.latest_release_published_at AS "latestReleasePublishedAt",
    rm.release_status             AS "releaseStatus",
    rm.active_contributor_count   AS "activeContributorCount",
    rm.top_contributor_percentage AS "topContributorPercentage",
    rm.contributor_status         AS "contributorStatus"
  FROM repositories r
  LEFT JOIN LATERAL (
    SELECT score, label, trend, factors, snapshot_at
    FROM risk_scores
    WHERE repo_id = r.id
    ORDER BY snapshot_at DESC
    LIMIT 1
  ) rs ON true
  LEFT JOIN LATERAL (
    SELECT score AS prev_score
    FROM risk_scores
    WHERE repo_id = r.id
    ORDER BY snapshot_at DESC
    LIMIT 1 OFFSET 1
  ) rsp ON true
  LEFT JOIN LATERAL (
    SELECT ci_status, latest_release_name, latest_release_published_at, release_status,
           active_contributor_count, top_contributor_percentage, contributor_status
    FROM repo_metrics
    WHERE repo_id = r.id
    ORDER BY snapshot_at DESC
    LIMIT 1
  ) rm ON true
  WHERE r.user_id = $1 AND r.is_active = true
    AND ($2::varchar IS NULL OR rs.label = $2)
    AND ($3::varchar IS NULL OR r.github_full_name ILIKE '%' || $3 || '%')
    AND ($4::timestamptz IS NULL OR r.last_synced_at >= $4::timestamptz)
    AND ($5::timestamptz IS NULL OR r.last_synced_at IS NULL OR r.last_synced_at < $5::timestamptz)
    AND ($6::varchar IS NULL OR r.project_status = $6)
  ORDER BY rs.score DESC NULLS LAST, r.github_full_name ASC`;

// ─── Filter param builder — mirrors route handler logic exactly ───────────────
// Any changes to the route's lowerBound/upperBound computation must be
// mirrored here so the test remains a faithful proxy for route behaviour.
const DAY_MS = 86_400_000;

function buildParams(userId, { riskLevel = null, search = null, activeSince = null, projectStatus = null } = {}) {
  let lowerBound = null;
  let upperBound = null;
  if (activeSince === 'stale') {
    upperBound = new Date(Date.now() - 30 * DAY_MS).toISOString();
  } else if (activeSince === '7d' || activeSince === '30d' || activeSince === '90d') {
    lowerBound = new Date(Date.now() - parseInt(activeSince, 10) * DAY_MS).toISOString();
  }
  return [userId, riskLevel, search, lowerBound, upperBound, projectStatus];
}

// ─── Query helper ─────────────────────────────────────────────────────────────
// Runs the verbatim route SQL against the real pool and returns the sorted
// array of github_full_name strings. Sorting makes assertions independent of
// the rs.score DESC / r.github_full_name ASC ordering in the query.
async function queryFullNames(filterOpts = {}) {
  const params = buildParams(testUserId, filterOpts);
  const { rows } = await pool.query(REPOS_SQL, params);
  return rows.map(r => r.fullName).sort();
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

// Monotonically-increasing synthetic github_repo_id — avoids UNIQUE violations
// across repeated beforeAll calls; starts far from any real repo ID.
let _repoIdCursor = 700_100;

async function seedRepo({ fullName, lastSyncedAt = null, projectStatus = 'active' }) {
  const { rows } = await pool.query(
    `INSERT INTO repositories
       (user_id, github_repo_id, github_full_name, is_active, linked_at, last_synced_at, project_status)
     VALUES ($1, $2, $3, true, NOW(), $4, $5)
     RETURNING id`,
    [testUserId, _repoIdCursor++, fullName, lastSyncedAt, projectStatus],
  );
  return rows[0].id;
}

async function seedRiskScore(repoId, { score, label }) {
  await pool.query(
    `INSERT INTO risk_scores (repo_id, snapshot_at, score, label, trend, factors)
     VALUES ($1, NOW(), $2, $3, 'stable', '[]')`,
    [repoId, score, label],
  );
}

// ─── Test fixtures ────────────────────────────────────────────────────────────
// Timestamps are anchored at module-load time and kept well away from every
// filter boundary — minimum cushion is 2 days — so timing drift between
// module load and test execution never flips a boundary assertion.
//
// Filter boundary reference:
//   7d:  cutoff = NOW-7d    → alpha (1d) and gamma (3d) and zeta (5d) qualify
//   30d: cutoff = NOW-30d   → above + beta (10d) qualifies; delta (60d) excluded
//   90d: cutoff = NOW-90d   → above + delta (60d) qualifies; epsilon (null) excluded
//   stale: > 30d ago or null → delta (60d) + epsilon (null)

const _NOW = Date.now();
const daysAgo = (n) => new Date(_NOW - n * DAY_MS).toISOString();

const FIXTURES = {
  HEALTHY_ALPHA:  { fullName: 'org/healthy-alpha',    score: 20, label: 'healthy',  lastSyncedAt: daysAgo(1),  projectStatus: 'active'   },
  HEALTHY_BETA:   { fullName: 'org/healthy-beta',     score: 25, label: 'healthy',  lastSyncedAt: daysAgo(10), projectStatus: 'inactive'  },
  ATRISK_GAMMA:   { fullName: 'org/atrisk-gamma',     score: 55, label: 'at-risk',  lastSyncedAt: daysAgo(3),  projectStatus: 'active'   },
  CRITICAL_DELTA: { fullName: 'org/critical-delta',   score: 80, label: 'critical', lastSyncedAt: daysAgo(60), projectStatus: 'archived'  },
  NOSCORE_EPS:    { fullName: 'org/noscore-epsilon',  score: null, label: null,     lastSyncedAt: null,        projectStatus: 'active'   },
  MIXCASE_ZETA:   { fullName: 'org/MIXED-Case-zeta',  score: 15, label: 'healthy',  lastSyncedAt: daysAgo(5),  projectStatus: 'active'   },
};

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!INTEGRATION_URL) return;

  pool = createTestPool(INTEGRATION_URL);

  // CASCADE removes all dependent rows (repositories, risk_scores, repo_metrics,
  // notifications, sessions) so each full test run starts from a clean slate.
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');

  const user = await upsertUser({
    db:             pool,
    githubId:       7001,
    githubUsername: 'filter-test-user',
    email:          'filter@test.local',
    defaultRole:    'project_manager',
    now:            new Date(),
  });
  testUserId = user.userId;

  for (const fx of Object.values(FIXTURES)) {
    const repoId = await seedRepo({ fullName: fx.fullName, lastSyncedAt: fx.lastSyncedAt, projectStatus: fx.projectStatus });
    if (fx.label !== null) {
      await seedRiskScore(repoId, { score: fx.score, label: fx.label });
    }
  }
});

afterAll(async () => {
  if (!pool) return;
  await closeTestPool(pool);
});

// ─── Block 1: riskLevel filter ────────────────────────────────────────────────

describeIntegration('Integration: GET /api/repos — riskLevel filter against real DB', () => {

  it('riskLevel=healthy returns only the three repos whose latest risk_score label is "healthy"', async () => {
    const names = await queryFullNames({ riskLevel: 'healthy' });
    expect(names).toEqual([
      'org/MIXED-Case-zeta',
      'org/healthy-alpha',
      'org/healthy-beta',
    ].sort());
  });

  it('riskLevel=at-risk returns only the one repo labeled at-risk', async () => {
    const names = await queryFullNames({ riskLevel: 'at-risk' });
    expect(names).toEqual(['org/atrisk-gamma']);
  });

  it('riskLevel=critical returns only the one repo labeled critical', async () => {
    const names = await queryFullNames({ riskLevel: 'critical' });
    expect(names).toEqual(['org/critical-delta']);
  });

  it('absent riskLevel returns all repos — including the one with no risk_score row', async () => {
    const names = await queryFullNames({});
    expect(names).toHaveLength(6);
    expect(names).toContain('org/noscore-epsilon');
  });

  it('setting any riskLevel value excludes repos whose risk_score row is missing (NULL LATERAL result)', async () => {
    // epsilon has no risk_score — rs.label IS NULL — so rs.label = $2 is never true.
    // It must be absent from every label-filtered result set.
    const [healthy, atRisk, critical] = await Promise.all([
      queryFullNames({ riskLevel: 'healthy' }),
      queryFullNames({ riskLevel: 'at-risk' }),
      queryFullNames({ riskLevel: 'critical' }),
    ]);
    expect(healthy).not.toContain('org/noscore-epsilon');
    expect(atRisk).not.toContain('org/noscore-epsilon');
    expect(critical).not.toContain('org/noscore-epsilon');
  });
});

// ─── Block 2: repository name search ─────────────────────────────────────────

describeIntegration('Integration: GET /api/repos — search filter against real DB', () => {

  it('search term is matched as a substring of github_full_name', async () => {
    const names = await queryFullNames({ search: 'healthy-alpha' });
    expect(names).toEqual(['org/healthy-alpha']);
  });

  it('search term matching a common prefix returns all repos sharing that prefix', async () => {
    const names = await queryFullNames({ search: 'org/' });
    expect(names).toHaveLength(6);
  });

  it('ILIKE is case-insensitive: lowercase search term matches uppercase stored value', async () => {
    // Stored: "org/MIXED-Case-zeta". Search "mixed" (lowercase) must match via ILIKE.
    const names = await queryFullNames({ search: 'mixed' });
    expect(names).toEqual(['org/MIXED-Case-zeta']);
  });

  it('ILIKE is case-insensitive: uppercase search term matches lowercase stored value', async () => {
    // Stored: "org/healthy-alpha". Search "ALPHA" (uppercase) must match via ILIKE.
    const names = await queryFullNames({ search: 'ALPHA' });
    expect(names).toEqual(['org/healthy-alpha']);
  });

  it('search term with no matching substring returns an empty result set', async () => {
    const names = await queryFullNames({ search: 'xyz-no-match-8675309' });
    expect(names).toHaveLength(0);
  });
});

// ─── Block 3: activeSince filter ─────────────────────────────────────────────

describeIntegration('Integration: GET /api/repos — activeSince filter against real DB', () => {

  it('activeSince=7d returns only repos whose last_synced_at is within the past 7 days', async () => {
    // alpha (1d), gamma (3d), zeta (5d) qualify; beta (10d), delta (60d), epsilon (null) excluded
    const names = await queryFullNames({ activeSince: '7d' });
    expect(names).toEqual([
      'org/MIXED-Case-zeta',
      'org/atrisk-gamma',
      'org/healthy-alpha',
    ].sort());
  });

  it('activeSince=30d returns repos synced within 30 days — adds beta (10d) vs the 7d result', async () => {
    // alpha (1d), beta (10d), gamma (3d), zeta (5d); delta (60d) and epsilon (null) excluded
    const names = await queryFullNames({ activeSince: '30d' });
    expect(names).toEqual([
      'org/MIXED-Case-zeta',
      'org/atrisk-gamma',
      'org/healthy-alpha',
      'org/healthy-beta',
    ].sort());
  });

  it('activeSince=90d returns repos synced within 90 days — adds delta (60d) vs the 30d result', async () => {
    // alpha (1d), beta (10d), gamma (3d), delta (60d), zeta (5d); epsilon (null) excluded
    const names = await queryFullNames({ activeSince: '90d' });
    expect(names).toEqual([
      'org/MIXED-Case-zeta',
      'org/atrisk-gamma',
      'org/critical-delta',
      'org/healthy-alpha',
      'org/healthy-beta',
    ].sort());
  });

  it('activeSince=stale returns repos whose last sync was more than 30 days ago', async () => {
    // delta (60d) is clearly stale; all repos synced within 30d must be absent
    const names = await queryFullNames({ activeSince: 'stale' });
    expect(names).toContain('org/critical-delta');
    expect(names).not.toContain('org/healthy-alpha');   // 1d ago — not stale
    expect(names).not.toContain('org/healthy-beta');    // 10d ago — not stale
    expect(names).not.toContain('org/atrisk-gamma');    // 3d ago — not stale
    expect(names).not.toContain('org/MIXED-Case-zeta'); // 5d ago — not stale
  });

  it('activeSince=stale includes repos with NULL last_synced_at (never synced)', async () => {
    // The SQL clause is: last_synced_at IS NULL OR last_synced_at < $5
    // epsilon.last_synced_at IS NULL → it satisfies the IS NULL branch → must appear in stale
    const names = await queryFullNames({ activeSince: 'stale' });
    expect(names).toContain('org/noscore-epsilon');
    expect(names).toHaveLength(2); // delta + epsilon
  });
});

// ─── Block 4: combined filters ────────────────────────────────────────────────

describeIntegration('Integration: GET /api/repos — combined filters against real DB', () => {

  it('riskLevel + search: both predicates must be satisfied simultaneously', async () => {
    // riskLevel=healthy AND search=alpha → only org/healthy-alpha is both healthy and contains "alpha"
    const names = await queryFullNames({ riskLevel: 'healthy', search: 'alpha' });
    expect(names).toEqual(['org/healthy-alpha']);
  });

  it('search + activeSince: name match and recency window both applied', async () => {
    // search=zeta → org/MIXED-Case-zeta (5d); activeSince=7d → 5d is within 7d → qualifies
    const names = await queryFullNames({ search: 'zeta', activeSince: '7d' });
    expect(names).toEqual(['org/MIXED-Case-zeta']);
  });

  it('riskLevel + activeSince: label match and recency window both applied', async () => {
    // riskLevel=at-risk → only gamma; activeSince=30d → gamma (3d) is within 30d → qualifies
    const names = await queryFullNames({ riskLevel: 'at-risk', activeSince: '30d' });
    expect(names).toEqual(['org/atrisk-gamma']);
  });

  it('all three filters applied together return only repos satisfying every constraint', async () => {
    // riskLevel=healthy AND search=beta AND activeSince=30d
    // beta is healthy, github_full_name contains "beta", and was synced 10d ago (within 30d)
    const names = await queryFullNames({ riskLevel: 'healthy', search: 'beta', activeSince: '30d' });
    expect(names).toEqual(['org/healthy-beta']);
  });
});

// ─── Block 5: projectStatus filter ───────────────────────────────────────────
//
// Fixtures (from FIXTURES above):
//   alpha  → active    (healthy,  1d ago)
//   beta   → inactive  (healthy, 10d ago)
//   gamma  → active    (at-risk,  3d ago)
//   delta  → archived  (critical, 60d ago)
//   eps    → active    (no score, null lastSyncedAt)
//   zeta   → active    (healthy,  5d ago)

describeIntegration('Integration: GET /api/repos — projectStatus filter against real DB', () => {

  it('projectStatus=active returns the four repos with project_status = "active"', async () => {
    const names = await queryFullNames({ projectStatus: 'active' });
    expect(names).toEqual([
      'org/MIXED-Case-zeta',
      'org/atrisk-gamma',
      'org/healthy-alpha',
      'org/noscore-epsilon',
    ].sort());
  });

  it('projectStatus=inactive returns only the one repo with project_status = "inactive"', async () => {
    const names = await queryFullNames({ projectStatus: 'inactive' });
    expect(names).toEqual(['org/healthy-beta']);
  });

  it('projectStatus=archived returns only the one repo with project_status = "archived"', async () => {
    const names = await queryFullNames({ projectStatus: 'archived' });
    expect(names).toEqual(['org/critical-delta']);
  });

  it('absent projectStatus returns all six repos regardless of their project_status value', async () => {
    const names = await queryFullNames({});
    expect(names).toHaveLength(6);
  });

  it('projectStatus=active combined with riskLevel=healthy returns only active healthy repos', async () => {
    // healthy repos: alpha (active), beta (inactive), zeta (active)
    // active AND healthy → alpha + zeta
    const names = await queryFullNames({ riskLevel: 'healthy', projectStatus: 'active' });
    expect(names).toEqual([
      'org/MIXED-Case-zeta',
      'org/healthy-alpha',
    ].sort());
  });
});
