'use strict';

const { buildImportDependencyGraph } = require('../../../../execution/architecture/buildImportDependencyGraph');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(path, content, language) {
  return { path, content: content || '', language: language || 'JavaScript' };
}

function edge(from, to, importPath, importType) {
  return { from, to, importPath, importType };
}

// ── Empty input ───────────────────────────────────────────────────────────────

describe('buildImportDependencyGraph — empty input', () => {
  test('null input returns valid zero-state', () => {
    const r = buildImportDependencyGraph(null);
    expect(r.nodes).toEqual([]);
    expect(r.edges).toEqual([]);
    expect(r.unresolvedImports).toEqual([]);
    expect(r.circularDependencies).toEqual([]);
    expect(r.boundaryHints).toEqual([]);
  });

  test('undefined input returns valid zero-state', () => {
    const r = buildImportDependencyGraph(undefined);
    expect(r.nodes).toEqual([]);
  });

  test('empty files array returns zero-state', () => {
    const r = buildImportDependencyGraph({ files: [] });
    expect(r.couplingMetrics.totalNodes).toBe(0);
    expect(r.couplingMetrics.totalEdges).toBe(0);
  });

  test('empty input summary is defined string', () => {
    const r = buildImportDependencyGraph({ files: [] });
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  test('couplingMetrics all zero/empty for empty input', () => {
    const r = buildImportDependencyGraph({ files: [] });
    const m = r.couplingMetrics;
    expect(m.totalNodes).toBe(0);
    expect(m.totalEdges).toBe(0);
    expect(m.unresolvedCount).toBe(0);
    expect(m.externalDependencyCount).toBe(0);
    expect(m.circularDependencyCount).toBe(0);
    expect(m.averageOutDegree).toBe(0);
    expect(m.highFanOutFiles).toEqual([]);
    expect(m.highFanInFiles).toEqual([]);
  });
});

// ── Node creation ─────────────────────────────────────────────────────────────

describe('buildImportDependencyGraph — nodes', () => {
  test('one file creates one node', () => {
    const r = buildImportDependencyGraph({ files: [makeFile('src/app.js', '')] });
    expect(r.nodes.length).toBe(1);
    expect(r.nodes[0].path).toBe('src/app.js');
  });

  test('node has required fields', () => {
    const r = buildImportDependencyGraph({ files: [makeFile('src/app.js', '')] });
    const n = r.nodes[0];
    expect(n).toHaveProperty('path');
    expect(n).toHaveProperty('language');
    expect(n).toHaveProperty('category');
    expect(n).toHaveProperty('inboundCount');
    expect(n).toHaveProperty('outboundCount');
  });

  test('node language matches file language', () => {
    const r = buildImportDependencyGraph({ files: [makeFile('src/app.ts', '', 'TypeScript')] });
    expect(r.nodes[0].language).toBe('TypeScript');
  });

  test('node inboundCount and outboundCount start at 0 for isolated file', () => {
    const r = buildImportDependencyGraph({ files: [makeFile('src/app.js', '')] });
    expect(r.nodes[0].inboundCount).toBe(0);
    expect(r.nodes[0].outboundCount).toBe(0);
  });

  test('nodes are sorted by path for determinism', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('z.js', ''), makeFile('a.js', ''), makeFile('m.js', '')],
    });
    const paths = r.nodes.map(n => n.path);
    expect(paths).toEqual([...paths].sort());
  });
});

// ── Static import parsing ─────────────────────────────────────────────────────

