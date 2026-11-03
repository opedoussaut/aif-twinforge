import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAgentApp } from './agent/app';
import { loadAgentConfig } from './agent/config';
import { Connectors } from './agent/connectors';

/**
 * Model-agnostic agent for the 3DDashboard widget: any model behind an OpenAI-compatible
 * endpoint (LiteLLM, Ollama…) drives the same MCP connectors Claude Desktop uses.
 */
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadAgentConfig();
const connectors = await Connectors.start(config.connectors);
const app = createAgentApp({ config, connectors });
app.listen(config.port, '127.0.0.1', () =>
  process.stderr.write(
    `aif-twinforge agent at http://127.0.0.1:${config.port} · models from ${new URL(config.modelBaseUrl).host} · ` +
      `${connectors.tools.length} tools${config.blockers.length ? ` · BLOCKED: ${config.blockers.join(' ')}` : ''}\n`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void connectors.close().then(() => process.exit(0)));
