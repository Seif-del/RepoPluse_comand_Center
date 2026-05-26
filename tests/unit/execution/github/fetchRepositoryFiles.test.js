'use strict';

const { fetchRepositoryFiles } = require('../../../../execution/github/fetchRepositoryFiles');

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_TOKEN    = 'ghp_test_token';
const VALID_FULLNAME = 'owner/repo';

function b64(str) {
  return Buffer.from(str).toString('base64');
}

// Builds a mock fetchFn that routes by URL pattern.
//   meta     - JSON for GET /repos/owner/repo (default_branch)
//   tree     - array of items for GET /git/trees/... (treeData.tree)
//   contents - map of path → content JSON for GET /contents/... responses
//   treeOk   - set false to make tree request return non-OK
//   repoOk   - set false to make repo metadata request return non-OK
function makeFetchFn({ meta, tree = [], contents = {}, treeOk = true, repoOk = true } = {}) {
  return jest.fn(async (url) => {
    const isRepoMeta = /\/repos\/[^/]+\/[^/]+$/.test(url) && !url.includes('/git/') && !url.includes('/contents/');
    if (isRepoMeta) {
      if (!repoOk) return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, json: async () => (meta || { default_branch: 'main' }) };
    }
    if (url.includes('/git/trees/')) {
      if (!treeOk) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, json: async () => ({ tree }) };
    }
    if (url.includes('/contents/')) {
      const pathMatch = url.match(/\/contents\/(.+?)\?ref=/);
      const filePath  = pathMatch ? pathMatch[1] : '';
      const entry     = contents[filePath];
      if (!entry) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, json: async () => entry };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

function makeBlob(path, textContent) {
  return { type: 'blob', path, sha: 'abc', size: textContent.length };
}

function makeContentEntry(textContent) {
  return { content: b64(textContent) + '\n', encoding: 'base64' };
}

// ── Input validation ──────────────────────────────────────────────────────────

describe('fetchRepositoryFiles — input validation', () => {
  it('throws INVALID_ACCESS_TOKEN when accessToken is missing', async () => {
    await expect(fetchRepositoryFiles({
      fullName: VALID_FULLNAME,
      fetchFn:  jest.fn(),
    })).rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN when accessToken is blank', async () => {
    await expect(fetchRepositoryFiles({
      accessToken: '   ',
      fullName:    VALID_FULLNAME,
      fetchFn:     jest.fn(),
    })).rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ARGUMENT when fullName is missing', async () => {
    await expect(fetchRepositoryFiles({
      accessToken: VALID_TOKEN,
      fetchFn:     jest.fn(),
    })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws INVALID_FETCH_FN when fetchFn is not a function', async () => {
    await expect(fetchRepositoryFiles({
      accessToken: VALID_TOKEN,
      fullName:    VALID_FULLNAME,
      fetchFn:     null,
    })).rejects.toMatchObject({ code: 'INVALID_FETCH_FN' });
  });
});

// ── Branch resolution ─────────────────────────────────────────────────────────

describe('fetchRepositoryFiles — branch resolution', () => {
  it('uses provided branch directly without fetching repo metadata', async () => {
    const fetchFn = makeFetchFn({
      tree: [makeBlob('index.js', 'a')],
      contents: { 'index.js': makeContentEntry('console.log("a")') },
    });
    await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'develop', fetchFn });
    const repoMetaCall = fetchFn.mock.calls.find(c =>
      /\/repos\/[^/]+\/[^/]+$/.test(c[0]) && !c[0].includes('/git/')
    );
    expect(repoMetaCall).toBeUndefined(); // no metadata fetch when branch is explicit
  });

  it('fetches repo metadata and uses default_branch when branch is omitted', async () => {
    const fetchFn = makeFetchFn({
      meta: { default_branch: 'master' },
      tree: [makeBlob('index.js', 'a')],
      contents: { 'index.js': makeContentEntry('console.log("a")') },
    });
    const { debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, fetchFn });
    expect(debug.branch).toBe('master');
  });

  it('falls back to main when repo metadata has no default_branch', async () => {
    const fetchFn = makeFetchFn({
      meta: {},
      tree: [],
    });
    const { debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, fetchFn });
    expect(debug.branch).toBe('main');
  });

  it('throws REPO_FETCH_FAILED when repo metadata request returns non-OK', async () => {
    const fetchFn = makeFetchFn({ repoOk: false });
    await expect(fetchRepositoryFiles({
      accessToken: VALID_TOKEN,
      fullName:    VALID_FULLNAME,
      fetchFn,
    })).rejects.toMatchObject({ code: 'REPO_FETCH_FAILED' });
  });

  it('uses provided branch in tree URL', async () => {
    const fetchFn = makeFetchFn({
      tree:     [makeBlob('src/app.ts', 'a')],
      contents: { 'src/app.ts': makeContentEntry('export {}') },
    });
    await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'feature-x', fetchFn });
    const treeCall = fetchFn.mock.calls.find(c => c[0].includes('/git/trees/'));
    expect(treeCall[0]).toContain('feature-x');
  });

  it('uses resolved branch in content URLs', async () => {
    const fetchFn = makeFetchFn({
      meta:     { default_branch: 'stable' },
      tree:     [makeBlob('lib/util.js', 'a')],
      contents: { 'lib/util.js': makeContentEntry('module.exports = {}') },
    });
    await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, fetchFn });
    const contentCall = fetchFn.mock.calls.find(c => c[0].includes('/contents/'));
    expect(contentCall[0]).toContain('ref=stable');
  });
});

