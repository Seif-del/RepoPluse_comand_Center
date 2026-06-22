'use strict';

jest.mock('fs');
jest.mock('../../../config/paths', () => ({ REPO_HISTORY_FILE: '/fake/repoHistory.json' }));

describe('repoHistory — startup resilience', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('returns [] when file does not exist', () => {
    require('fs').existsSync.mockReturnValue(false);
    const history = require('../../../execution/repoHistory');
    expect(history).toEqual([]);
  });

  it('returns [] when file is empty (the crash case: JSON.parse("") throws)', () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('');
    const history = require('../../../execution/repoHistory');
    expect(history).toEqual([]);
  });

  it('returns [] when file contains only whitespace', () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('   \n  \t  ');
    const history = require('../../../execution/repoHistory');
    expect(history).toEqual([]);
  });

  it('returns [] when file contains invalid JSON', () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('{not: valid json{{');
    const history = require('../../../execution/repoHistory');
    expect(history).toEqual([]);
  });

  it('returns [] when file contains truncated JSON', () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('[{"id":1,"name":"repo"');
    const history = require('../../../execution/repoHistory');
    expect(history).toEqual([]);
  });

  it('preserves valid history — full array returned intact', () => {
    const data = [
      { id: 1, name: 'org/repo-a', status: 'ok',       lastUpdated: '2026-01-01T00:00:00.000Z' },
      { id: 2, name: 'org/repo-b', status: 'watch',    lastUpdated: '2026-01-02T00:00:00.000Z' },
      { id: 3, name: 'org/repo-c', status: 'critical', lastUpdated: '2026-01-03T00:00:00.000Z' },
    ];
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(data));
    const history = require('../../../execution/repoHistory');
    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({ id: 1, name: 'org/repo-a', status: 'ok' });
    expect(history[1]).toMatchObject({ id: 2, name: 'org/repo-b', status: 'watch' });
    expect(history[2]).toMatchObject({ id: 3, name: 'org/repo-c', status: 'critical' });
  });

  it('preserves single-entry valid history', () => {
    const data = [{ id: 42, name: 'org/solo', status: 'ok', lastUpdated: '2026-06-01T00:00:00.000Z' }];
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(data));
    const history = require('../../../execution/repoHistory');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: 42, name: 'org/solo' });
  });

  it('returns [] when file contains valid JSON but not an array (object)', () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ repos: [] }));
    const history = require('../../../execution/repoHistory');
    expect(history).toEqual([]);
  });

  it('returns [] when file contains JSON null', () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('null');
    const history = require('../../../execution/repoHistory');
    expect(history).toEqual([]);
  });

  it('returns [] when file contains a JSON number', () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('42');
    const history = require('../../../execution/repoHistory');
    expect(history).toEqual([]);
  });

  it('module exports an array in all resilience cases', () => {
    const cases = ['', '   ', '{bad', 'null', '{}', '42'];
    for (const raw of cases) {
      jest.resetModules();
      const fs = require('fs');
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(raw);
      const history = require('../../../execution/repoHistory');
      expect(Array.isArray(history)).toBe(true);
    }
  });
});
