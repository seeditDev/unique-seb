/**
 * articleFetcher.js
 * Helper utility to fetch article JSONs and Course Mapping files directly from GitHub seed-contents repo,
 * with local fallback support.
 */

const GITHUB_SEED_CONTENTS_BASE = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';

/**
 * Clean path helper to ensure relative path without leading slashes.
 */
export function normalizeArticlePath(relativePath) {
  if (!relativePath) return '';
  let cleaned = relativePath.trim().replace(/^\/+/, '');
  if (cleaned.startsWith('articles/')) {
    cleaned = cleaned.replace(/^articles\//, '');
  }
  return cleaned;
}

/**
 * Fetch an article or syllabus mapping JSON using GitHub seed-contents primary URL,
 * with local fallback options.
 * @param {string} relativePath - e.g. 'CourseMappingFiles/learn-c-syllabus.json' or 'seed-contents/coding/learn-c-syllabus.json'
 * @returns {Promise<Response>} Fetch Response object
 */
export async function fetchArticleFile(relativePath) {
  if (!relativePath) return null;
  const rawPath = relativePath.trim().replace(/^\/+/, '');

  let githubUrl = `${GITHUB_SEED_CONTENTS_BASE}/${rawPath}`;
  if (!rawPath.startsWith('seed-contents/') && !rawPath.startsWith('articles/')) {
    githubUrl = `${GITHUB_SEED_CONTENTS_BASE}/articles/${rawPath}`;
  } else if (rawPath.startsWith('seed-contents/')) {
    githubUrl = `${GITHUB_SEED_CONTENTS_BASE}/${rawPath.replace(/^seed-contents\//, '')}`;
  }

  // 1. Primary: GitHub Raw (seed-contents repo)
  try {
    const res = await fetch(githubUrl);
    if (res.ok) return res;
  } catch (_) {}

  // 2. Local Fallback: /seed-contents/ or /articles/
  try {
    const localRes = await fetch(`/${rawPath}`);
    if (localRes.ok) return localRes;
  } catch (_) {}

  // 3. Last-resort fetch directly against GitHub Raw URL
  return await fetch(githubUrl);
}

/**
 * Fetch and parse JSON directly from GitHub seed-contents articles repo.
 */
export async function fetchArticleJson(relativePath) {
  const response = await fetchArticleFile(relativePath);
  if (!response || !response.ok) {
    throw new Error(`Failed to load article ${relativePath}: HTTP ${response?.status}`);
  }
  return await response.json();
}
