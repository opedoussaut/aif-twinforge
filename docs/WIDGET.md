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

## Run it locally

1. A model endpoint. With Ollama: `ollama serve`, then `AGENT_MODEL_BASE_URL=http://127.0.0.1:11434/v1`. With LiteLLM: `litellm --config litellm.yaml` (port 4000, the default).
2. Settings in `.env` (see `.env.example`, section _Agent for the 3DDashboard widget_).
3. The agent: `npm run agent` → `http://127.0.0.1:3100`.
4. The widget, standalone: `cd widget && npm install && npm start` → <http://localhost:8081>. Allow that origin in `AGENT_ALLOWED_ORIGINS`.

## Put it in the 3DDashboard

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