describe('buildImportDependencyGraph — static import', () => {
  test('import x from "./x" creates edge', () => {
    const files = [
      makeFile('src/app.js', "import foo from './utils';"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/utils.js', './utils', 'static'));
  });

  test('import { x } from "../x" resolves parent dir', () => {
    const files = [
      makeFile('src/components/Button.js', "import { helper } from '../utils';"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/components/Button.js', 'src/utils.js', '../utils', 'static'));
  });

  test('import with extension resolves directly', () => {
    const files = [
      makeFile('src/app.js', "import foo from './utils.js';"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/utils.js', './utils.js', 'static'));
  });

  test('import side-effect (no binding) creates edge with importType static', () => {
    const files = [
      makeFile('src/app.js', "import './styles.css';"),
      makeFile('src/styles.css', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/styles.css', './styles.css', 'static'));
  });

  test('inbound/outbound counts updated correctly', () => {
    const files = [
      makeFile('src/app.js', "import foo from './utils';"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const app   = r.nodes.find(n => n.path === 'src/app.js');
    const utils = r.nodes.find(n => n.path === 'src/utils.js');
    expect(app.outboundCount).toBe(1);
    expect(utils.inboundCount).toBe(1);
  });
});

// ── Require parsing ───────────────────────────────────────────────────────────

describe('buildImportDependencyGraph — require', () => {
  test('const x = require("./x") creates edge with importType require', () => {
    const files = [
      makeFile('src/app.js', "const utils = require('./utils');"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/utils.js', './utils', 'require'));
  });

  test('require("../x") resolves parent dir', () => {
    const files = [
      makeFile('src/routes/auth.js', "const db = require('../db');"),
      makeFile('src/db.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/routes/auth.js', 'src/db.js', '../db', 'require'));
  });

  test('bare require without assignment creates edge', () => {
    const files = [
      makeFile('src/app.js', "require('./polyfill');"),
      makeFile('src/polyfill.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/polyfill.js', './polyfill', 'require'));
  });
});

// ── Dynamic import parsing ────────────────────────────────────────────────────

describe('buildImportDependencyGraph — dynamic import', () => {
  test('import("./x") creates edge with importType dynamic', () => {
    const files = [
      makeFile('src/app.js', "const m = import('./module');"),
      makeFile('src/module.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/module.js', './module', 'dynamic'));
  });

  test('await import("./x") creates edge', () => {
    const files = [
      makeFile('src/app.js', "const m = await import('./module');"),
      makeFile('src/module.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/module.js', './module', 'dynamic'));
  });
});

// ── Export-from parsing ───────────────────────────────────────────────────────

describe('buildImportDependencyGraph — export-from', () => {
  test('export { x } from "./x" creates edge with importType export', () => {
    const files = [
      makeFile('src/index.js', "export { helper } from './utils';"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/index.js', 'src/utils.js', './utils', 'export'));
  });

  test('export * from "./x" creates edge with importType export', () => {
    const files = [
      makeFile('src/index.js', "export * from './utils';"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/index.js', 'src/utils.js', './utils', 'export'));
  });
});

// ── Extensionless resolution ──────────────────────────────────────────────────

describe('buildImportDependencyGraph — extensionless resolution', () => {
  test('import "./utils" resolves to utils.js', () => {
    const files = [
      makeFile('src/app.js', "import './utils';"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/utils.js', './utils', 'static'));
  });

  test('import "./utils" resolves to utils.ts', () => {
    const files = [
      makeFile('src/app.ts', "import './utils';", 'TypeScript'),
      makeFile('src/utils.ts', '', 'TypeScript'),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.ts', 'src/utils.ts', './utils', 'static'));
  });

  test('import "./utils" resolves to utils.tsx', () => {
    const files = [
      makeFile('src/app.ts', "import './utils';", 'TypeScript'),
      makeFile('src/utils.tsx', '', 'TypeScript'),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.ts', 'src/utils.tsx', './utils', 'static'));
  });

  test('import "./utils" resolves to utils.jsx', () => {
    const files = [
      makeFile('src/app.js', "import './utils';"),
      makeFile('src/utils.jsx', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/utils.jsx', './utils', 'static'));
  });

  test('import "./data" resolves to data.json', () => {
    const files = [
      makeFile('src/app.js', "import './data';"),
      makeFile('src/data.json', '', 'JSON'),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/data.json', './data', 'static'));
  });
});

// ── Directory index resolution ────────────────────────────────────────────────

describe('buildImportDependencyGraph — directory index resolution', () => {
  test('import "./foo" resolves to foo/index.js', () => {
    const files = [
      makeFile('src/app.js', "import './foo';"),
      makeFile('src/foo/index.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/foo/index.js', './foo', 'static'));
  });

  test('import "./foo" resolves to foo/index.ts', () => {
    const files = [
      makeFile('src/app.ts', "import './foo';", 'TypeScript'),
      makeFile('src/foo/index.ts', '', 'TypeScript'),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.ts', 'src/foo/index.ts', './foo', 'static'));
  });

  test('direct extension takes priority over index resolution', () => {
    const files = [
      makeFile('src/app.js', "import './foo';"),
      makeFile('src/foo.js', ''),
      makeFile('src/foo/index.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const fooEdges = r.edges.filter(e => e.from === 'src/app.js' && e.importPath === './foo');
    expect(fooEdges.length).toBe(1);
    expect(fooEdges[0].to).toBe('src/foo.js');
  });
});

// ── Windows path normalization ────────────────────────────────────────────────

describe('buildImportDependencyGraph — Windows paths', () => {
  test('file path with backslashes is normalized', () => {
    const r = buildImportDependencyGraph({
      files: [{ path: 'src\\app.js', content: '', language: 'JavaScript' }],
    });
    expect(r.nodes[0].path).toBe('src/app.js');
  });

  test('import with backslash-normalized file still resolves', () => {
    const files = [
      { path: 'src\\app.js', content: "import './utils';", language: 'JavaScript' },
      { path: 'src\\utils.js', content: '', language: 'JavaScript' },
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/utils.js', './utils', 'static'));
  });
});

// ── External dependencies ─────────────────────────────────────────────────────

describe('buildImportDependencyGraph — external dependencies', () => {
  test('import from "react" is captured as external, not an edge', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('src/app.jsx', "import React from 'react';")],
    });
    expect(r.edges.length).toBe(0);
    expect(r.couplingMetrics.externalDependencyCount).toBeGreaterThan(0);
  });

  test('require("express") is captured as external', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('server.js', "const express = require('express');")],
    });
    expect(r.couplingMetrics.externalDependencyCount).toBeGreaterThan(0);
    expect(r.edges.length).toBe(0);
  });

  test('external import appears in unresolvedImports with reason external', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('src/app.js', "import lodash from 'lodash';")],
    });
    const u = r.unresolvedImports.find(u => u.importPath === 'lodash');
    expect(u).toBeDefined();
    expect(u.reason).toBe('external');
  });

  test('external dependency count matches distinct external packages', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('src/app.js', "import React from 'react';\nimport lodash from 'lodash';")],
    });
    expect(r.couplingMetrics.externalDependencyCount).toBe(2);
  });
});

// ── Missing relative imports ──────────────────────────────────────────────────

describe('buildImportDependencyGraph — missing relative imports', () => {
  test('relative import to non-existent file → unresolved reason missing', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('src/app.js', "import './ghost';")],
    });
    const u = r.unresolvedImports.find(u => u.from === 'src/app.js' && u.importPath === './ghost');
    expect(u).toBeDefined();
    expect(u.reason).toBe('missing');
  });

  test('missing import does NOT create an edge', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('src/app.js', "import './ghost';")],
    });
    expect(r.edges.length).toBe(0);
  });

  test('unresolvedCount in metrics equals total unresolved items', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('src/app.js', "import './ghost';\nimport './phantom';")],
    });
    expect(r.couplingMetrics.unresolvedCount).toBe(r.unresolvedImports.length);
  });
});

