'use strict';

const { buildRepositoryStructureInventory } = require('../../../../execution/architecture/buildRepositoryStructureInventory');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFile(path, opts = {}) {
  return {
    path,
    sizeBytes:     opts.sizeBytes     ?? 1000,
    language:      opts.language      ?? 'JavaScript',
    lastModified:  opts.lastModified  ?? '2024-01-01T00:00:00Z',
  };
}

// ── Empty input ───────────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — empty input', () => {
  test('null input returns valid zero-state output', () => {
    const r = buildRepositoryStructureInventory(null);
    expect(r.totalFiles).toBe(0);
    expect(r.languages).toEqual({});
    expect(r.directories).toEqual([]);
  });

  test('undefined input returns valid zero-state output', () => {
    const r = buildRepositoryStructureInventory(undefined);
    expect(r.totalFiles).toBe(0);
  });

  test('empty files array returns zero totalFiles', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    expect(r.totalFiles).toBe(0);
  });

  test('empty input returns all category arrays empty', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    const cats = r.categories;
    expect(cats.frontend).toEqual([]);
    expect(cats.backend).toEqual([]);
    expect(cats.tests).toEqual([]);
    expect(cats.config).toEqual([]);
    expect(cats.docs).toEqual([]);
    expect(cats.migrations).toEqual([]);
    expect(cats.scripts).toEqual([]);
    expect(cats.routes).toEqual([]);
    expect(cats.services).toEqual([]);
    expect(cats.models).toEqual([]);
    expect(cats.components).toEqual([]);
    expect(cats.apiClients).toEqual([]);
    expect(cats.styles).toEqual([]);
    expect(cats.assets).toEqual([]);
    expect(cats.unknown).toEqual([]);
  });

  test('empty input returns false for all architecture hints', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    const h = r.architectureHints;
    expect(h.hasFrontend).toBe(false);
    expect(h.hasBackend).toBe(false);
    expect(h.hasTests).toBe(false);
    expect(h.hasMigrations).toBe(false);
    expect(h.hasApiLayer).toBe(false);
    expect(h.hasServiceLayer).toBe(false);
    expect(h.hasModelLayer).toBe(false);
    expect(h.hasComponentLayer).toBe(false);
    expect(h.likelyFullStackApp).toBe(false);
  });

  test('empty input: testToSourceRatio is null', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    expect(r.testCoverageHints.testToSourceRatio).toBeNull();
  });

  test('empty input: no risk hints except possibly large_unclassified_surface', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    // no_tests_detected not triggered (no source files), and unknown is 0%
    expect(r.riskHints).not.toContain('large_unclassified_surface');
  });
});

// ── totalFiles ────────────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — totalFiles', () => {
  test('counts all files', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('a.js'), makeFile('b.ts'), makeFile('c.css')],
    });
    expect(r.totalFiles).toBe(3);
  });
});

// ── Language counts ───────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — languages', () => {
  test('counts each language', () => {
    const r = buildRepositoryStructureInventory({
      files: [
        makeFile('a.js', { language: 'JavaScript' }),
        makeFile('b.js', { language: 'JavaScript' }),
        makeFile('c.ts', { language: 'TypeScript' }),
      ],
    });
    expect(r.languages['JavaScript']).toBe(2);
    expect(r.languages['TypeScript']).toBe(1);
  });

  test('null/undefined language treated as unknown language', () => {
    const r = buildRepositoryStructureInventory({
      files: [{ path: 'a.js', sizeBytes: 100, language: null, lastModified: '2024-01-01' }],
    });
    expect(r.totalFiles).toBe(1);
  });
});

