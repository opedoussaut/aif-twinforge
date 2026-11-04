# aif-twinforge widget

A 3DDashboard widget where engineers chat with **any model** that drives the aif-twinforge connectors. The model is a commodity: the controls are not in the model.

```
3DDashboard ── widget/ (Vue) ──HTTPS/CORS──► npm run agent (server/agent.ts)
                model selector · chat ·        AI SDK tool loop · approval policy
                approve / decline each write        │                    │
                                              OpenAI-compatible     MCP stdio (unchanged)
                                              LiteLLM / Ollama      iterop-mcp · cameo-mcp
```

| Part         | Open-source piece                                                                                          | Where                        |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Model access | Any OpenAI-compatible endpoint. **LiteLLM** in front of Claude, GPT, Ollama, vLLM is the recommended setup | `AGENT_MODEL_BASE_URL`       |
| Harness      | **Vercel AI SDK** (Apache-2.0): `ToolLoopAgent`, tool approvals, UI message stream                         | `server/agent/`              |
| Tools        | The same MCP connectors Claude Desktop uses, started as child processes                                    | `server/agent/connectors.ts` |
| Widget       | Vue 3 + `@ai-sdk/vue`, one-file bundle for the 3DDashboard                                                 | `widget/`                    |

## Controls

- **Reads run directly.** A tool runs without approval only if its connector declares it read-only (`readOnlyHint: true`).
- **Every other call waits for the user.** The widget shows the tool and its exact values, with _Approve_ and _Decline_.
- **Only certified models may ask.** Models not listed in `AGENT_FULL_CHAIN_MODELS` are refused every write before it reaches a connector; the widget labels them _read only_. List a model only after it passes the Hall B benchmark.
- **Unknown tools are refused.** The connectors' own guards (proposal check, model receipts, no sign-off) still apply behind this gate.
- **Credentials stay in the connectors.** The widget never sees model keys or ITEROP credentials; the browser only reaches the agent.
- **Only allowed origins.** The agent answers browsers only from `AGENT_ALLOWED_ORIGINS` (your 3DDashboard origin), and only on `127.0.0.1`.

The prompt is the [iterop-orchestrator skill](../.claude/skills/iterop-orchestrator/SKILL.md), so every model follows the same rules as Claude.

## Each user runs their own agent

There is no shared server. Each person runs the agent on their own computer with their own model, so keys and prompts stay on their machine. The widget walks them through it:

1. **No agent found:** the widget shows _Run your own agent_. It needs Node.js 22 and Git once, then one command, kept open while the widget is used:

   ```bash
   npx github:opedoussaut/aif-twinforge
   ```

2. **Agent found:** the widget connects by itself. With Ollama running on its default port, the models show up with no settings at all.
3. **Other models:** _Model source_ (the gear) offers Ollama, OpenRouter, OpenAI or any OpenAI-compatible endpoint (LiteLLM, a company gateway). The agent keeps the choice in `~/.aif-twinforge/settings.json`. The key goes only to the endpoint it was entered for: changing the URL without a new key drops the saved one, and the widget never gets a key back.

Defaults that need no `.env`: models from Ollama (`http://127.0.0.1:11434/v1`), and browser calls accepted from the published widget, any `https://*.3dexperience.3ds.com` dashboard and the dev server (`http://localhost:8081`). A `.env` still overrides them (see `.env.example`).

Only models listed in `AGENT_FULL_CHAIN_MODELS` may ask for changes; every other model reads only. That list is empty by default, until a model passes the Hall B benchmark.

### Live ITEROP

The agent drives the live sandbox when its settings say so, the same way the Claude Desktop connector does. It reads them from one config folder, which holds `.env` (`ITEROP_MCP_ENGINE=live` and the `NOVA_LAB_*` gateway settings) and `.private/` (the reviewed lab contract, the run journal, the 3D scenes):

- `AIF_CONFIG_DIR`, when set, for example the folder Claude Desktop's connectors already use, so both see the same runs;
- otherwise `~/.aif-twinforge`, when it holds a `.env`;
- otherwise the repository.

The widget shows _Live sandbox_ or _Simulated_ next to the status. Every write still waits for approval in the widget, and live mode still needs the reviewed contract. Never commit these files.

### Developing the widget

1. `npm run agent` from the repository (uses `.env` if present) → `http://127.0.0.1:3100`.
2. `cd widget && npm install && npm start` → <http://localhost:8081>. Outside the dashboard, `?agent=http://127.0.0.1:3199` points the page at another local agent.

## Put it in the 3DDashboard

### On Vercel (HTTPS, no server to run)

1. On vercel.com, import `opedoussaut/aif-twinforge` and choose **Import single project** on `widget` (not the root app). Root Directory `widget`; the rest comes from `widget/vercel.json`.
2. Every push to `main` redeploys. The widget URL is `https://<project>.vercel.app/index.html`.
3. Add that origin and the dashboard's origin to `AGENT_ALLOWED_ORIGINS`, restart the agent, and add the widget in the 3DDashboard by its URL.

The deployed files hold no secrets: model keys and ITEROP credentials stay with the agent on your machine. Some tenants accept widgets only from approved domains.

### On MinIO

1. `cd widget`, copy `minio.config.example.json` to `minio.config.json` (git-ignored) and fill it in.
2. `npm run deploy` (or `npm run deploy:watch` to rebuild and upload on every change). It prints the widget URL.
3. In the 3DDashboard, add the widget by that URL.
4. Add the dashboard's origin to `AGENT_ALLOWED_ORIGINS` and restart the agent.
5. Widget preferences: _Agent server_ (default `http://127.0.0.1:3100`) and _Default model_.

Drop a 3DEXPERIENCE object on the widget to give the agent its context (name, type, id).

**Check first:** the dashboard is HTTPS and the agent runs on your machine. Chrome asks permission before a public page calls a local server (the agent answers the Private Network Access preflight), and company policy may block it. If it is blocked, host the agent behind HTTPS.

## Tested so far

- `tests/agent.test.ts`: config, approval policy, and the agent against the **simulated** ITEROP connector with a scripted model: any model reads; a read-only model is refused a write before it reaches ITEROP; a certified model gets an approval request; origins are enforced.
- By hand, standalone, with Ollama `qwen3-coder:30b` and the simulated engine: the widget connects, lists the models, and the model calls `iterop_connection` and `iterop_list_startable_processes` through the connector. On its third turn it wrote a tool call as plain text instead of calling it, so it is not ready for the full chain.
- Not yet: inside a 3DDashboard, the live sandbox, CATIA Magic, and the Hall B benchmark per model.
