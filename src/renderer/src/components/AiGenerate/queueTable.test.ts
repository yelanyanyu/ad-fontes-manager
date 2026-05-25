import { describe, expect, it } from 'vitest';
import {
  buildQueueTableTemplate,
  formatCompactStatus,
  formatReviewScore,
  reviewScoreClass,
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
});