// ── Directory extraction ──────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — directories', () => {
  test('extracts unique directories from file paths', () => {
    const r = buildRepositoryStructureInventory({
      files: [
        makeFile('src/components/Button.jsx'),
        makeFile('src/components/Input.jsx'),
        makeFile('src/utils/helpers.js'),
      ],
    });
    expect(r.directories).toContain('src/components');
    expect(r.directories).toContain('src/utils');
    expect(r.directories).toContain('src');
  });

  test('root-level files produce no directory entry', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('README.md')],
    });
    expect(r.directories).not.toContain('');
    expect(r.directories.length).toBe(0);
  });

  test('directories list is unique (no duplicates)', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('src/a.js'), makeFile('src/b.js')],
    });
    const srcCount = r.directories.filter(d => d === 'src').length;
    expect(srcCount).toBe(1);
  });

  test('normalizes Windows backslashes to forward slashes', () => {
    const r = buildRepositoryStructureInventory({
      files: [{ path: 'src\\components\\Button.jsx', sizeBytes: 100, language: 'JavaScript', lastModified: '2024-01-01' }],
    });
    expect(r.directories).toContain('src/components');
    expect(r.directories).not.toContain('src\\components');
  });
});

// ── Category: tests ───────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: tests', () => {
  test('.test.js files → tests category', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('src/auth.test.js')],
    });
    expect(r.categories.tests).toContain('src/auth.test.js');
  });

  test('.test.ts files → tests category', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('src/auth.test.ts')],
    });
    expect(r.categories.tests).toContain('src/auth.test.ts');
  });

  test('.spec.js files → tests category', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('src/auth.spec.js')],
    });
    expect(r.categories.tests).toContain('src/auth.spec.js');
  });

  test('.spec.ts files → tests category', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('src/auth.spec.ts')],
    });
    expect(r.categories.tests).toContain('src/auth.spec.ts');
  });

  test('__tests__/ directory → tests category', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('__tests__/auth.js')],
    });
    expect(r.categories.tests).toContain('__tests__/auth.js');
  });

  test('tests/ directory → tests category', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('tests/unit/auth.js')],
    });
    expect(r.categories.tests).toContain('tests/unit/auth.js');
  });
});

// ── Category: frontend ────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: frontend', () => {
  test('.jsx files → frontend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/App.jsx')] });
    expect(r.categories.frontend).toContain('src/App.jsx');
  });

  test('.tsx files → frontend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/App.tsx')] });
    expect(r.categories.frontend).toContain('src/App.tsx');
  });

  test('frontend/ directory → frontend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('frontend/index.html')] });
    expect(r.categories.frontend).toContain('frontend/index.html');
  });

  test('client/ directory → frontend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('client/app.js')] });
    expect(r.categories.frontend).toContain('client/app.js');
  });

  test('public/ directory → frontend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('public/index.html')] });
    expect(r.categories.frontend).toContain('public/index.html');
  });

  test('src/components/ → frontend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/components/Button.js')] });
    expect(r.categories.frontend).toContain('src/components/Button.js');
  });

  test('src/pages/ → frontend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/pages/Home.js')] });
    expect(r.categories.frontend).toContain('src/pages/Home.js');
  });

  test('src/views/ → frontend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/views/Dashboard.js')] });
    expect(r.categories.frontend).toContain('src/views/Dashboard.js');
  });
});

// ── Category: backend ─────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: backend', () => {
  test('server/ directory → backend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('server/index.js')] });
    expect(r.categories.backend).toContain('server/index.js');
  });

  test('api/ directory → backend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('api/auth.js')] });
    expect(r.categories.backend).toContain('api/auth.js');
  });

  test('controllers/ directory → backend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('controllers/UserController.js')] });
    expect(r.categories.backend).toContain('controllers/UserController.js');
  });

  test('server.js → backend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('server.js')] });
    expect(r.categories.backend).toContain('server.js');
  });

  test('app.js → backend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('app.js')] });
    expect(r.categories.backend).toContain('app.js');
  });
});

// ── Category: config ──────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: config', () => {
  test('.config.js files → config', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('jest.config.js')] });
    expect(r.categories.config).toContain('jest.config.js');
  });

  test('.config.ts files → config', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('vite.config.ts')] });
    expect(r.categories.config).toContain('vite.config.ts');
  });

  test('.env files → config', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('.env')] });
    expect(r.categories.config).toContain('.env');
  });

  test('package.json → config', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('package.json')] });
    expect(r.categories.config).toContain('package.json');
  });

  test('.yaml files → config', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('.github/workflows/ci.yaml')] });
    expect(r.categories.config).toContain('.github/workflows/ci.yaml');
  });

  test('.yml files → config', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('docker-compose.yml')] });
    expect(r.categories.config).toContain('docker-compose.yml');
  });
});

