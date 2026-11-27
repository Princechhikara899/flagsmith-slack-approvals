import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Flagsmith } from '../src/flagsmith.js';
import { parseCommand, canApprove, approvalBlocks } from '../src/approval.js';

function mockFlagsmith() {
  const state = { id: 7, enabled: false, calls: [] };
  const srv = http.createServer((req, res) => {
    state.calls.push(`${req.method} ${req.url} ${req.headers.authorization}`);
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET') return res.end(JSON.stringify({ results: [{ id: state.id, feature: 3, enabled: state.enabled, identity: null, feature_segment: null }] }));
      if (req.method === 'PATCH') { state.enabled = JSON.parse(body).enabled; return res.end(JSON.stringify({ id: state.id, enabled: state.enabled })); }
      res.statusCode = 405; res.end('{}');
    });
  });
  return new Promise((r) => srv.listen(0, () => r({ srv, state, url: `http://127.0.0.1:${srv.address().port}` })));
}

test('flips a flag via Flagsmith API and reports before/after', async () => {
  const { srv, state, url } = await mockFlagsmith();
  const fs = new Flagsmith({ baseUrl: url, apiKey: 'k', environmentKey: 'envkey' });
  const r = await fs.setFlag('new_checkout', true);
  assert.deepEqual(r, { before: false, after: true });
  assert.equal(state.enabled, true);
  assert.ok(state.calls[0].startsWith('GET /api/v1/environments/envkey/featurestates/?feature_name=new_checkout Api-Key k'));
  assert.ok(state.calls[1].startsWith('PATCH /api/v1/environments/envkey/featurestates/7/'));
  srv.close();
});

test('parses commands', () => {
  assert.deepEqual(parseCommand('on my_flag'), { flag: 'my_flag', enabled: true });
  assert.deepEqual(parseCommand('disable x'), { flag: 'x', enabled: false });
  assert.equal(parseCommand('nonsense'), null);
});

test('requester cannot approve own request', () => {
  assert.equal(canApprove({ requester: 'U1' }, 'U1').ok, false);
  assert.equal(canApprove({ requester: 'U1' }, 'U2').ok, true);
  assert.equal(canApprove(undefined, 'U2').ok, false);
});

test('approval card has approve and reject buttons', () => {
  const b = approvalBlocks({ flag: 'f', enabled: true, requester: 'U1', env: 'demo', id: 'abc' });
  assert.deepEqual(b[1].elements.map((e) => e.action_id), ['flag_approve', 'flag_reject']);
});

test('falls back to the update-flag endpoint when legacy PATCH returns 400', async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(`${opts.method || 'GET'} ${url}`);
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (!opts.method) return json(200, { results: [{ id: 7, feature: 3, enabled: false }] });
    if (url.includes('/featurestates/7/')) return json(400, { detail: 'versioning' });
    return json(200, { environment_default: { enabled: true } });
  };
  const fs = new Flagsmith({ baseUrl: 'http://x', apiKey: 'k', environmentKey: 'e', fetchImpl });
  assert.deepEqual(await fs.setFlag('f', true), { before: false, after: true });
  assert.equal(calls[2], 'PATCH http://x/api/__future__/environments/e/features/3/');
});
