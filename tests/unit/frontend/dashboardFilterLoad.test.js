'use strict';

// Pure-logic unit tests for the FR-009 server-side filter URL helpers.
// Both functions are embedded in frontend/dashboard.html but have no DOM
// dependency — they are copied verbatim here so Jest (node env) can run
// them without a browser or jsdom.
//
// buildReposUrl        — builds the fetch URL, appending ?riskLevel= when needed
// filterToLoadOptions  — maps the active filter name to loadRepos() options

// ── buildReposUrl (copied verbatim from dashboard.html) ──────────────────────
function buildReposUrl(options) {
  var params = [];
  if (options && options.riskLevel) {
    params.push('riskLevel=' + encodeURIComponent(options.riskLevel));
  }
  var search = options && typeof options.search === 'string' ? options.search.trim() : '';
  if (search) {
    params.push('search=' + encodeURIComponent(search));
  }
  return '/api/repos' + (params.length ? '?' + params.join('&') : '');
}

// ── filterToLoadOptions (copied verbatim from dashboard.html) ─────────────────
function filterToLoadOptions(activeFilter) {
  if (activeFilter === 'Healthy') return { riskLevel: 'healthy' };
  return null;
}

// ── buildReposUrl — URL construction ─────────────────────────────────────────

describe('buildReposUrl — URL construction', () => {
  test('returns base URL when options is absent', () => {
    expect(buildReposUrl()).toBe('/api/repos');
  });

  test('returns base URL when options is null', () => {
    expect(buildReposUrl(null)).toBe('/api/repos');
  });

  test('returns base URL when options is empty object', () => {
    expect(buildReposUrl({})).toBe('/api/repos');
  });

  test('appends riskLevel=healthy for { riskLevel: "healthy" }', () => {
    expect(buildReposUrl({ riskLevel: 'healthy' })).toBe('/api/repos?riskLevel=healthy');
  });

  test('appends riskLevel=at-risk for { riskLevel: "at-risk" }', () => {
    expect(buildReposUrl({ riskLevel: 'at-risk' })).toBe('/api/repos?riskLevel=at-risk');
  });

  test('appends riskLevel=critical for { riskLevel: "critical" }', () => {
    expect(buildReposUrl({ riskLevel: 'critical' })).toBe('/api/repos?riskLevel=critical');
  });
});

// ── filterToLoadOptions — Healthy filter ──────────────────────────────────────

describe('filterToLoadOptions — Healthy filter', () => {
  test('Healthy returns { riskLevel: "healthy" }', () => {
    expect(filterToLoadOptions('Healthy')).toEqual({ riskLevel: 'healthy' });
  });

  test('Healthy result has exactly the riskLevel property', () => {
    expect(Object.keys(filterToLoadOptions('Healthy'))).toEqual(['riskLevel']);
  });

  test('Healthy result riskLevel value is the lowercase DB label', () => {
    expect(filterToLoadOptions('Healthy').riskLevel).toBe('healthy');
  });
});

// ── filterToLoadOptions — All filter ─────────────────────────────────────────

describe('filterToLoadOptions — All filter', () => {
  test('All returns null (no server-side filter param)', () => {
    expect(filterToLoadOptions('All')).toBeNull();
  });
});

// ── filterToLoadOptions — At Risk filter ─────────────────────────────────────

describe('filterToLoadOptions — At Risk filter', () => {
  test('At Risk returns null (client-side filter; no server param)', () => {
    expect(filterToLoadOptions('At Risk')).toBeNull();
  });
});

// ── filterToLoadOptions + buildReposUrl — end-to-end URL ─────────────────────

describe('filterToLoadOptions + buildReposUrl — end-to-end URL', () => {
  test('Healthy maps to /api/repos?riskLevel=healthy', () => {
    expect(buildReposUrl(filterToLoadOptions('Healthy'))).toBe('/api/repos?riskLevel=healthy');
  });

  test('All maps to /api/repos', () => {
    expect(buildReposUrl(filterToLoadOptions('All'))).toBe('/api/repos');
  });

  test('At Risk maps to /api/repos', () => {
    expect(buildReposUrl(filterToLoadOptions('At Risk'))).toBe('/api/repos');
  });
});

// ── buildReposUrl — search parameter ─────────────────────────────────────────

describe('buildReposUrl — search parameter', () => {
  test('appends search=myrepo for { search: "myrepo" }', () => {
    expect(buildReposUrl({ search: 'myrepo' })).toBe('/api/repos?search=myrepo');
  });

  test('trims leading and trailing whitespace from search value', () => {
    expect(buildReposUrl({ search: ' myrepo ' })).toBe('/api/repos?search=myrepo');
  });

  test('omits search param when search is empty string', () => {
    expect(buildReposUrl({ search: '' })).toBe('/api/repos');
  });

  test('omits search param when search is whitespace only', () => {
    expect(buildReposUrl({ search: '   ' })).toBe('/api/repos');
  });

  test('URL-encodes a search value containing a space', () => {
    expect(buildReposUrl({ search: 'my repo' })).toBe('/api/repos?search=my%20repo');
  });

  test('appends riskLevel before search when both are present', () => {
    expect(buildReposUrl({ riskLevel: 'healthy', search: 'myrepo' })).toBe(
      '/api/repos?riskLevel=healthy&search=myrepo'
    );
  });

  test('URL-encodes at-risk in riskLevel and encodes search', () => {
    expect(buildReposUrl({ riskLevel: 'at-risk', search: 'my repo' })).toBe(
      '/api/repos?riskLevel=at-risk&search=my%20repo'
    );
  });
});

// ── filterToLoadOptions + buildReposUrl — filter with search ─────────────────

describe('filterToLoadOptions + buildReposUrl — filter with search composition', () => {
  test('Healthy + search produces ?riskLevel=healthy&search=myrepo', () => {
    var opts = filterToLoadOptions('Healthy') || {};
    opts.search = 'myrepo';
    expect(buildReposUrl(opts)).toBe('/api/repos?riskLevel=healthy&search=myrepo');
  });

  test('All + search produces ?search=myrepo (no riskLevel)', () => {
    var opts = filterToLoadOptions('All') || {};
    opts.search = 'myrepo';
    expect(buildReposUrl(opts)).toBe('/api/repos?search=myrepo');
  });

  test('At Risk + search produces ?search=myrepo (no riskLevel, client-side filter)', () => {
    var opts = filterToLoadOptions('At Risk') || {};
    opts.search = 'myrepo';
    expect(buildReposUrl(opts)).toBe('/api/repos?search=myrepo');
  });
});