// ── JSON imports ──────────────────────────────────────────────────────────────

describe('buildImportDependencyGraph — JSON imports', () => {
  test('import "./config.json" creates edge to JSON node', () => {
    const files = [
      makeFile('src/app.js', "import config from './config.json';"),
      makeFile('src/config.json', '{}', 'JSON'),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.js', 'src/config.json', './config.json', 'static'));
  });
});

// ── TypeScript/TSX imports ────────────────────────────────────────────────────

describe('buildImportDependencyGraph — TypeScript/TSX', () => {
  test('TS import from "./service" resolves service.ts', () => {
    const files = [
      makeFile('src/app.ts', "import { AuthService } from './service';", 'TypeScript'),
      makeFile('src/service.ts', '', 'TypeScript'),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/app.ts', 'src/service.ts', './service', 'static'));
  });

  test('TSX import resolves', () => {
    const files = [
      makeFile('src/App.tsx', "import Button from './Button';", 'TypeScript'),
      makeFile('src/Button.tsx', '', 'TypeScript'),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges).toContainEqual(edge('src/App.tsx', 'src/Button.tsx', './Button', 'static'));
  });
});

// ── Comment suppression ───────────────────────────────────────────────────────

describe('buildImportDependencyGraph — no false positives from comments', () => {
  test('line-comment import is not parsed as an edge', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('src/app.js', "// import foo from './utils';")],
    });
    expect(r.edges.length).toBe(0);
    expect(r.unresolvedImports.length).toBe(0);
  });

  test('block-comment import is not parsed as an edge', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('src/app.js', "/* import foo from './utils'; */")],
    });
    expect(r.edges.length).toBe(0);
  });

  test('real import after comment line is still parsed', () => {
    const files = [
      makeFile('src/app.js', "// import foo from './ghost';\nimport bar from './utils';"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges.length).toBe(1);
    expect(r.edges[0].to).toBe('src/utils.js');
  });
});

// ── Circular dependency detection ─────────────────────────────────────────────

