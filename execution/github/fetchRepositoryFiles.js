'use strict';

// fetchRepositoryFiles
// Fetches all text source files from a GitHub repository using the Git Trees API.
//
// Input:  { accessToken, fullName, branch?, fetchFn }
// Output: { files: Array<{ path, content, sizeBytes, language, lastModified }>,
//           debug: { branch, fetchedTreeCount, eligibleFileCount, fetchedFileCount,
//                     skippedFileCount, failedFetchCount, skippedLargeFileCount } }
//
// Branch handling:
//   - If branch is omitted (or blank), fetches /repos/{fullName} to get default_branch.
//   - Falls back to 'main' only when GitHub metadata returns no valid branch name.
//
// Safety constraints:
//   - Skips secret file patterns (.env, .pem, .key, credentials, secrets)
//   - Skips unsupported/binary extensions
//   - Caps at 300 files total
//   - Caps per-file content at 400 KB (decoded)
//   - Fetches blob content with throttled concurrency (not unbounded parallel)
//     to avoid triggering GitHub secondary rate limiting on larger repos
//   - Resilient to individual blob failures (Promise.allSettled semantics)
//   - Never executes code or writes to disk
//   - Never includes access token in returned objects or thrown errors

const GITHUB_API          = 'https://api.github.com';
const MAX_FILES           = 300;
const MAX_FILE_SIZE_BYTES = 400 * 1024;
const CONCURRENCY_LIMIT   = 8;
const MAX_BLOB_WARNINGS   = 10;

const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.json', '.html', '.css', '.scss', '.md',
  '.yml', '.yaml', '.sql',
]);

