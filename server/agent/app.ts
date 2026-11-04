import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  APICallError,
  createAgentUIStream,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { checkModelUrl, originAllowed, type AgentConfig, type ModelSettings } from './config';
import type { Connectors } from './connectors';
import { approvalFor } from './policy';
import { memorySettingsStore, type SettingsStore } from './settings';

export type AgentModel = { id: string; fullChain: boolean };

const skill = fileURLToPath(
  new URL('../../.claude/skills/iterop-orchestrator/SKILL.md', import.meta.url),
);

/** The iterop-orchestrator skill, written for Claude, serves as instructions for any model. */
export function agentInstructions() {
  const body = readFileSync(skill, 'utf8').replace(/^---[\s\S]*?---\s*/, '');
  return [
    'You run inside the aif-twinforge widget of a 3DDashboard. You may be any language model; the',
    'skill below was written for Claude and applies to you in full.',
    'Every tool call that changes something pauses until the user approves it in the widget. When',
    'a call is denied, do not retry it: explain what you wanted to do and ask how to proceed.',
    'Always say whether a result comes from the SIMULATED engine or the live sandbox.',
    '',
    body,
  ].join('\n');
}

/**
 * What went wrong, for the widget and the agent's log, instead of the SDK's bare "An error
 * occurred.". Model endpoint failures keep their status; anything that looks like a key is masked.
 */
export function errorMessage(e: unknown) {
  const status = APICallError.isInstance(e) && e.statusCode ? ` (${e.statusCode})` : '';
  const text = e instanceof Error ? e.message : String(e);
  const where = APICallError.isInstance(e) ? 'The model endpoint failed' : 'The agent failed';
  return `${where}${status}: ${text}`
    .replace(/\bBearer\s+\S+/gi, 'Bearer …')
    .replace(/\bsk-[\w-]+/g, 'sk-…')
    .replace(/(api[_-]?key\s*[=:]\s*)\S+/gi, '$1…')
    .slice(0, 500);
}

const settingsBody = z.object({
  modelBaseUrl: z.string().min(1).max(500),
  /** A new key. Left out: keep the saved key if the URL is unchanged, else none. */
  modelApiKey: z.string().max(500).optional(),
});

const chatBody = z.object({
  model: z.string().min(1).max(200),
  messages: z.array(z.unknown()).max(400),
});

