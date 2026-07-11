'use strict';

// Unit tests for buildRepoMetricsHtml — the sole Operational Status build
// function retained on the Overview tab after Repository Overview Refinement #10
// (Risk Score / PR Health / Recent Events sections were removed as low-value;
// Operational Metrics now shows Commits (7d) only).
// No DOM or browser required — Jest node env only.

// ── Minimal esc stub ─────────────────────────────────────────────────────────
function esc(s) { return String(s); }

// ── buildRepoMetricsHtml (copied verbatim from dashboard.html) ───────────────
function buildRepoMetricsHtml(data) {
  if (!data) {
    return '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:2px 0;">No operational metrics available yet.</p>';
  }
  var commits = data.commits7d != null ? String(data.commits7d) : '—';
  var ms = 'font-size:0.74rem;color:var(--text-muted);';
  var vs = 'font-size:0.86rem;font-weight:600;color:var(--text-primary);';
  return '<div style="padding:4px 0;">'
    + '<span style="' + ms + '">Commits (7d) </span><span style="' + vs + '">' + esc(commits) + '</span>'
    + '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRepoMetricsHtml
// ─────────────────────────────────────────────────────────────────────────────

describe('buildRepoMetricsHtml — empty states', () => {
  test('null data renders empty-state message', () => {
    const html = buildRepoMetricsHtml(null);
    expect(html).toContain('No operational metrics available yet.');
    expect(html).not.toContain('grid');
  });

  test('undefined data renders empty-state message', () => {
    const html = buildRepoMetricsHtml(undefined);
    expect(html).toContain('No operational metrics available yet.');
  });
});

describe('buildRepoMetricsHtml — values', () => {
  const data = { commits7d: 12, openPrs: 3, stalePrs: 1, openIssues: 7 };

  test('renders commits7d value', () => {
    expect(buildRepoMetricsHtml(data)).toContain('>12<');
  });

  test('renders only the Commits (7d) label', () => {
    const html = buildRepoMetricsHtml(data);
    expect(html).toContain('Commits (7d)');
    expect(html).not.toContain('Open PRs');
    expect(html).not.toContain('Stale PRs');
    expect(html).not.toContain('Open Issues');
  });

  test('ignores openPrs/stalePrs/openIssues fields entirely', () => {
    const html = buildRepoMetricsHtml(data);
    expect(html).not.toContain('>3<');
    expect(html).not.toContain('>1<');
    expect(html).not.toContain('>7<');
  });

  test('null commits7d renders as em dash', () => {
    const html = buildRepoMetricsHtml({ commits7d: null });
    expect(html).toContain('—');
  });

  test('zero commits7d renders as 0, not em dash', () => {
    const html = buildRepoMetricsHtml({ commits7d: 0 });
    expect(html).not.toContain('—');
    expect(html).toContain('>0<');
  });

  test('does not render a CSS grid container', () => {
    expect(buildRepoMetricsHtml(data)).not.toContain('grid-template-columns');
  });
});
