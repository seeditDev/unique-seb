/**
 * Cloudflare Worker: static asset + SPA fallback server, plus the small
 * server-side API surface the client needs so that no credential ever ships in
 * the browser bundle.
 *
 * Required Worker secret:
 *   GITHUB_CONTENT_TOKEN  – fine-grained PAT with read-only Contents access to
 *                           seeditDev/seed-contents and seeditDev/SEEDDB.
 *   wrangler secret put GITHUB_CONTENT_TOKEN
 */

const ALLOWED_REPOS = new Set(['seed-contents', 'SEEDDB']);
const CONTENT_CACHE_TTL = 300; // seconds

const json = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });

/** Reject traversal and anything that is not a plain repo-relative JSON path. */
function sanitizeContentPath(raw) {
  const path = String(raw || '').replace(/^\/+/, '');
  if (!path) return null;
  if (path.includes('..') || path.includes('\\') || path.startsWith('.git')) return null;
  if (!/^[A-Za-z0-9._\-/ ]+$/.test(path)) return null;
  return path;
}

/**
 * GET /api/content?repo=seed-contents&path=Assessments/foo.json
 * Proxies a private content file using the server-held token. The token is
 * never returned to, or reconstructible by, the client.
 */
async function handleContent(request, env, url) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
  }

  const repo = url.searchParams.get('repo') || 'seed-contents';
  const path = sanitizeContentPath(url.searchParams.get('path'));

  if (!ALLOWED_REPOS.has(repo)) return json({ error: 'Unknown content repository' }, 400);
  if (!path) return json({ error: 'Invalid content path' }, 400);

  const token = env.GITHUB_CONTENT_TOKEN;
  if (!token) {
    return json({ error: 'Content proxy is not configured on the server' }, 503);
  }

  const upstream = `https://api.github.com/repos/seeditDev/${repo}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  let res;
  try {
    res = await fetch(upstream, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'seed-seb-worker',
      },
      cf: { cacheTtl: CONTENT_CACHE_TTL, cacheEverything: true },
    });
  } catch (err) {
    return json({ error: 'Upstream content fetch failed' }, 502);
  }

  if (!res.ok) {
    // Never relay GitHub's body: it can contain rate-limit/identity details.
    return json({ error: 'Content not available', status: res.status }, res.status === 404 ? 404 : 502);
  }

  let payload;
  try {
    payload = await res.json();
  } catch (_) {
    return json({ error: 'Malformed upstream response' }, 502);
  }

  if (typeof payload?.content !== 'string') {
    return json({ error: 'Unsupported content entry' }, 415);
  }

  let decoded;
  try {
    const binary = atob(payload.content.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    decoded = new TextDecoder('utf-8').decode(bytes);
  } catch (_) {
    return json({ error: 'Could not decode content' }, 502);
  }

  return new Response(decoded, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CONTENT_CACHE_TTL}`,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/content') {
      return handleContent(request, env, url);
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404);
    }

    try {
      // 1. Try fetching requested static asset from build/
      const response = await env.ASSETS.fetch(request);

      // 2. If static asset is found (status 200/304), return it directly
      if (response && response.status !== 404) {
        return response;
      }

      // 3. For 404 responses on files with explicit file extensions, return a
      // clean 404 so frontend fallbacks catch it cleanly.
      const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);
      if (hasFileExtension) {
        return new Response('Not Found', { status: 404 });
      }

      // 4. SPA navigation routes without file extensions -> index.html
      const indexReq = new Request(`${url.origin}/index.html`, {
        method: 'GET',
        headers: request.headers,
      });
      const indexRes = await env.ASSETS.fetch(indexReq);

      if (indexRes && indexRes.status === 200) {
        return indexRes;
      }

      return await env.ASSETS.fetch(new Request(`${url.origin}/`, { method: 'GET' }));
    } catch (err) {
      try {
        const fallbackReq = new Request(`${url.origin}/index.html`, { method: 'GET' });
        return await env.ASSETS.fetch(fallbackReq);
      } catch (_) {
        return new Response('SPA Fallback Error', { status: 500 });
      }
    }
  },
};