export function createAgentApp(opts: {
  config: AgentConfig;
  connectors: Connectors;
  fetchImpl?: typeof fetch;
  modelFor?: (id: string) => LanguageModel;
  /** Where model settings entered in the widget are saved. Default: this process only. */
  settings?: SettingsStore;
}) {
  const { config, connectors } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const store = opts.settings ?? memorySettingsStore();
  // The model endpoint can change while the agent runs, when the user saves new settings.
  let model: ModelSettings = { modelBaseUrl: config.modelBaseUrl, modelApiKey: config.modelApiKey };
  let modelSource = config.modelSource;
  const blockers = () => [
    ...config.blockers.filter((b) => !b.startsWith('The model URL')),
    ...(model.modelBaseUrl ? [] : config.blockers.filter((b) => b.startsWith('The model URL'))),
  ];
  const modelFor =
    opts.modelFor ??
    ((id: string) =>
      createOpenAICompatible({
        name: 'models',
        baseURL: model.modelBaseUrl,
        apiKey: model.modelApiKey,
      }).chatModel(id));
  const instructions = agentInstructions();

  const listModels = async (): Promise<AgentModel[]> => {
    const r = await fetchImpl(`${model.modelBaseUrl}/models`, {
      headers: model.modelApiKey ? { Authorization: `Bearer ${model.modelApiKey}` } : {},
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`The model endpoint answered ${r.status}.`);
    const body = (await r.json()) as { data?: { id?: unknown }[] };
    return (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      .sort()
      .map((id) => ({ id, fullChain: config.fullChainModels.includes(id) }));
  };

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(req.hostname))
      return res.status(403).json({ error: 'HOST_REJECTED' });
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    // Browser callers must come from an allowed widget origin. Tools without an Origin
    // (curl, tests) are local by the host check above.
    const origin = req.headers.origin;
    if (origin) {
      // A refused page may read the refusal, so the widget can say why instead of "offline".
      const allowed = originAllowed(origin, config.allowedOrigins);
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
      });
      // Chrome asks before a public page reaches a local server (Private Network Access).
      if (req.headers['access-control-request-private-network'] === 'true')
        res.set('Access-Control-Allow-Private-Network', 'true');
      if (!allowed && req.method !== 'OPTIONS')
        return res.status(403).json({ error: 'ORIGIN_REJECTED' });
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.get('/agent/status', (_req, res) => {
    res.json({
      ready: blockers().length === 0,
      blockers: blockers(),
      model: { source: modelSource, host: model.modelBaseUrl && new URL(model.modelBaseUrl).host },
      engine: process.env.ITEROP_MCP_ENGINE === 'live' ? 'live' : 'simulated',
      connectors: [...new Set(connectors.tools.map((t) => t.connector))].map((name) => ({
        name,
        tools: connectors.tools.filter((t) => t.connector === name).length,
        writeTools: connectors.tools.filter((t) => t.connector === name && !t.readOnly).length,
      })),
    });
  });

  app.get('/agent/models', async (_req, res) => {
    try {
      res.json({ models: await listModels() });
    } catch {
      res.status(502).json({ error: 'MODELS_UNAVAILABLE' });
    }
  });

  // Model settings: the key is never sent back, only whether one is saved.
  const settingsView = () => ({
    modelBaseUrl: model.modelBaseUrl,
    hasKey: Boolean(model.modelApiKey),
    source: modelSource,
  });
  app.get('/agent/settings', (_req, res) => {
    res.json(settingsView());
  });
  app.put('/agent/settings', express.json({ limit: '8kb' }), async (req, res) => {
    const parsed = settingsBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_SETTINGS' });
    const url = checkModelUrl(parsed.data.modelBaseUrl);
    if ('error' in url)
      return res.status(400).json({ error: 'INVALID_SETTINGS', message: url.error });
    // A saved key only ever goes to the endpoint it was entered for.
    const key = parsed.data.modelApiKey?.trim();
    const next: ModelSettings = {
      modelBaseUrl: url.url,
      modelApiKey: key || (url.url === model.modelBaseUrl ? model.modelApiKey : undefined),
    };
    store.save(next);
    model = next;
    modelSource = 'saved';
    try {
      res.json({ settings: settingsView(), models: await listModels() });
    } catch {
      res.json({ settings: settingsView(), models: [], modelsError: 'MODELS_UNAVAILABLE' });
    }
  });

  app.post('/agent/chat', express.json({ limit: '2mb' }), async (req, res) => {
    const parsed = chatBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_REQUEST' });
    if (blockers().length) return res.status(503).json({ error: 'NOT_CONFIGURED' });
    const { model, messages } = parsed.data;
    let models: AgentModel[];
    try {
      models = await listModels();
    } catch {
      return res.status(502).json({ error: 'MODELS_UNAVAILABLE' });
    }
    if (!models.some((m) => m.id === model))
      return res.status(400).json({ error: 'UNKNOWN_MODEL' });
    const agent = new ToolLoopAgent({
      model: modelFor(model),
      instructions,
      tools: await connectors.toolSet(),
      stopWhen: stepCountIs(40),
      toolApproval: ({ toolCall }) =>
        approvalFor(
          connectors.tools.find((t) => t.name === toolCall.toolName),
          model,
          config.fullChainModels,
        ),
    });
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    await pipeUIMessageStreamToResponse({
      response: res,
      stream: await createAgentUIStream({
        agent,
        uiMessages: messages,
        abortSignal: abort.signal,
        onError: (e) => {
          const message = errorMessage(e);
          process.stderr.write(`agent: ${model}: ${message}\n`);
          return message;
        },
      }),
    });
  });

  return app;
}