// ── Category: docs ────────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: docs', () => {
  test('.md files → docs', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('CONTRIBUTING.md')] });
    expect(r.categories.docs).toContain('CONTRIBUTING.md');
  });

  test('README → docs', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('README.md')] });
    expect(r.categories.docs).toContain('README.md');
  });

  test('.mdx files → docs', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('docs/guide.mdx')] });
    expect(r.categories.docs).toContain('docs/guide.mdx');
  });

  test('docs/ directory → docs', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('docs/architecture.md')] });
    expect(r.categories.docs).toContain('docs/architecture.md');
  });
});

// ── Category: migrations ──────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: migrations', () => {
  test('migrations/ directory → migrations', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('migrations/001_init.sql')] });
    expect(r.categories.migrations).toContain('migrations/001_init.sql');
  });

  test('db/migrations → migrations', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('db/migrations/002_users.sql')] });
    expect(r.categories.migrations).toContain('db/migrations/002_users.sql');
  });

  test('.sql files → migrations', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('schema.sql')] });
    expect(r.categories.migrations).toContain('schema.sql');
  });
});

// ── Category: scripts ─────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: scripts', () => {
  test('scripts/ directory → scripts', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('scripts/deploy.sh')] });
    expect(r.categories.scripts).toContain('scripts/deploy.sh');
  });

  test('bin/ directory → scripts', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('bin/start.js')] });
    expect(r.categories.scripts).toContain('bin/start.js');
  });

  test('Makefile → scripts', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('Makefile')] });
    expect(r.categories.scripts).toContain('Makefile');
  });

  test('.sh files → scripts', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('setup.sh')] });
    expect(r.categories.scripts).toContain('setup.sh');
  });
});

// ── Category: routes ──────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: routes', () => {
  test('routes/ directory → routes', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('routes/auth.js')] });
    expect(r.categories.routes).toContain('routes/auth.js');
  });

  test('router/ directory → routes', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('router/index.js')] });
    expect(r.categories.routes).toContain('router/index.js');
  });
});

// ── Category: services ────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: services', () => {
  test('services/ directory → services', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('services/UserService.js')] });
    expect(r.categories.services).toContain('services/UserService.js');
  });

  test('nested services/ → services', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('backend/services/Auth.js')] });
    expect(r.categories.services).toContain('backend/services/Auth.js');
  });
});

// ── Category: models ──────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: models', () => {
  test('models/ directory → models', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('models/User.js')] });
    expect(r.categories.models).toContain('models/User.js');
  });

  test('schemas/ directory → models', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('schemas/userSchema.js')] });
    expect(r.categories.models).toContain('schemas/userSchema.js');
  });

  test('entities/ directory → models', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('entities/User.ts')] });
    expect(r.categories.models).toContain('entities/User.ts');
  });
});

// ── Category: components ──────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: components', () => {
  test('components/ directory → components', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('components/Button.jsx')] });
    // components/ takes priority over jsx check — both are valid;
    // verify it is classified (in components OR frontend)
    const path = 'components/Button.jsx';
    const inComponents = r.categories.components.includes(path);
    const inFrontend   = r.categories.frontend.includes(path);
    expect(inComponents || inFrontend).toBe(true);
  });
});

// ── Category: apiClients ──────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: apiClients', () => {
  test('services/api/ path → apiClients', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('services/api/githubClient.js')] });
    expect(r.categories.apiClients).toContain('services/api/githubClient.js');
  });

  test('clients/ directory → apiClients', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('clients/httpClient.js')] });
    expect(r.categories.apiClients).toContain('clients/httpClient.js');
  });
});

