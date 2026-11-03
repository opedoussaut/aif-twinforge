import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createAgentApp } from '../server/agent/app';
import { loadAgentConfig, type AgentConfig } from '../server/agent/config';
import { Connectors, type ConnectedTool } from '../server/agent/connectors';
import { approvalFor } from '../server/agent/policy';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
/** A model that calls one tool, then answers with text once the tool result is back. */
const scripted = (toolName: string, input: unknown) => {
  let calls = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      calls += 1;
      const chunks =
        calls === 1
          ? [
              { type: 'tool-call', toolCallId: 'call-1', toolName, input: JSON.stringify(input) },
              { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage },
            ]
          : [
              { type: 'text-start', id: 't' },
              { type: 'text-delta', id: 't', delta: 'Done.' },
              { type: 'text-end', id: 't' },
              { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage },
            ];
      return { stream: simulateReadableStream({ chunks: chunks as never[] }) };
    },
  });
};
const models = async () =>
  new Response(JSON.stringify({ data: [{ id: 'local/llama' }, { id: 'claude' }] }), {
    headers: { 'content-type': 'application/json' },
  });
const user = (text: string) => [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }];

test('agent config: defaults, origin rules and optional CATIA connector', () => {
  const c = loadAgentConfig({});
  assert.equal(c.modelBaseUrl, 'http://127.0.0.1:4000/v1');
  assert.equal(c.port, 3100);
  assert.deepEqual(c.blockers, []);
  assert.deepEqual(
    c.connectors.map((s) => s.name),
    ['iterop'],
  );
  const d = loadAgentConfig({
    AGENT_ALLOWED_ORIGINS:
      'https://tenant.example.com, http://evil.example.com, http://localhost:8081',
    AGENT_FULL_CHAIN_MODELS: 'claude, gpt',
    AGENT_CAMEO: 'on',
  });
  assert.deepEqual(d.allowedOrigins, ['https://tenant.example.com', 'http://localhost:8081']);
  assert.equal(d.blockers.length, 1);
  assert.deepEqual(d.fullChainModels, ['claude', 'gpt']);
  assert.deepEqual(
    d.connectors.map((s) => s.name),
    ['iterop', 'cameo'],
  );
  assert.ok(loadAgentConfig({ AGENT_MODEL_BASE_URL: 'http://u:p@host/v1' }).blockers.length);
});

test('approval policy: reads run, writes need a certified model and the user', () => {
  const read: ConnectedTool = { name: 'r', connector: 'x', description: '', readOnly: true };
  const write: ConnectedTool = { ...read, name: 'w', readOnly: false };
  assert.equal(approvalFor(read, 'local/llama', []), undefined);
  assert.equal(approvalFor(write, 'claude', ['claude']), 'user-approval');
  assert.equal((approvalFor(write, 'local/llama', ['claude']) as { type: string }).type, 'denied');
  assert.equal((approvalFor(undefined, 'claude', ['claude']) as { type: string }).type, 'denied');
});

let connectors: Connectors;
before(async () => {
  connectors = await Connectors.start([{ name: 'iterop', script: 'server/iterop-mcp.ts' }], {
    ITEROP_MCP_ENGINE: 'simulated',
  });
});
after(() => connectors.close());

const serve = async (model: ReturnType<typeof scripted>, over: Partial<AgentConfig> = {}) => {
  const config = { ...loadAgentConfig({}), ...over };
  const app = createAgentApp({ config, connectors, fetchImpl: models, modelFor: () => model });
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: () => server.close() };
};
const chat = async (url: string, model: string, text: string) => {
  const r = await fetch(`${url}/agent/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: user(text) }),
  });
  assert.equal(r.status, 200);
  return (await r.text())
    .split('\n')
    .filter((l) => l.startsWith('data: {'))
    .map((l) => JSON.parse(l.slice(6)) as { type: string; [k: string]: unknown });
};

test('connectors expose the ITEROP tools with their read/write nature', () => {
  const byName = new Map(connectors.tools.map((t) => [t.name, t]));
  assert.equal(byName.get('iterop_connection')?.readOnly, true);
  assert.equal(byName.get('iterop_start_process')?.readOnly, false);
  assert.equal(byName.get('iterop_complete_task')?.readOnly, false);
});

test('any model reads through the connector without approval', async () => {
  const s = await serve(scripted('iterop_connection', {}));
  try {
    const chunks = await chat(s.url, 'local/llama', 'Which engine are you on?');
    const output = chunks.find((c) => c.type === 'tool-output-available');
    assert.match(JSON.stringify(output?.output), /SIMULATED/);
    assert.ok(chunks.some((c) => c.type === 'text-delta' && c.delta === 'Done.'));
  } finally {
    s.close();
  }
});

test('a read-only model is refused a write before it reaches ITEROP', async () => {
  const s = await serve(scripted('iterop_start_process', { processKey: 'x', values: {} }), {
    fullChainModels: ['claude'],
  });
  try {
    const chunks = await chat(s.url, 'local/llama', 'Start the cooling chain.');
    assert.ok(chunks.some((c) => c.type === 'tool-output-denied'));
    assert.ok(!chunks.some((c) => c.type === 'tool-output-available'));
  } finally {
    s.close();
  }
});

test('a certified model asks the user before any write', async () => {
  const s = await serve(scripted('iterop_start_process', { processKey: 'x', values: {} }), {
    fullChainModels: ['claude'],
  });
  try {
    const chunks = await chat(s.url, 'claude', 'Start the cooling chain.');
    assert.ok(chunks.some((c) => c.type === 'tool-approval-request'));
    assert.ok(!chunks.some((c) => c.type === 'tool-output-available'));
  } finally {
    s.close();
  }
});

test('browser calls need an allowed widget origin; models list is labelled', async () => {
  const s = await serve(scripted('iterop_connection', {}), {
    allowedOrigins: ['https://tenant.example.com'],
    fullChainModels: ['claude'],
  });
  try {
    const denied = await fetch(`${s.url}/agent/models`, {
      headers: { origin: 'https://evil.example.com' },
    });
    assert.equal(denied.status, 403);
    const pre = await fetch(`${s.url}/agent/chat`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://tenant.example.com',
        'access-control-request-private-network': 'true',
      },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://tenant.example.com');
    assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
    const list = await (
      await fetch(`${s.url}/agent/models`, { headers: { origin: 'https://tenant.example.com' } })
    ).json();
    assert.deepEqual(list.models, [
      { id: 'claude', fullChain: true },
      { id: 'local/llama', fullChain: false },
    ]);
    const unknown = await fetch(`${s.url}/agent/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'nope', messages: user('hi') }),
    });
    assert.equal(unknown.status, 400);
  } finally {
    s.close();
  }
});
