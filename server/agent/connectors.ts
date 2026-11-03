import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dynamicTool, jsonSchema, type JSONSchema7, type ToolSet } from 'ai';
import type { ConnectorSpec } from './config';

/** One tool exposed by an MCP connector, with what the harness needs to gate it. */
export type ConnectedTool = {
  name: string;
  connector: string;
  description: string;
  /** Only tools that declare readOnlyHint: true run without approval. */
  readOnly: boolean;
};

const root = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The same MCP connectors Claude Desktop uses, started as stdio child processes. They keep the
 * credentials and the guards; the model only sees their fixed tools.
 */
export class Connectors {
  private constructor(
    private readonly clients: { name: string; client: Client }[],
    readonly tools: ConnectedTool[],
  ) {}

  static async start(specs: ConnectorSpec[], env: Record<string, string> = {}) {
    const clients: { name: string; client: Client }[] = [];
    const tools: ConnectedTool[] = [];
    const baseEnv = Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
    );
    try {
      for (const spec of specs) {
        const client = new Client({ name: 'aif-twinforge-agent', version: '0.1.0' });
        await client.connect(
          new StdioClientTransport({
            command: process.execPath,
            args: ['--import', 'tsx', spec.script],
            cwd: root,
            env: { ...baseEnv, ...env },
          }),
        );
        clients.push({ name: spec.name, client });
        for (const t of (await client.listTools()).tools) {
          if (tools.some((x) => x.name === t.name))
            throw new Error(`Tool "${t.name}" is exposed by two connectors.`);
          tools.push({
            name: t.name,
            connector: spec.name,
            description: t.description ?? '',
            readOnly: t.annotations?.readOnlyHint === true,
          });
        }
      }
    } catch (e) {
      await Promise.allSettled(clients.map((c) => c.client.close()));
      throw e;
    }
    return new Connectors(clients, tools);
  }

  /** AI SDK tools that forward each call to its connector, unchanged. */
  async toolSet(): Promise<ToolSet> {
    const set: ToolSet = {};
    for (const { name, client } of this.clients)
      for (const t of (await client.listTools()).tools)
        set[t.name] = dynamicTool({
          description: t.description ?? '',
          inputSchema: jsonSchema(t.inputSchema as JSONSchema7),
          execute: async (input) => {
            const r = await client.callTool({
              name: t.name,
              arguments: (input ?? {}) as Record<string, unknown>,
            });
            const text = ((r.content ?? []) as { type: string; text?: string }[])
              .filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
            let result: unknown = text;
            try {
              result = JSON.parse(text);
            } catch {
              // Plain-text answers are passed through as they are.
            }
            return r.isError ? { error: true, connector: name, result } : result;
          },
        });
    return set;
  }

  async close() {
    await Promise.allSettled(this.clients.map((c) => c.client.close()));
  }
}
