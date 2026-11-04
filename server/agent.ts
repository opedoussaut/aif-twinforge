import { createAgentApp } from './agent/app';
import { loadAgentConfig } from './agent/config';
import { Connectors } from './agent/connectors';
import { fileSettingsStore } from './agent/settings';
import { useConfigDir } from './config-dir';

/**
 * Model-agnostic agent for the 3DDashboard widget: any model behind an OpenAI-compatible
 * endpoint (LiteLLM, Ollama…) drives the same MCP connectors Claude Desktop uses.
 */
const configDir = useConfigDir();

const settings = fileSettingsStore();
const config = loadAgentConfig(process.env, settings.load());
const connectors = await Connectors.start(config.connectors);
const app = createAgentApp({ config, connectors, settings });
const engine = process.env.ITEROP_MCP_ENGINE === 'live' ? 'LIVE sandbox' : 'simulated';
app.listen(config.port, '127.0.0.1', () =>
  process.stderr.write(
    [
      `aif-twinforge agent running at http://127.0.0.1:${config.port}`,
      `  models: ${config.modelBaseUrl || 'not set'} (${config.modelSource}) · ${connectors.tools.length} tools · ITEROP ${engine}`,
      `  settings and private files: ${configDir}`,
      ...config.blockers.map((b) => `  BLOCKED: ${b}`),
      '  Open the aif-twinforge widget in your 3DDashboard. Keep this window open; Ctrl+C stops the agent.',
      '',
    ].join('\n'),
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => void connectors.close().then(() => process.exit(0)));
