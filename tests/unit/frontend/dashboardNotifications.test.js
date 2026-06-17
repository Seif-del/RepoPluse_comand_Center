'use strict';

// Pure-logic unit tests for dashboard notification UI helpers.
// Functions are embedded in frontend/dashboard.html but have no DOM dependency —
// they are copied verbatim here so Jest (node env) can run them without a browser.
//
// Functions under test:
//   notificationPriorityClass   — maps priority string → severity CSS class
//   buildNotificationBadgeText  — maps unreadCount → badge display string
//   buildNotificationListHtml   — renders a list of notification objects as HTML

// ── esc stub (copied verbatim from dashboard.html) ────────────────────────────
// NOTE: dashboard.html esc() does NOT escape single quotes — only 4 replacements.
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── notificationPriorityClass (copied verbatim from dashboard.html) ───────────
function notificationPriorityClass(priority) {
  if (priority === 'CRITICAL') return 'severity-critical';
  if (priority === 'HIGH')     return 'severity-high';
  if (priority === 'MEDIUM')   return 'severity-medium';
  if (priority === 'LOW')      return 'severity-healthy';
  return 'severity-unknown';
}

// ── buildNotificationBadgeText (copied verbatim from dashboard.html) ──────────
function buildNotificationBadgeText(unreadCount) {
  if (!unreadCount || unreadCount <= 0) return '';
  return unreadCount > 9 ? '9+' : String(unreadCount);
}

// ── buildNotificationListHtml (copied verbatim from dashboard.html) ───────────
function buildNotificationListHtml(notifications) {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return '<p style="font-size:0.82rem;color:var(--text-muted);'
      + 'font-style:italic;padding:8px 0;">No new notifications.</p>';
  }

  var html = '';
  notifications.forEach(function(n) {
    var isRead  = n.status === 'READ' || n.status === 'EXPIRED';
    var sevCls  = notificationPriorityClass(n.priority);
    var opacity = isRead ? 'opacity:0.55;' : '';

    html += '<div style="padding:10px 0;border-bottom:1px solid var(--border);' + opacity + '">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
    html += '<span class="aq-badge ' + sevCls + '" style="font-size:0.65rem;padding:1px 6px;">'
      + esc(n.priority || 'MEDIUM') + '</span>';
    html += '<span style="font-size:0.83rem;font-weight:600;color:var(--text-primary);">'
      + esc(n.title || '') + '</span>';
    if (!isRead) {
      html += '<button onclick="markNotificationRead(' + Number(n.id) + ')" '
        + 'style="margin-left:auto;font-size:0.7rem;color:var(--blue);'
        + 'background:none;border:none;cursor:pointer;padding:0;">Mark read</button>';
    }
    html += '</div>';
    html += '<div style="font-size:0.79rem;color:var(--text-secondary);padding-left:2px;">'
      + esc(n.body || '') + '</div>';
    html += '</div>';
  });
  return html;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

var UNREAD_CRITICAL = {
  id: 1, status: 'CREATED', priority: 'CRITICAL',
  title: '[RepoPulse] Critical Alert', body: 'Risk score is 80%. 8 / 10 projects at risk.',
};

var UNREAD_HIGH = {
  id: 2, status: 'CREATED', priority: 'HIGH',
  title: '[RepoPulse] High Alert', body: 'Trend is Worsening.',
};

var UNREAD_MEDIUM = {
  id: 3, status: 'CREATED', priority: 'MEDIUM',
  title: '[RepoPulse] Medium Alert', body: 'Monitoring situation.',
};

var UNREAD_LOW = {
  id: 4, status: 'CREATED', priority: 'LOW',
  title: '[RepoPulse] Low Alert', body: 'Minor issue detected.',
};

var READ_NOTIF = {
  id: 5, status: 'READ', priority: 'HIGH',
  title: '[RepoPulse] Read Alert', body: 'Already acknowledged.',
};

var EXPIRED_NOTIF = {
  id: 6, status: 'EXPIRED', priority: 'MEDIUM',
  title: '[RepoPulse] Expired Alert', body: 'This notification has expired.',
};

// ── notificationPriorityClass ─────────────────────────────────────────────────

describe('notificationPriorityClass — priority to CSS class mapping', () => {

  test('CRITICAL maps to severity-critical', () => {
    expect(notificationPriorityClass('CRITICAL')).toBe('severity-critical');
  });

  test('HIGH maps to severity-high', () => {
    expect(notificationPriorityClass('HIGH')).toBe('severity-high');
  });

  test('MEDIUM maps to severity-medium', () => {
    expect(notificationPriorityClass('MEDIUM')).toBe('severity-medium');
  });

  test('LOW maps to severity-healthy', () => {
    expect(notificationPriorityClass('LOW')).toBe('severity-healthy');
  });

  test('unrecognised string maps to severity-unknown', () => {
    expect(notificationPriorityClass('CATASTROPHIC')).toBe('severity-unknown');
  });

  test('undefined maps to severity-unknown', () => {
    expect(notificationPriorityClass(undefined)).toBe('severity-unknown');
  });

});

