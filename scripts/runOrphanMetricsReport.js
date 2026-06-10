'use strict';

// scripts/runOrphanMetricsReport.js
// Temporary read-only validation script.
// Reads scripts/reportOrphanMetrics.sql, executes sections 2–4 against the
// database, and prints formatted tables to stdout.
//
// Run with:   node scripts/runOrphanMetricsReport.js
//
// DATABASE_URL is loaded from .env automatically if not already in the shell
// environment — no manual export required.
//
// Section 1 (per-repo breakdown) is intentionally skipped; it is too wide for
// console output. Use psql directly for the full table:
//   psql $DATABASE_URL -f scripts/reportOrphanMetrics.sql
//
// No new dependencies — uses only Node built-ins (fs, path) and the existing
// pg pool from execution/db.js.

const fs   = require('fs');
const path = require('path');

// ── Load .env if DATABASE_URL is not already in the environment ───────────────
// Simple line-by-line parser — no dotenv package required.
if (!process.env.DATABASE_URL) {
  try {
    const envLines = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch (_) {
    // No .env file — DATABASE_URL must be present in the shell environment.
  }
}

// Importing db.js triggers pool initialisation, which emits one [INFO] log line.
const db = require('../execution/db');

// ── SQL section extractor ─────────────────────────────────────────────────────
// Splits the .sql file on boundary comment lines of the form:
//   "-- ── N. SECTION TITLE ─────────────────────────────────────────────────"
// From each section, strips \echo meta-commands and SQL comment lines,
// leaving only the executable SELECT statement.

function extractSections(sqlPath) {
  const lines    = fs.readFileSync(sqlPath, 'utf8').split('\n');
  const sections = [];
  let   current  = null;

  // Matches: "-- <any> N. TITLE-IN-CAPS <trailing fill chars>"
  // The all-caps title requirement prevents matching preamble comment lines.
  const BOUNDARY_RE = /^-- .+?(\d+)\. ([-A-Z\/ ]+[A-Z\d])/;

  for (const line of lines) {
    const m = BOUNDARY_RE.exec(line);
    if (m) {
      if (current) sections.push(current);
      current = { num: parseInt(m[1], 10), title: m[2].trim(), sqlLines: [] };
      continue;
    }
    if (!current) continue;
    if (line.trim().startsWith('\\')) continue; // strip psql meta-commands (\echo)
    if (line.trim().startsWith('--'))  continue; // strip SQL comment lines
    current.sqlLines.push(line);
  }
  if (current) sections.push(current);

  return sections
    .map(s => ({ num: s.num, title: s.title, sql: s.sqlLines.join('\n').trim() }))
    .filter(s => s.sql.length > 0);
}

// ── Table formatter ───────────────────────────────────────────────────────────
// Formats a pg query result as a fixed-width ASCII table.
// Null values print as NULL. No external dependencies.

function printTable(title, result) {
  const cols = result.fields.map(f => f.name);
  const rows = result.rows;

  console.log('\n' + '═'.repeat(72));
  console.log(title);
  console.log('═'.repeat(72));

  if (rows.length === 0) {
    console.log('(no rows)');
    return;
  }

  const widths = cols.map(c => c.length);
  for (const row of rows) {
    for (let i = 0; i < cols.length; i++) {
      const val = row[cols[i]] == null ? 'NULL' : String(row[cols[i]]);
      if (val.length > widths[i]) widths[i] = val.length;
    }
  }

  const border = widths.map(w => '-'.repeat(w + 2)).join('+');
  const header = cols.map((c, i) => ` ${c.padEnd(widths[i])} `).join('|');

  console.log(border);
  console.log(header);
  console.log(border);
  for (const row of rows) {
    const line = cols.map((c, i) => {
      const val = row[c] == null ? 'NULL' : String(row[c]);
      return ` ${val.padEnd(widths[i])} `;
    }).join('|');
    console.log(line);
  }
  console.log(border);
  console.log(`${rows.length} row${rows.length === 1 ? '' : 's'}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const sqlPath  = path.join(__dirname, 'reportOrphanMetrics.sql');
  const sections = extractSections(sqlPath);

  // Print sections 2, 3, 4 only.
  // Section 1 (per-repo breakdown) is omitted — console width is insufficient
  // for its 7 columns; run via psql for the full view.
  const RUN_SECTIONS = new Set([2, 3, 4]);

  console.log('\nOrphan Metrics Validation Report');
  console.log('Source: repo_architecture_snapshots  |  read-only');
  console.log('Tip: run via psql for the full per-repo breakdown (Section 1).');

  try {
    for (const section of sections) {
      if (!RUN_SECTIONS.has(section.num)) continue;
      const result = await db.query(section.sql);
      printTable(section.title, result);
    }
  } finally {
    await db.end();
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
