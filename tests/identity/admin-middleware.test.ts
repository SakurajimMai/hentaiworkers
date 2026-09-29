import assert from 'node:assert/strict';
import test from 'node:test';
import { sealData } from 'iron-session';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import { SESSION_COOKIE_NAME, type SessionData } from '../../lib/server/identity/session-config';

const SECRET = 's'.repeat(32);
process.env.SESSION_SECRET = SECRET;

async function request(path: string, session?: SessionData): Promise<NextRequest> {
  const headers = new Headers();
  if (session) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${await sealData(session, { password: SECRET })}`);
  }
  return new NextRequest(`https://site.example${path}`, { headers });
}

test('the console answers like an unknown page without an admin session', async () => {
  const cases: Array<SessionData | undefined> = [
    undefined,
    { isLoggedIn: true, role: 'user', userId: 7 },
    { isLoggedIn: false },
  ];
  for (const session of cases) {
    for (const path of ['/admin', '/admin/settings', '/admin/login']) {
      const response = await middleware(await request(path, session));
      assert.equal(response.headers.get('location'), null, `${path} must not redirect to a login page`);
      assert.equal(new URL(response.headers.get('x-middleware-rewrite') ?? '').pathname, '/404', `${path} renders the regular 404`);
    }
    const api = await middleware(await request('/api/admin/anything', session));
    assert.equal(api.status, 404);
    assert.deepEqual(await api.json(), { error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
});

test('an admin session reaches the console', async () => {
  const response = await middleware(await request('/admin/settings', { isLoggedIn: true, role: 'admin', userId: 1 }));
  assert.equal(response.headers.get('x-middleware-next'), '1');
  assert.equal(response.headers.get('x-middleware-rewrite'), null);
});

test('a tampered cookie is treated as no session', async () => {
  const headers = new Headers({ cookie: `${SESSION_COOKIE_NAME}=not-a-sealed-value` });
  const response = await middleware(new NextRequest('https://site.example/admin', { headers }));
  assert.equal(new URL(response.headers.get('x-middleware-rewrite') ?? '').pathname, '/404');
});
