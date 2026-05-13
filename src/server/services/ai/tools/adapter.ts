import type { Tool } from 'ai';
import type { ToolResult } from './buildTool';

const { jsonSchema, tool } = require('ai') as typeof import('ai');
const { searchEtymologyTool } = require('./searchEtymology') as typeof import('./searchEtymology');
const { fetchPageTool } = require('./fetchPage') as typeof import('./fetchPage');

type BuiltTool = {
  id: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: never, signal?: AbortSignal) => Promise<ToolResult<unknown>>;
};

export function toAISdkTool(toolDef: BuiltTool): Tool {
  return tool({
    description: toolDef.description,
    inputSchema: jsonSchema(toolDef.inputSchema),
    execute: async (input, options) =>
      toolDef.run(input as never, (options as { signal?: AbortSignal } | undefined)?.signal),
  }) as Tool;
}

export function createToolRegistry(): Map<string, BuiltTool> {
  return new Map<string, BuiltTool>([
    [searchEtymologyTool.id, searchEtymologyTool as BuiltTool],
    [fetchPageTool.id, fetchPageTool as BuiltTool],
  ]);
}

export function resolveTools(toolNames: string[] = []): Record<string, Tool> {
  const registry = createToolRegistry();
  const resolved: Record<string, Tool> = {};
  for (const name of toolNames) {
    const toolDef = registry.get(name);
    if (toolDef) resolved[name] = toAISdkTool(toolDef);
  }
  return resolved;
}

module.exports = { toAISdkTool, createToolRegistry, resolveTools };
