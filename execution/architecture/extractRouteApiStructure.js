'use strict';

// Route/API Structure Extractor
// Answers: "What backend routes and frontend API calls exist in this repository?"
//
// Input:  { files: [{ path, content, language }] }
// Output: backendRoutes, frontendApiCalls, routeHandlers, nextRoutes,
//         endpointInventory, unresolvedApiCalls, unusedBackendRoutes,
//         frameworkHints, summary
//
// Pure function — no I/O, no mutation of input.

// ── Constants ─────────────────────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

// ── Path normalization ────────────────────────────────────────────────────────

function _norm(p) {
  return (p || '').replace(/\\/g, '/');
}

function _normRoutePath(p) {
  if (!p) return '/';
  // Strip trailing slash (but keep bare /)
  let s = p.replace(/\/+$/, '') || '/';
  return s;
}

function _normalizeDynamic(p) {
  // Next.js [param] → :param
  return p.replace(/\[([^\]]+)\]/g, ':$1');
}

function _normTemplateParams(p) {
  // Template literal ${...} → :param
  return p.replace(/\$\{[^}]+\}/g, ':param');
}

// ── Documentation-file exclusion ──────────────────────────────────────────────
// Markdown/MDX prose is not executable source. Code samples inside .md/.mdx
// files (e.g. a table documenting `serverFetch('/api/x')` usage) match the same
// regexes as real route registrations and API calls, producing false positives.
// Extension-only, case-insensitive — deliberately narrow: no repository category
// metadata, no docs-directory classification (unlike buildImportDependencyGraph.js's
// broader exclusion), and HTML is never matched by this predicate.

function _isDocumentationFile(path) {
  return /\.mdx?$/i.test(path || '');
}

// ── Test-file exclusion ───────────────────────────────────────────────────────
// Test fixtures routinely contain source-code strings that look exactly like
// real route registrations or API calls (e.g. a supertest fixture literally
// containing "app.get('/api/foo', handler)" or "fetch('/api/ghost')"). Those
// strings are not real architecture evidence. This used to be enforced by
// excluding test files from the GitHub fetch entirely (fetchRepositoryFiles.js),
// which also hid them from structure-inventory/completeness analysis that
// legitimately needs to see them. The exclusion now lives here instead, at
// extraction time, so test files remain visible everywhere else.
//
// Segment-boundary-anchored (`/…/`) so a directory merely *containing* the
// substring "test" — backend/contest/routes.js, frontend/latest/dashboard.js,
// services/testimonials/send.js — is never misclassified; only an exact
// tests/test/__tests__ path segment, or a *.test.*/*.spec.* filename, counts.

const TEST_FILE_PATTERNS = [
  /^(?:tests?|__tests__)\//i,   // starts with tests/, test/, or __tests__/
  /\/(?:tests?|__tests__)\//i,  // tests/, test/, or __tests__/ nested anywhere
  /\.(?:test|spec)\.[jt]sx?$/i, // *.test.js/jsx/ts/tsx  *.spec.js/jsx/ts/tsx
];

function _isTestFile(path) {
  const p = path || '';
  return TEST_FILE_PATTERNS.some(function(re) { return re.test(p); });
}

// ── Comment stripping ─────────────────────────────────────────────────────────

function _stripComments(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  s = s.replace(/\/\/[^\n]*/g, '');
  return s;
}

// ── Handler type detection ────────────────────────────────────────────────────
// After the route path argument, determine whether the handler is inline or named.
// "inline" = function keyword or arrow; "named" = identifier reference.

