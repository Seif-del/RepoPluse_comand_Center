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
  var activeSince = options && typeof options.activeSince === 'string' ? options.activeSince : '';
  if (activeSince) {
    params.push('activeSince=' + encodeURIComponent(activeSince));
  }
  return '/api/repos' + (params.length ? '?' + params.join('&') : '');
}

// ── filterToLoadOptions (copied verbatim from dashboard.html) ─────────────────
// The "Healthy" filter button/state has been removed — only All and Needs
// Attention remain, and both are client-side (no server-side riskLevel param).
function filterToLoadOptions(activeFilter) {
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

// ── filterToLoadOptions — Healthy filter control removed ──────────────────────
// The Healthy button/state no longer exists. filterToLoadOptions() has no
// branch for it, so passing 'Healthy' now returns null — identical to any
// other unrecognized filter name.

describe('filterToLoadOptions — Healthy filter control no longer exists', () => {
  test('"Healthy" now returns null (no dedicated branch remains)', () => {
    expect(filterToLoadOptions('Healthy')).toBeNull();
  });
});

// ── filterToLoadOptions — All filter ─────────────────────────────────────────

describe('filterToLoadOptions — All filter', () => {
  test('All returns null (no server-side filter param)', () => {
    expect(filterToLoadOptions('All')).toBeNull();
  });
});

// ── filterToLoadOptions — Needs Attention filter ─────────────────────────────

describe('filterToLoadOptions — Needs Attention filter', () => {
  test('Needs Attention returns null (client-side filter; no server param)', () => {
    expect(filterToLoadOptions('Needs Attention')).toBeNull();
  });
});

// ── filterToLoadOptions + buildReposUrl — end-to-end URL ─────────────────────

describe('filterToLoadOptions + buildReposUrl — end-to-end URL', () => {
  test('All maps to /api/repos', () => {
    expect(buildReposUrl(filterToLoadOptions('All'))).toBe('/api/repos');
  });

  test('Needs Attention maps to /api/repos', () => {
    expect(buildReposUrl(filterToLoadOptions('Needs Attention'))).toBe('/api/repos');
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
  test('All + search produces ?search=myrepo (no riskLevel)', () => {
    var opts = filterToLoadOptions('All') || {};
    opts.search = 'myrepo';
    expect(buildReposUrl(opts)).toBe('/api/repos?search=myrepo');
  });

  test('Needs Attention + search produces ?search=myrepo (no riskLevel, client-side filter)', () => {
    var opts = filterToLoadOptions('Needs Attention') || {};
    opts.search = 'myrepo';
    expect(buildReposUrl(opts)).toBe('/api/repos?search=myrepo');
  });
});

// ── buildReposUrl — activeSince parameter ────────────────────────────────────

describe('buildReposUrl — activeSince parameter', () => {
  test('appends activeSince=7d for { activeSince: "7d" }', () => {
    expect(buildReposUrl({ activeSince: '7d' })).toBe('/api/repos?activeSince=7d');
  });

  test('appends activeSince=30d for { activeSince: "30d" }', () => {
    expect(buildReposUrl({ activeSince: '30d' })).toBe('/api/repos?activeSince=30d');
  });

  test('appends activeSince=90d for { activeSince: "90d" }', () => {
    expect(buildReposUrl({ activeSince: '90d' })).toBe('/api/repos?activeSince=90d');
  });

  test('appends activeSince=stale for { activeSince: "stale" }', () => {
    expect(buildReposUrl({ activeSince: 'stale' })).toBe('/api/repos?activeSince=stale');
  });

  test('omits activeSince param when activeSince is empty string', () => {
    expect(buildReposUrl({ activeSince: '' })).toBe('/api/repos');
  });

  test('orders riskLevel before activeSince in the URL', () => {
    expect(buildReposUrl({ riskLevel: 'healthy', activeSince: '30d' })).toBe(
      '/api/repos?riskLevel=healthy&activeSince=30d'
    );
  });

  test('orders search before activeSince in the URL', () => {
    expect(buildReposUrl({ search: 'myrepo', activeSince: '7d' })).toBe(
      '/api/repos?search=myrepo&activeSince=7d'
    );
  });

  test('orders riskLevel, search, activeSince correctly when all three are present', () => {
    expect(buildReposUrl({ riskLevel: 'healthy', search: 'myrepo', activeSince: '30d' })).toBe(
      '/api/repos?riskLevel=healthy&search=myrepo&activeSince=30d'
    );
  });

  test('URL-encodes activeSince value (stale has no special chars but encoding is applied)', () => {
    expect(buildReposUrl({ activeSince: 'stale' })).toBe('/api/repos?activeSince=stale');
  });
});

// ── filterToLoadOptions + buildReposUrl — filter with activeSince ─────────────

describe('filterToLoadOptions + buildReposUrl — filter with activeSince composition', () => {
  test('Needs Attention + activeSince=stale produces ?activeSince=stale (no riskLevel, client-side filter)', () => {
    var opts = filterToLoadOptions('Needs Attention') || {};
    opts.activeSince = 'stale';
    expect(buildReposUrl(opts)).toBe('/api/repos?activeSince=stale');
  });

  test('All + search + activeSince=7d produces ?search=myrepo&activeSince=7d', () => {
    var opts = filterToLoadOptions('All') || {};
    opts.search = 'myrepo';
    opts.activeSince = '7d';
    expect(buildReposUrl(opts)).toBe('/api/repos?search=myrepo&activeSince=7d');
  });
});