// ── Tree fetch failures ───────────────────────────────────────────────────────

describe('fetchRepositoryFiles — tree fetch failure', () => {
  it('throws TREE_FETCH_FAILED when tree request returns non-OK', async () => {
    const fetchFn = makeFetchFn({ treeOk: false });
    await expect(fetchRepositoryFiles({
      accessToken: VALID_TOKEN,
      fullName:    VALID_FULLNAME,
      branch:      'main',
      fetchFn,
    })).rejects.toMatchObject({ code: 'TREE_FETCH_FAILED' });
  });

  it('includes status on TREE_FETCH_FAILED error', async () => {
    const fetchFn = makeFetchFn({ treeOk: false });
    let thrown;
    try {
      await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    } catch (e) { thrown = e; }
    expect(thrown).toBeDefined();
    expect(thrown.status).toBe(404);
  });

  it('does not silently return [] when tree fetch fails', async () => {
    const fetchFn = makeFetchFn({ treeOk: false });
    await expect(
      fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn })
    ).rejects.toThrow();
  });
});

// ── File filtering ────────────────────────────────────────────────────────────

describe('fetchRepositoryFiles — file filtering', () => {
  it('includes common source files: .js, .ts, .json, .html, .css, .yml', async () => {
    const paths = ['backend/app.js', 'src/index.ts', 'package.json', 'frontend/index.html', 'styles/main.css', '.github/ci.yml'];
    const tree  = paths.map(p => makeBlob(p, 'a'));
    const contents = Object.fromEntries(paths.map(p => [p, makeContentEntry('content')]));
    const fetchFn  = makeFetchFn({ tree, contents });
    const { files, debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(debug.eligibleFileCount).toBe(paths.length);
    expect(files).toHaveLength(paths.length);
  });

  it('includes package.json correctly', async () => {
    const fetchFn = makeFetchFn({
      tree:     [makeBlob('package.json', 'a')],
      contents: { 'package.json': makeContentEntry('{"name":"test"}') },
    });
    const { files } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('package.json');
    expect(files[0].language).toBe('json');
  });

  it('includes backend route files (*.js)', async () => {
    const fetchFn = makeFetchFn({
      tree:     [makeBlob('backend/routes/repoRoutes.js', 'a')],
      contents: { 'backend/routes/repoRoutes.js': makeContentEntry('module.exports={}') },
    });
    const { files } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(files).toHaveLength(1);
    expect(files[0].language).toBe('javascript');
  });

  it('excludes unsupported/binary file types', async () => {
    const paths = ['image.png', 'font.woff2', 'archive.zip', 'binary.exe', 'data.csv'];
    const fetchFn = makeFetchFn({ tree: paths.map(p => makeBlob(p, 'a')) });
    const { debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(debug.eligibleFileCount).toBe(0);
  });

  it('excludes .env files', async () => {
    const fetchFn = makeFetchFn({ tree: [makeBlob('.env', 'a'), makeBlob('.env.local', 'a'), makeBlob('.env.production', 'a')] });
    const { debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(debug.eligibleFileCount).toBe(0);
  });

  it('excludes .pem and .key files', async () => {
    const fetchFn = makeFetchFn({ tree: [makeBlob('certs/server.pem', 'a'), makeBlob('keys/private.key', 'a')] });
    const { debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(debug.eligibleFileCount).toBe(0);
  });

  it('excludes files with credentials or secrets in path', async () => {
    const fetchFn = makeFetchFn({ tree: [makeBlob('config/credentials.json', 'a'), makeBlob('config/secrets.yml', 'a')] });
    const { debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(debug.eligibleFileCount).toBe(0);
  });

  it('returns files without access token in any field', async () => {
    const fetchFn = makeFetchFn({
      tree:     [makeBlob('index.js', 'a')],
      contents: { 'index.js': makeContentEntry('console.log("safe")') },
    });
    const { files } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    const serialised = JSON.stringify(files);
    expect(serialised).not.toContain(VALID_TOKEN);
  });
});

// ── Blob fetch resilience ─────────────────────────────────────────────────────

describe('fetchRepositoryFiles — blob fetch resilience', () => {
  it('tolerates a single blob fetch failure without crashing', async () => {
    const fetchFn = makeFetchFn({
      tree: [makeBlob('good.js', 'a'), makeBlob('bad.js', 'b')],
      contents: {
        'good.js': makeContentEntry('console.log("good")'),
        // bad.js intentionally absent → 404
      },
    });
    const { files } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('good.js');
  });

  it('returns only successfully fetched files when some blobs fail', async () => {
    const paths = ['a.js', 'b.ts', 'c.json'];
    const tree  = paths.map(p => makeBlob(p, 'x'));
    const contents = {
      'a.js':   makeContentEntry('// a'),
      'c.json': makeContentEntry('{}'),
      // b.ts absent
    };
    const fetchFn = makeFetchFn({ tree, contents });
    const { files, debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(files).toHaveLength(2);
    expect(files.map(f => f.path).sort()).toEqual(['a.js', 'c.json']);
    expect(debug.eligibleFileCount).toBe(3);
    expect(debug.fetchedFileCount).toBe(2);
    expect(debug.skippedFileCount).toBe(1);
  });

  it('returns empty files with accurate debug counts when all eligible blobs fail', async () => {
    const tree     = ['x.js', 'y.ts', 'z.json'].map(p => makeBlob(p, 'a'));
    const fetchFn  = makeFetchFn({ tree, contents: {} }); // no contents → all 404
    const { files, debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(files).toHaveLength(0);
    expect(debug.eligibleFileCount).toBe(3);
    expect(debug.fetchedFileCount).toBe(0);
    expect(debug.skippedFileCount).toBe(3);
    // tree count must reflect what was actually in the tree
    expect(debug.fetchedTreeCount).toBe(3);
  });

  it('skips files with non-base64 encoding', async () => {
    const fetchFn = makeFetchFn({
      tree:     [makeBlob('odd.js', 'a')],
      contents: { 'odd.js': { content: 'hello', encoding: 'utf-8' } },
    });
    const { files, debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(files).toHaveLength(0);
    expect(debug.skippedFileCount).toBe(1);
  });

  it('skips files larger than 200 KB after decoding', async () => {
    const largeContent = 'x'.repeat(201 * 1024);
    const fetchFn = makeFetchFn({
      tree:     [makeBlob('large.js', 'a')],
      contents: { 'large.js': makeContentEntry(largeContent) },
    });
    const { files } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(files).toHaveLength(0);
  });
});

// ── Debug metadata ────────────────────────────────────────────────────────────

describe('fetchRepositoryFiles — debug metadata', () => {
  it('returns debug.fetchedTreeCount equal to total blobs+trees in tree response', async () => {
    const tree = [
      makeBlob('a.js', 'a'),
      { type: 'tree', path: 'src', sha: 'def' }, // directory — not a blob
      makeBlob('b.png', 'a'), // unsupported
    ];
    const contents = { 'a.js': makeContentEntry('// a') };
    const fetchFn  = makeFetchFn({ tree, contents });
    const { debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(debug.fetchedTreeCount).toBe(3); // all items in tree array
    expect(debug.eligibleFileCount).toBe(1); // only a.js passes filters
  });

  it('returns debug.branch matching the branch used for fetching', async () => {
    const fetchFn = makeFetchFn({ tree: [] });
    const { debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'hotfix', fetchFn });
    expect(debug.branch).toBe('hotfix');
  });

  it('does not include access token anywhere in returned debug object', async () => {
    const fetchFn = makeFetchFn({ tree: [] });
    const { debug } = await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    expect(JSON.stringify(debug)).not.toContain(VALID_TOKEN);
  });
});

// ── Token safety ──────────────────────────────────────────────────────────────

describe('fetchRepositoryFiles — token safety', () => {
  it('does not include access token in INVALID_ACCESS_TOKEN error message', async () => {
    let thrown;
    try {
      await fetchRepositoryFiles({ accessToken: '', fullName: VALID_FULLNAME, fetchFn: jest.fn() });
    } catch (e) { thrown = e; }
    expect(thrown.message).not.toContain(VALID_TOKEN);
  });

  it('does not include access token in TREE_FETCH_FAILED error message', async () => {
    const fetchFn = makeFetchFn({ treeOk: false });
    let thrown;
    try {
      await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, branch: 'main', fetchFn });
    } catch (e) { thrown = e; }
    expect(thrown.message).not.toContain(VALID_TOKEN);
  });

  it('does not include access token in REPO_FETCH_FAILED error message', async () => {
    const fetchFn = makeFetchFn({ repoOk: false });
    let thrown;
    try {
      await fetchRepositoryFiles({ accessToken: VALID_TOKEN, fullName: VALID_FULLNAME, fetchFn });
    } catch (e) { thrown = e; }
    expect(thrown.message).not.toContain(VALID_TOKEN);
  });
});
