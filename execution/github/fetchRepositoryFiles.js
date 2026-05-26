'use strict';

// fetchRepositoryFiles
// Fetches all text source files from a GitHub repository using the Git Trees API.
//
// Input:  { accessToken, fullName, branch, fetchFn }
// Output: Array<{ path, content, sizeBytes, language, lastModified: null }>
//
// Safety constraints:
//   - Skips secret file patterns (.env, .pem, .key, credentials, secrets)
//   - Skips unsupported/binary extensions
//   - Caps at 300 files total
//   - Caps per-file content at 200 KB (decoded)
//   - Resilient to individual blob failures (Promise.allSettled)
//   - Never executes code or writes to disk
//   - Never includes access token in returned objects

const GITHUB_API          = 'https://api.github.com';
const MAX_FILES           = 300;
const MAX_FILE_SIZE_BYTES = 200 * 1024;

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

/**
 * Fetches text source files from a GitHub repository.
 *
 * @param {object}   params
 * @param {string}   params.accessToken - Raw GitHub OAuth access token
 * @param {string}   params.fullName    - "owner/repo"
 * @param {string}   [params.branch]   - Branch name (defaults to 'main')
 * @param {Function} params.fetchFn    - Fetch implementation (injected for testability)
 * @returns {Promise<Array<{path, content, sizeBytes, language, lastModified}>>}
 * @throws {Error} code INVALID_ACCESS_TOKEN — accessToken not a non-empty string
 * @throws {Error} code INVALID_ARGUMENT     — fullName not a non-empty string
 * @throws {Error} code INVALID_FETCH_FN     — fetchFn not a function
 * @throws {Error} code TREE_FETCH_FAILED    — GitHub returned non-OK for the git tree
 */
async function fetchRepositoryFiles(params) {
  const accessToken = (params && params.accessToken) || '';
  const fullName    = (params && params.fullName)    || '';
  const fetchFn     = (params && params.fetchFn)     || null;
  const branch      = (params && typeof params.branch === 'string' && params.branch.trim())
    ? params.branch.trim()
    : 'main';

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

  // ── Stage 1: fetch recursive git tree ────────────────────────────────────────
  const treeRes = await fetchFn(
    GITHUB_API + '/repos/' + fullName + '/git/trees/' + branch + '?recursive=1',
    { headers }
  );

  if (!treeRes.ok) {
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
    .slice(0, MAX_FILES);

  // ── Stage 3: fetch content for each file (resilient) ─────────────────────────
  const settlements = await Promise.allSettled(
    eligible.map(async function(item) {
      const contentRes = await fetchFn(
        GITHUB_API + '/repos/' + fullName + '/contents/' + item.path + '?ref=' + branch,
        { headers }
      );
      if (!contentRes.ok) return null;

      const data = await contentRes.json();
      if (!data.content || data.encoding !== 'base64') return null;

      const decoded  = Buffer.from(data.content, 'base64').toString('utf8');
      const sizeBytes = Buffer.byteLength(decoded, 'utf8');
      if (sizeBytes > MAX_FILE_SIZE_BYTES) return null;

      return {
        path:         item.path,
        content:      decoded,
        sizeBytes:    sizeBytes,
        language:     _language(item.path),
        lastModified: null,
      };
    })
  );

  // ── Stage 4: collect fulfilled non-null files ─────────────────────────────────
  return settlements
    .filter(function(r) { return r.status === 'fulfilled' && r.value !== null; })
    .map(function(r) { return r.value; });
}

module.exports = { fetchRepositoryFiles };