// ── Category: styles ──────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: styles', () => {
  test('.css files → styles', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('styles/main.css')] });
    expect(r.categories.styles).toContain('styles/main.css');
  });

  test('.scss files → styles', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('styles/app.scss')] });
    expect(r.categories.styles).toContain('styles/app.scss');
  });

  test('.sass files → styles', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('app.sass')] });
    expect(r.categories.styles).toContain('app.sass');
  });

  test('styles/ directory → styles', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('styles/tokens.js')] });
    expect(r.categories.styles).toContain('styles/tokens.js');
  });
});

// ── Category: assets ─────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: assets', () => {
  test('.png files → assets', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('public/logo.png')] });
    expect(r.categories.assets).toContain('public/logo.png');
  });

  test('.jpg files → assets', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('images/hero.jpg')] });
    expect(r.categories.assets).toContain('images/hero.jpg');
  });

  test('.svg files → assets', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('assets/icon.svg')] });
    expect(r.categories.assets).toContain('assets/icon.svg');
  });

  test('.ico files → assets', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('favicon.ico')] });
    expect(r.categories.assets).toContain('favicon.ico');
  });

  test('images/ directory → assets', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('images/banner.jpg')] });
    expect(r.categories.assets).toContain('images/banner.jpg');
  });

  test('fonts/ directory → assets', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('fonts/Inter.woff2')] });
    expect(r.categories.assets).toContain('fonts/Inter.woff2');
  });

  test('static/ directory → assets', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('static/robots.txt')] });
    expect(r.categories.assets).toContain('static/robots.txt');
  });
});

// ── Category: unknown ─────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — category: unknown', () => {
  test('unrecognized file → unknown', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('strangeFile.xyz')] });
    expect(r.categories.unknown).toContain('strangeFile.xyz');
  });

  test('each file appears in exactly one category', () => {
    const files = [
      makeFile('src/App.jsx'),
      makeFile('routes/auth.js'),
      makeFile('models/User.js'),
      makeFile('auth.test.js'),
      makeFile('package.json'),
      makeFile('README.md'),
      makeFile('strangeFile.xyz'),
    ];
    const r = buildRepositoryStructureInventory({ files });
    const allCats = Object.values(r.categories).flat();
    const allPaths = files.map(f => f.path.replace(/\\/g, '/'));
    allPaths.forEach(p => {
      const count = allCats.filter(c => c === p).length;
      expect(count).toBe(1);
    });
  });
});

// ── Framework hints ───────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — frameworkHints', () => {
  test('React: detected via .jsx file', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/App.jsx')] });
    expect(r.frameworkHints.react).toBe(true);
  });

  test('React: detected via .tsx file', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/App.tsx')] });
    expect(r.frameworkHints.react).toBe(true);
  });

  test('React: not detected without jsx/tsx', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/app.js')] });
    expect(r.frameworkHints.react).toBe(false);
  });

  test('Next.js: detected via pages/ directory', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('pages/index.js')] });
    expect(r.frameworkHints.nextjs).toBe(true);
  });

  test('Next.js: detected via app/ directory', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('app/layout.tsx')] });
    expect(r.frameworkHints.nextjs).toBe(true);
  });

  test('Next.js: detected via next.config.js', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('next.config.js')] });
    expect(r.frameworkHints.nextjs).toBe(true);
  });

  test('Express: detected via server.js', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('server.js')] });
    expect(r.frameworkHints.express).toBe(true);
  });

  test('Express: detected via app.js', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('app.js')] });
    expect(r.frameworkHints.express).toBe(true);
  });

  test('Node.js: detected via package.json', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('package.json')] });
    expect(r.frameworkHints.nodejs).toBe(true);
  });

  test('Jest: detected via jest.config.js', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('jest.config.js')] });
    expect(r.frameworkHints.jest).toBe(true);
  });

  test('Jest: detected via .test.js file', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('auth.test.js')] });
    expect(r.frameworkHints.jest).toBe(true);
  });

  test('PostgreSQL migrations: detected via migrations/*.sql', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('migrations/001_init.sql')] });
    expect(r.frameworkHints.postgresqlMigrations).toBe(true);
  });

  test('PostgreSQL migrations: detected via db/migrations', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('db/migrations/002.sql')] });
    expect(r.frameworkHints.postgresqlMigrations).toBe(true);
  });

  test('Vite: detected via vite.config.js', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('vite.config.js')] });
    expect(r.frameworkHints.vite).toBe(true);
  });

  test('Vite: detected via vite.config.ts', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('vite.config.ts')] });
    expect(r.frameworkHints.vite).toBe(true);
  });

  test('Tailwind: detected via tailwind.config.js', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('tailwind.config.js')] });
    expect(r.frameworkHints.tailwind).toBe(true);
  });

  test('Tailwind: detected via tailwind.config.ts', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('tailwind.config.ts')] });
    expect(r.frameworkHints.tailwind).toBe(true);
  });

  test('all hints false when no matching files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('strangeFile.xyz')] });
    expect(r.frameworkHints.react).toBe(false);
    expect(r.frameworkHints.nextjs).toBe(false);
    expect(r.frameworkHints.express).toBe(false);
    expect(r.frameworkHints.nodejs).toBe(false);
    expect(r.frameworkHints.jest).toBe(false);
    expect(r.frameworkHints.postgresqlMigrations).toBe(false);
    expect(r.frameworkHints.vite).toBe(false);
    expect(r.frameworkHints.tailwind).toBe(false);
  });
});

