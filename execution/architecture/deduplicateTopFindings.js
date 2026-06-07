'use strict';

// Deduplicates an array of architecture top-findings by their human-readable
// summary text. When two findings share the same normalized summary (trimmed,
// lowercased), only the highest-severity entry is kept.
//
// This prevents the same finding from appearing twice when emitted by different
// analysis steps with different internal type names — e.g.
//   Step 2 (apiLinkage):           type='unresolved_frontend_calls', severity='medium'
//   Step 4 (implCompleteness):     type='unresolved_frontend_api',   severity='high'
// Both produce '19 frontend API calls have no matching backend route.' — only the
// high-severity entry should survive.
//
// Applied both in the builder (new snapshots) AND in the API route (cached DB
// snapshots created before the fix was deployed).

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

function _rank(s) {
  return SEVERITY_RANK[s] !== undefined ? SEVERITY_RANK[s] : 3;
}

/**
 * Deduplicate top-findings by normalized summary, keeping the highest severity.
 * Input order is preserved for survivors; on equal severity the first occurrence wins.
 *
 * @param {Array} findings  — array of { type, severity, summary } objects
 * @returns {Array}         — deduplicated array (new reference, originals unchanged)
 */
function deduplicateTopFindings(findings) {
  if (!Array.isArray(findings) || findings.length <= 1) {
    return Array.isArray(findings) ? findings.slice() : [];
  }
  const seen = new Map();
  findings.forEach(function(f) {
    const key  = (f.summary || '').trim().toLowerCase();
    const prev = seen.get(key);
    if (!prev || _rank(f.severity) < _rank(prev.severity)) {
      seen.set(key, f);
    }
  });
  return findings.filter(function(f) {
    return seen.get((f.summary || '').trim().toLowerCase()) === f;
  });
}

module.exports = { deduplicateTopFindings };
