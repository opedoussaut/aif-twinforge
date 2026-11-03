/**
 * Agent harness settings. Model access goes through one OpenAI-compatible endpoint (LiteLLM in
 * front of Claude, GPT, Ollama, vLLM…), so the widget can offer any model without code changes.
 */
export type ConnectorSpec = { name: string; script: string };
export type AgentConfig = {
  /** OpenAI-compatible base URL, e.g. LiteLLM `http://127.0.0.1:4000/v1` or Ollama `…:11434/v1`. */
  modelBaseUrl: string;
  modelApiKey?: string;
  /** Models allowed to write (start processes, complete tasks, change the model). Others read only. */
  fullChainModels: string[];
  /** Origins allowed to call the agent from a browser: the widget's 3DDashboard origin(s). */
  allowedOrigins: string[];
  port: number;
  connectors: ConnectorSpec[];
  blockers: string[];
};

const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const blockers: string[] = [];
  const modelBaseUrl = (env.AGENT_MODEL_BASE_URL || 'http://127.0.0.1:4000/v1').replace(/\/+$/, '');
  try {
    const u = new URL(modelBaseUrl);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
      blockers.push('AGENT_MODEL_BASE_URL must be an http(s) URL without credentials.');
  } catch {
    blockers.push('AGENT_MODEL_BASE_URL is not a valid URL.');
  }
  const allowedOrigins: string[] = [];
  for (const o of list(env.AGENT_ALLOWED_ORIGINS)) {
    try {
      const u = new URL(o);
      const local = ['localhost', '127.0.0.1'].includes(u.hostname);
      if (u.origin !== o.replace(/\/+$/, '') || (u.protocol !== 'https:' && !local))
        blockers.push(`AGENT_ALLOWED_ORIGINS: "${o}" must be an https origin without a path.`);
      else allowedOrigins.push(u.origin);
    } catch {
      blockers.push(`AGENT_ALLOWED_ORIGINS: "${o}" is not a valid origin.`);
    }
  }
  const port = Number(env.AGENT_PORT || 3100);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    blockers.push('AGENT_PORT must be between 1024 and 65535.');
  const connectors: ConnectorSpec[] = [{ name: 'iterop', script: 'server/iterop-mcp.ts' }];
  if (env.AGENT_CAMEO === 'on') connectors.push({ name: 'cameo', script: 'server/cameo-mcp.ts' });
  return {
    modelBaseUrl,
    modelApiKey: env.AGENT_MODEL_API_KEY?.trim() || undefined,
    fullChainModels: list(env.AGENT_FULL_CHAIN_MODELS),
    allowedOrigins,
    port,
    connectors,
    blockers,
  };
}