// ── buildNotificationBadgeText ────────────────────────────────────────────────

describe('buildNotificationBadgeText — badge display string', () => {

  test('0 returns empty string (badge hidden)', () => {
    expect(buildNotificationBadgeText(0)).toBe('');
  });

  test('undefined returns empty string', () => {
    expect(buildNotificationBadgeText(undefined)).toBe('');
  });

  test('negative number returns empty string', () => {
    expect(buildNotificationBadgeText(-1)).toBe('');
  });

  test('1 returns "1"', () => {
    expect(buildNotificationBadgeText(1)).toBe('1');
  });

  test('9 returns "9"', () => {
    expect(buildNotificationBadgeText(9)).toBe('9');
  });

  test('10 returns "9+" (capped to prevent wide badge)', () => {
    expect(buildNotificationBadgeText(10)).toBe('9+');
  });

  test('99 returns "9+"', () => {
    expect(buildNotificationBadgeText(99)).toBe('9+');
  });

});

// ── buildNotificationListHtml — empty state ───────────────────────────────────

describe('buildNotificationListHtml — empty state', () => {

  test('empty array returns the empty-state paragraph', () => {
    expect(buildNotificationListHtml([])).toContain('No new notifications.');
  });

  test('null input is treated as empty and returns the empty-state paragraph', () => {
    expect(buildNotificationListHtml(null)).toContain('No new notifications.');
  });

});

// ── buildNotificationListHtml — priority rendering ────────────────────────────

describe('buildNotificationListHtml — priority rendering', () => {

  test('CRITICAL notification output contains severity-critical class', () => {
    expect(buildNotificationListHtml([UNREAD_CRITICAL])).toContain('severity-critical');
  });

  test('HIGH notification output contains severity-high class', () => {
    expect(buildNotificationListHtml([UNREAD_HIGH])).toContain('severity-high');
  });

  test('MEDIUM notification output contains severity-medium class', () => {
    expect(buildNotificationListHtml([UNREAD_MEDIUM])).toContain('severity-medium');
  });

  test('LOW notification output contains severity-healthy class', () => {
    expect(buildNotificationListHtml([UNREAD_LOW])).toContain('severity-healthy');
  });

});

// ── buildNotificationListHtml — escaping ──────────────────────────────────────

describe('buildNotificationListHtml — XSS escaping', () => {

  test('title containing < is escaped to &lt; in output', () => {
    var n = { id: 10, status: 'CREATED', priority: 'HIGH',
              title: '<script>alert(1)</script>', body: 'test' };
    var html = buildNotificationListHtml([n]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('body containing & is escaped to &amp; in output', () => {
    var n = { id: 11, status: 'CREATED', priority: 'MEDIUM',
              title: 'Alert', body: 'Risk is high & growing' };
    var html = buildNotificationListHtml([n]);
    expect(html).toContain('&amp;');
    expect(html).not.toContain('high & growing');
  });

});

// ── buildNotificationListHtml — read/unread behavior ─────────────────────────

describe('buildNotificationListHtml — read and unread rendering', () => {

  test('unread notification (CREATED) renders a Mark read button', () => {
    expect(buildNotificationListHtml([UNREAD_CRITICAL])).toContain('markNotificationRead');
  });

  test('Mark read button contains the correct notification id', () => {
    var html = buildNotificationListHtml([UNREAD_CRITICAL]);
    expect(html).toContain('markNotificationRead(1)');
  });

  test('READ notification does not render a Mark read button', () => {
    expect(buildNotificationListHtml([READ_NOTIF])).not.toContain('markNotificationRead');
  });

  test('READ notification renders with opacity:0.55 to appear dimmed', () => {
    expect(buildNotificationListHtml([READ_NOTIF])).toContain('opacity:0.55;');
  });

  test('EXPIRED notification does not render a Mark read button', () => {
    expect(buildNotificationListHtml([EXPIRED_NOTIF])).not.toContain('markNotificationRead');
  });

  test('unread notification does not render opacity:0.55', () => {
    expect(buildNotificationListHtml([UNREAD_CRITICAL])).not.toContain('opacity:0.55;');
  });

});

// ── buildNotificationListHtml — multiple notifications ────────────────────────

describe('buildNotificationListHtml — multiple notifications', () => {

  test('both notification titles appear in the output', () => {
    var html = buildNotificationListHtml([UNREAD_CRITICAL, READ_NOTIF]);
    expect(html).toContain('[RepoPulse] Critical Alert');
    expect(html).toContain('[RepoPulse] Read Alert');
  });

  test('in a mixed list only the unread notification has a Mark read button', () => {
    var html = buildNotificationListHtml([UNREAD_CRITICAL, READ_NOTIF]);
    expect(html).toContain('markNotificationRead(1)');
    expect(html).not.toContain('markNotificationRead(5)');
  });

});
