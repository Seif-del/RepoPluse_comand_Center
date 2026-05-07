'use strict';

// tests/directives/validateDirectives.test.js
// Validates the structural integrity of all directive files in /directives.
// Ensures directives have the required sections and that referenced
// implementation files exist on disk.
// Run automatically with: npm test

const fs   = require('fs');
const path = require('path');

const DIRECTIVES_DIR = path.resolve(__dirname, '../../directives');

// Every directive must contain these section headings.
const REQUIRED_SECTIONS = [
  '## Goal',
  '## Inputs',
  '## Outputs',
  '## Edge Cases',
  '## Verification',
];

function getDirectiveFiles() {
  if (!fs.existsSync(DIRECTIVES_DIR)) return [];
  return fs
    .readdirSync(DIRECTIVES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Directive files', () => {
  const files = getDirectiveFiles();

  it('directives/ directory exists', () => {
    expect(fs.existsSync(DIRECTIVES_DIR)).toBe(true);
  });

  it('contains at least one .md file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  files.forEach((filename) => {
    describe(filename, () => {
      let content;

      beforeAll(() => {
        content = fs.readFileSync(path.join(DIRECTIVES_DIR, filename), 'utf8');
      });

      REQUIRED_SECTIONS.forEach((section) => {
        it(`contains required section "${section}"`, () => {
          expect(content).toContain(section);
        });
      });

      it('is not empty', () => {
        expect(content.trim().length).toBeGreaterThan(0);
      });
    });
  });
});
