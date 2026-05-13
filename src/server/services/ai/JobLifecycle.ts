import { EventEmitter } from 'node:events';

import type { PipelineProgressEvent, StepResult } from './types';
import { QueueStore } from './QueueStore';

export class JobLifecycle {
  private emitters = new Map<string, EventEmitter>();
  private completedSteps = new Map<string, PipelineProgressEvent[]>();
  private subscribers = new Map<
    string,
    Array<{ res: unknown; listener: (event: PipelineProgressEvent) => void }>
  >();

  constructor(private readonly store: QueueStore) {}

  ensureQueuedEmitter(jobId: string): void {
    if (!this.emitters.has(jobId)) {
      this.emitters.set(jobId, new EventEmitter());
      this.completedSteps.set(jobId, []);
    }
  }

  prepareStartedJob(jobId: string): {
    emitter: EventEmitter;
    steps: PipelineProgressEvent[];
    jobStartedEvent: PipelineProgressEvent;
  } {
    const emitter = this.emitters.get(jobId) || new EventEmitter();
    this.emitters.set(jobId, emitter);
    const steps: PipelineProgressEvent[] = [];
    this.completedSteps.set(jobId, steps);
    const jobStartedEvent: PipelineProgressEvent = { type: 'job:started' };
    emitter.emit('progress', jobStartedEvent);
    steps.push(jobStartedEvent);
    this.store.persistProgressEvents(jobId, steps);
    return { emitter, steps, jobStartedEvent };
  }

  subscribe(
    jobId: string,
    res: { write: (chunk: string) => void },
    initialEvent?: PipelineProgressEvent
  ): void {
    if (initialEvent) {
      res.write(`event: ${initialEvent.type}\ndata: ${JSON.stringify(initialEvent)}\n\n`);
    }

    const steps = this.completedSteps.get(jobId) || [];
    for (const event of steps) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }

    let emitter = this.emitters.get(jobId);
    if (!emitter) {
      emitter = new EventEmitter();
      this.emitters.set(jobId, emitter);
      if (!this.completedSteps.has(jobId)) {
        this.completedSteps.set(jobId, []);
      }
    }

    const onProgress = (event: PipelineProgressEvent): void => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    emitter.on('progress', onProgress);
    this.trackSubscriber(jobId, res, onProgress);
  }

  unsubscribe(jobId: string, res: unknown): void {
    const emitter = this.emitters.get(jobId);
    if (!emitter) return;
    const listeners = this.subscribers.get(jobId);
    if (!listeners) return;
    const idx = listeners.findIndex(l => l.res === res);
    if (idx >= 0) {
      emitter.off('progress', listeners[idx].listener);
      listeners.splice(idx, 1);
    }
    if (listeners.length === 0) {
      this.subscribers.delete(jobId);
    }
  }

  private shouldPersist(event: PipelineProgressEvent): boolean {
    return (
      event.type === 'step:complete' ||
      event.type === 'step:error' ||
      event.type === 'pipeline:complete' ||
      event.type === 'pipeline:stopped'
    );
  }

  emitProgress(jobId: string, event: PipelineProgressEvent): void {
    let emitter = this.emitters.get(jobId);
    if (!emitter) {
      emitter = new EventEmitter();
      this.emitters.set(jobId, emitter);
      this.completedSteps.set(jobId, []);
    }
    emitter.emit('progress', event);
    if (event.type !== 'step:tokens' && event.type !== 'step:reasoning') {
      const steps = this.completedSteps.get(jobId);
      if (steps) {
        steps.push(event);
        if (this.shouldPersist(event)) {
          this.store.persistProgressEvents(jobId, steps);
        }
      }
    }
  }

  recordProgress(
    jobId: string,
    event: PipelineProgressEvent,
    steps: PipelineProgressEvent[]
  ): void {
    const emitter = this.emitters.get(jobId);
    emitter?.emit('progress', event);
    if (event.type !== 'step:tokens' && event.type !== 'step:reasoning') {
      steps.push(event);
      if (this.shouldPersist(event)) {
        this.store.persistProgressEvents(jobId, steps);
      }
    }
  }

  getCompletedSteps(jobId: string): PipelineProgressEvent[] {
    const inMemory = this.completedSteps.get(jobId);
    if (inMemory) return inMemory;
    const row = this.store.getOne('SELECT progress_events FROM job_queue WHERE id = ?', jobId);
    return row ? this.store.getPersistedEvents(row) : [];
  }

  cleanup(jobId: string): void {
    this.emitters.delete(jobId);
    this.completedSteps.delete(jobId);
    this.subscribers.delete(jobId);
  }

  finishEmitter(jobId: string): void {
    const emitter = this.emitters.get(jobId);
    if (emitter) {
      emitter.emit('done');
      this.emitters.delete(jobId);
    }
  }

  buildStepResults(events: PipelineProgressEvent[]): StepResult[] {
    const steps: StepResult[] = [];
    for (const event of events) {
      if (event.type === 'step:start') {
        const existingIndex = steps.findIndex(step => step.step === event.step);
        const next: StepResult = {
          step: event.step,
          status: 'running',
          startTime: Date.now(),
          summary: event.message,
        };
        if (existingIndex >= 0) {
          steps[existingIndex] = { ...steps[existingIndex], ...next };
        } else {
          steps.push(next);
        }
      } else if (event.type === 'step:tool-call') {
        let step = steps.find(item => item.step === event.step);
        if (!step) {
          step = { step: event.step, status: 'running', startTime: Date.now() };
          steps.push(step);
        }
        step.toolCalls = step.toolCalls || [];
        if (!step.toolCalls.some(item => item.toolCallId === event.toolCallId)) {
          step.toolCalls.push({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            status: 'running',
            input: event.input,
            startTime: event.startTime,
          });
        }
      } else if (event.type === 'step:tool-result') {
        const step = steps.find(item => item.step === event.step);
        const toolCall = step?.toolCalls?.find(item => item.toolCallId === event.toolCallId);
        if (toolCall) {
          toolCall.status = event.error ? 'error' : 'complete';
          toolCall.output = event.output;
          toolCall.error = event.error;
          toolCall.warning = event.warning;
          toolCall.durationMs = event.duration;
          toolCall.endTime = toolCall.startTime + event.duration;
        }
      } else if (event.type === 'step:complete') {
        let step = steps.find(item => item.step === event.step);
        if (!step) {
          step = { step: event.step, status: 'running', startTime: Date.now() };
          steps.push(step);
        }
        step.status = 'complete';
        step.durationMs = event.duration;
        step.endTime = step.startTime + event.duration;
        step.summary = event.summary;
        step.result = event.result;
        step.rawText = event.rawText;
        step.reasoningText = event.reasoningText;
      } else if (event.type === 'step:error') {
        let step = steps.find(item => item.step === event.step);
        if (!step) {
          step = { step: event.step, status: 'running', startTime: Date.now() };
          steps.push(step);
        }
        step.status = 'error';
        step.error = event.error;
      }
    }
    return steps;
  }

  private trackSubscriber(
    jobId: string,
    res: unknown,
    listener: (event: PipelineProgressEvent) => void
  ): void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, []);
    }
    this.subscribers.get(jobId)!.push({ res, listener });
  }
}
