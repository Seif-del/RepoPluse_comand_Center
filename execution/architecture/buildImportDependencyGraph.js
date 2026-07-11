'use strict';

// Import/Dependency Graph Builder
// Answers: "How are files in this repository connected via imports?"
//
// Input:  { files: [{ path, content, language }] }
// Output: nodes, edges, unresolvedImports, circularDependencies,
//         boundaryHints, couplingMetrics, summary
//
// Pure function — no I/O, no mutation of input.

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'];

const HIGH_FAN_THRESHOLD = 5;

// Documentation content (README/CHANGELOG/ADR prose, code samples inside
// PROGRESS.md/CLAUDE.md, etc.) is not executable source. Code fences inside
// Markdown routinely contain require()/import snippets as *examples*, which
// this extractor would otherwise parse as real edges/unresolved imports.
const DOC_EXTENSIONS  = new Set(['.md', '.mdx']);
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

// ── Path utilities ────────────────────────────────────────────────────────────

function _norm(p) {
  return (p || '').replace(/\\/g, '/');
}

function _dirname(p) {
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '';
}

function _joinPath(dir, rel) {
  if (!dir) return _cleanPath(rel);
  return _cleanPath(dir + '/' + rel);
}

function _cleanPath(p) {
  const parts = p.split('/');
  const stack = [];
  for (const part of parts) {
    if (part === '..') {
      if (stack.length > 0) stack.pop();
    } else if (part !== '.') {
      if (part !== '') stack.push(part);
    }
  }
  return stack.join('/');
}

// ── Comment stripping ─────────────────────────────────────────────────────────
// Removes line comments (// ...) and block comments (/* ... */) from source.
// This avoids false-positive import detection from commented-out code.

function _stripComments(source) {
  // Replace block comments with whitespace (preserve line count)
  let s = source.replace(/\/\*[\s\S]*?\*\//g, function(m) {
    return m.replace(/[^\n]/g, ' ');
  });
  // Replace line comments
  s = s.replace(/\/\/[^\n]*/g, '');
  return s;
}

// ── Import extraction ─────────────────────────────────────────────────────────

const IMPORT_PATTERNS = [
  // static: import x from '...'  /  import '...'  /  import { x } from '...'
  {
    type: 'static',
    re: /\bimport\s+(?:[\w*{][^;'"]*?from\s+)?['"]([^'"]+)['"]/g,
  },
  // export-from: export { x } from '...'  /  export * from '...'
  {
    type: 'export',
    re: /\bexport\s+(?:[\w*{][^;'"]*?from\s+|\*\s+from\s+)['"]([^'"]+)['"]/g,
  },
  // dynamic: import('...')
  {
    type: 'dynamic',
    re: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  },
  // require: require('...')
  {
    type: 'require',
    re: /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  },
];

function _extractImports(source) {
  const stripped = _stripComments(source);
  const results = [];
  const seen = new Set();

  for (const { type, re } of IMPORT_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(stripped)) !== null) {
      const importPath = m[1];
      const key = type + ':' + importPath;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ importPath, importType: type });
      }
    }
  }

  return results;
}

// ── Import path classification ────────────────────────────────────────────────

function _isRelative(importPath) {
  return importPath.startsWith('./') || importPath.startsWith('../');
}

function _isExternal(importPath) {
  return !_isRelative(importPath) && !importPath.startsWith('/');
}

// ── Resolution ────────────────────────────────────────────────────────────────

function _resolve(fromPath, importPath, fileSet) {
  const dir = _dirname(fromPath);
  const base = _joinPath(dir, importPath);

  // Exact match — covers imports with any extension (e.g. './styles.css', './data.json')
  if (fileSet.has(base)) return base;

  // Extensionless: try adding each supported extension
  for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = base + ext;
    if (fileSet.has(candidate)) return candidate;
  }

  // Directory index resolution
  for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = base + '/index' + ext;
    if (fileSet.has(candidate)) return candidate;
  }

  return null;
}

