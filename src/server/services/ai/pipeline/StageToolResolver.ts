import type { Tool } from 'ai';
import type { PipelineStage } from '../types';
import type { StageToolDescriptor, StageToolKind, StageToolSet } from './StageRecipe';

// 这个模块把 Stage 声明里的 Tool 名称解析成执行器能使用的工具集合。
// 目前只有 AI SDK function-call 适配器；CLI、MCP 和自定义调用器会从这里继续扩展。
const { getStagePolicy } =
  require('./PipelineDefinitionNormalizer') as typeof import('./PipelineDefinitionNormalizer');
const { resolveTools } = require('../tools/adapter') as {
  resolveTools: (toolNames?: string[]) => Record<string, Tool>;
};
const { getAIConfig } = require('../provider') as {
  getAIConfig: () => {
    search?: {
      apiKey?: string;
    };
  };
};

interface StageToolResolverLogger {
  info: (payload: Record<string, unknown>, msg?: string) => void;
}

export interface StageToolResolution {
  descriptors: StageToolDescriptor[];
  aiSdkTools: StageToolSet<Tool>;
}

const KNOWN_TOOL_KINDS: Record<string, StageToolKind> = {
  search_etymology: 'function-call',
  fetch_page: 'function-call',
};

/**
 * 解析一个 Stage 本次运行可以使用的工具。
 */
export class StageToolResolver {
  resolve(stage: PipelineStage, runLogger?: StageToolResolverLogger): StageToolResolution {
    const toolNames = this.getDeclaredToolNames(stage);
    if (this.shouldDisableSearchTools(stage, toolNames, runLogger)) {
      return { descriptors: [], aiSdkTools: {} };
    }

    const descriptors = toolNames.map(name => this.describeTool(name));
    return {
      descriptors,
      aiSdkTools: this.resolveAiSdkTools(descriptors),
    };
  }

  /**
   * 从 Stage Policy 或旧字段里读取工具名称。
   */
  private getDeclaredToolNames(stage: PipelineStage): string[] {
    const policy = getStagePolicy(stage);
    return policy.execution.tools?.names || stage.toolNames || [];
  }

  /**
   * 搜索工具需要 API Key；缺失时整组搜索工具不要暴露给模型。
   */
  private shouldDisableSearchTools(
    stage: PipelineStage,
    toolNames: string[],
    runLogger?: StageToolResolverLogger
  ): boolean {
    const policy = getStagePolicy(stage);
    if (!policy.execution.tools?.requiresSearchApiKey) return false;
    if (!toolNames.includes('search_etymology')) return false;

    const aiConfig = getAIConfig();
    if (aiConfig.search?.apiKey) return false;

    runLogger?.info(
      { step: stage.id, event: 'search-tools-disabled' },
      'Search tools disabled because search API key is not configured'
    );
    return true;
  }

  /**
   * 把工具名称转成通用描述。
   */
  private describeTool(name: string): StageToolDescriptor {
    return {
      name,
      kind: KNOWN_TOOL_KINDS[name] || 'custom',
    };
  }

  /**
   * 当前执行器只能把 function-call 工具交给 AI SDK。
   */
  private resolveAiSdkTools(descriptors: StageToolDescriptor[]): StageToolSet<Tool> {
    const functionCallNames = descriptors
      .filter(descriptor => descriptor.kind === 'function-call')
      .map(descriptor => descriptor.name);
    return resolveTools(functionCallNames);
  }
}

module.exports = { StageToolResolver };