const SECRET_PATTERNS = [
  /\.env(\.|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /credentials/i,
  /secrets/i,
];

const LANGUAGE_MAP = {
  '.js':   'javascript',
  '.jsx':  'javascript',
  '.ts':   'typescript',
  '.tsx':  'typescript',
  '.mjs':  'javascript',
  '.cjs':  'javascript',
  '.json': 'json',
  '.html': 'html',
  '.css':  'css',
  '.scss': 'css',
  '.md':   'markdown',
  '.yml':  'yaml',
  '.yaml': 'yaml',
  '.sql':  'sql',
};

function _ext(filePath) {
  const dot = filePath.lastIndexOf('.');
  return dot >= 0 ? filePath.slice(dot).toLowerCase() : '';
}

function _isSupported(filePath) {
  return SUPPORTED_EXTENSIONS.has(_ext(filePath));
}

function _isSecret(filePath) {
  return SECRET_PATTERNS.some(function(re) { return re.test(filePath); });
}

// Test-file patterns — matches paths that belong to unit/integration test suites.
// These files contain fixture source-code strings that the architecture extractor
// would otherwise scan as real frontend calls, producing false unresolved findings.
const TEST_FILE_PATTERNS = [
  /^(?:tests?|__tests__)\//,   // starts with tests/, test/, or __tests__/
  /\/__tests__\//,             // /__tests__/ anywhere in path
  /\.(?:test|spec)\.[jt]sx?$/, // *.test.js/jsx/ts/tsx  *.spec.js/jsx/ts/tsx
];

function _isTestFile(filePath) {
  return TEST_FILE_PATTERNS.some(function(re) { return re.test(filePath); });
}

function _language(filePath) {
  return LANGUAGE_MAP[_ext(filePath)] || null;
}

function _githubHeaders(accessToken) {
  return {
    Authorization:          'Bearer ' + accessToken,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// Runs `worker` over `items` with at most `limit` in flight at once.
// Returns an array of Promise.allSettled-shaped results, aligned by index
// with `items`, so callers can keep treating outcomes the same way.
async function _runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runOne() {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      try {
        results[currentIndex] = { status: 'fulfilled', value: await worker(items[currentIndex]) };
      } catch (err) {
        results[currentIndex] = { status: 'rejected', reason: err };
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  const runners = [];
  for (let i = 0; i < workerCount; i++) {
    runners.push(runOne());
  }
  await Promise.all(runners);
  return results;
}

/**
 * Fetches text source files from a GitHub repository.
 *
 * @param {object}   params
 * @param {string}   params.accessToken - Raw GitHub OAuth access token
 * @param {string}   params.fullName    - "owner/repo"
 * @param {string}   [params.branch]   - Branch name; if omitted, auto-detected via repo metadata
 * @param {Function} params.fetchFn    - Fetch implementation (injected for testability)
 * @returns {Promise<{
 *   files: Array<{path, content, sizeBytes, language, lastModified}>,
 *   debug: { branch: string, fetchedTreeCount: number, eligibleFileCount: number,
 *            fetchedFileCount: number, skippedFileCount: number,
 *            failedFetchCount: number, skippedLargeFileCount: number }
 * }>}
 * @throws {Error} code INVALID_ACCESS_TOKEN — accessToken not a non-empty string
 * @throws {Error} code INVALID_ARGUMENT     — fullName not a non-empty string
 * @throws {Error} code INVALID_FETCH_FN     — fetchFn not a function
 * @throws {Error} code REPO_FETCH_FAILED    — GitHub returned non-OK for repo metadata (branch auto-detect)
 * @throws {Error} code TREE_FETCH_FAILED    — GitHub returned non-OK for the git tree
 */
async function fetchRepositoryFiles(params) {
  const accessToken = (params && params.accessToken) || '';
  const fullName    = (params && params.fullName)    || '';
  const fetchFn     = (params && params.fetchFn)     || null;
  const branchParam = (params && typeof params.branch === 'string' && params.branch.trim())
    ? params.branch.trim()
    : null;

  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    const err = new Error('accessToken must be a non-empty string');
    err.code = 'INVALID_ACCESS_TOKEN';
    throw err;
  }
  if (typeof fullName !== 'string' || !fullName.trim()) {
    const err = new Error('fullName must be a non-empty string');
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }
  if (typeof fetchFn !== 'function') {
    const err = new Error('fetchFn must be a function');
    err.code = 'INVALID_FETCH_FN';
    throw err;
  }

  const headers = _githubHeaders(accessToken);

  // ── Stage 0: resolve branch ───────────────────────────────────────────────────
  let branch = branchParam;
  if (!branch) {
    const repoRes = await fetchFn(GITHUB_API + '/repos/' + fullName, { headers });
    if (!repoRes.ok) {
      let ghMessage;
      try { const body = await repoRes.json(); if (typeof body.message === 'string') ghMessage = body.message; } catch (_) {}
      const logEntry = { repo: fullName, status: repoRes.status };
      if (ghMessage) logEntry.message = ghMessage;
      console.warn('[architecture] github metadata fetch failed', logEntry);
      const err = new Error('Failed to fetch repository metadata for ' + fullName);
      err.code   = 'REPO_FETCH_FAILED';
      err.status = repoRes.status;
      throw err;
    }
    const repoMeta = await repoRes.json();
    branch = (typeof repoMeta.default_branch === 'string' && repoMeta.default_branch.trim())
      ? repoMeta.default_branch.trim()
      : 'main';
  }

  // ── Stage 1: fetch recursive git tree ────────────────────────────────────────
  const treeRes = await fetchFn(
    GITHUB_API + '/repos/' + fullName + '/git/trees/' + branch + '?recursive=1',
    { headers }
  );

  if (!treeRes.ok) {
    let ghMessage;
    try { const body = await treeRes.json(); if (typeof body.message === 'string') ghMessage = body.message; } catch (_) {}
    const logEntry = { repo: fullName, branch, status: treeRes.status };
    if (ghMessage) logEntry.message = ghMessage;
    console.warn('[architecture] github tree fetch failed', logEntry);
    const err = new Error('Failed to fetch git tree for ' + fullName + '@' + branch);
    err.code   = 'TREE_FETCH_FAILED';
    err.status = treeRes.status;
    throw err;
  }

  const treeData = await treeRes.json();
  const tree     = Array.isArray(treeData.tree) ? treeData.tree : [];

  // ── Stage 2: filter to eligible blobs ────────────────────────────────────────
  const eligible = tree
    .filter(function(item) { return item.type === 'blob'; })
    .filter(function(item) { return _isSupported(item.path); })
    .filter(function(item) { return !_isSecret(item.path); })
    .filter(function(item) { return !_isTestFile(item.path); })
    .slice(0, MAX_FILES);

  // ── Stage 3: fetch content for each file (throttled, resilient) ──────────────
  // Bounded to CONCURRENCY_LIMIT in-flight requests at a time instead of firing
  // all eligible blob requests in parallel, to avoid GitHub secondary rate
  // limiting silently dropping a large fraction of the file sample.
  const settlements = await _runWithConcurrency(eligible, CONCURRENCY_LIMIT, async function(item) {
    const contentRes = await fetchFn(
      GITHUB_API + '/repos/' + fullName + '/contents/' + item.path + '?ref=' + branch,
      { headers }
    );
    if (!contentRes.ok) {
      return { outcome: 'failed', path: item.path, status: contentRes.status };
    }

    const data = await contentRes.json();
    if (!data.content || data.encoding !== 'base64') {
      return { outcome: 'failed', path: item.path, status: contentRes.status };
    }

    const decoded   = Buffer.from(data.content, 'base64').toString('utf8');
    const sizeBytes = Buffer.byteLength(decoded, 'utf8');
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      return { outcome: 'large', path: item.path };
    }

    return {
      outcome: 'ok',
      file: {
        path:         item.path,
        content:      decoded,
        sizeBytes:    sizeBytes,
        language:     _language(item.path),
        lastModified: null,
      },
    };
  });

  // ── Stage 4: collect outcomes, split failures vs. oversized skips ────────────
  const files               = [];
  const failedBlobWarnings  = [];
  let   failedFetchCount    = 0;
  let   skippedLargeFileCount = 0;

  settlements.forEach(function(r, idx) {
    if (r.status === 'rejected') {
      failedFetchCount++;
      failedBlobWarnings.push({ path: eligible[idx].path, status: null, message: r.reason && r.reason.message });
      return;
    }
    const outcome = r.value;
    if (outcome.outcome === 'ok') {
      files.push(outcome.file);
    } else if (outcome.outcome === 'large') {
      skippedLargeFileCount++;
    } else {
      failedFetchCount++;
      failedBlobWarnings.push({ path: outcome.path, status: outcome.status });
    }
  });

  // Cap individual per-file warnings so a large-scale rate-limit event doesn't
  // flood logs; emit one summary warning for whatever wasn't logged individually.
  failedBlobWarnings.slice(0, MAX_BLOB_WARNINGS).forEach(function(w) {
    const logEntry = { repo: fullName, branch, path: w.path, status: w.status };
    if (w.message) logEntry.message = w.message;
    console.warn('[architecture] github blob fetch failed', logEntry);
  });
  if (failedBlobWarnings.length > MAX_BLOB_WARNINGS) {
    console.warn('[architecture] github blob fetch failures summary', {
      repo:                        fullName,
      branch,
      failedFetchCount:            failedBlobWarnings.length,
      additionalFailuresNotLogged: failedBlobWarnings.length - MAX_BLOB_WARNINGS,
    });
  }

  return {
    files,
    debug: {
      branch,
      fetchedTreeCount:      tree.length,
      eligibleFileCount:     eligible.length,
      fetchedFileCount:      files.length,
      skippedFileCount:      failedFetchCount + skippedLargeFileCount,
      failedFetchCount:      failedFetchCount,
      skippedLargeFileCount: skippedLargeFileCount,
    },
  };
}

module.exports = { fetchRepositoryFiles };