function _parseHandlerArg(afterPath) {
  // afterPath is the text after the closing quote/backtick of the path, up to end of statement
  // Skip comma + whitespace
  const rest = afterPath.replace(/^\s*,\s*/, '');
  if (!rest) return { handlerType: 'unknown', handlerName: null };

  // If it starts with function keyword or arrow pattern — inline
  if (/^(?:async\s+)?function\b/.test(rest)) return { handlerType: 'inline', handlerName: null };

  // Arrow: (req, res) => ...  or  req => ...
  if (/^\(/.test(rest) || /^\w+\s*=>/.test(rest)) return { handlerType: 'inline', handlerName: null };

  // Middleware array: [mw1, mw2, handler] — take last identifier
  if (rest.startsWith('[')) {
    const inner = rest.slice(1, rest.indexOf(']') > 0 ? rest.indexOf(']') : rest.length);
    const idents = inner.match(/\b([A-Za-z_$][\w$]*)\b/g);
    if (idents && idents.length > 0) {
      return { handlerType: 'named', handlerName: idents[idents.length - 1] };
    }
    return { handlerType: 'unknown', handlerName: null };
  }

  // Multiple comma-separated identifiers: mw1, mw2, handler — take last simple identifier
  const parts = rest.split(',').map(s => s.trim()).filter(Boolean);
  // Find last part that is a plain identifier (not a function/arrow)
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    // Stop at function/arrow
    if (/^(?:async\s+)?function\b/.test(p) || /^\(/.test(p) || /^\w+\s*=>/.test(p)) {
      return { handlerType: 'inline', handlerName: null };
    }
    const m = p.match(/^([A-Za-z_$][\w$]*)/);
    if (m) return { handlerType: 'named', handlerName: m[1] };
  }

  return { handlerType: 'unknown', handlerName: null };
}

// ── Express route extraction ──────────────────────────────────────────────────

// Matches:  app.get('/path', ...)  router.post('/path', ...)  fastify.get('/path', ...)
// Group 1: object name (app/router/fastify/etc.)
// Group 2: method
// Group 3: path (single or double quote)
// Group 4: remainder after closing quote (for handler detection)
const EXPRESS_ROUTE_RE = /\b(app|router|server)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*(['"`])((?:\\.|[^\\])*?)\3\s*(.*?)(?=\)|\n|;)/gis;

// fastify.route({ method: 'GET', url: '/path', handler })
const FASTIFY_ROUTE_OBJ_RE = /\bfastify\s*\.\s*route\s*\(\s*\{[^}]*?method\s*:\s*['"`]([A-Z]+)['"`][^}]*?url\s*:\s*['"`]([^'"`]+)['"`][^}]*?\}/gis;
const FASTIFY_ROUTE_OBJ_RE2 = /\bfastify\s*\.\s*route\s*\(\s*\{[^}]*?url\s*:\s*['"`]([^'"`]+)['"`][^}]*?method\s*:\s*['"`]([A-Z]+)['"`][^}]*?\}/gis;

// fastify.get/post/etc.
const FASTIFY_METHOD_RE = /\bfastify\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*(['"`])((?:\\.|[^\\])*?)\2\s*(.*?)(?=\)|\n|;)/gis;

// app.use / router.use (mount) — explicit-prefix form
// Group 1: object, Group 2: quote, Group 3: path, \2 closes the quote
const USE_RE = /\b(app|router)\s*\.\s*use\s*\(\s*(['"`])((?:\\.|[^\\])*?)\2\s*,\s*([A-Za-z_$][\w$]*)\s*\)/gis;

// app.use / router.use (mount) — omitted-prefix composition form, e.g.
// `router.use(childRoutes)`, equivalent to mounting at '/'. The identifier
// must be the *only* argument, immediately followed by the closing paren, so
// this never matches the explicit-prefix form above (which always has a
// leading quoted path) or a call expression like `express.json()`/`cors()`
// (which have `(`/`.` immediately after the identifier, not `)`).
const USE_NO_PREFIX_RE = /\b(app|router)\s*\.\s*use\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/gis;

function _extractExpressRoutes(filePath, src) {
  const stripped = _stripComments(src);
  const routes = [];
  const handlers = [];

  // app/router method routes
  let m;
  EXPRESS_ROUTE_RE.lastIndex = 0;
  while ((m = EXPRESS_ROUTE_RE.exec(stripped)) !== null) {
    const method = m[2].toUpperCase();
    const rawPath = m[4];
    const after   = m[5] || '';
    const path = _normRoutePath(_normalizeDynamic(rawPath));
    const { handlerType, handlerName } = _parseHandlerArg(after);
    routes.push({ method, path, file: filePath, framework: 'express', handlerType, handlerName });
  }

  // fastify.METHOD
  FASTIFY_METHOD_RE.lastIndex = 0;
  while ((m = FASTIFY_METHOD_RE.exec(stripped)) !== null) {
    const method = m[1].toUpperCase();
    const rawPath = m[3];
    const after   = m[4] || '';
    const path = _normRoutePath(_normalizeDynamic(rawPath));
    const { handlerType, handlerName } = _parseHandlerArg(after);
    routes.push({ method, path, file: filePath, framework: 'fastify', handlerType, handlerName });
  }

  // fastify.route({ method, url }) — two orderings
  FASTIFY_ROUTE_OBJ_RE.lastIndex = 0;
  while ((m = FASTIFY_ROUTE_OBJ_RE.exec(stripped)) !== null) {
    const method = m[1].toUpperCase();
    const path   = _normRoutePath(_normalizeDynamic(m[2]));
    routes.push({ method, path, file: filePath, framework: 'fastify', handlerType: 'unknown', handlerName: null });
  }
  FASTIFY_ROUTE_OBJ_RE2.lastIndex = 0;
  while ((m = FASTIFY_ROUTE_OBJ_RE2.exec(stripped)) !== null) {
    const path   = _normRoutePath(_normalizeDynamic(m[1]));
    const method = m[2].toUpperCase();
    routes.push({ method, path, file: filePath, framework: 'fastify', handlerType: 'unknown', handlerName: null });
  }

  // app.use / router.use mounts — explicit-prefix form
  USE_RE.lastIndex = 0;
  while ((m = USE_RE.exec(stripped)) !== null) {
    const mountPath  = _normRoutePath(m[3]);
    const routerName = m[4];
    handlers.push({ file: filePath, mountPath, routerName });
  }

  // app.use / router.use mounts — omitted-prefix form (mount at '/').
  // Raw/unfiltered, same as the explicit-prefix form above: whether the
  // identifier actually resolves to a route module (vs. plain middleware
  // like `authenticate`) is decided later, in _buildMountEdges.
  USE_NO_PREFIX_RE.lastIndex = 0;
  while ((m = USE_NO_PREFIX_RE.exec(stripped)) !== null) {
    handlers.push({ file: filePath, mountPath: '/', routerName: m[2] });
  }

  return { routes, handlers };
}

// ── Mount-prefix resolution ───────────────────────────────────────────────────
// Parses `const routerVar = require('./relative/path')` assignments so each
// routerVar can be traced back to its source file path.  Combined with the
// app.use('/prefix', routerVar) / router.use(routerVar) entries already
// captured in routeHandlers, this builds a *mount graph* — edges from a
// mounting file to the router file it mounts, carrying that hop's prefix —
// which is then resolved transitively (server.js → repoRoutes.js →
// repoCoreRoutes.js → ...) so a route defined arbitrarily deep in a chain of
// composed routers inherits its full effective public path (e.g. /summary
// becomes /api/repos/summary) before any frontend/backend matching takes place.
//
// Internal pipeline (see extractRouteApiStructure's call site for the order):
//   1. _extractRequireAssignments / _resolveRequirePath — trace `const X =
//      require('./path')` per file (existing convention, unchanged).
//   2. _buildMountEdges — cross-reference every routeHandlers entry (both the
//      explicit-prefix `use('/x', X)` and omitted-prefix `use(X)` forms) against
//      that per-file require map, keeping an edge only when X resolves to a
//      file the analyzer independently found routes or further use() mounts in
//      (i.e. an actual route module — not `authenticate`/`errorHandler`/
//      `express.json()`, which produce no routes/handlers of their own and are
//      therefore never mistaken for child-router composition).
//   3. _groupIncomingEdges — index edges by child file for graph traversal.
//   4. _resolveEffectivePrefixes — per file, walk backward through incoming
//      edges to every root (cycle-protected, arbitrary depth), returning the
//      *set* of effective prefixes that file is reachable at (usually one; two
//      when the same router is mounted at two different prefixes, e.g. /v1 and
//      /v2 — both must be preserved, not collapsed).

// Matches:  const foo = require('./path')  (const / let / var)
const REQUIRE_ASSIGN_RE = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*(['"`])((?:\\.|[^\\])*?)\2\s*\)/g;

function _extractRequireAssignments(src) {
  const stripped = _stripComments(src);
  const assignments = [];
  let m;
  REQUIRE_ASSIGN_RE.lastIndex = 0;
  while ((m = REQUIRE_ASSIGN_RE.exec(stripped)) !== null) {
    assignments.push({ varName: m[1], requirePath: m[3] });
  }
  return assignments;
}

// Resolve a relative require path (./foo or ../foo) against the file that
// contains the require() call.  Returns a repo-relative path with .js appended
// when no extension is present, or null for non-relative requires.
function _resolveRequirePath(fromFilePath, requirePath) {
  if (!requirePath.startsWith('./') && !requirePath.startsWith('../')) return null;
  const lastSlash = fromFilePath.lastIndexOf('/');
  const fromDir = lastSlash >= 0 ? fromFilePath.substring(0, lastSlash) : '';
  const combined = fromDir ? fromDir + '/' + requirePath : requirePath;
  const parts = combined.split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (resolved.length) resolved.pop(); continue; }
    resolved.push(part);
  }
  let path = resolved.join('/');
  if (path && !path.match(/\.[^/]+$/)) path += '.js';
  return path || null;
}

// Build mount-graph edges { parentFile, childFile, prefix } by cross-referencing:
//   1. require assignments extracted from every file (routerVar → file it names)
//   2. every routeHandlers entry (both use('/x', routerVar) and use(routerVar))
// An edge is only kept when the resolved child file is among the files the
// analyzer actually fetched *and* is itself a route module — meaning
// backendRoutes or routeHandlers already contains at least one entry for that
// file (real .get/.post/... routes, or its own further use() mounts). This is
// what distinguishes `router.use(childRoutes)` (composition) from
// `router.use(authenticate)` / `app.use(express.json())` (ordinary middleware,
// which extract zero routes/handlers and therefore never qualify) — reusing
// the analyzer's own already-computed extraction results rather than a new
// filename- or content-pattern heuristic.
function _buildMountEdges(normalizedFiles, backendRoutes, routeHandlers) {
  const varToFile = new Map(); // 'sourceFile:varName' → resolvedFilePath
  for (const f of normalizedFiles) {
    for (const { varName, requirePath } of _extractRequireAssignments(f.content)) {
      const resolved = _resolveRequirePath(f.path, requirePath);
      if (resolved) varToFile.set(f.path + ':' + varName, resolved);
    }
  }

  const fileSet = new Set(normalizedFiles.map(f => f.path));

  const routeModuleFiles = new Set();
  for (const rt of backendRoutes) routeModuleFiles.add(rt.file);
  for (const h  of routeHandlers) routeModuleFiles.add(h.file);

  const edges = [];
  for (const handler of routeHandlers) {
    const childFile = varToFile.get(handler.file + ':' + handler.routerName);
    if (!childFile) continue;                       // not a locally require()'d identifier
    if (!fileSet.has(childFile)) continue;           // resolved path wasn't among the analyzed files
    if (!routeModuleFiles.has(childFile)) continue;  // no routes/handlers of its own — not a route module
    edges.push({ parentFile: handler.file, childFile, prefix: handler.mountPath });
  }
  return edges;
}

// Index mount-graph edges by child file for backward traversal.
function _groupIncomingEdges(edges) {
  const map = new Map(); // childFile → [{ parentFile, prefix }]
  for (const e of edges) {
    if (!map.has(e.childFile)) map.set(e.childFile, []);
    map.get(e.childFile).push({ parentFile: e.parentFile, prefix: e.prefix });
  }
  return map;
}

// Join any number of path segments into a single normalized path: exactly one
// leading slash, no duplicate internal slashes, no trailing slash (unless the
// result is the bare root). Each segment's own leading/trailing slashes are
// trimmed before joining, so '/api/repos' + '/' + '/summary' → '/api/repos/summary'
// and '/api' + '/repos' + '/risk/:id' → '/api/repos/risk/:id'.
function _joinPrefixSegments(...segments) {
  const atoms = [];
  for (const seg of segments) {
    const trimmed = (seg || '').replace(/^\/+|\/+$/g, '');
    if (trimmed) atoms.push(trimmed);
  }
  return '/' + atoms.join('/');
}

// Combines a parent's already-resolved effective prefix ('' means "no prefix
// — root") with one mount hop's own prefix (which may itself be '/', the
// omitted-prefix default). Canonicalizes back to '' whenever the combination
// is the bare root, so '' consistently means "no prefix" throughout resolution.
function _combinePrefix(parentPrefix, hopPrefix) {
  const joined = _joinPrefixSegments(parentPrefix, hopPrefix);
  return joined === '/' ? '' : joined;
}

// Resolves the *set* of effective public-path prefixes for `file` by walking
// backward through the mount graph to every root (a file with no incoming
// mount edge — e.g. server.js, or a router file the analyzer couldn't trace a
// mount for, which safely falls back to no-prefix, matching pre-existing
// behavior for untraceable files). Supports arbitrary transitive depth — no
// hard-coded hop limit — and multiple distinct mounts of the same file (e.g.
// the same router mounted at both /v1 and /v2: both prefixes are returned,
// not collapsed to one).
//
// `visiting` is the set of files already on the *current* resolution path;
// encountering one again means a mount cycle (aRoutes ↔ bRoutes) — that
// branch simply contributes no further prefix rather than recursing forever,
// which guarantees termination without throwing or emitting infinite routes.
function _resolveEffectivePrefixes(file, incomingByFile, visiting) {
  if (visiting.has(file)) return new Set();

  const parents = incomingByFile.get(file);
  if (!parents || parents.length === 0) return new Set(['']);

  const nextVisiting = new Set(visiting);
  nextVisiting.add(file);

  const result = new Set();
  for (const { parentFile, prefix } of parents) {
    const parentPrefixes = _resolveEffectivePrefixes(parentFile, incomingByFile, nextVisiting);
    for (const pp of parentPrefixes) {
      result.add(_combinePrefix(pp, prefix));
    }
  }
  if (result.size === 0) result.add(''); // every parent path was cut off by cycle protection
  return result;
}

// ── NestJS decorator route discovery ──────────────────────────────────────────
// Regex-based (not AST) — mirrors the rest of this module's approach. Recognizes
// only the five HTTP method decorators named in scope; @Head/@Options/@All and
// custom route decorators are intentionally not supported.

const NEST_CONTROLLER_RE = /@Controller\s*\(([^)]*)\)/g;
const NEST_METHOD_RE     = /@(Get|Post|Put|Patch|Delete)\s*\(([^)]*)\)/g;
const NEST_CLASS_RE      = /class\s+[A-Za-z_$][\w$]*/;

// Resolves a decorator's raw argument text to a literal path string, or null when
// the argument is dynamic/unsupported (identifier reference, expression, options
// object, or a template literal containing ${...} interpolation). An empty
// argument (bare @Controller() / @Get()) resolves to '' — a valid root path.
function _parseNestPathArg(inner) {
  const trimmed = (inner || '').trim();
  if (trimmed === '') return '';
  const m = trimmed.match(/^(['"`])((?:\\.|[^\\])*)\1$/);
  if (!m) return null;
  const quote = m[1];
  const value = m[2];
  if (quote === '`' && value.indexOf('${') !== -1) return null;
  return value;
}

// ── NestJS object-form @Controller() support ──────────────────────────────────
// @Controller({ path: 'users' })
// @Controller({ version: '1' })
// @Controller({ path: 'auth', version: '1' })   (either key order)
// Only string/template-literal (non-interpolated) `path` and string/numeric
// `version` values are resolved. Array paths, imported constants, and any other
// computed expression cause the whole controller prefix to resolve to null
// (dynamic/unsupported — the caller skips the entire controller safely, same as
// the existing bare-string dynamic-prefix behavior).

// Resolves a single string/template-literal or bare-numeric value expression to
// its literal text, or null when the expression itself is present but not a
// literal RepoPulse can safely resolve (array, identifier, call expression, ...).
function _resolveNestLiteralValue(raw) {
  const strMatch = raw.match(/^(['"`])((?:\\.|[^\\])*)\1$/);
  if (strMatch) {
    if (strMatch[1] === '`' && strMatch[2].indexOf('${') !== -1) return null;
    return strMatch[2];
  }
  if (/^\d+$/.test(raw)) return raw;
  return null; // array literal, identifier, imported constant, expression, etc.
}

// Extracts the raw (unparsed) value text following `key:` inside a single-level
// object literal body, respecting [ ], { }, ( ) nesting so an array/object value
// isn't truncated at an internal comma. Returns null when the key is absent.
function _extractNestObjectPropRaw(objInner, key) {
  const keyRe = new RegExp('(?:^|[{,])\\s*' + key + '\\s*:\\s*');
  const km = keyRe.exec(objInner);
  if (!km) return null;
  const start = km.index + km[0].length;
  let depth = 0;
  let end = objInner.length;
  for (let i = start; i < objInner.length; i++) {
    const ch = objInner[i];
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    else if (ch === ']' || ch === '}' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) { end = i; break; }
  }
  return objInner.slice(start, end).trim();
}

// Resolves an object-literal @Controller({ ... }) argument (braces included) to
// a combined prefix string, or null when unsupported. `path` and `version` are
// looked up independently so either key order produces the same result.
function _parseNestControllerObject(objText) {
  const inner = objText.slice(1, -1);
  const pathRaw    = _extractNestObjectPropRaw(inner, 'path');
  const versionRaw = _extractNestObjectPropRaw(inner, 'version');

  const pathValue    = pathRaw    !== null ? _resolveNestLiteralValue(pathRaw)    : null;
  const versionValue = versionRaw !== null ? _resolveNestLiteralValue(versionRaw) : null;

  // Key present but not resolvable to a literal (array path, imported constant,
  // expression, ...) — unsupported per scope; skip the whole controller safely.
  if (pathRaw !== null && pathValue === null) return null;
  if (versionRaw !== null && versionValue === null) return null;

  const segments = [];
  if (versionRaw !== null) segments.push('v' + versionValue);
  if (pathRaw !== null)    segments.push(pathValue.replace(/^\/+|\/+$/g, ''));

  return segments.join('/'); // '' when neither key was present/resolvable
}

// Resolves an @Controller(...) decorator's raw argument — bare string/template
// literal (existing behavior) or an object literal (path/version) — to a
// combined prefix, or null when the whole controller should be skipped safely.
function _parseNestControllerPrefix(inner) {
  const trimmed = (inner || '').trim();
  if (trimmed.charAt(0) === '{' && trimmed.charAt(trimmed.length - 1) === '}') {
    return _parseNestControllerObject(trimmed);
  }
  return _parseNestPathArg(trimmed);
}

// Finds the index of the closing brace matching the '{' at openIndex using a
// plain depth counter over the (comment-stripped) source. Same level of rigor
// as the rest of this module's naive text-based structural parsing.
function _matchingBraceIndex(str, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < str.length; i++) {
    const ch = str[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Combines a resolved controller prefix with a resolved method path, trimming
// redundant slashes on both sides before joining (e.g. '/api/users' + '' → '/api/users';
// 'api/auth' + 'login' → '/api/auth/login').
function _joinNestPath(prefix, methodPath) {
  const p = (prefix || '').replace(/^\/+|\/+$/g, '');
  const m = (methodPath || '').replace(/^\/+|\/+$/g, '');
  const combined = [p, m].filter(function(s) { return s.length > 0; }).join('/');
  return _normRoutePath('/' + combined);
}

// ── NestJS global prefix detection (app.setGlobalPrefix(...)) ─────────────────
// app.setGlobalPrefix('api')  app.setGlobalPrefix("/api")  app.setGlobalPrefix(`api`)
// Typically declared in main.ts/bootstrap files, scanned across every fetched file
// like the rest of this module's pattern detection (no filename restriction).
// Only a bare string/template-literal (non-interpolated) argument is recognized —
// the regex simply does not match a variable or function-call argument, so those
// occurrences are inherently skipped ("ignored safely") without special-casing.
const NEST_GLOBAL_PREFIX_RE = /\bapp\s*\.\s*setGlobalPrefix\s*\(\s*(['"`])((?:\\.|[^\\])*?)\1/g;

// Scans files (in the order given) for the first app.setGlobalPrefix(...) call
// that resolves to a non-empty static literal, returning its normalized (slash-
// trimmed) value, or null when no such call exists anywhere. When multiple calls
// are present — dynamic or literal, in any file — this returns the first literal
// one encountered while scanning in file order; dynamic-argument calls simply
// never match the regex and are passed over automatically.
function _detectNestGlobalPrefix(normalizedFiles) {
  for (const f of normalizedFiles) {
    const stripped = _stripComments(f.content);
    if (!/setGlobalPrefix\s*\(/.test(stripped)) continue;
    NEST_GLOBAL_PREFIX_RE.lastIndex = 0;
    let m;
    while ((m = NEST_GLOBAL_PREFIX_RE.exec(stripped)) !== null) {
      const quote = m[1];
      const value = m[2];
      if (quote === '`' && value.indexOf('${') !== -1) continue; // interpolated — ignore, keep scanning
      const trimmed = value.replace(/^\/+|\/+$/g, '');
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function _extractNestRoutes(filePath, src) {
  const stripped = _stripComments(src);
  const routes = [];

  if (!/@Controller\b/.test(stripped)) return routes;

  NEST_CONTROLLER_RE.lastIndex = 0;
  let cm;
  while ((cm = NEST_CONTROLLER_RE.exec(stripped)) !== null) {
    const prefix = _parseNestControllerPrefix(cm[1]);
    if (prefix === null) continue; // dynamic/unsupported controller prefix — skip this controller safely

    const classMatch = NEST_CLASS_RE.exec(stripped.slice(cm.index));
    if (!classMatch) continue;
    const classKeywordIndex = cm.index + classMatch.index;
    const openBraceIndex = stripped.indexOf('{', classKeywordIndex);
    if (openBraceIndex === -1) continue;
    const closeBraceIndex = _matchingBraceIndex(stripped, openBraceIndex);
    if (closeBraceIndex === -1) continue;

    const classBody = stripped.slice(openBraceIndex, closeBraceIndex + 1);

    NEST_METHOD_RE.lastIndex = 0;
    let mm;
    while ((mm = NEST_METHOD_RE.exec(classBody)) !== null) {
      const method = mm[1].toUpperCase();
      const methodPath = _parseNestPathArg(mm[2]);
      if (methodPath === null) continue; // dynamic method path — skip this route safely
      const routePath = _joinNestPath(prefix, methodPath);
      routes.push({ method, path: routePath, file: filePath, framework: 'nestjs', handlerType: 'unknown', handlerName: null });
    }
  }

  return routes;
}

// ── Next.js route discovery ───────────────────────────────────────────────────

const NEXT_HTTP_METHOD_NAMES = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

// export async function GET(...) {}   /   export function POST(...) {}
const NEXT_EXPORT_FUNCTION_RE = /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g;

// export const PATCH = async (...) => {}   /   export const DELETE = function (...) {}
const NEXT_EXPORT_CONST_RE = /\bexport\s+const\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*=/g;

// export { GET, POST }   /   export { someHandler as GET }
const NEXT_EXPORT_LIST_RE = /\bexport\s*\{([^}]*)\}/g;

// Parses the identifier list inside an `export { ... }` block, resolving
// `name as ALIAS` pairs to the alias (the externally-visible export name —
// the only one Next.js's route-handler convention cares about).
function _parseNextExportListMethods(inner) {
  const methods = [];
  (inner || '').split(',').forEach(function(part) {
    const trimmed = part.trim();
    if (!trimmed) return;
    const asMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
    const name = asMatch ? asMatch[2] : trimmed;
    if (NEXT_HTTP_METHOD_NAMES.has(name)) methods.push(name);
  });
  return methods;
}

function _nextUrlFromPath(filePath) {
  let p = filePath;

  // pages/api/users/[id].js  →  /api/users/:id
  const pagesMatch = p.match(/^pages\/api\/(.+)\.[jt]sx?$/);
  if (pagesMatch) {
    const segments = pagesMatch[1];
    const urlPath = '/api/' + segments.replace(/\[([^\]]+)\]/g, ':$1').replace(/\/index$/, '');
    return { urlPattern: _normRoutePath(urlPath), type: 'pages' };
  }

  // app/api/users/[id]/route.ts  →  /api/users/:id
  // src/app/api/candidates/[id]/edit/route.ts  →  /api/candidates/:id/edit
  // Workspace/monorepo layouts — a single leading package-name segment under
  // apps/, packages/, services/, or libs/ (with or without a further src/):
  //   apps/web/src/app/api/users/route.ts       →  /api/users
  //   apps/admin/app/api/users/route.ts         →  /api/users
  //   packages/web/src/app/api/users/route.ts   →  /api/users
  //   services/frontend/src/app/api/users/route.ts → /api/users
  //   libs/demo/src/app/api/users/route.ts      →  /api/users
  const appMatch = p.match(/^(?:(?:apps|packages|services|libs)\/[^/]+\/)?(?:src\/)?app\/api\/(.+)\/route\.[jt]sx?$/);
  if (appMatch) {
    const segments = appMatch[1];
    const urlPath = '/api/' + segments.replace(/\[([^\]]+)\]/g, ':$1');
    return { urlPattern: _normRoutePath(urlPath), type: 'app' };
  }

  return null;
}

function _extractNextRoutes(filePath, src) {
  const next = _nextUrlFromPath(filePath);
  if (!next) return [];

  const stripped = _stripComments(src);
  const methods = [];

  if (next.type === 'app') {
    // App Router route-handler files: only ever record methods that are
    // actually exported. Do not invent a wildcard fallback here — an
    // unrecognized or method-less route.ts file safely produces no route
    // (requirement: prefer skip over guessing).
    let m;
    NEXT_EXPORT_FUNCTION_RE.lastIndex = 0;
    while ((m = NEXT_EXPORT_FUNCTION_RE.exec(stripped)) !== null) methods.push(m[1]);

    NEXT_EXPORT_CONST_RE.lastIndex = 0;
    while ((m = NEXT_EXPORT_CONST_RE.exec(stripped)) !== null) methods.push(m[1]);

    NEXT_EXPORT_LIST_RE.lastIndex = 0;
    while ((m = NEXT_EXPORT_LIST_RE.exec(stripped)) !== null) {
      _parseNextExportListMethods(m[1]).forEach(function(method) { methods.push(method); });
    }

    if (methods.length === 0) return [];
  } else {
    // pages/api: single default export handles every method — record as wildcard.
    methods.push('*');
  }

  return [{
    urlPattern: next.urlPattern,
    file:       filePath,
    framework:  'next',
    type:       next.type,
    methods:    [...new Set(methods)].sort(),
  }];
}

// ── Frontend API call extraction ──────────────────────────────────────────────

// fetch('/path') and fetch("/path")
// Split by quote type so the URL capture cannot cross its own closing delimiter.
// The old unified FETCH_RE used [^\\] (not-backslash) in the URL group, which allowed
// regex backtracking to extend the captured path past closing quotes and into surrounding
// code — producing garbage multi-line "paths" from nearby string literals.
const FETCH_SQ_RE  = /\bfetch\s*\(\s*'((?:\\.|[^'\\])*)'/gs;
const FETCH_DQ_RE  = /\bfetch\s*\(\s*"((?:\\.|[^"\\])*)"/gs;
// fetch(`/path/${expr}`) — backtick already excluded by [^`\\], no cross-boundary risk.
const FETCH_TMPL_RE = /\bfetch\s*\(\s*`((?:\\.|[^`\\])*)`/gs;
// HTTP method from the options block immediately following a fetch URL.
// Anchored at ^ so it only fires when options open directly after the closing quote.
// (?:[^{}]|\{[^{}]*\})* handles one level of brace nesting (e.g. headers: { ... })
// between the opening brace and the method: property.
const FETCH_OPTS_RE = /^\s*,\s*\{(?:[^{}]|\{[^{}]*\})*?method\s*:\s*['"`]([A-Za-z]+)['"`]/s;

// fetch('PREFIX' + EXPR + 'SUFFIX', opts) — string-concatenation paths.
// EXPR must contain no string literals (single/double quotes), covering patterns like
// fetch('/api/repos/' + encodeURIComponent(String(id)) + '/architecture', opts).
// Group 1: prefix (e.g. '/api/repos/'), Group 2: suffix (e.g. '/architecture'),
// Group 3: optional options object for method detection.
const FETCH_CONCAT_RE = /\bfetch\s*\(\s*'(\/[^'\\]*)'\s*\+\s*[^'"]*?\+\s*'([^'\\]*)'\s*(,\s*\{(?:[^{}]|\{[^{}]*\})*\})?/gs;

// axios.METHOD('/path')  apiClient.METHOD('/path')
const AXIOS_RE = /\b(axios|apiClient)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*(['"`])((?:\\.|[^\\])*?)\3/gis;
const AXIOS_TMPL_RE = /\b(axios|apiClient)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*`((?:\\.|[^`])*?)`/gis;

// client.request({ method: 'GET', url: '/path' })
// Group 1: method value, Group 2: URL quote, Group 3: URL value, \2 closes URL quote
const CLIENT_REQ_RE = /\bclient\s*\.\s*request\s*\(\s*\{[^}]*?method\s*:\s*['"`]([A-Z]+)['"`][^}]*?url\s*:\s*(['"`])((?:\\.|[^\\])*?)\2[^}]*?\}/gis;
const CLIENT_REQ_RE2 = /\bclient\s*\.\s*request\s*\(\s*\{[^}]*?url\s*:\s*(['"`])((?:\\.|[^\\])*?)\1[^}]*?method\s*:\s*['"`]([A-Z]+)['"`][^}]*?\}/gis;

// serverFetch('/path')  apiFetch('/path')  internalFetch('/path')  backendFetch('/path')
// Server-side BFF/internal fetch wrappers — same path-form support as fetch() below
// (single/double-quoted, template literal with or without ${...} interpolation, and
// simple two-segment string concatenation). Group 1 in every BFF_* regex is the
// wrapper name itself, used verbatim as the call's `client` field.
const BFF_SQ_RE   = /\b(serverFetch|apiFetch|internalFetch|backendFetch)\s*\(\s*'((?:\\.|[^'\\])*)'/gs;
const BFF_DQ_RE   = /\b(serverFetch|apiFetch|internalFetch|backendFetch)\s*\(\s*"((?:\\.|[^"\\])*)"/gs;
const BFF_TMPL_RE = /\b(serverFetch|apiFetch|internalFetch|backendFetch)\s*\(\s*`((?:\\.|[^`\\])*)`/gs;
// serverFetch('/api/repos/' + id + '/metrics', opts) — mirrors FETCH_CONCAT_RE.
// Group 1: wrapper name, Group 2: prefix, Group 3: suffix, Group 4: optional options object.
const BFF_CONCAT_RE = /\b(serverFetch|apiFetch|internalFetch|backendFetch)\s*\(\s*'(\/[^'\\]*)'\s*\+\s*[^'"]*?\+\s*'([^'\\]*)'\s*(,\s*\{(?:[^{}]|\{[^{}]*\})*\})?/gs;

function _extractMethod(optionsStr) {
  if (!optionsStr) return null;
  const m = optionsStr.match(/method\s*:\s*['"`]([A-Za-z]+)['"`]/i);
  return m ? m[1].toUpperCase() : null;
}

function _extractFrontendCalls(filePath, src) {
  const stripped = _stripComments(src);
  const calls = [];

  let m;

  // fetch with string concatenation: fetch('PREFIX' + expr + 'SUFFIX', opts).
  // Runs before FETCH_SQ_RE so we can skip these positions — FETCH_SQ_RE would otherwise
  // emit only the truncated prefix (e.g. '/api/repos') instead of the full parameterised path.
  const concatPositions = new Set();
  FETCH_CONCAT_RE.lastIndex = 0;
  while ((m = FETCH_CONCAT_RE.exec(stripped)) !== null) {
    concatPositions.add(m.index);
    const prefix = m[1].replace(/\/$/, ''); // strip trailing slash from prefix
    const suffix = m[2];                    // e.g. '/architecture'
    const method = _extractMethod(m[3]) || 'GET';
    const path   = _normRoutePath(prefix + '/:_p' + suffix);
    if (path.startsWith('/')) {
      calls.push({ method, path, file: filePath, client: 'fetch' });
    }
  }

  // fetch with single-quoted URL (skip positions already consumed by FETCH_CONCAT_RE)
  FETCH_SQ_RE.lastIndex = 0;
  while ((m = FETCH_SQ_RE.exec(stripped)) !== null) {
    if (concatPositions.has(m.index)) continue;
    const rawPath = m[1];
    if (!rawPath.startsWith('/')) continue;
    const rest   = stripped.slice(m.index + m[0].length);
    const mo     = FETCH_OPTS_RE.exec(rest);
    const method = mo ? mo[1].toUpperCase() : 'GET';
    calls.push({ method, path: _normRoutePath(rawPath), file: filePath, client: 'fetch' });
  }

  // fetch with double-quoted URL
  FETCH_DQ_RE.lastIndex = 0;
  while ((m = FETCH_DQ_RE.exec(stripped)) !== null) {
    const rawPath = m[1];
    if (!rawPath.startsWith('/')) continue;
    const rest   = stripped.slice(m.index + m[0].length);
    const mo     = FETCH_OPTS_RE.exec(rest);
    const method = mo ? mo[1].toUpperCase() : 'GET';
    calls.push({ method, path: _normRoutePath(rawPath), file: filePath, client: 'fetch' });
  }

  // fetch with template literal URL
  FETCH_TMPL_RE.lastIndex = 0;
  while ((m = FETCH_TMPL_RE.exec(stripped)) !== null) {
    const rawPath = m[1];
    if (!rawPath.startsWith('/')) continue;
    const rest   = stripped.slice(m.index + m[0].length);
    const mo     = FETCH_OPTS_RE.exec(rest);
    const method = mo ? mo[1].toUpperCase() : 'GET';
    const path   = _normRoutePath(_normTemplateParams(rawPath));
    calls.push({ method, path, file: filePath, client: 'fetch' });
  }

  // axios / apiClient with string literal
  AXIOS_RE.lastIndex = 0;
  while ((m = AXIOS_RE.exec(stripped)) !== null) {
    const clientName = m[1];
    const method     = m[2].toUpperCase();
    const rawPath    = m[4];
    if (!rawPath.startsWith('/')) continue;
    calls.push({ method, path: _normRoutePath(rawPath), file: filePath, client: clientName });
  }

  // axios / apiClient with template literal
  AXIOS_TMPL_RE.lastIndex = 0;
  while ((m = AXIOS_TMPL_RE.exec(stripped)) !== null) {
    const clientName = m[1];
    const method     = m[2].toUpperCase();
    const rawPath    = m[3];
    if (!rawPath.startsWith('/')) continue;
    const path = _normRoutePath(_normTemplateParams(rawPath));
    calls.push({ method, path, file: filePath, client: clientName });
  }

  // client.request({ method, url }) — two orderings
  CLIENT_REQ_RE.lastIndex = 0;
  while ((m = CLIENT_REQ_RE.exec(stripped)) !== null) {
    const method  = m[1].toUpperCase();
    const rawPath = m[3];
    if (!rawPath.startsWith('/')) continue;
    calls.push({ method, path: _normRoutePath(rawPath), file: filePath, client: 'client' });
  }
  CLIENT_REQ_RE2.lastIndex = 0;
  while ((m = CLIENT_REQ_RE2.exec(stripped)) !== null) {
    const rawPath = m[2];
    const method  = m[3].toUpperCase();
    if (!rawPath.startsWith('/')) continue;
    calls.push({ method, path: _normRoutePath(rawPath), file: filePath, client: 'client' });
  }

  // serverFetch/apiFetch/internalFetch/backendFetch with string concatenation.
  // Runs before BFF_SQ_RE for the same reason as FETCH_CONCAT_RE above — otherwise
  // BFF_SQ_RE would emit only the truncated prefix instead of the full parameterised path.
  const bffConcatPositions = new Set();
  BFF_CONCAT_RE.lastIndex = 0;
  while ((m = BFF_CONCAT_RE.exec(stripped)) !== null) {
    bffConcatPositions.add(m.index);
    const wrapperName = m[1];
    const prefix = m[2].replace(/\/$/, '');
    const suffix = m[3];
    const method = _extractMethod(m[4]) || 'GET';
    const path   = _normRoutePath(prefix + '/:_p' + suffix);
    if (path.startsWith('/')) {
      calls.push({ method, path, file: filePath, client: wrapperName });
    }
  }

  // serverFetch/... with single-quoted URL (skip positions already consumed by BFF_CONCAT_RE)
  BFF_SQ_RE.lastIndex = 0;
  while ((m = BFF_SQ_RE.exec(stripped)) !== null) {
    if (bffConcatPositions.has(m.index)) continue;
    const wrapperName = m[1];
    const rawPath = m[2];
    if (!rawPath.startsWith('/')) continue;
    const rest   = stripped.slice(m.index + m[0].length);
    const mo     = FETCH_OPTS_RE.exec(rest);
    const method = mo ? mo[1].toUpperCase() : 'GET';
    calls.push({ method, path: _normRoutePath(rawPath), file: filePath, client: wrapperName });
  }

  // serverFetch/... with double-quoted URL
  BFF_DQ_RE.lastIndex = 0;
  while ((m = BFF_DQ_RE.exec(stripped)) !== null) {
    const wrapperName = m[1];
    const rawPath = m[2];
    if (!rawPath.startsWith('/')) continue;
    const rest   = stripped.slice(m.index + m[0].length);
    const mo     = FETCH_OPTS_RE.exec(rest);
    const method = mo ? mo[1].toUpperCase() : 'GET';
    calls.push({ method, path: _normRoutePath(rawPath), file: filePath, client: wrapperName });
  }

  // serverFetch/... with template literal URL
  BFF_TMPL_RE.lastIndex = 0;
  while ((m = BFF_TMPL_RE.exec(stripped)) !== null) {
    const wrapperName = m[1];
    const rawPath = m[2];
    if (!rawPath.startsWith('/')) continue;
    const rest   = stripped.slice(m.index + m[0].length);
    const mo     = FETCH_OPTS_RE.exec(rest);
    const method = mo ? mo[1].toUpperCase() : 'GET';
    const path   = _normRoutePath(_normTemplateParams(rawPath));
    calls.push({ method, path, file: filePath, client: wrapperName });
  }

  return calls;
}

// ── Matching: frontend call → backend route ───────────────────────────────────

function _routeKey(method, path) {
  return method.toUpperCase() + ':' + path;
}

function _buildRouteKeySet(backendRoutes, nextRoutes) {
  const keys = new Set();
  for (const rt of backendRoutes) {
    keys.add(_routeKey(rt.method, rt.path));
  }
  for (const nr of nextRoutes) {
    for (const method of nr.methods) {
      if (method === '*') {
        // Wildcard — add all common methods
        for (const hm of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
          keys.add(_routeKey(hm, nr.urlPattern));
        }
      } else {
        keys.add(_routeKey(method, nr.urlPattern));
      }
    }
  }
  return keys;
}

// ── Endpoint inventory ────────────────────────────────────────────────────────

function _buildEndpointInventory(backendRoutes, nextRoutes, frontendCalls) {
  const map = new Map(); // key → entry

  for (const rt of backendRoutes) {
    const key = _routeKey(rt.method, rt.path);
    if (!map.has(key)) {
      map.set(key, { method: rt.method, path: rt.path, sources: [], hasBackend: true, hasFrontend: false });
    } else {
      map.get(key).hasBackend = true;
    }
    map.get(key).sources.push({ type: 'backend', file: rt.file });
  }

  for (const nr of nextRoutes) {
    for (const method of nr.methods) {
      const eff = method === '*' ? 'ANY' : method;
      const key = _routeKey(eff, nr.urlPattern);
      if (!map.has(key)) {
        map.set(key, { method: eff, path: nr.urlPattern, sources: [], hasBackend: true, hasFrontend: false });
      } else {
        map.get(key).hasBackend = true;
      }
      map.get(key).sources.push({ type: 'next', file: nr.file });
    }
  }

  for (const c of frontendCalls) {
    const key = _routeKey(c.method, c.path);
    if (!map.has(key)) {
      map.set(key, { method: c.method, path: c.path, sources: [], hasBackend: false, hasFrontend: true });
    } else {
      map.get(key).hasFrontend = true;
    }
    map.get(key).sources.push({ type: 'frontend', file: c.file });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.method < b.method ? -1 : 1;
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _buildSummary(backendRoutes, nextRoutes, frontendCalls, unresolved, unused) {
  const total = backendRoutes.length + nextRoutes.length;
  if (total === 0 && frontendCalls.length === 0) {
    return 'No routes or API calls detected.';
  }
  const parts = [];
  if (total > 0) parts.push(total + ' backend route' + (total === 1 ? '' : 's') + ' detected.');
  if (frontendCalls.length > 0) parts.push(frontendCalls.length + ' frontend API call' + (frontendCalls.length === 1 ? '' : 's') + ' detected.');
  if (unresolved.length > 0) parts.push(unresolved.length + ' unresolved frontend call' + (unresolved.length === 1 ? '' : 's') + '.');
  if (unused.length > 0) parts.push(unused.length + ' candidate unused backend route' + (unused.length === 1 ? '' : 's') + '.');
  return parts.join(' ');
}

// ── Analyzer coverage / framework-support hints ───────────────────────────────
// Answers: "does this repo *look like* it uses a framework we know how to parse,
// independent of whether extraction actually succeeded?" These hints are raw
// textual/path signals — they do not affect scoring, linking, or the extraction
// results above; they only drive the analyzerCoverage warnings surfaced to the
// user so measurement-confidence gaps are visible without being mistaken for
// architecture risk.

// @Controller, @Get, @Post, @Put, @Patch, @Delete, @Module, @Injectable
const NEST_HINT_RE = /@(?:Controller|Get|Post|Put|Patch|Delete|Module|Injectable)\b/;

// serverFetch(  apiFetch(  internalFetch(  backendFetch(
const BFF_HINT_RE = /\b(?:serverFetch|apiFetch|internalFetch|backendFetch)\s*\(/;

// app/api/**/route.*  and  src/app/api/**/route.*  (existence only — does not
// require an exported HTTP handler, unlike _nextUrlFromPath's appMatch usage).
const NEXT_APP_ROUTER_FILE_RE = /^(?:src\/)?app\/api\/(.+)\/route\.[jt]sx?$/;

const BFF_CLIENT_NAMES = new Set(['serverFetch', 'apiFetch', 'internalFetch', 'backendFetch']);

function _buildAnalyzerCoverage(normalized, backendRoutes, nextRoutes, frontendCalls) {
  let hasNestDecoratorHints     = false;
  let hasNextAppRouterFileHints = false;
  let hasBffWrapperHints        = false;

  for (const f of normalized) {
    if (!hasNextAppRouterFileHints && NEXT_APP_ROUTER_FILE_RE.test(f.path)) {
      hasNextAppRouterFileHints = true;
    }
    if (!hasNestDecoratorHints || !hasBffWrapperHints) {
      const stripped = _stripComments(f.content);
      if (!hasNestDecoratorHints && NEST_HINT_RE.test(stripped)) hasNestDecoratorHints = true;
      if (!hasBffWrapperHints && BFF_HINT_RE.test(stripped))     hasBffWrapperHints    = true;
    }
  }

  const nestRoutesExtracted    = backendRoutes.some(function(rt) { return rt.framework === 'nestjs'; });
  const nextAppRoutesExtracted = nextRoutes.some(function(nr) { return nr.type === 'app'; });
  const bffCallsExtracted      = frontendCalls.some(function(c) { return BFF_CLIENT_NAMES.has(c.client); });

  const supportedPatterns = [];
  if (backendRoutes.some(function(rt) { return rt.framework === 'express'; })) supportedPatterns.push('express');
  if (backendRoutes.some(function(rt) { return rt.framework === 'fastify'; })) supportedPatterns.push('fastify');
  if (nestRoutesExtracted) supportedPatterns.push('nestjs-decorators');
  if (nextRoutes.some(function(nr) { return nr.type === 'pages'; })) supportedPatterns.push('nextjs-pages');
  if (nextAppRoutesExtracted) supportedPatterns.push('nextjs-app-router');
  if (bffCallsExtracted) supportedPatterns.push('bff-fetch-wrappers');

  const warnings = [];

  if ((hasNestDecoratorHints || hasNextAppRouterFileHints || hasBffWrapperHints) && backendRoutes.length === 0) {
    warnings.push('Framework patterns detected but no backend routes were extracted; architecture linkage may be underreported.');
  }

  if (frontendCalls.length > 0 && backendRoutes.length === 0) {
    warnings.push('Frontend/BFF API calls were detected without matching backend route extraction; verify framework support before treating unresolved calls as architecture debt.');
  }

  if (hasNextAppRouterFileHints && !nextAppRoutesExtracted) {
    warnings.push('Next.js App Router files were detected but no exported HTTP handlers were recognized.');
  }

  if (hasNestDecoratorHints && !nestRoutesExtracted) {
    warnings.push('NestJS decorators were detected but no routes were extracted.');
  }

  const unsupportedRisk = warnings.length === 0 ? 'low' : warnings.length === 1 ? 'medium' : 'high';

  return {
    frameworkHints: {
      nestjs:           hasNestDecoratorHints,
      nextAppRouter:    hasNextAppRouterFileHints,
      bffFetchWrappers: hasBffWrapperHints,
    },
    supportedPatterns,
    unsupportedRisk,
    warnings,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract route and API call structure from repository file contents.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ files: Array }} [params]
 */
function extractRouteApiStructure(params) {
  const files = (params && Array.isArray(params.files)) ? params.files : [];

  const normalized = files.map(f => ({ path: _norm(f.path), content: f.content || '', language: f.language || null }));

  let backendRoutes     = [];
  const routeHandlers   = [];
  const nextRoutes      = [];
  const frontendCalls   = [];

  for (const f of normalized) {
    // Next.js route files — path-pattern-driven (app/api/**/route.* or
    // pages/api/**). Neither a .md/.mdx path nor a test-marked path
    // (tests/**, *.test.ts, __tests__/**, etc.) can structurally match these
    // anchored regexes: _nextUrlFromPath's appMatch only allows an optional
    // apps|packages|services|libs workspace-root segment before app/api/, and
    // pagesMatch requires pages/api/ at the very start — "tests/app/api/..."
    // and "apps/web/__tests__/app/api/..." both fail to match either pattern
    // (verified by dedicated regression tests). No guard needed here.
    const nxt = _extractNextRoutes(f.path, f.content);
    for (const nr of nxt) nextRoutes.push(nr);

    // Express/Fastify routes, NestJS routes, and frontend/BFF API calls all
    // skip documentation (.md/.mdx) and test files. Code samples in
    // documentation (e.g. a table illustrating `router.get('/x', ...)` or
    // `serverFetch('/api/x')` usage — see PROGRESS.md's own "Example
    // Extracted Calls" tables, which triggered exactly this false-positive
    // class live) and fixture strings inside test files (e.g. a supertest
    // fixture literally containing "app.get('/api/foo', handler)" or
    // "fetch('/api/ghost')") are not real route registrations or API calls.
    const isDocumentation      = _isDocumentationFile(f.path);
    const isTestFile           = _isTestFile(f.path);
    const isArchitectureSource = !isDocumentation && !isTestFile;

    if (isArchitectureSource) {
      const { routes, handlers } = _extractExpressRoutes(f.path, f.content);
      for (const rt of routes)   backendRoutes.push(rt);
      for (const h  of handlers) routeHandlers.push(h);

      const nestRoutes = _extractNestRoutes(f.path, f.content);
      for (const rt of nestRoutes) backendRoutes.push(rt);

      const calls = _extractFrontendCalls(f.path, f.content);
      for (const c of calls) frontendCalls.push(c);
    }
  }

  // Resolve app.use()/router.use() mount prefixes — including through nested
  // router composition (server.js → repoRoutes.js → repoCoreRoutes.js, etc.)
  // — so /summary (router-relative, however deep the composition chain) becomes
  // /api/repos/summary (full effective public path), matching the full paths
  // extracted from frontend fetch() calls. A file reachable via more than one
  // distinct effective prefix (e.g. the same router mounted at /v1 and /v2)
  // expands into one route entry per prefix; identical (method, path, file)
  // results — however reached — are deduplicated.
  const mountEdges     = _buildMountEdges(normalized, backendRoutes, routeHandlers);
  const incomingByFile = _groupIncomingEdges(mountEdges);
  if (incomingByFile.size > 0) {
    const expanded = [];
    const seenRoutes = new Set();
    for (const rt of backendRoutes) {
      const prefixes = _resolveEffectivePrefixes(rt.file, incomingByFile, new Set());
      for (const prefix of prefixes) {
        const finalPath = prefix ? _normRoutePath(_joinPrefixSegments(prefix, rt.path)) : rt.path;
        const identity  = rt.method + ':' + finalPath + ':' + rt.file;
        if (seenRoutes.has(identity)) continue;
        seenRoutes.add(identity);
        expanded.push(finalPath === rt.path ? rt : Object.assign({}, rt, { path: finalPath }));
      }
    }
    backendRoutes = expanded;
  }

  // Prepend a detected app.setGlobalPrefix(...) to NestJS routes only — never
  // Express/Fastify (they have their own app.use() mount-prefix handling above),
  // never Next.js routes (merged below), never frontend calls.
  const nestGlobalPrefix = _detectNestGlobalPrefix(normalized);
  if (nestGlobalPrefix !== null) {
    for (let i = 0; i < backendRoutes.length; i++) {
      if (backendRoutes[i].framework === 'nestjs') {
        backendRoutes[i] = Object.assign({}, backendRoutes[i],
          { path: _joinNestPath(nestGlobalPrefix, backendRoutes[i].path) });
      }
    }
  }

  // Merge Next.js App Router routes into backendRoutes so they participate in
  // linkFrontendBackendApis matching exactly like Express/Fastify/NestJS routes.
  // Only `type: 'app'` entries qualify — Step #2's extraction guarantees a
  // route.ts file with no recognized exported HTTP method never reaches
  // `nextRoutes` in the first place, so there is nothing methodless to merge here.
  // `nextRoutes` itself is left fully intact below (unfiltered) for backward
  // compatibility with existing consumers; only the *downstream* computations in
  // this function (routeKeySet, unusedBackendRoutes, endpointInventory, summary)
  // are scoped to the non-'app' subset below, so each app-router route is
  // represented exactly once (via backendRoutes) rather than twice.
  for (const nr of nextRoutes) {
    if (nr.type !== 'app') continue;
    for (const method of nr.methods) {
      backendRoutes.push({
        method,
        path:        nr.urlPattern,
        file:        nr.file,
        framework:   'nextjs-app-router',
        handlerType: 'unknown',
        handlerName: null,
      });
    }
  }

  // Sort deterministically
  backendRoutes.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.method < b.method ? -1 : 1;
  });
  frontendCalls.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.method < b.method ? -1 : 1;
  });
  nextRoutes.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  routeHandlers.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.mountPath < b.mountPath ? -1 : 1;
  });

  // Non-'app' Next.js routes (pages/api only) — used below wherever nextRoutes
  // would otherwise double-count routes already merged into backendRoutes above.
  const pageRoutesOnly = nextRoutes.filter(nr => nr.type !== 'app');

  // Build route key set for matching
  const routeKeySet = _buildRouteKeySet(backendRoutes, pageRoutesOnly);

  // Unresolved API calls: frontend calls with no matching backend
  const unresolvedApiCalls = [];
  for (const c of frontendCalls) {
    const key = _routeKey(c.method, c.path);
    if (!routeKeySet.has(key)) {
      // UNKNOWN/GET mismatch: if method is UNKNOWN, check any method for same path
      let matched = false;
      if (c.method === 'UNKNOWN') {
        for (const k of routeKeySet) {
          if (k.endsWith(':' + c.path)) { matched = true; break; }
        }
      }
      if (!matched) {
        unresolvedApiCalls.push({ from: c.file, method: c.method, path: c.path });
      }
    }
  }

  // Unused backend routes: backend routes with no matching frontend call
  const frontendKeySet = new Set(frontendCalls.map(c => _routeKey(c.method, c.path)));
  const unusedBackendRoutes = [];

  for (const rt of backendRoutes) {
    const key = _routeKey(rt.method, rt.path);
    if (!frontendKeySet.has(key)) {
      unusedBackendRoutes.push({ method: rt.method, path: rt.path, file: rt.file, framework: rt.framework, candidate: true });
    }
  }
  for (const nr of pageRoutesOnly) {
    let matched = false;
    for (const method of nr.methods) {
      if (method === '*') {
        for (const hm of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
          if (frontendKeySet.has(_routeKey(hm, nr.urlPattern))) { matched = true; break; }
        }
      } else {
        if (frontendKeySet.has(_routeKey(method, nr.urlPattern))) { matched = true; break; }
      }
      if (matched) break;
    }
    if (!matched) {
      unusedBackendRoutes.push({ methods: nr.methods, path: nr.urlPattern, file: nr.file, framework: 'next', candidate: true });
    }
  }

  unusedBackendRoutes.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.path < b.path ? -1 : 1;
  });
  unresolvedApiCalls.sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.method < b.method ? -1 : 1;
  });

  // Endpoint inventory
  const endpointInventory = _buildEndpointInventory(backendRoutes, pageRoutesOnly, frontendCalls);

  // Framework hints
  const hasExpressRoutes  = backendRoutes.some(rt => rt.framework === 'express');
  const hasFastifyRoutes  = backendRoutes.some(rt => rt.framework === 'fastify');
  const hasNextApiRoutes  = nextRoutes.length > 0;
  const hasFrontendApiCalls = frontendCalls.length > 0;
  const frameworkHints = {
    hasExpressRoutes,
    hasFastifyRoutes,
    hasNextApiRoutes,
    hasFrontendApiCalls,
    likelyFullStackApiIntegration: (hasExpressRoutes || hasFastifyRoutes || hasNextApiRoutes) && hasFrontendApiCalls,
  };

  const summary = _buildSummary(backendRoutes, pageRoutesOnly, frontendCalls, unresolvedApiCalls, unusedBackendRoutes);

  const analyzerCoverage = _buildAnalyzerCoverage(normalized, backendRoutes, nextRoutes, frontendCalls);

  return {
    backendRoutes,
    frontendApiCalls: frontendCalls,
    routeHandlers,
    nextRoutes,
    endpointInventory,
    unresolvedApiCalls,
    unusedBackendRoutes,
    frameworkHints,
    analyzerCoverage,
    summary,
  };
}

module.exports = { extractRouteApiStructure };
