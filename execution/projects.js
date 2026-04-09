const fs = require('fs');
const { PROJECTS_FILE, PROJECT_SOURCE } = require('../config/paths');

const seed = [
  { id: 1, name: 'Alpha Dashboard', status: 'Healthy' },
  { id: 2, name: 'Beta API Integration', status: 'At Risk' },
  { id: 3, name: 'Gamma Reporting', status: 'Healthy' },
];

// PROJECT_SOURCE is imported above for future use (e.g. 'github').
// The GitHub fetch path requires async support across the call chain
// and will be wired in a dedicated follow-up once callers are ready.
// For now, only the file / seed path is active.

if (PROJECTS_FILE && !fs.existsSync(PROJECTS_FILE)) {
  throw new Error(
    `PROJECTS_FILE is set to '${PROJECTS_FILE}' but the file does not exist`
  );
}

let projects;
if (PROJECTS_FILE) {
  try {
    projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  } catch (e) {
    throw new Error(
      `PROJECTS_FILE at '${PROJECTS_FILE}' contains invalid JSON`
    );
  }
  if (!Array.isArray(projects)) {
    throw new Error(
      `PROJECTS_FILE at '${PROJECTS_FILE}' must be an array`
    );
  }
  const VALID_STATUSES = ['Healthy', 'At Risk'];
  projects.forEach((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(
        `PROJECTS_FILE at '${PROJECTS_FILE}': item at index ${index} is missing required field "status"`
      );
    }
    if (!('status' in item)) {
      throw new Error(
        `PROJECTS_FILE at '${PROJECTS_FILE}': item at index ${index} is missing required field "status"`
      );
    }
    if (!VALID_STATUSES.includes(item.status)) {
      throw new Error(
        `PROJECTS_FILE at '${PROJECTS_FILE}': item at index ${index} has invalid status "${item.status}"; allowed values are: Healthy, At Risk`
      );
    }
  });
} else {
  projects = seed;
}

module.exports = projects;