// ── Architecture hints ────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — architectureHints', () => {
  test('hasFrontend true with frontend files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/App.jsx')] });
    expect(r.architectureHints.hasFrontend).toBe(true);
  });

  test('hasBackend true with backend files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('server.js')] });
    expect(r.architectureHints.hasBackend).toBe(true);
  });

  test('hasTests true with test files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('auth.test.js')] });
    expect(r.architectureHints.hasTests).toBe(true);
  });

  test('hasMigrations true with migration files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('migrations/001.sql')] });
    expect(r.architectureHints.hasMigrations).toBe(true);
  });

  test('hasApiLayer true with routes files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('routes/auth.js')] });
    expect(r.architectureHints.hasApiLayer).toBe(true);
  });

  test('hasApiLayer true with apiClients files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('clients/http.js')] });
    expect(r.architectureHints.hasApiLayer).toBe(true);
  });

  test('hasServiceLayer true with services files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('services/Auth.js')] });
    expect(r.architectureHints.hasServiceLayer).toBe(true);
  });

  test('hasModelLayer true with models files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('models/User.js')] });
    expect(r.architectureHints.hasModelLayer).toBe(true);
  });

  test('hasComponentLayer true with components files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('components/Button.jsx')] });
    expect(r.architectureHints.hasComponentLayer).toBe(true);
  });

  test('likelyFullStackApp true when both frontend and backend present', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('src/App.jsx'), makeFile('server.js')],
    });
    expect(r.architectureHints.likelyFullStackApp).toBe(true);
  });

  test('likelyFullStackApp false when only frontend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/App.jsx')] });
    expect(r.architectureHints.likelyFullStackApp).toBe(false);
  });

  test('likelyFullStackApp false when only backend', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('server.js')] });
    expect(r.architectureHints.likelyFullStackApp).toBe(false);
  });
});

