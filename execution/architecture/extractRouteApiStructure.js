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

// app.use / router.use (mount)
// Group 1: object, Group 2: quote, Group 3: path, \2 closes the quote
const USE_RE = /\b(app|router)\s*\.\s*use\s*\(\s*(['"`])((?:\\.|[^\\])*?)\2\s*,\s*([A-Za-z_$][\w$]*)\s*\)/gis;

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

  // app.use / router.use mounts
  USE_RE.lastIndex = 0;
  while ((m = USE_RE.exec(stripped)) !== null) {
    const mountPath  = _normRoutePath(m[3]);
    const routerName = m[4];
    handlers.push({ file: filePath, mountPath, routerName });
  }

  return { routes, handlers };
}

// ── Mount-prefix resolution ───────────────────────────────────────────────────
// Parses `const routerVar = require('./relative/path')` assignments so each
// routerVar can be traced back to its source file path.  Combined with the
// app.use('/prefix', routerVar) entries already captured in routeHandlers, this
// lets us rewrite router-relative paths (e.g. /summary) to their full
// prefixed form (e.g. /api/repos/summary) before any matching takes place.

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

// Build a Map<routerFilePath, mountPrefix> by cross-referencing:
//   1. require assignments extracted from every file
//   2. app.use(prefix, routerVar) entries already in routeHandlers
function _buildMountPrefixMap(normalizedFiles, routeHandlers) {
  const varToFile = new Map(); // 'sourceFile:varName' → resolvedFilePath
  for (const f of normalizedFiles) {
    for (const { varName, requirePath } of _extractRequireAssignments(f.content)) {
      const resolved = _resolveRequirePath(f.path, requirePath);
      if (resolved) varToFile.set(f.path + ':' + varName, resolved);
    }
  }
  const map = new Map(); // routerFilePath → mountPrefix
  for (const handler of routeHandlers) {
    const routerFile = varToFile.get(handler.file + ':' + handler.routerName);
    if (routerFile) map.set(routerFile, handler.mountPath);
  }
  return map;
}

// Combine a mount prefix with a router-relative path.
// router.get('/')  + /api/repos → /api/repos  (no trailing slash)
// router.get('/x') + /api/repos → /api/repos/x
function _joinRoutePaths(prefix, routerPath) {
  if (routerPath === '/') return prefix;
  return prefix + routerPath;
}

// ── Next.js route discovery ───────────────────────────────────────────────────

// Exported HTTP method handlers in app/api route files
const NEXT_EXPORT_METHOD_RE = /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g;

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
  const appMatch = p.match(/^app\/api\/(.+)\/route\.[jt]sx?$/);
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

  // app/api route files: detect exported HTTP methods
  if (next.type === 'app') {
    let m;
    NEXT_EXPORT_METHOD_RE.lastIndex = 0;
    while ((m = NEXT_EXPORT_METHOD_RE.exec(stripped)) !== null) {
      methods.push(m[1]);
    }
  }
  // pages/api: default export — all methods accepted, record as wildcard
  if (methods.length === 0) methods.push('*');

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

// axios.METHOD('/path')  apiClient.METHOD('/path')
const AXIOS_RE = /\b(axios|apiClient)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*(['"`])((?:\\.|[^\\])*?)\3/gis;
const AXIOS_TMPL_RE = /\b(axios|apiClient)\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*`((?:\\.|[^`])*?)`/gis;

// client.request({ method: 'GET', url: '/path' })
// Group 1: method value, Group 2: URL quote, Group 3: URL value, \2 closes URL quote
const CLIENT_REQ_RE = /\bclient\s*\.\s*request\s*\(\s*\{[^}]*?method\s*:\s*['"`]([A-Z]+)['"`][^}]*?url\s*:\s*(['"`])((?:\\.|[^\\])*?)\2[^}]*?\}/gis;
const CLIENT_REQ_RE2 = /\bclient\s*\.\s*request\s*\(\s*\{[^}]*?url\s*:\s*(['"`])((?:\\.|[^\\])*?)\1[^}]*?method\s*:\s*['"`]([A-Z]+)['"`][^}]*?\}/gis;

function _extractMethod(optionsStr) {
  if (!optionsStr) return null;
  const m = optionsStr.match(/method\s*:\s*['"`]([A-Za-z]+)['"`]/i);
  return m ? m[1].toUpperCase() : null;
}

function _extractFrontendCalls(filePath, src) {
  const stripped = _stripComments(src);
  const calls = [];

  let m;

  // fetch with single-quoted URL
  FETCH_SQ_RE.lastIndex = 0;
  while ((m = FETCH_SQ_RE.exec(stripped)) !== null) {
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

  const backendRoutes   = [];
  const routeHandlers   = [];
  const nextRoutes      = [];
  const frontendCalls   = [];

  for (const f of normalized) {
    // Next.js route files
    const nxt = _extractNextRoutes(f.path, f.content);
    for (const nr of nxt) nextRoutes.push(nr);

    // Express / Fastify routes
    const { routes, handlers } = _extractExpressRoutes(f.path, f.content);
    for (const rt of routes)   backendRoutes.push(rt);
    for (const h  of handlers) routeHandlers.push(h);

    // Frontend API calls
    const calls = _extractFrontendCalls(f.path, f.content);
    for (const c of calls) frontendCalls.push(c);
  }

  // Prepend app.use() mount prefixes to router-file routes so that
  // /summary (router-relative) becomes /api/repos/summary (full path),
  // matching the full paths extracted from frontend fetch() calls.
  const mountPrefixMap = _buildMountPrefixMap(normalized, routeHandlers);
  if (mountPrefixMap.size > 0) {
    for (let i = 0; i < backendRoutes.length; i++) {
      const prefix = mountPrefixMap.get(backendRoutes[i].file);
      if (prefix) {
        backendRoutes[i] = Object.assign({}, backendRoutes[i],
          { path: _joinRoutePaths(prefix, backendRoutes[i].path) });
      }
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

  // Build route key set for matching
  const routeKeySet = _buildRouteKeySet(backendRoutes, nextRoutes);

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
  for (const nr of nextRoutes) {
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
  const endpointInventory = _buildEndpointInventory(backendRoutes, nextRoutes, frontendCalls);

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

  const summary = _buildSummary(backendRoutes, nextRoutes, frontendCalls, unresolvedApiCalls, unusedBackendRoutes);

  return {
    backendRoutes,
    frontendApiCalls: frontendCalls,
    routeHandlers,
    nextRoutes,
    endpointInventory,
    unresolvedApiCalls,
    unusedBackendRoutes,
    frameworkHints,
    summary,
  };
}

module.exports = { extractRouteApiStructure };