// ── Category classification ───────────────────────────────────────────────────

function _category(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path) || /\/__tests__\//.test(path) || /^tests\//.test(path) || /\/tests\//.test(path)) return 'test';
  if (/^migrations\//.test(path) || /\/migrations\//.test(path) || /\.sql$/.test(path)) return 'migrations';
  if (/^routes\//.test(path) || /\/routes\//.test(path) || /^router\//.test(path)) return 'routes';
  if (/^services\/api\//.test(path) || /\/services\/api\//.test(path) || /^clients\//.test(path)) return 'apiClients';
  if (/^services\//.test(path) || /\/services\//.test(path)) return 'services';
  if (/^models\//.test(path) || /\/models\//.test(path) || /^schemas\//.test(path) || /^entities\//.test(path)) return 'models';
  if (/^components\//.test(path)) return 'components';
  if (/\.[jt]sx$/.test(path) || /^src\/components\//.test(path) || /^src\/pages\//.test(path) || /^frontend\//.test(path) || /^client\//.test(path)) return 'frontend';
  if (/^server\//.test(path) || /^api\//.test(path) || /^controllers\//.test(path) || /^server\.[jt]sx?$/.test(path) || /^app\.[jt]sx?$/.test(path)) return 'backend';
  if (/\.(config|env)\.[jt]sx?$/.test(path) || /^\.env$/.test(path) || /\.(json|yaml|yml)$/.test(path)) return 'config';
  if (/\.(md|mdx)$/.test(path) || /^docs\//.test(path)) return 'docs';
  if (/^scripts\//.test(path) || /^bin\//.test(path) || /\.sh$/.test(path)) return 'scripts';
  if (/\.(css|scss|sass)$/.test(path) || /^styles\//.test(path)) return 'styles';
  if (/\.(png|jpg|jpeg|svg|ico|gif)$/.test(path) || /^images\//.test(path) || /^assets\//.test(path)) return 'assets';
  return 'unknown';
}

// ── Documentation exclusion ───────────────────────────────────────────────────
// A file is treated as documentation — excluded from import extraction — when
// it has a Markdown extension (.md/.mdx), or when the repository's own
// category classification already labels it 'docs' (e.g. any non-code file
// under a docs/ folder) per the existing `_category` conventions above. Real
// source-code extensions (CODE_EXTENSIONS) are never excluded this way, even
// if such a file happens to live under a docs/ folder, so import extraction
// for actual .js/.jsx/.ts/.tsx/.mjs/.cjs files is always preserved.

function _extname(path) {
  const idx = path.lastIndexOf('.');
  return idx === -1 ? '' : path.slice(idx).toLowerCase();
}

function _isDocumentationFile(path, category) {
  const ext = _extname(path);
  if (DOC_EXTENSIONS.has(ext)) return true;
  return category === 'docs' && !CODE_EXTENSIONS.has(ext);
}

// ── Circular dependency detection (DFS) ───────────────────────────────────────

function _findCycles(adjacency) {
  const cycles = [];
  const visited = new Set();
  const stack = new Set();

  function dfs(node, path) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat([node]);
      cycles.push({ cycle, length: cycle.length - 1 });
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    path.push(node);

    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, path);
    }

    path.pop();
    stack.delete(node);
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  // Deduplicate cycles by their canonical form (smallest-start rotation)
  const seen = new Set();
  return cycles.filter(function(c) {
    const key = [...c.cycle].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Boundary hint detection ───────────────────────────────────────────────────

const BOUNDARY_CHECKS = [
  {
    type: 'frontend_imports_backend',
    severity: 'high',
    fromCats: new Set(['frontend', 'components']),
    toCats:   new Set(['backend']),
    summary:  'Frontend code imports directly from backend modules — coupling UI to server logic.',
  },
  {
    type: 'backend_imports_frontend',
    severity: 'high',
    fromCats: new Set(['backend']),
    toCats:   new Set(['frontend', 'components']),
    summary:  'Backend code imports from frontend modules — unexpected reverse dependency.',
  },
  {
    type: 'model_imports_route',
    severity: 'medium',
    fromCats: new Set(['models']),
    toCats:   new Set(['routes']),
    summary:  'Model imports from route layer — models should not depend on routing logic.',
  },
  {
    type: 'service_imports_route',
    severity: 'medium',
    fromCats: new Set(['services', 'apiClients']),
    toCats:   new Set(['routes']),
    summary:  'Service imports from route layer — services should not depend on routing logic.',
  },
  {
    type: 'route_imports_component',
    severity: 'low',
    fromCats: new Set(['routes']),
    toCats:   new Set(['components', 'frontend']),
    summary:  'Route handler imports UI components — route layer should not import rendering code.',
  },
  {
    type: 'config_imported_by_runtime',
    severity: 'low',
    fromCats: new Set(['backend', 'services', 'routes']),
    toCats:   new Set(['config']),
    summary:  'Runtime code imports config files directly — consider injecting config via environment.',
  },
];

function _buildBoundaryHints(edges, catMap) {
  const hintMap = new Map(); // type → set of files

  for (const e of edges) {
    const fromCat = catMap.get(e.from) || 'unknown';
    const toCat   = catMap.get(e.to)   || 'unknown';

    for (const check of BOUNDARY_CHECKS) {
      if (check.fromCats.has(fromCat) && check.toCats.has(toCat)) {
        if (!hintMap.has(check.type)) hintMap.set(check.type, new Set());
        hintMap.get(check.type).add(e.from);
        hintMap.get(check.type).add(e.to);
      }
    }
  }

  const hints = [];
  for (const check of BOUNDARY_CHECKS) {
    if (hintMap.has(check.type)) {
      hints.push({
        type:     check.type,
        severity: check.severity,
        summary:  check.summary,
        files:    Array.from(hintMap.get(check.type)).sort(),
      });
    }
  }
  return hints;
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _buildSummary(metrics) {
  if (metrics.totalNodes === 0) {
    return 'No files provided — dependency graph is empty.';
  }
  const parts = [
    metrics.totalNodes + ' file' + (metrics.totalNodes === 1 ? '' : 's') + ',',
    metrics.totalEdges + ' import edge' + (metrics.totalEdges === 1 ? '' : 's') + '.',
  ];
  if (metrics.circularDependencyCount > 0) {
    parts.push(metrics.circularDependencyCount + ' circular dependenc' + (metrics.circularDependencyCount === 1 ? 'y' : 'ies') + ' detected.');
  }
  if (metrics.unresolvedCount > 0) {
    parts.push(metrics.unresolvedCount + ' unresolved import' + (metrics.unresolvedCount === 1 ? '' : 's') + '.');
  }
  if (metrics.externalDependencyCount > 0) {
    parts.push(metrics.externalDependencyCount + ' external package' + (metrics.externalDependencyCount === 1 ? '' : 's') + ' referenced.');
  }
  return parts.join(' ');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build an import/dependency graph from repository file contents.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ files: Array }} [params]
 * @returns {{
 *   nodes:                 Array,
 *   edges:                 Array,
 *   unresolvedImports:     Array,
 *   circularDependencies:  Array,
 *   boundaryHints:         Array,
 *   couplingMetrics:       object,
 *   summary:               string,
 * }}
 */
function buildImportDependencyGraph(params) {
  const files = (params && Array.isArray(params.files)) ? params.files : [];

  // -- Normalize paths --
  const normalized = files.map(function(f) {
    return { path: _norm(f.path), content: f.content || '', language: f.language || null };
  });

  // -- Build file lookup set --
  const fileSet = new Set(normalized.map(f => f.path));

  // -- Per-file metadata (category) --
  const catMap = new Map();
  for (const f of normalized) catMap.set(f.path, _category(f.path));

  // -- Parse imports --
  const rawEdges = [];
  const unresolvedImports = [];
  const externalPkgs = new Set();

  for (const f of normalized) {
    // Documentation files are excluded from import extraction — code samples
    // inside Markdown prose are not real dependency edges. The file still
    // gets a graph node (see -- Build nodes -- below) with outboundCount 0
    // and contributes no unresolved imports; this preserves the existing
    // `dependencyGraph.nodes.length > 0` structural-presence signal consumed
    // by assessImplementationCompleteness.js and verifyArchitectureBoundaries.js.
    if (_isDocumentationFile(f.path, catMap.get(f.path))) continue;

    const imports = _extractImports(f.content);

    for (const { importPath, importType } of imports) {
      if (_isExternal(importPath)) {
        externalPkgs.add(importPath);
        unresolvedImports.push({ from: f.path, importPath, reason: 'external' });
        continue;
      }

      if (!_isRelative(importPath)) {
        unresolvedImports.push({ from: f.path, importPath, reason: 'non_relative' });
        continue;
      }

      const resolved = _resolve(f.path, importPath, fileSet);
      if (resolved) {
        rawEdges.push({ from: f.path, to: resolved, importPath, importType });
      } else {
        unresolvedImports.push({ from: f.path, importPath, reason: 'missing' });
      }
    }
  }

  // -- Sort edges and unresolvedImports for determinism --
  rawEdges.sort(function(a, b) {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.to !== b.to)     return a.to   < b.to   ? -1 : 1;
    return 0;
  });
  unresolvedImports.sort(function(a, b) {
    if (a.from !== b.from)             return a.from       < b.from       ? -1 : 1;
    if (a.importPath !== b.importPath) return a.importPath < b.importPath ? -1 : 1;
    return 0;
  });

  // -- Build inbound/outbound counts --
  const outCount = new Map();
  const inCount  = new Map();
  for (const f of normalized) { outCount.set(f.path, 0); inCount.set(f.path, 0); }
  for (const e of rawEdges) {
    outCount.set(e.from, (outCount.get(e.from) || 0) + 1);
    inCount.set(e.to,   (inCount.get(e.to)    || 0) + 1);
  }

  // -- Build nodes (sorted by path) --
  const nodes = normalized
    .slice()
    .sort(function(a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; })
    .map(function(f) {
      return {
        path:          f.path,
        language:      f.language,
        category:      catMap.get(f.path),
        inboundCount:  inCount.get(f.path)  || 0,
        outboundCount: outCount.get(f.path) || 0,
      };
    });

  // -- Circular dependency detection --
  const adjacency = new Map();
  for (const f of normalized) adjacency.set(f.path, []);
  for (const e of rawEdges) adjacency.get(e.from).push(e.to);

  const circularDependencies = _findCycles(adjacency);

  // -- Boundary hints --
  const boundaryHints = _buildBoundaryHints(rawEdges, catMap);

  // -- High fan-in/fan-out (threshold: >= HIGH_FAN_THRESHOLD) --
  const highFanInFiles  = nodes.filter(n => n.inboundCount  >= HIGH_FAN_THRESHOLD).map(n => n.path).sort();
  const highFanOutFiles = nodes.filter(n => n.outboundCount >= HIGH_FAN_THRESHOLD).map(n => n.path).sort();

  // -- Coupling metrics --
  const totalNodes = nodes.length;
  const totalEdges = rawEdges.length;
  const couplingMetrics = {
    totalNodes,
    totalEdges,
    unresolvedCount:         unresolvedImports.length,
    externalDependencyCount: externalPkgs.size,
    circularDependencyCount: circularDependencies.length,
    averageOutDegree:        totalNodes > 0 ? totalEdges / totalNodes : 0,
    highFanOutFiles,
    highFanInFiles,
  };

  return {
    nodes,
    edges:                rawEdges,
    unresolvedImports,
    circularDependencies,
    boundaryHints,
    couplingMetrics,
    summary:              _buildSummary(couplingMetrics),
  };
}

module.exports = { buildImportDependencyGraph };