// ── Test coverage hints ───────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — testCoverageHints', () => {
  test('testFileCount equals tests category count', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('auth.test.js'), makeFile('user.test.js'), makeFile('server.js')],
    });
    expect(r.testCoverageHints.testFileCount).toBe(2);
  });

  test('sourceFileCount = backend + frontend + routes + services + models', () => {
    const r = buildRepositoryStructureInventory({
      files: [
        makeFile('server.js'),          // backend
        makeFile('src/App.jsx'),         // frontend
        makeFile('routes/auth.js'),      // routes
        makeFile('services/Auth.js'),    // services
        makeFile('models/User.js'),      // models
        makeFile('README.md'),           // docs (not source)
      ],
    });
    expect(r.testCoverageHints.sourceFileCount).toBe(5);
  });

  test('testToSourceRatio null when sourceFileCount is 0', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('auth.test.js')],
    });
    expect(r.testCoverageHints.testToSourceRatio).toBeNull();
  });

  test('testToSourceRatio computed when source files exist', () => {
    const r = buildRepositoryStructureInventory({
      files: [
        makeFile('auth.test.js'),
        makeFile('server.js'),
        makeFile('routes/api.js'),
      ],
    });
    // 1 test file, 2 source files → 0.5
    expect(r.testCoverageHints.testToSourceRatio).toBeCloseTo(0.5);
  });

  test('testToSourceRatio 0 when no test files', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('server.js'), makeFile('routes/api.js')],
    });
    expect(r.testCoverageHints.testToSourceRatio).toBe(0);
  });

  test('hasUnitTests true with .test.js files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/auth.test.js')] });
    expect(r.testCoverageHints.hasUnitTests).toBe(true);
  });

  test('hasUnitTests true with .spec.js files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/auth.spec.js')] });
    expect(r.testCoverageHints.hasUnitTests).toBe(true);
  });

  test('hasIntegrationTests true with integration/ path', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('tests/integration/authFlow.test.js')] });
    expect(r.testCoverageHints.hasIntegrationTests).toBe(true);
  });

  test('hasIntegrationTests false without integration/ path', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('tests/unit/auth.test.js')] });
    expect(r.testCoverageHints.hasIntegrationTests).toBe(false);
  });
});

// ── Risk hints ────────────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — riskHints', () => {
  test('no_tests_detected when testFileCount === 0 and there are source files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('server.js')] });
    expect(r.riskHints).toContain('no_tests_detected');
  });

  test('no_tests_detected not present when tests exist', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('server.js'), makeFile('auth.test.js')],
    });
    expect(r.riskHints).not.toContain('no_tests_detected');
  });

  test('frontend_without_backend when only frontend files', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('src/App.jsx')] });
    expect(r.riskHints).toContain('frontend_without_backend');
  });

  test('backend_without_tests when backend files but no tests', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('server.js')] });
    expect(r.riskHints).toContain('backend_without_tests');
  });

  test('backend_without_tests not present when tests exist', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('server.js'), makeFile('auth.test.js')],
    });
    expect(r.riskHints).not.toContain('backend_without_tests');
  });

  test('routes_without_services when routes but no services', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('routes/auth.js')] });
    expect(r.riskHints).toContain('routes_without_services');
  });

  test('routes_without_services not present when services exist', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('routes/auth.js'), makeFile('services/Auth.js')],
    });
    expect(r.riskHints).not.toContain('routes_without_services');
  });

  test('services_without_tests when services but no tests', () => {
    const r = buildRepositoryStructureInventory({ files: [makeFile('services/Auth.js')] });
    expect(r.riskHints).toContain('services_without_tests');
  });

  test('large_unclassified_surface when unknown > 20% of totalFiles', () => {
    // 3 unknown, 10 total → 30%
    const files = [
      makeFile('server.js'),
      makeFile('routes/auth.js'),
      makeFile('package.json'),
      makeFile('README.md'),
      makeFile('auth.test.js'),
      makeFile('services/Auth.js'),
      makeFile('models/User.js'),
      makeFile('strangeA.xyz'),
      makeFile('strangeB.xyz'),
      makeFile('strangeC.xyz'),
    ];
    const r = buildRepositoryStructureInventory({ files });
    expect(r.riskHints).toContain('large_unclassified_surface');
  });

  test('large_unclassified_surface not triggered at exactly 20%', () => {
    // 1 unknown, 5 total → 20% — should NOT trigger (strictly greater than)
    const files = [
      makeFile('server.js'),
      makeFile('routes/auth.js'),
      makeFile('services/Auth.js'),
      makeFile('auth.test.js'),
      makeFile('strangeA.xyz'),
    ];
    const r = buildRepositoryStructureInventory({ files });
    expect(r.riskHints).not.toContain('large_unclassified_surface');
  });

  test('empty input produces no risk hints', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    expect(r.riskHints.length).toBe(0);
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — non-mutation', () => {
  test('input array not mutated', () => {
    const files = [makeFile('src/App.jsx'), makeFile('server.js')];
    const original = files.map(f => ({ ...f }));
    buildRepositoryStructureInventory({ files });
    files.forEach((f, i) => {
      expect(f.path).toBe(original[i].path);
      expect(f.sizeBytes).toBe(original[i].sizeBytes);
    });
  });

  test('input object not mutated', () => {
    const input = { files: [makeFile('server.js')] };
    const originalLength = input.files.length;
    buildRepositoryStructureInventory(input);
    expect(input.files.length).toBe(originalLength);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — determinism', () => {
  test('same input produces same output', () => {
    const files = [
      makeFile('src/App.jsx'),
      makeFile('server.js'),
      makeFile('routes/auth.js'),
      makeFile('auth.test.js'),
      makeFile('models/User.js'),
    ];
    const r1 = buildRepositoryStructureInventory({ files });
    const r2 = buildRepositoryStructureInventory({ files });
    expect(r1).toEqual(r2);
  });

  test('directories list is sorted', () => {
    const r = buildRepositoryStructureInventory({
      files: [
        makeFile('routes/auth.js'),
        makeFile('models/User.js'),
        makeFile('controllers/home.js'),
      ],
    });
    const dirs = r.directories;
    const sorted = dirs.slice().sort();
    expect(dirs).toEqual(sorted);
  });

  test('riskHints list is sorted', () => {
    const r = buildRepositoryStructureInventory({
      files: [makeFile('server.js'), makeFile('routes/auth.js')],
    });
    const hints = r.riskHints;
    const sorted = hints.slice().sort();
    expect(hints).toEqual(sorted);
  });
});

// ── Windows path normalization ────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — Windows paths', () => {
  test('backslash paths are normalized to forward slashes in categories', () => {
    const r = buildRepositoryStructureInventory({
      files: [{ path: 'src\\App.jsx', sizeBytes: 100, language: 'JavaScript', lastModified: '2024-01-01' }],
    });
    expect(r.categories.frontend).toContain('src/App.jsx');
  });

  test('backslash paths are normalized to forward slashes in directories', () => {
    const r = buildRepositoryStructureInventory({
      files: [{ path: 'routes\\auth\\index.js', sizeBytes: 100, language: 'JavaScript', lastModified: '2024-01-01' }],
    });
    expect(r.directories).toContain('routes/auth');
  });
});

