const fs   = require('fs');
const os   = require('os');
const path = require('path');

const OUTPUT_FILE = path.join(os.tmpdir(), 'repopulse-syncGithubProjects.test.json');

// Must be set before any require() that transitively loads config/paths.js,
// because paths.js reads process.env.PROJECTS_FILE once at load time and
// freezes the value into its export. Jest isolates each test file in its own
// module registry, so setting the env var here — at the top of the file,
// before the requires below — guarantees a fresh read of the correct value.
process.env.PROJECTS_FILE = OUTPUT_FILE;

jest.mock('../execution/fetchGithubProjects');
const fetchGithubProjects = require('../execution/fetchGithubProjects');
const syncGithubProjects  = require('../execution/syncGithubProjects');

const MOCK_PROJECTS = [
  { id: 101, name: 'colaberry/data-pipeline', status: 'Healthy' },
  { id: 102, name: 'colaberry/auth-service',  status: 'At Risk' },
];

beforeEach(() => {
  fetchGithubProjects.mockResolvedValue(MOCK_PROJECTS);
});

afterEach(() => {
  if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);
  jest.clearAllMocks();
});

describe('syncGithubProjects', () => {
  it('calls fetchGithubProjects exactly once', async () => {
    await syncGithubProjects();
    expect(fetchGithubProjects).toHaveBeenCalledTimes(1);
  });

  it('creates a file at PROJECTS_FILE path', async () => {
    await syncGithubProjects();
    expect(fs.existsSync(OUTPUT_FILE)).toBe(true);
  });

  it('written file contains valid JSON', async () => {
    await syncGithubProjects();
    const raw = fs.readFileSync(OUTPUT_FILE, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('written JSON matches the array returned by fetchGithubProjects', async () => {
    await syncGithubProjects();
    const written = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    expect(written).toEqual(MOCK_PROJECTS);
  });

  it('returns the fetched projects array', async () => {
    const result = await syncGithubProjects();
    expect(result).toEqual(MOCK_PROJECTS);
  });

  it('overwrites a pre-existing file with fresh data', async () => {
    const stale = [{ id: 0, name: 'stale', status: 'Healthy' }];
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stale), 'utf8');

    await syncGithubProjects();

    const written = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    expect(written).toEqual(MOCK_PROJECTS);
  });

  it('propagates a rejection from fetchGithubProjects', async () => {
    fetchGithubProjects.mockRejectedValue(new Error('GitHub API error'));
    await expect(syncGithubProjects()).rejects.toThrow('GitHub API error');
  });
});
