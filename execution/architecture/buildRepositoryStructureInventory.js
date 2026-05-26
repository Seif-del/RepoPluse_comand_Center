'use strict';

// Repository Structure Inventory
// Answers: "What does this repository contain and how is it structured?"
//
// Input:  { files: [{ path, sizeBytes, language, lastModified }] }
// Output: totalFiles, languages, directories, categories, architectureHints,
//         testCoverageHints, frameworkHints, riskHints
//
// Pure function — no I/O, no mutation of input.

// ── Category classifiers (priority-ordered) ────────────────────────────────────
// Each entry: { name, test(normalizedPath) }
// First match wins.

var CATEGORY_RULES = [
  // tests: must come before backend/frontend to prevent .test.js leaking elsewhere
  {
    name: 'tests',
    test: function(p) {
      return /\.(test|spec)\.[jt]sx?$/.test(p) ||
             /^__tests__\//.test(p) ||
             /\/__tests__\//.test(p) ||
             /^tests\//.test(p) ||
             /\/tests\//.test(p);
    },
  },
  // migrations
  {
    name: 'migrations',
    test: function(p) {
      return /^migrations\//.test(p) ||
             /\/migrations\//.test(p) ||
             /^db\/migrations\//.test(p) ||
             /\/db\/migrations\//.test(p) ||
             /\.sql$/.test(p);
    },
  },
  // docs
  {
    name: 'docs',
    test: function(p) {
      return /\.(md|mdx)$/.test(p) ||
             /^docs\//.test(p) ||
             /\/docs\//.test(p) ||
             /^README/i.test(p);
    },
  },
  // config
  {
    name: 'config',
    test: function(p) {
      return /\.config\.[jt]sx?$/.test(p) ||
             /(^|\/)\.env(\.|$)/.test(p) ||
             /^\.env$/.test(p) ||
             /\.(json|yaml|yml)$/.test(p);
    },
  },
  // scripts
  {
    name: 'scripts',
    test: function(p) {
      return /^scripts\//.test(p) ||
             /\/scripts\//.test(p) ||
             /^bin\//.test(p) ||
             /\/bin\//.test(p) ||
             /^Makefile$/.test(p) ||
             /\.sh$/.test(p);
    },
  },
  // styles
  {
    name: 'styles',
    test: function(p) {
      return /\.(css|scss|sass)$/.test(p) ||
             /^styles\//.test(p) ||
             /\/styles\//.test(p);
    },
  },
  // assets
  {
    name: 'assets',
    test: function(p) {
      return /\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)$/.test(p) ||
             /^images\//.test(p) ||
             /\/images\//.test(p) ||
             /^fonts\//.test(p) ||
             /\/fonts\//.test(p) ||
             /^static\//.test(p) ||
             /\/static\//.test(p) ||
             /^assets\//.test(p) ||
             /\/assets\//.test(p);
    },
  },
  // apiClients (before services, since services/api/ is more specific)
  {
    name: 'apiClients',
    test: function(p) {
      return /^clients\//.test(p) ||
             /\/clients\//.test(p) ||
             /^services\/api\//.test(p) ||
             /\/services\/api\//.test(p);
    },
  },
  // routes
  {
    name: 'routes',
    test: function(p) {
      return /^routes\//.test(p) ||
             /\/routes\//.test(p) ||
             /^router\//.test(p) ||
             /\/router\//.test(p);
    },
  },
  // services
  {
    name: 'services',
    test: function(p) {
      return /^services\//.test(p) ||
             /\/services\//.test(p);
    },
  },
  // models
  {
    name: 'models',
    test: function(p) {
      return /^models\//.test(p) ||
             /\/models\//.test(p) ||
             /^schemas\//.test(p) ||
             /\/schemas\//.test(p) ||
             /^entities\//.test(p) ||
             /\/entities\//.test(p);
    },
  },
  // components (top-level ^components/ only; must come before frontend so
  // components/Button.jsx isn't swallowed by the .jsx extension rule)
  {
    name: 'components',
    test: function(p) {
      return /^components\//.test(p);
    },
  },
  // frontend (src/components/ is listed here; top-level components/ is caught above)
  {
    name: 'frontend',
    test: function(p) {
      return /\.[jt]sx$/.test(p) ||
             /^frontend\//.test(p) ||
             /\/frontend\//.test(p) ||
             /^client\//.test(p) ||
             /\/client\//.test(p) ||
             /^public\//.test(p) ||
             /\/public\//.test(p) ||
             /^src\/components\//.test(p) ||
             /^src\/pages\//.test(p) ||
             /^src\/views\//.test(p);
    },
  },
  // backend
  {
    name: 'backend',
    test: function(p) {
      return /^server\//.test(p) ||
             /\/server\//.test(p) ||
             /^api\//.test(p) ||
             /\/api\//.test(p) ||
             /^controllers\//.test(p) ||
             /\/controllers\//.test(p) ||
             /^server\.[jt]sx?$/.test(p) ||
             /^app\.[jt]sx?$/.test(p);
    },
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function _normalize(path) {
  return (path || '').replace(/\\/g, '/');
}

function _classify(normalizedPath) {
  for (var i = 0; i < CATEGORY_RULES.length; i++) {
    if (CATEGORY_RULES[i].test(normalizedPath)) return CATEGORY_RULES[i].name;
  }
  return 'unknown';
}

function _dirname(normalizedPath) {
  var idx = normalizedPath.lastIndexOf('/');
  return idx > 0 ? normalizedPath.slice(0, idx) : null;
}

function _allAncestors(normalizedPath) {
  var parts = [];
  var current = _dirname(normalizedPath);
  while (current) {
    parts.push(current);
    current = _dirname(current);
  }
  return parts;
}

// ── Framework hint detectors ───────────────────────────────────────────────────

function _detectFrameworks(paths) {
  var hasJsx       = paths.some(function(p) { return /\.[jt]sx$/.test(p); });
  var hasNextCfg   = paths.some(function(p) { return /^next\.config\.[jt]sx?$/.test(p); });
  var hasPages     = paths.some(function(p) { return /^pages\//.test(p) || /\/pages\//.test(p); });
  var hasAppDir    = paths.some(function(p) { return /^app\//.test(p) || /\/app\//.test(p); });
  var hasServerJs  = paths.some(function(p) { return /^(server|app)\.[jt]sx?$/.test(p); });
  var hasPkgJson   = paths.some(function(p) { return /^package\.json$/.test(p); });
  var hasJestCfg   = paths.some(function(p) { return /^jest\.config\.[jt]sx?$/.test(p); });
  var hasTestFile  = paths.some(function(p) { return /\.(test|spec)\.[jt]sx?$/.test(p); });
  var hasMigSql    = paths.some(function(p) {
    return (/^migrations\//.test(p) || /\/migrations\//.test(p) || /^db\/migrations\//.test(p) || /\/db\/migrations\//.test(p)) &&
           /\.sql$/.test(p);
  });
  var hasViteCfg   = paths.some(function(p) { return /^vite\.config\.[jt]sx?$/.test(p); });
  var hasTailwind  = paths.some(function(p) { return /^tailwind\.config\.[jt]sx?$/.test(p); });

  return {
    react:                hasJsx,
    nextjs:               hasNextCfg || hasPages || hasAppDir,
    express:              hasServerJs,
    nodejs:               hasPkgJson,
    jest:                 hasJestCfg || hasTestFile,
    postgresqlMigrations: hasMigSql,
    vite:                 hasViteCfg,
    tailwind:             hasTailwind,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Summarize the structure of a repository from its file listing.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ files: Array }} [params]
 * @returns {{
 *   totalFiles:          number,
 *   languages:           object,
 *   directories:         string[],
 *   categories:          object,
 *   architectureHints:   object,
 *   testCoverageHints:   object,
 *   frameworkHints:      object,
 *   riskHints:           string[],
 * }}
 */
function buildRepositoryStructureInventory(params) {
  var files = (params && Array.isArray(params.files)) ? params.files : [];

  // -- Normalize paths (no mutation) --
  var normalized = files.map(function(f) {
    return { raw: f, path: _normalize(f.path), language: f.language || null };
  });

  // -- Total files --
  var totalFiles = normalized.length;

  // -- Languages --
  var languages = {};
  normalized.forEach(function(f) {
    var lang = f.language || 'unknown';
    languages[lang] = (languages[lang] || 0) + 1;
  });

  // -- Categories --
  var categories = {
    frontend: [], backend: [], tests: [], config: [], docs: [],
    migrations: [], scripts: [], routes: [], services: [], models: [],
    components: [], apiClients: [], styles: [], assets: [], unknown: [],
  };
  normalized.forEach(function(f) {
    var cat = _classify(f.path);
    categories[cat].push(f.path);
  });

  // -- Directories (unique, sorted, no empty string) --
  var dirSet = new Set();
  normalized.forEach(function(f) {
    _allAncestors(f.path).forEach(function(d) { dirSet.add(d); });
  });
  var directories = Array.from(dirSet).sort();

  // -- Framework hints --
  var paths = normalized.map(function(f) { return f.path; });
  var frameworkHints = _detectFrameworks(paths);

  // -- Architecture hints --
  var hasFrontend      = categories.frontend.length > 0 || categories.components.length > 0 || categories.styles.length > 0;
  var hasBackend       = categories.backend.length > 0 || categories.routes.length > 0 || categories.services.length > 0 || categories.models.length > 0;
  var hasTests         = categories.tests.length > 0;
  var hasMigrations    = categories.migrations.length > 0;
  var hasApiLayer      = categories.routes.length > 0 || categories.apiClients.length > 0;
  var hasServiceLayer  = categories.services.length > 0;
  var hasModelLayer    = categories.models.length > 0;
  var hasComponentLayer = categories.components.length > 0;

  var architectureHints = {
    hasFrontend:      hasFrontend,
    hasBackend:       hasBackend,
    hasTests:         hasTests,
    hasMigrations:    hasMigrations,
    hasApiLayer:      hasApiLayer,
    hasServiceLayer:  hasServiceLayer,
    hasModelLayer:    hasModelLayer,
    hasComponentLayer: hasComponentLayer,
    likelyFullStackApp: hasFrontend && hasBackend,
  };

  // -- Test coverage hints --
  var testFileCount   = categories.tests.length;
  var sourceFileCount = categories.backend.length + categories.frontend.length +
                        categories.routes.length + categories.services.length +
                        categories.models.length;
  var testToSourceRatio = sourceFileCount === 0 ? null : testFileCount / sourceFileCount;

  var hasUnitTests = normalized.some(function(f) {
    return /\.(test|spec)\.[jt]sx?$/.test(f.path) && !/\/integration\//.test(f.path);
  });
  var hasIntegrationTests = normalized.some(function(f) {
    return /\/integration\//.test(f.path) && /\.(test|spec)\.[jt]sx?$/.test(f.path);
  });

  var testCoverageHints = {
    testFileCount:        testFileCount,
    sourceFileCount:      sourceFileCount,
    testToSourceRatio:    testToSourceRatio,
    hasUnitTests:         hasUnitTests,
    hasIntegrationTests:  hasIntegrationTests,
  };

  // -- Risk hints (sorted for determinism) --
  var riskHints = [];
  if (totalFiles > 0) {
    var unknownFraction = totalFiles > 0 ? categories.unknown.length / totalFiles : 0;
    if (testFileCount === 0 && sourceFileCount > 0)            riskHints.push('no_tests_detected');
    if (hasFrontend && !hasBackend)                            riskHints.push('frontend_without_backend');
    if (hasBackend && testFileCount === 0)                     riskHints.push('backend_without_tests');
    if (hasApiLayer && !hasServiceLayer)                       riskHints.push('routes_without_services');
    if (hasServiceLayer && testFileCount === 0)                riskHints.push('services_without_tests');
    if (unknownFraction > 0.2)                                 riskHints.push('large_unclassified_surface');
  }
  riskHints.sort();

  return {
    totalFiles,
    languages,
    directories,
    categories,
    architectureHints,
    testCoverageHints,
    frameworkHints,
    riskHints,
  };
}

module.exports = { buildRepositoryStructureInventory };