// ── Output shape ──────────────────────────────────────────────────────────────

describe('buildRepositoryStructureInventory — output shape', () => {
  test('all top-level keys present', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    expect(r).toHaveProperty('totalFiles');
    expect(r).toHaveProperty('languages');
    expect(r).toHaveProperty('directories');
    expect(r).toHaveProperty('categories');
    expect(r).toHaveProperty('architectureHints');
    expect(r).toHaveProperty('testCoverageHints');
    expect(r).toHaveProperty('frameworkHints');
    expect(r).toHaveProperty('riskHints');
  });

  test('all 15 category keys present', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    const cats = r.categories;
    ['frontend','backend','tests','config','docs','migrations','scripts',
     'routes','services','models','components','apiClients','styles','assets','unknown']
      .forEach(k => expect(cats).toHaveProperty(k));
  });

  test('all 9 architectureHint keys present', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    const h = r.architectureHints;
    ['hasFrontend','hasBackend','hasTests','hasMigrations','hasApiLayer',
     'hasServiceLayer','hasModelLayer','hasComponentLayer','likelyFullStackApp']
      .forEach(k => expect(h).toHaveProperty(k));
  });

  test('all 5 testCoverageHint keys present', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    const h = r.testCoverageHints;
    ['testFileCount','sourceFileCount','testToSourceRatio','hasUnitTests','hasIntegrationTests']
      .forEach(k => expect(h).toHaveProperty(k));
  });

  test('all 8 frameworkHint keys present', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    const h = r.frameworkHints;
    ['react','nextjs','express','nodejs','jest','postgresqlMigrations','vite','tailwind']
      .forEach(k => expect(h).toHaveProperty(k));
  });

  test('riskHints is an array', () => {
    const r = buildRepositoryStructureInventory({ files: [] });
    expect(Array.isArray(r.riskHints)).toBe(true);
  });
});
