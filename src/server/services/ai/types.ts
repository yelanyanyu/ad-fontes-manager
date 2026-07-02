export type PipelineContextKey =
  | 'searchSummary'
  | 'researchYaml'
  | 'creativeYaml'
  | 'fullYaml'
  | 'scores';

export interface StageExecutionPolicy {
  kind: 'llm' | 'validate';
  timeoutMs?: number;
  maxOutputTokens?: number;
  tools?: {
    names: string[];
    maxRounds?: number;
    requiresSearchApiKey?: boolean;
    fallbackOnFailureToolName?: string;
  };
}

export interface StageOutputPolicy {
  kind: 'yaml-fragment' | 'full-yaml' | 'scores';
  contextKey?: PipelineContextKey;
}

export interface StageAssemblyPolicy {
  kind: 'none' | 'merge-yaml';
  sourceKeys?: ['researchYaml', 'creativeYaml'];
  targetKey?: 'fullYaml';
}

export interface StageStopLossPolicy {
  kind: 'none' | 'require-text-and-context';
  contextKey?: PipelineContextKey;
  partialResultKey?: PipelineContextKey;
  fallback?: {
    kind: 'retry-without-tools';
    useToolEvidenceSummary?: boolean;
  };
}

export interface StagePolicy {
  execution: StageExecutionPolicy;
  output: StageOutputPolicy;
  assembly: StageAssemblyPolicy;
  stopLoss: StageStopLossPolicy;
}

export interface PipelineStage {
  id: string;
  description: string;
  type: 'llm' | 'validate';
  policy?: StagePolicy;
  modelKey?: 'fast' | 'balanced' | 'expert';
  systemPromptFile?: string;
  schemaFile?: string;
  toolNames?: string[];
  promptInputAugmenters?: Array<'aiFlavorMarkerReport'>;
  outputParser?: (text: string) => Partial<PipelineContext>;
  schemaName?: string;
  retry?: { maxAttempts: number; fixerStageId?: string };
}

export interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'complete' | 'error';
  input?: unknown;
  output?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  warning?: string;
}

export interface PipelineDefinition {
  id: string;
  language: string;
  stages: PipelineStage[];
}

export interface StepResult {
  step: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  startTime: number;
  endTime?: number;
  durationMs?: number;
  summary?: string;
  tokens?: string;
  result?: unknown;
  rawText?: string;
  reasoningText?: string;
  diagnostics?: unknown;
  toolCalls?: ToolCallRecord[];
  error?: string;
}

export interface PipelineContext {
  word: string;
  context: string;
  language: string;
  notes: string;
  searchSummary?: string;
  researchYaml?: string;
  creativeYaml?: string;
  fullYaml?: string;
  scores?: Record<string, unknown>;
  userScore?: number;
  revisionNotes?: string;
}

export interface PipelineJob {
  jobId: string;
  word: string;
  language: string;
  context?: string;
  notes?: string;
  status: 'queued' | 'running' | 'paused' | 'complete' | 'partial' | 'error';
  queuePosition?: number;
  steps: StepResult[];
  currentStep?: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
  result?: {
    yaml: string;
    scores: Record<string, unknown>;
  };
}

export type PipelineProgressEvent =
  | { type: 'job:queued'; position: number }
  | { type: 'job:started' }
  | { type: 'job:paused'; step?: string }
  | { type: 'step:start'; step: string; message: string }
  | { type: 'step:tokens'; step: string; chunk: string }
  | { type: 'step:reasoning'; step: string; chunk: string }
  | {
      type: 'step:tool-call';
      step: string;
      toolCallId: string;
      toolName: string;
      input?: unknown;
      startTime: number;
    }
  | {
      type: 'step:tool-result';
      step: string;
      toolCallId: string;
      toolName: string;
      output?: unknown;
      error?: string;
      warning?: string;
      duration: number;
    }
  | {
      type: 'step:complete';
      step: string;
      duration: number;
      summary: string;
      result?: unknown;
      rawText?: string;
      reasoningText?: string;
      diagnostics?: unknown;
    }
  | { type: 'step:diagnostic'; step: string; diagnostics: unknown }
  | { type: 'step:error'; step: string; error: string; willRetry: boolean; diagnostics?: unknown }
  | {
      type: 'pipeline:complete';
      yaml: string;
      scores: Record<string, unknown>;
      totalDuration: number;
    }
  | {
      type: 'pipeline:stopped';
      yaml: string;
      stoppedAtStage: string;
      reason: string;
    };

export interface PipelineRunner {
  run(params: {
    definition: PipelineDefinition;
    input: { word: string; context?: string; language: string; notes?: string };
    onProgress: (event: PipelineProgressEvent) => void;
    abortSignal?: { aborted: boolean; addEventListener: (type: string, fn: () => void) => void };
    resumeFromStage?: string;
    previousContext?: Partial<PipelineContext>;
    previousSteps?: Array<{
      step: string;
      summary?: string;
      duration?: number;
      result?: unknown;
      rawText?: string;
      reasoningText?: string;
    }>;
  }): Promise<{ yaml: string; scores: Record<string, unknown> }>;
}
