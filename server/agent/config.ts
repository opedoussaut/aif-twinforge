/**
 * Agent harness settings. Model access goes through one OpenAI-compatible endpoint (Ollama,
 * LiteLLM in front of Claude, GPT, vLLM, OpenRouter…), so the widget can offer any model without
 * code changes.
 */
export type ConnectorSpec = { name: string; script: string };
/** Where the models come from. Each user sets it in the widget; it is saved on their machine. */
export type ModelSettings = { modelBaseUrl: string; modelApiKey?: string };
export type AgentConfig = ModelSettings & {
  /** Where the model settings came from: the user's saved settings, .env, or the default. */
  modelSource: 'saved' | 'env' | 'default';
  /** Models allowed to write (start processes, complete tasks, change the model). Others read only. */
  fullChainModels: string[];
  /**
   * Origins allowed to call the agent from a browser: the widget's host and the 3DDashboard.
   * `https://*.example.com` allows every subdomain.
   */
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

/** Ollama's OpenAI-compatible endpoint on its default port: what works with no setup. */
export const DEFAULT_MODEL_BASE_URL = 'http://127.0.0.1:11434/v1';
/** The published widget and every 3DEXPERIENCE dashboard, plus the widget's dev server. */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://aif-twinforge.vercel.app',
  'https://*.3dexperience.3ds.com',
  'http://localhost:8081',
];

const isLocal = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

/**
 * A model endpoint the agent may send prompts and keys to: https, or http on this machine
 * (Ollama, LiteLLM). Returns the normalized URL or why it is refused.
 */
export function checkModelUrl(raw: string): { url: string } | { error: string } {
  try {
    const u = new URL(raw.trim());
    if (u.username || u.password) return { error: 'The model URL must not contain credentials.' };
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocal(u.hostname)))
      return { error: 'The model URL must be https, or http on this machine.' };
    return { url: u.href.replace(/\/+$/, '') };
  } catch {
    return { error: 'The model URL is not a valid URL.' };
  }
}

/** Whether a browser origin matches the allowed list (exact, or `https://*.domain`). */
export function originAllowed(origin: string, allowed: string[]) {
  return allowed.some((a) => {
    if (!a.includes('*')) return a === origin;
    const domain = a.slice('https://*.'.length);
    try {
      const u = new URL(origin);
      return u.protocol === 'https:' && !u.port && u.hostname.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  });
}

export function loadAgentConfig(
  env: NodeJS.ProcessEnv = process.env,
  saved?: ModelSettings,
): AgentConfig {
  const blockers: string[] = [];
  const modelSource = saved ? 'saved' : env.AGENT_MODEL_BASE_URL ? 'env' : 'default';
  const model = checkModelUrl(
    saved?.modelBaseUrl ?? (env.AGENT_MODEL_BASE_URL || DEFAULT_MODEL_BASE_URL),
  );
  if ('error' in model) blockers.push(model.error);
  const allowedOrigins: string[] = [];
  const origins = list(env.AGENT_ALLOWED_ORIGINS);
  for (const o of origins.length ? origins : DEFAULT_ALLOWED_ORIGINS) {
    if (/^https:\/\/\*\.[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(o)) {
      allowedOrigins.push(o);
      continue;
    }
    try {
      const u = new URL(o);
      if (u.origin !== o.replace(/\/+$/, '') || (u.protocol !== 'https:' && !isLocal(u.hostname)))
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
    modelSource,
    modelBaseUrl: 'url' in model ? model.url : '',
    modelApiKey: saved ? saved.modelApiKey : env.AGENT_MODEL_API_KEY?.trim() || undefined,
    fullChainModels: list(env.AGENT_FULL_CHAIN_MODELS),
    allowedOrigins,
    port,
    connectors,
    blockers,
  };
}
