import type { ToolApprovalStatus } from 'ai';
import type { ConnectedTool } from './connectors';

/**
 * Who may run a tool call. Reads run directly. Every other call, from any connector, waits for
 * the user's approval in the widget, and only models certified for the full chain may ask.
 * Unknown tools are refused. The connectors' own guards still apply behind this gate.
 */
export function approvalFor(
  tool: ConnectedTool | undefined,
  model: string,
  fullChainModels: string[],
): ToolApprovalStatus | undefined {
  if (!tool) return { type: 'denied', reason: 'This tool is not exposed by any connector.' };
  if (tool.readOnly) return undefined;
  if (!fullChainModels.includes(model))
    return {
      type: 'denied',
      reason: `${model} is certified for reading only. Choose a full-chain model to make changes.`,
    };
  return 'user-approval';
}
