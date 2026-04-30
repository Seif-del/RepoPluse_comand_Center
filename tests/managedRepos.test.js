'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point MANAGED_REPOS_FILE at a temp file before requiring the module.
const TEST_FILE = path.join(os.tmpdir(), `repopulse-managedRepos-unit-${Date.now()}.json`);
process.env.MANAGED_REPOS_FILE = TEST_FILE;

// Clear the require cache so the module picks up the env override.
const modulePath = require.resolve('../execution/managedRepos');
const configPath = require.resolve('../config/paths');
delete require.cache[modulePath];
delete require.cache[configPath];

const {
  parseGitHubUrl,
  loadManagedRepos,
  saveManagedRepos,
  registerRepo,
} = require('../execution/managedRepos');

afterEach(() => {
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
  // Reset internal require cache between tests so loadManagedRepos reads fresh state.
});

// ── parseGitHubUrl ────────────────────────────────────────────────────────────

describe('parseGitHubUrl', () => {
  it('parses a standard URL', () => {
    expect(parseGitHubUrl('https://github.com/vercel/next.js')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
    });
  });

  it('parses a URL with a trailing slash', () => {
    expect(parseGitHubUrl('https://github.com/facebook/react/')).toEqual({
      owner: 'facebook',
      repo: 'react',
    });
  });

  it('parses a URL with a .git suffix', () => {
    expect(parseGitHubUrl('https://github.com/torvalds/linux.git')).toEqual({
      owner: 'torvalds',
      repo: 'linux',
    });
  });

  it('handles owner/repo names with hyphens and underscores', () => {
    expect(parseGitHubUrl('https://github.com/my-org/my_repo')).toEqual({
      owner: 'my-org',
      repo: 'my_repo',
    });
  });

  it('returns null for an empty string', () => {
    expect(parseGitHubUrl('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseGitHubUrl(null)).toBeNull();
  });

  it('returns null for a non-GitHub URL', () => {
    expect(parseGitHubUrl('https://gitlab.com/foo/bar')).toBeNull();
  });

  it('returns null for a GitHub URL missing the repo segment', () => {
    expect(parseGitHubUrl('https://github.com/vercel')).toBeNull();
  });

  it('returns null for http (not https)', () => {
    expect(parseGitHubUrl('http://github.com/vercel/next.js')).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(parseGitHubUrl('not a url')).toBeNull();
  });
});

// ── loadManagedRepos ──────────────────────────────────────────────────────────

describe('loadManagedRepos', () => {
  it('returns an empty array when the file does not exist', () => {
    expect(loadManagedRepos()).toEqual([]);
  });

  it('returns an empty array when the file contains invalid JSON', () => {
    fs.writeFileSync(TEST_FILE, 'not-json', 'utf8');
    expect(loadManagedRepos()).toEqual([]);
  });

  it('returns saved data when the file is valid', () => {
    const data = [{ id: 1, fullName: 'foo/bar' }];
    fs.writeFileSync(TEST_FILE, JSON.stringify(data), 'utf8');
    expect(loadManagedRepos()).toEqual(data);
  });
});

// ── registerRepo ─────────────────────────────────────────────────────────────

describe('registerRepo', () => {
  it('rejects an empty string', () => {
    const result = registerRepo('');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it('rejects a whitespace-only string', () => {
    const result = registerRepo('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid URL', () => {
    const result = registerRepo('https://gitlab.com/foo/bar');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it('registers a valid URL and returns the expected shape', () => {
    const result = registerRepo('https://github.com/vercel/next.js');
    expect(result.ok).toBe(true);
    expect(result.repo).toMatchObject({
      owner: 'vercel',
      repo: 'next.js',
      fullName: 'vercel/next.js',
      url: 'https://github.com/vercel/next.js',
    });
    expect(typeof result.repo.id).toBe('number');
    expect(typeof result.repo.registeredAt).toBe('string');
  });

  it('creates the persistence file on first registration', () => {
    expect(fs.existsSync(TEST_FILE)).toBe(false);
    registerRepo('https://github.com/vercel/next.js');
    expect(fs.existsSync(TEST_FILE)).toBe(true);
  });

  it('persists the repo so a subsequent load returns it', () => {
    registerRepo('https://github.com/vercel/next.js');
    const repos = loadManagedRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].fullName).toBe('vercel/next.js');
  });

  it('rejects a duplicate (exact match)', () => {
    registerRepo('https://github.com/vercel/next.js');
    const result = registerRepo('https://github.com/vercel/next.js');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already registered/i);
  });

  it('rejects a duplicate case-insensitively', () => {
    registerRepo('https://github.com/Vercel/Next.js');
    const result = registerRepo('https://github.com/vercel/next.js');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already registered/i);
  });

  it('allows a second distinct repo', () => {
    registerRepo('https://github.com/vercel/next.js');
    const result = registerRepo('https://github.com/facebook/react');
    expect(result.ok).toBe(true);
    expect(loadManagedRepos()).toHaveLength(2);
  });
});