describe('buildImportDependencyGraph — circular dependencies', () => {
  test('A → B → A is detected as circular', () => {
    const files = [
      makeFile('src/a.js', "import './b';"),
      makeFile('src/b.js', "import './a';"),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.circularDependencies.length).toBeGreaterThan(0);
    expect(r.couplingMetrics.circularDependencyCount).toBeGreaterThan(0);
  });

  test('cycle includes length field', () => {
    const files = [
      makeFile('src/a.js', "import './b';"),
      makeFile('src/b.js', "import './a';"),
    ];
    const r = buildImportDependencyGraph({ files });
    const cyc = r.circularDependencies[0];
    expect(typeof cyc.length).toBe('number');
    expect(cyc.length).toBeGreaterThan(0);
  });

  test('cycle includes cycle array', () => {
    const files = [
      makeFile('src/a.js', "import './b';"),
      makeFile('src/b.js', "import './a';"),
    ];
    const r = buildImportDependencyGraph({ files });
    const cyc = r.circularDependencies[0];
    expect(Array.isArray(cyc.cycle)).toBe(true);
    expect(cyc.cycle.length).toBeGreaterThan(1);
  });

  test('no circularity in linear chain A → B → C', () => {
    const files = [
      makeFile('src/a.js', "import './b';"),
      makeFile('src/b.js', "import './c';"),
      makeFile('src/c.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.circularDependencies.length).toBe(0);
  });

  test('A → B → C → A is detected', () => {
    const files = [
      makeFile('src/a.js', "import './b';"),
      makeFile('src/b.js', "import './c';"),
      makeFile('src/c.js', "import './a';"),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.circularDependencies.length).toBeGreaterThan(0);
  });
});

// ── Boundary hints ────────────────────────────────────────────────────────────

describe('buildImportDependencyGraph — boundaryHints', () => {
  test('frontend importing from backend triggers frontend_imports_backend hint', () => {
    const files = [
      makeFile('src/App.jsx', "import server from '../server';"),
      makeFile('server.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const hint = r.boundaryHints.find(h => h.type === 'frontend_imports_backend');
    expect(hint).toBeDefined();
    expect(hint.severity).toBeDefined();
  });

  test('backend importing from frontend triggers backend_imports_frontend hint', () => {
    const files = [
      makeFile('server.js', "import App from './src/App';"),
      makeFile('src/App.jsx', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const hint = r.boundaryHints.find(h => h.type === 'backend_imports_frontend');
    expect(hint).toBeDefined();
  });

  test('model importing from routes triggers model_imports_route hint', () => {
    const files = [
      makeFile('models/User.js', "import router from '../routes/auth';"),
      makeFile('routes/auth.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const hint = r.boundaryHints.find(h => h.type === 'model_imports_route');
    expect(hint).toBeDefined();
  });

  test('service importing from routes triggers service_imports_route hint', () => {
    const files = [
      makeFile('services/Auth.js', "import router from '../routes/auth';"),
      makeFile('routes/auth.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const hint = r.boundaryHints.find(h => h.type === 'service_imports_route');
    expect(hint).toBeDefined();
  });

  test('boundary hint has summary field (non-empty string)', () => {
    const files = [
      makeFile('src/App.jsx', "import server from '../server';"),
      makeFile('server.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const hint = r.boundaryHints[0];
    expect(typeof hint.summary).toBe('string');
    expect(hint.summary.length).toBeGreaterThan(0);
  });

  test('boundary hint has files array', () => {
    const files = [
      makeFile('src/App.jsx', "import server from '../server';"),
      makeFile('server.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const hint = r.boundaryHints[0];
    expect(Array.isArray(hint.files)).toBe(true);
  });

  test('no boundary hints for well-structured project', () => {
    const files = [
      makeFile('src/App.jsx', "import { login } from './api/auth';"),
      makeFile('src/api/auth.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    // No cross-boundary violations — all within src/
    const criticalHints = r.boundaryHints.filter(h =>
      ['frontend_imports_backend', 'backend_imports_frontend', 'model_imports_route'].includes(h.type)
    );
    expect(criticalHints.length).toBe(0);
  });
});

// ── High fan-in / fan-out ─────────────────────────────────────────────────────

describe('buildImportDependencyGraph — fan-in/fan-out metrics', () => {
  test('file imported by many others appears in highFanInFiles', () => {
    const files = [
      makeFile('src/utils.js', ''),
      makeFile('src/a.js', "import './utils';"),
      makeFile('src/b.js', "import './utils';"),
      makeFile('src/c.js', "import './utils';"),
      makeFile('src/d.js', "import './utils';"),
      makeFile('src/e.js', "import './utils';"),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.couplingMetrics.highFanInFiles).toContain('src/utils.js');
  });

  test('file importing many others appears in highFanOutFiles', () => {
    const content = [
      "import './a';",
      "import './b';",
      "import './c';",
      "import './d';",
      "import './e';",
    ].join('\n');
    const files = [
      makeFile('src/god.js', content),
      makeFile('src/a.js', ''),
      makeFile('src/b.js', ''),
      makeFile('src/c.js', ''),
      makeFile('src/d.js', ''),
      makeFile('src/e.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.couplingMetrics.highFanOutFiles).toContain('src/god.js');
  });

  test('averageOutDegree is totalEdges / totalNodes', () => {
    const files = [
      makeFile('src/app.js', "import './utils';"),
      makeFile('src/utils.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const expected = r.couplingMetrics.totalEdges / r.couplingMetrics.totalNodes;
    expect(r.couplingMetrics.averageOutDegree).toBeCloseTo(expected);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('buildImportDependencyGraph — determinism', () => {
  test('same input produces identical output', () => {
    const files = [
      makeFile('src/app.js', "import './utils';\nimport './config';"),
      makeFile('src/utils.js', "import './helpers';"),
      makeFile('src/helpers.js', ''),
      makeFile('src/config.js', ''),
    ];
    const r1 = buildImportDependencyGraph({ files });
    const r2 = buildImportDependencyGraph({ files });
    expect(r1).toEqual(r2);
  });

  test('edges are sorted deterministically (from ASC, to ASC)', () => {
    const files = [
      makeFile('src/app.js', "import './b';\nimport './a';"),
      makeFile('src/a.js', ''),
      makeFile('src/b.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const tos = r.edges.map(e => e.to);
    const sorted = [...tos].sort();
    expect(tos).toEqual(sorted);
  });

  test('unresolvedImports are sorted (from ASC, importPath ASC)', () => {
    const r = buildImportDependencyGraph({
      files: [makeFile('src/app.js', "import './zzz';\nimport './aaa';")],
    });
    const paths = r.unresolvedImports.map(u => u.importPath);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('buildImportDependencyGraph — non-mutation', () => {
  test('input files array is not mutated', () => {
    const files = [
      makeFile('src/app.js', "import './utils';"),
      makeFile('src/utils.js', ''),
    ];
    const originalPaths = files.map(f => f.path);
    buildImportDependencyGraph({ files });
    files.forEach((f, i) => expect(f.path).toBe(originalPaths[i]));
  });

  test('input object is not mutated', () => {
    const input = { files: [makeFile('src/app.js', '')] };
    const originalLen = input.files.length;
    buildImportDependencyGraph(input);
    expect(input.files.length).toBe(originalLen);
  });
});

// ── Multiple import types same file ──────────────────────────────────────────

describe('buildImportDependencyGraph — multiple imports in one file', () => {
  test('multiple distinct imports each create separate edges', () => {
    const files = [
      makeFile('src/app.js', "import a from './a';\nconst b = require('./b');\nconst c = import('./c');"),
      makeFile('src/a.js', ''),
      makeFile('src/b.js', ''),
      makeFile('src/c.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    expect(r.edges.filter(e => e.from === 'src/app.js').length).toBe(3);
  });

  test('outboundCount reflects all resolved imports from a file', () => {
    const files = [
      makeFile('src/app.js', "import a from './a';\nimport b from './b';"),
      makeFile('src/a.js', ''),
      makeFile('src/b.js', ''),
    ];
    const r = buildImportDependencyGraph({ files });
    const app = r.nodes.find(n => n.path === 'src/app.js');
    expect(app.outboundCount).toBe(2);
  });
});

// ── Output shape ──────────────────────────────────────────────────────────────

describe('buildImportDependencyGraph — output shape', () => {
  test('all top-level keys present', () => {
    const r = buildImportDependencyGraph({ files: [] });
    expect(r).toHaveProperty('nodes');
    expect(r).toHaveProperty('edges');
    expect(r).toHaveProperty('unresolvedImports');
    expect(r).toHaveProperty('circularDependencies');
    expect(r).toHaveProperty('boundaryHints');
    expect(r).toHaveProperty('couplingMetrics');
    expect(r).toHaveProperty('summary');
  });

  test('all couplingMetrics keys present', () => {
    const r = buildImportDependencyGraph({ files: [] });
    const m = r.couplingMetrics;
    expect(m).toHaveProperty('totalNodes');
    expect(m).toHaveProperty('totalEdges');
    expect(m).toHaveProperty('unresolvedCount');
    expect(m).toHaveProperty('externalDependencyCount');
    expect(m).toHaveProperty('circularDependencyCount');
    expect(m).toHaveProperty('averageOutDegree');
    expect(m).toHaveProperty('highFanOutFiles');
    expect(m).toHaveProperty('highFanInFiles');
  });
});
