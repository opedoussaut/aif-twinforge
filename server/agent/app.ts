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
import type { AgentConfig } from './config';
import type { Connectors } from './connectors';
import { approvalFor } from './policy';

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

const chatBody = z.object({
  model: z.string().min(1).max(200),
  messages: z.array(z.unknown()).max(400),
});

export function createAgentApp(opts: {
  config: AgentConfig;
  connectors: Connectors;
  fetchImpl?: typeof fetch;
  modelFor?: (id: string) => LanguageModel;
}) {
  const { config, connectors } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const provider = createOpenAICompatible({
    name: 'models',
    baseURL: config.modelBaseUrl,
    apiKey: config.modelApiKey,
  });
  const modelFor = opts.modelFor ?? ((id: string) => provider.chatModel(id));
  const instructions = agentInstructions();

  const listModels = async (): Promise<AgentModel[]> => {
    const r = await fetchImpl(`${config.modelBaseUrl}/models`, {
      headers: config.modelApiKey ? { Authorization: `Bearer ${config.modelApiKey}` } : {},
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
      if (!config.allowedOrigins.includes(origin))
        return res.status(403).json({ error: 'ORIGIN_REJECTED' });
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
      });
      // Chrome asks before a public page reaches a local server (Private Network Access).
      if (req.headers['access-control-request-private-network'] === 'true')
        res.set('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.get('/agent/status', (_req, res) => {
    res.json({
      ready: config.blockers.length === 0,
      blockers: config.blockers,
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

  app.post('/agent/chat', express.json({ limit: '2mb' }), async (req, res) => {
    const parsed = chatBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_REQUEST' });
    if (config.blockers.length) return res.status(503).json({ error: 'NOT_CONFIGURED' });
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
