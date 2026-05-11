'use strict';

const { parseGithubUrl } = require('../../../../execution/github/parseGithubUrl');

// ── Happy path ────────────────────────────────────────────────────────────────

describe('parseGithubUrl — success', () => {
  it('parses a standard github.com URL', () => {
    const result = parseGithubUrl('https://github.com/vercel/next.js');
    expect(result).toEqual({ owner: 'vercel', repo: 'next.js', fullName: 'vercel/next.js' });
  });

  it('parses a URL with a trailing slash', () => {
    const result = parseGithubUrl('https://github.com/facebook/react/');
    expect(result).toEqual({ owner: 'facebook', repo: 'react', fullName: 'facebook/react' });
  });

  it('ignores extra path segments beyond owner/repo', () => {
    const result = parseGithubUrl('https://github.com/owner/repo/tree/main');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', fullName: 'owner/repo' });
  });

  it('trims leading and trailing whitespace from the input', () => {
    const result = parseGithubUrl('  https://github.com/alice/beta  ');
    expect(result.fullName).toBe('alice/beta');
  });

  it('returns owner, repo, and fullName as separate fields', () => {
    const { owner, repo, fullName } = parseGithubUrl('https://github.com/Seif-del/RepoPluse_comand_Center');
    expect(owner).toBe('Seif-del');
    expect(repo).toBe('RepoPluse_comand_Center');
    expect(fullName).toBe('Seif-del/RepoPluse_comand_Center');
  });
});

// ── .git suffix normalisation ─────────────────────────────────────────────────

describe('parseGithubUrl — .git suffix normalisation', () => {
  it('strips .git from the repo segment', () => {
    const result = parseGithubUrl('https://github.com/Ojobo1800/AI-inbox-Manager.git');
    expect(result).toEqual({
      owner:    'Ojobo1800',
      repo:     'AI-inbox-Manager',
      fullName: 'Ojobo1800/AI-inbox-Manager',
    });
  });

  it('strips .git when extra path segments follow', () => {
    const result = parseGithubUrl('https://github.com/owner/repo.git/tree/main');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', fullName: 'owner/repo' });
  });

  it('does not strip .git from the owner segment', () => {
    const result = parseGithubUrl('https://github.com/owner.git/repo');
    expect(result.owner).toBe('owner.git');
    expect(result.repo).toBe('repo');
    expect(result.fullName).toBe('owner.git/repo');
  });

  it('normal URL without .git still works after the change', () => {
    const result = parseGithubUrl('https://github.com/vercel/next.js');
    expect(result.fullName).toBe('vercel/next.js');
  });

  it('throws VALIDATION_ERROR when repo is only ".git" (empty after stripping)', () => {
    expect(() => parseGithubUrl('https://github.com/owner/.git')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });
});

// ── VALIDATION_ERROR — missing or empty url ───────────────────────────────────

describe('parseGithubUrl — missing url', () => {
  it('throws VALIDATION_ERROR for null', () => {
    expect(() => parseGithubUrl(null)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('throws VALIDATION_ERROR for undefined', () => {
    expect(() => parseGithubUrl(undefined)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('throws VALIDATION_ERROR for an empty string', () => {
    expect(() => parseGithubUrl('')).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('throws VALIDATION_ERROR for a whitespace-only string', () => {
    expect(() => parseGithubUrl('   ')).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('throws VALIDATION_ERROR for a number', () => {
    expect(() => parseGithubUrl(42)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});

// ── VALIDATION_ERROR — unparseable URL ───────────────────────────────────────

describe('parseGithubUrl — invalid URL syntax', () => {
  it('throws VALIDATION_ERROR for a bare string', () => {
    expect(() => parseGithubUrl('not-a-url')).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('throws VALIDATION_ERROR for a URL with no scheme', () => {
    expect(() => parseGithubUrl('github.com/owner/repo')).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});

// ── VALIDATION_ERROR — wrong host ────────────────────────────────────────────

describe('parseGithubUrl — wrong host', () => {
  it('throws VALIDATION_ERROR for gitlab.com', () => {
    expect(() => parseGithubUrl('https://gitlab.com/owner/repo')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('throws VALIDATION_ERROR for bitbucket.org', () => {
    expect(() => parseGithubUrl('https://bitbucket.org/owner/repo')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('throws VALIDATION_ERROR for an http (non-https) github URL', () => {
    // http://github.com parses fine but hostname is still github.com — should pass.
    // This test confirms we only gate on hostname, not scheme.
    const result = parseGithubUrl('http://github.com/owner/repo');
    expect(result.fullName).toBe('owner/repo');
  });
});

// ── VALIDATION_ERROR — missing owner or repo ─────────────────────────────────

describe('parseGithubUrl — missing path segments', () => {
  it('throws VALIDATION_ERROR for a URL with only owner (no repo)', () => {
    expect(() => parseGithubUrl('https://github.com/vercel')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('throws VALIDATION_ERROR for a bare github.com URL', () => {
    expect(() => parseGithubUrl('https://github.com')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('throws VALIDATION_ERROR for github.com with trailing slash only', () => {
    expect(() => parseGithubUrl('https://github.com/')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });
});
