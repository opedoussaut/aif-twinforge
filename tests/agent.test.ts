import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createAgentApp, errorMessage } from '../server/agent/app';
import {
  checkModelUrl,
  loadAgentConfig,
  originAllowed,
  type AgentConfig,
} from '../server/agent/config';
import { memorySettingsStore } from '../server/agent/settings';
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
  assert.equal(c.modelBaseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(c.modelSource, 'default');
  assert.equal(c.port, 3100);
  assert.deepEqual(c.blockers, []);
  assert.ok(originAllowed('https://r1-eu1-ifwe.3dexperience.3ds.com', c.allowedOrigins));
  assert.ok(originAllowed('https://aif-twinforge.vercel.app', c.allowedOrigins));
  assert.ok(!originAllowed('https://3dexperience.3ds.com.evil.example', c.allowedOrigins));
  assert.ok(!originAllowed('http://r1.3dexperience.3ds.com', c.allowedOrigins));
  assert.ok(!originAllowed('https://evil-3dexperience.3ds.com', c.allowedOrigins));
  const saved = loadAgentConfig(
    { AGENT_MODEL_BASE_URL: 'http://127.0.0.1:4000/v1', AGENT_MODEL_API_KEY: 'env-key' },
    { modelBaseUrl: 'https://openrouter.ai/api/v1', modelApiKey: 'mine' },
  );
  assert.equal(saved.modelSource, 'saved');
  assert.equal(saved.modelBaseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(saved.modelApiKey, 'mine');
  assert.ok('error' in checkModelUrl('http://models.example.com/v1'));
  assert.ok('url' in checkModelUrl('http://localhost:4000/v1/'));
  assert.deepEqual(
    c.connectors.map((s) => s.name),
    ['iterop'],
  );
  const d = loadAgentConfig({
    AGENT_ALLOWED_ORIGINS:
      'https://tenant.example.com, http://evil.example.com, http://localhost:8081, https://*.example.org',
    AGENT_FULL_CHAIN_MODELS: 'claude, gpt',
    AGENT_CAMEO: 'on',
  });
  assert.deepEqual(d.allowedOrigins, [
    'https://tenant.example.com',
    'http://localhost:8081',
    'https://*.example.org',
  ]);
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

const serve = async (
  model: ReturnType<typeof scripted>,
  over: Partial<AgentConfig> = {},
  fetchImpl: typeof fetch = models,
) => {
  const config = { ...loadAgentConfig({}), ...over };
  const settings = memorySettingsStore();
  const app = createAgentApp({ config, connectors, fetchImpl, modelFor: () => model, settings });
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, settings, close: () => server.close() };
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

test('after an approved write, the next write asks the user again', async () => {
  const s = await serve(scripted('view3d_build', { runReference: 'cooling 1' }), {
    fullChainModels: ['claude'],
  });
  try {
    const r = await fetch(`${s.url}/agent/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude',
        messages: [
          ...user('Start the cooling chain.'),
          {
            id: 'a1',
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'dynamic-tool',
                toolName: 'iterop_start_process',
                toolCallId: 'call-0',
                state: 'approval-responded',
                input: { processKey: 'x', values: {} },
                approval: { id: 'ap-0', approved: true },
              },
            ],
          },
        ],
      }),
    });
    const chunks = (await r.text())
      .split('\n')
      .filter((l) => l.startsWith('data: {'))
      .map((l) => JSON.parse(l.slice(6)) as { type: string; toolCallId?: string });
    // The approved call ran (and the connector refused its made-up process)...
    assert.ok(chunks.some((c) => c.type === 'tool-output-available' && c.toolCallId === 'call-0'));
    // ...and the model's next write waits for the user, even with invalid input.
    assert.ok(chunks.some((c) => c.type === 'tool-approval-request' && c.toolCallId === 'call-1'));
    assert.ok(!chunks.some((c) => c.type.startsWith('tool-output') && c.toolCallId === 'call-1'));
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

test('model settings from the widget: saved, key never returned, never sent to a new URL', async () => {
  const calls: { url: string; auth: string | null }[] = [];
  const recording = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
    return models();
  }) as typeof fetch;
  const s = await serve(scripted('iterop_connection', {}), {}, recording);
  const put = (body: unknown) =>
    fetch(`${s.url}/agent/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: 'https://aif-twinforge.vercel.app' },
      body: JSON.stringify(body),
    });
  try {
    const first = await (
      await put({ modelBaseUrl: 'https://openrouter.ai/api/v1', modelApiKey: 'sk-mine' })
    ).json();
    assert.deepEqual(first.settings, {
      modelBaseUrl: 'https://openrouter.ai/api/v1',
      hasKey: true,
      source: 'saved',
    });
    assert.equal(first.models.length, 2);
    assert.equal(calls.at(-1)?.auth, 'Bearer sk-mine');
    assert.deepEqual(s.settings.load(), {
      modelBaseUrl: 'https://openrouter.ai/api/v1',
      modelApiKey: 'sk-mine',
    });
    const view = await (await fetch(`${s.url}/agent/settings`)).text();
    assert.ok(!view.includes('sk-mine'));
    // Same URL without a key keeps it; another URL without a key drops it.
    await put({ modelBaseUrl: 'https://openrouter.ai/api/v1' });
    assert.equal(calls.at(-1)?.auth, 'Bearer sk-mine');
    const moved = await (await put({ modelBaseUrl: 'https://models.example.com/v1' })).json();
    assert.equal(moved.settings.hasKey, false);
    assert.equal(calls.at(-1)?.auth, null);
    const refused = await put({ modelBaseUrl: 'http://models.example.com/v1' });
    assert.equal(refused.status, 400);
    assert.match((await refused.json()).message, /https/);
  } finally {
    s.close();
  }
});

test('a failing model shows its reason instead of "An error occurred"', async () => {
  const failing = new MockLanguageModelV4({
    doStream: async () => {
      throw new APICallError({
        message: 'model failed to load, this may be due to resource limitations',
        url: 'http://127.0.0.1:11434/v1/chat/completions',
        requestBodyValues: {},
        statusCode: 500,
        isRetryable: false,
      });
    },
  });
  const s = await serve(failing as unknown as ReturnType<typeof scripted>);
  try {
    const chunks = await chat(s.url, 'local/llama', 'Hello');
    const error = chunks.find((c) => c.type === 'error');
    assert.match(String(error?.errorText), /model endpoint failed \(500\): model failed to load/);
  } finally {
    s.close();
  }
  assert.equal(
    errorMessage(new Error('rejected: Bearer sk-abc123 is invalid')),
    'The agent failed: rejected: Bearer … is invalid',
  );
  assert.equal(
    errorMessage(new Error('bad sk-proj-9x_Y and api_key=abc123')),
    'The agent failed: bad sk-… and api_key=…',
  );
});
