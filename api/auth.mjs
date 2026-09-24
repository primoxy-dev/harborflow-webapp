import { randomBytes } from 'node:crypto';
import { nodeHandler, authorized, configReady, cookie, json, knowledgeRole, origin, sameOrigin, sessionCookie, sessionLogin, sign, stateCookie, validSigned } from '../lib/harborflow.mjs';
import { permission as operationsPermission } from '../lib/operations.mjs';

async function route(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'status';
  if (mode === 'status') {
    const login = sessionLogin(request);
    return json({ configured: configReady(), authenticated: authorized(request), login, knowledgeRole: await knowledgeRole(login) });
  }
  if (mode === 'logout' && request.method === 'POST') {
    if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
    return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }
  if (!configReady()) return json({ error: 'GitHub authentication is not configured' }, 503);
  if (mode === 'start' && request.method === 'GET') {
    const nonce = randomBytes(24).toString('hex');
    const state = `${nonce}.${sign(nonce)}`;
    const callback = `${origin(request)}/api/auth?mode=callback`;
    const auth = new URL('https://github.com/login/oauth/authorize');
    auth.searchParams.set('client_id', process.env.GITHUB_OAUTH_CLIENT_ID);
    auth.searchParams.set('redirect_uri', callback);
    auth.searchParams.set('state', nonce);
    return new Response(null, { status: 302, headers: { Location: auth.toString(), 'Set-Cookie': stateCookie(state, 600), 'Cache-Control': 'no-store' } });
  }
  if (mode === 'callback' && request.method === 'GET') {
    const [stored, signature] = cookie(request, 'hf_oauth_state').split('.');
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!code || !state || state !== stored || !validSigned(stored, signature)) return json({ error: 'Invalid OAuth state' }, 403);
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.GITHUB_OAUTH_CLIENT_ID, client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET, code, redirect_uri: `${origin(request)}/api/auth?mode=callback` })
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) return json({ error: 'GitHub sign in failed' }, 502);
    const userResponse = await fetch('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'X-GitHub-Api-Version': '2022-11-28' } });
    const user = await userResponse.json();
    const login = String(user.login || '').toLowerCase();
    if (!userResponse.ok || !/^[a-z0-9-]{1,39}$/.test(login) || !(await knowledgeRole(login) || await operationsPermission(login))) return json({ error: 'This GitHub account has not been granted access' }, 403);
    const expiry = Date.now() + 8 * 60 * 60 * 1000;
    const payload = `${login}.${expiry}`;
    return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': sessionCookie(`${payload}.${sign(payload)}`, 28800), 'Cache-Control': 'no-store' } });
  }
  return json({ error: 'Unsupported action' }, 405);
}

export default nodeHandler(route);


