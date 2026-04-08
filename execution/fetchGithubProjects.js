/**
 * fetchGithubProjects
 *
 * Returns a list of projects derived from GitHub repositories.
 * Each item conforms to the RepoPulse project shape: { id, name, status }.
 *
 * NOTE: This is currently a mock implementation. The real GitHub API
 * integration (GET /orgs/{org}/repos) will replace the return value below
 * once GITHUB_ORG and GITHUB_TOKEN are wired through config/paths.js.
 * The function signature and return shape will not change.
 */

async function fetchGithubProjects() {
  return [
    { id: 101, name: 'colaberry/data-pipeline',       status: 'Healthy'  },
    { id: 102, name: 'colaberry/auth-service',         status: 'At Risk'  },
    { id: 103, name: 'colaberry/reporting-dashboard',  status: 'Healthy'  },
    { id: 104, name: 'colaberry/ml-feature-store',     status: 'At Risk'  },
    { id: 105, name: 'colaberry/infra-terraform',      status: 'Healthy'  },
  ];
}

module.exports = fetchGithubProjects;
