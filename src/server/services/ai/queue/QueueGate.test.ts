import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QueueGate } from './QueueGate';

void describe('QueueGate', () => {
  void it('reserves and releases concurrency slots up to the configured limit', () => {
    const gate = new QueueGate(2);

    assert.equal(gate.reserveSlot(), true);
    assert.equal(gate.reserveSlot(), true);
    assert.equal(gate.reserveSlot(), false);
    assert.equal(gate.getActiveCount(), 2);

    gate.releaseSlot();

    assert.equal(gate.reserveSlot(), true);
    assert.equal(gate.getActiveCount(), 2);
  });

  void it('allows the concurrency limit to grow at runtime', () => {
    const gate = new QueueGate(1);

    assert.equal(gate.reserveSlot(), true);
    assert.equal(gate.reserveSlot(), false);

    gate.setMaxConcurrency(3);

    assert.equal(gate.reserveSlot(), true);
    assert.equal(gate.reserveSlot(), true);
    assert.equal(gate.reserveSlot(), false);
    assert.equal(gate.getActiveCount(), 3);
  });

  void it('tracks abort controllers and pause flags for running jobs', () => {
    const gate = new QueueGate(1);
    const controller = new AbortController();

    gate.setAbortController('job-1', controller);
    gate.markPaused('job-1');
    gate.abortAll();

    assert.equal(gate.getAbortController('job-1'), controller);
    assert.equal(gate.isPaused('job-1'), true);
    assert.equal(controller.signal.aborted, true);

    gate.clearPause('job-1');
    gate.deleteAbortController('job-1');

    assert.equal(gate.isPaused('job-1'), false);
    assert.equal(gate.getAbortController('job-1'), undefined);
  });

  void it('opens and resets provider circuit breakers after consecutive failures', () => {
    const gate = new QueueGate(1);

    gate.recordProviderFailure('provider-a', { wasAborted: false });
    gate.recordProviderFailure('provider-a', { wasAborted: false });
    assert.deepEqual(gate.getExcludedProviders(), []);

    gate.recordProviderFailure('provider-a', { wasAborted: false });
    assert.deepEqual(gate.getExcludedProviders(), ['provider-a']);

    gate.resetCircuitBreaker('provider-a');
    assert.deepEqual(gate.getExcludedProviders(), []);
  });
});
