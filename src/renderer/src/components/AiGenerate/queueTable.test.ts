import { describe, expect, it } from 'vitest';
import {
  buildQueueTableTemplate,
  formatCompactStatus,
  formatRunMetricsSummary,
  formatReviewScore,
  isRunMetricsRowExpanded,
  reviewScoreClass,
  toggleRunMetricsModeExpansion,
  toggleRunMetricsRowExpansion,
  type QueueRunMetricsDisclosureState,
  worksetQueueColumns,
} from './queueTable';

describe('queueTable', () => {
  it('builds one grid template from semantic columns for header and rows', () => {
    expect(buildQueueTableTemplate(worksetQueueColumns)).toBe(
      '76px minmax(180px, 1fr) 72px 48px 88px'
    );
  });

  it('formats queue status and review score chips consistently', () => {
    expect(formatCompactStatus('complete')).toBe('done');
    expect(formatCompactStatus('partial')).toBe('part');
    expect(formatReviewScore(8)).toBe('8/10');
    expect(formatReviewScore(null)).toBe('--');
    expect(reviewScoreClass(9)).toBe('score-strong');
    expect(reviewScoreClass(5)).toBe('score-low');
  });

  it('formats compact Run Metrics summaries for Queue disclosure rows', () => {
    expect(
      formatRunMetricsSummary({
        totalDurationMs: 102000,
        totalTokens: 18400,
        stages: [],
      })
    ).toBe('Total 1m42s · 18.4k tok');

    expect(
      formatRunMetricsSummary({
        totalDurationMs: 102000,
        totalTokens: null,
        stages: [],
      })
    ).toBe('Total 1m42s');

    expect(
      formatRunMetricsSummary({
        totalDurationMs: null,
        totalTokens: null,
        stages: [],
      })
    ).toBe('');
  });

  it('collapses single-row disclosure when the header collapse action is used', () => {
    const state: QueueRunMetricsDisclosureState = {
      expandedByMode: { active: false, history: false, workset: false },
      expandedRows: new Set(['job-1']),
      collapsedRows: new Set(),
    };

    expect(isRunMetricsRowExpanded(state, 'active', 'job-1')).toBe(true);

    const collapsed = toggleRunMetricsModeExpansion(state, 'active', ['job-1', 'job-2']);

    expect(isRunMetricsRowExpanded(collapsed, 'active', 'job-1')).toBe(false);
    expect(isRunMetricsRowExpanded(collapsed, 'active', 'job-2')).toBe(false);
  });

  it('lets a row collapse while its Queue surface is globally expanded', () => {
    const state: QueueRunMetricsDisclosureState = {
      expandedByMode: { active: false, history: false, workset: true },
      expandedRows: new Set(),
      collapsedRows: new Set(),
    };

    expect(isRunMetricsRowExpanded(state, 'workset', 'job-1')).toBe(true);

    const next = toggleRunMetricsRowExpansion(state, 'workset', 'job-1');

    expect(isRunMetricsRowExpanded(next, 'workset', 'job-1')).toBe(false);
    expect(isRunMetricsRowExpanded(next, 'workset', 'job-2')).toBe(true);
  });
});
