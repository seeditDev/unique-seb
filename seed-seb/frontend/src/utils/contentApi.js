/**
 * Central content-fetching helper.
 *
 * SECURITY: this module replaces the previously hard-coded / atob-obfuscated
 * GitHub Personal Access Token that used to live in the client bundle
 * (StudentDashboard.js, MCQPage.jsx, CodingAssessmentPage.jsx,
 * AptitudeTest.js, config/constants.js).
 *
 * No credential of any kind is shipped to the client any more. When a file is
 * not reachable publicly, the request is proxied through the Cloudflare Worker
 * endpoint `/api/content`, which holds the token as a Worker secret
 * (`GITHUB_CONTENT_TOKEN`) and never echoes it back.
 */

export const CONTENT_REPOS = {
  SEED_CONTENTS: 'seed-contents',
  SEEDDB: 'SEEDDB',
};

const RAW_BASE = {
  [CONTENT_REPOS.SEED_CONTENTS]: 'https://raw.githubusercontent.com/seeditDev/seed-contents/main',
  [CONTENT_REPOS.SEEDDB]: 'https://raw.githubusercontent.com/seeditDev/SEEDDB/main',
};

const LOCAL_BASE = {
  [CONTENT_REPOS.SEED_CONTENTS]: '/seed-contents',
  [CONTENT_REPOS.SEEDDB]: '/SEEDDB',
};

/** Normalise any absolute/relative content reference to a repo-relative path. */
export function normalizeContentPath(url = '') {
  let path = String(url ?? '');
  if (path.startsWith('http')) {
    if (path.includes('/seed-contents/main/')) path = path.split('/seed-contents/main/')[1];
    else if (path.includes('/SEEDDB/main/')) path = path.split('/SEEDDB/main/')[1];
    else if (path.includes('/contents/')) path = path.split('/contents/')[1];
  }
  return path
    .replace(/^\/+/, '')
    .replace(/^seed-contents\//, '')
    .replace(/^SEEDDB\//, '')
    .split('?')[0];
}

async function tryJson(url, init) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return undefined;
    return await res.json();
  } catch (_) {
    return undefined;
  }
}

/**
 * Fetch a JSON content file.
 * Order: bundled/local copy -> public raw GitHub -> authenticated Worker proxy.
 *
 * @param {string} url        repo-relative path, or any absolute GitHub URL
 * @param {object} [options]
 * @param {string} [options.repo]      preferred repo (defaults to seed-contents)
 * @param {boolean} [options.localFirst=true]
 * @returns {Promise<any>}
 */
export async function fetchContentJSON(url, options = {}) {
  const { repo = CONTENT_REPOS.SEED_CONTENTS, localFirst = true } = options;
  const path = normalizeContentPath(url);
  if (!path) throw new Error('fetchContentJSON: empty content path');

  // Repos to attempt, preferred one first.
  const repos = [repo, ...Object.values(CONTENT_REPOS).filter((r) => r !== repo)];

  if (localFirst) {
    for (const r of repos) {
      const local = await tryJson(`${LOCAL_BASE[r]}/${path}`);
      if (local !== undefined) return local;
    }
  }

  for (const r of repos) {
    const raw = await tryJson(`${RAW_BASE[r]}/${path}`);
    if (raw !== undefined) return raw;
  }

  // Authenticated fallback: server-side proxy. The token stays on the server.
  for (const r of repos) {
    const proxied = await tryJson(
      `/api/content?repo=${encodeURIComponent(r)}&path=${encodeURIComponent(path)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (proxied !== undefined) return proxied;
  }

  if (!localFirst) {
    for (const r of repos) {
      const local = await tryJson(`${LOCAL_BASE[r]}/${path}`);
      if (local !== undefined) return local;
    }
  }

  throw new Error(`Could not download content file: ${path}`);
}

export const fetchJSONFile = fetchContentJSON;
export default fetchContentJSON;
