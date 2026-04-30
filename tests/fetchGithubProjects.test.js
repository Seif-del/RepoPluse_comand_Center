// Must be set before any require() that transitively loads config/paths.js,
// because paths.js reads process.env.GITHUB_ORG once at load time and
// freezes the value. Without this, fetchGithubProjects returns the MOCK
// array immediately and never reaches the scoring logic.
process.env.GITHUB_ORG = 'test-org';

const fetchGithubProjects = require('../execution/fetchGithubProjects');

// Defaults from config/paths.js when env vars are not set:
//   STALE_DAYS = 90, ISSUE_THRESHOLD = 20
const OLD_PUSH    = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(); // 180d ago → stale
const RECENT_PUSH = new Date().toISOString();
const HIGH_ISSUES = 50;  // > 20 threshold
const LOW_ISSUES  = 0;

function makeRepo(overrides) {
  return {
    id: 1,
    full_name: 'test/repo',
    archived: false,
    disabled: false,
    pushed_at: RECENT_PUSH,
    open_issues_count: LOW_ISSUES,
    ...overrides,
  };
}

function mockFetch(repos) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(repos),
  });
}

afterEach(() => {
  delete global.fetch;
});

describe('fetchGithubProjects — scoring model', () => {
  it('archived alone does not force At Risk', async () => {
    mockFetch([makeRepo({ archived: true })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('Healthy');
  });

  it('disabled is a hard stop → At Risk regardless of other signals', async () => {
    mockFetch([makeRepo({ disabled: true })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('At Risk');
  });

  it('archived + disabled → At Risk (disabled hard stop wins)', async () => {
    mockFetch([makeRepo({ archived: true, disabled: true })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('At Risk');
  });

  it('stale + high issues → At Risk (score reaches threshold)', async () => {
    mockFetch([makeRepo({ pushed_at: OLD_PUSH, open_issues_count: HIGH_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('At Risk');
  });

  it('stale only → Healthy (score below threshold)', async () => {
    mockFetch([makeRepo({ pushed_at: OLD_PUSH, open_issues_count: LOW_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('Healthy');
  });

  it('high issues only → At Risk (score 2 meets threshold)', async () => {
    mockFetch([makeRepo({ pushed_at: RECENT_PUSH, open_issues_count: HIGH_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('At Risk');
  });

  it('archived + stale + high issues → At Risk (active signals are still scored)', async () => {
    mockFetch([makeRepo({ archived: true, pushed_at: OLD_PUSH, open_issues_count: HIGH_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('At Risk');
  });

  it('archived + stale only → Healthy (archived excluded, one signal below threshold)', async () => {
    mockFetch([makeRepo({ archived: true, pushed_at: OLD_PUSH, open_issues_count: LOW_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('Healthy');
  });
});

describe('fetchGithubProjects — output shape', () => {
  it('each result has id, name, status, and reasons and nothing else', async () => {
    mockFetch([makeRepo()]);
    const [repo] = await fetchGithubProjects();
    expect(Object.keys(repo).sort()).toEqual(['id', 'name', 'reasons', 'status']);
  });

  it('name maps from full_name', async () => {
    mockFetch([makeRepo({ full_name: 'myorg/my-repo' })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.name).toBe('myorg/my-repo');
  });
});

describe('fetchGithubProjects — At Risk / reasons invariant', () => {
  it('every At Risk result has at least one reason (disabled path)', async () => {
    mockFetch([makeRepo({ disabled: true })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('At Risk');
    expect(repo.reasons.length).toBeGreaterThanOrEqual(1);
  });

  it('every At Risk result has at least one reason (high issues path)', async () => {
    mockFetch([makeRepo({ open_issues_count: HIGH_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('At Risk');
    expect(repo.reasons.length).toBeGreaterThanOrEqual(1);
  });

  it('every At Risk result has at least one reason (stale + high issues path)', async () => {
    mockFetch([makeRepo({ pushed_at: OLD_PUSH, open_issues_count: HIGH_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.status).toBe('At Risk');
    expect(repo.reasons.length).toBeGreaterThanOrEqual(1);
  });
});

describe('fetchGithubProjects — reasons field', () => {
  it('healthy repo with no signals has empty reasons array', async () => {
    mockFetch([makeRepo()]);
    const [repo] = await fetchGithubProjects();
    expect(repo.reasons).toEqual([]);
  });

  it('disabled repo has "Repository is disabled" reason', async () => {
    mockFetch([makeRepo({ disabled: true })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.reasons).toContain('Repository is disabled');
  });

  it('stale repo has "No recent activity" reason', async () => {
    mockFetch([makeRepo({ pushed_at: OLD_PUSH })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.reasons).toContain('No recent activity');
  });

  it('high issues repo has "High issue backlog" reason', async () => {
    mockFetch([makeRepo({ open_issues_count: HIGH_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.reasons).toContain('High issue backlog');
  });

  it('stale + high issues → both reasons present', async () => {
    mockFetch([makeRepo({ pushed_at: OLD_PUSH, open_issues_count: HIGH_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.reasons).toContain('No recent activity');
    expect(repo.reasons).toContain('High issue backlog');
    expect(repo.reasons).toHaveLength(2);
  });

  it('disabled + stale + high issues → all three reasons present', async () => {
    mockFetch([makeRepo({ disabled: true, pushed_at: OLD_PUSH, open_issues_count: HIGH_ISSUES })]);
    const [repo] = await fetchGithubProjects();
    expect(repo.reasons).toContain('Repository is disabled');
    expect(repo.reasons).toContain('No recent activity');
    expect(repo.reasons).toContain('High issue backlog');
    expect(repo.reasons).toHaveLength(3);
  });
});
