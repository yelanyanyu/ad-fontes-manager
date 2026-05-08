export interface PipelineStage {
  id: string;
  description: string;
  type: 'llm' | 'validate';
  modelKey?: 'fast' | 'balanced' | 'expert';
  systemPromptFile?: string;
  toolNames?: string[];
  outputParser?: (text: string) => Partial<PipelineContext>;
  schemaName?: string;
  retry?: { maxAttempts: number; fixerStageId?: string };
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
  error?: string;
}

export interface PipelineContext {
  word: string;
  context: string;
  language: string;
  notes: string;
  searchSummary?: string;
  researchYaml?: string;
  fullYaml?: string;
  scores?: Record<string, unknown>;
}

export interface PipelineJob {
  jobId: string;
  word: string;
  language: string;
  context?: string;
  notes?: string;
  status: 'queued' | 'running' | 'complete' | 'error';
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
  | { type: 'step:start'; step: string; message: string }
  | { type: 'step:tokens'; step: string; chunk: string }
  | {
      type: 'step:complete';
      step: string;
      duration: number;
      summary: string;
      result?: unknown;
    }
  | { type: 'step:error'; step: string; error: string; willRetry: boolean }
  | {
      type: 'pipeline:complete';
      yaml: string;
      scores: Record<string, unknown>;
      totalDuration: number;
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
    }>;
  }): Promise<{ yaml: string; scores: Record<string, unknown> }>;
}
