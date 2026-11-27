import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADSTERRA_API_BASE,
  AdsterraApiError,
  fetchAdsterraInventory,
  pickAdsterraSmartlink,
} from '../../lib/server/system/application/adsterra';

const DOMAINS_FIXTURE = {
  items: [
    { id: 3351519, title: 'hmw.app' },
    { id: 6034326, title: 'ixacg.de' },
  ],
  itemCount: 2,
};

const PLACEMENTS_FIXTURE = {
  items: [
    { id: 21745358, domain_id: 3351519, title: '320x50_1', alias: '320x50_1' },
    { id: 31115742, domain_id: 6034326, title: '300x250_1', alias: '300x250_1' },
    {
      id: 32485072,
      domain_id: 3351519,
      title: 'Smartlink_1',
      alias: 'Smartlink_1',
      direct_url: 'https://smart.example/1',
    },
    {
      id: 32485073,
      domain_id: 6034326,
      title: 'Smartlink_2',
      alias: 'Smartlink_2',
      direct_url: 'https://smart.example/2',
    },
    {
      id: 32485074,
      domain_id: 6034326,
      title: 'Invalid_Link',
      direct_url: 'javascript:alert(1)',
    },
  ],
  itemCount: 5,
};

test('fetchAdsterraInventory sends X-API-Key, resolves domain titles and sanitizes directUrl', async () => {
  const seen: Array<{ url: string; apiKey: string | null; accept: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    seen.push({
      url,
      apiKey: headers.get('X-API-Key'),
      accept: headers.get('Accept'),
    });
    if (url === `${ADSTERRA_API_BASE}/domains.json`) {
      return new Response(JSON.stringify(DOMAINS_FIXTURE), { status: 200 });
    }
    if (url === `${ADSTERRA_API_BASE}/placements.json`) {
      return new Response(JSON.stringify(PLACEMENTS_FIXTURE), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  const placements = await fetchAdsterraInventory('test-key', { fetchImpl });
  assert.equal(seen.length, 2);
  for (const call of seen) {
    assert.equal(call.apiKey, 'test-key');
    assert.equal(call.accept, 'application/json');
  }
  assert.deepEqual(placements, [
    { id: 21745358, title: '320x50_1', domain: 'hmw.app', directUrl: '' },
    { id: 31115742, title: '300x250_1', domain: 'ixacg.de', directUrl: '' },
    {
      id: 32485072,
      title: 'Smartlink_1',
      domain: 'hmw.app',
      directUrl: 'https://smart.example/1',
    },
    {
      id: 32485073,
      title: 'Smartlink_2',
      domain: 'ixacg.de',
      directUrl: 'https://smart.example/2',
    },
    { id: 32485074, title: 'Invalid_Link', domain: 'ixacg.de', directUrl: '' },
  ]);
});

test('fetchAdsterraInventory classifies unauthorized, http, network and invalid responses', async () => {
  await assert.rejects(
    () =>
      fetchAdsterraInventory('test-key', {
        fetchImpl: async () => new Response('{}', { status: 401 }),
      }),
    (error: unknown) => error instanceof AdsterraApiError && error.reason === 'unauthorized',
  );

  await assert.rejects(
    () =>
      fetchAdsterraInventory('test-key', {
        fetchImpl: async () => new Response('{}', { status: 500 }),
      }),
    (error: unknown) => error instanceof AdsterraApiError && error.reason === 'http',
  );

  await assert.rejects(
    () =>
      fetchAdsterraInventory('test-key', {
        fetchImpl: async () => {
          throw new Error('connect ETIMEDOUT');
        },
      }),
    (error: unknown) => error instanceof AdsterraApiError && error.reason === 'network',
  );

  await assert.rejects(
    () =>
      fetchAdsterraInventory('test-key', {
        fetchImpl: async () => new Response('not json', { status: 200 }),
      }),
    (error: unknown) => error instanceof AdsterraApiError && error.reason === 'invalid_response',
  );

  await assert.rejects(
    () =>
      fetchAdsterraInventory('test-key', {
        fetchImpl: async () => new Response(JSON.stringify({ wrong: true }), { status: 200 }),
      }),
    (error: unknown) => error instanceof AdsterraApiError && error.reason === 'invalid_response',
  );
});

test('pickAdsterraSmartlink prefers placement matching siteHost and falls back to first candidate', () => {
  const placements = [
    { id: 1, title: 'Banner', domain: 'ixacg.de', directUrl: '' },
    { id: 2, title: 'Smartlink_1', domain: 'hmw.app', directUrl: 'https://smart.example/hmw' },
    { id: 3, title: 'Smartlink_2', domain: 'ixacg.de', directUrl: 'https://smart.example/ixacg' },
  ];

  assert.equal(pickAdsterraSmartlink(placements, 'ixacg.de'), 'https://smart.example/ixacg');
  assert.equal(pickAdsterraSmartlink(placements, 'www.ixacg.de'), 'https://smart.example/ixacg');
  assert.equal(pickAdsterraSmartlink(placements, 'other.example'), 'https://smart.example/hmw');
  assert.equal(pickAdsterraSmartlink([], 'ixacg.de'), '');
  assert.equal(pickAdsterraSmartlink([placements[0]], 'ixacg.de'), '');
});
