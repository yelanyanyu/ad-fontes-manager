import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { saveWordWithProvenance } from '../src/server/services/word/WordSaveProvenance';

void describe('Word Save Provenance', () => {
  void it('records Workset Sync Marker provenance after a successful Word save', async () => {
    const marked: Array<{ jobId: string; wordId: string }> = [];

    const result = await saveWordWithProvenance({
      req: { id: 'req-1' },
      yaml: 'yield:\n  lemma: above\n',
      forceUpdate: false,
      sourceJobId: 'job-above',
      saveWord: async () => ({
        success: true,
        id: 'word-above',
        status: 'created',
      }),
      syncMarkerWriter: {
        markWorksetJobSynced(jobId, wordId) {
          marked.push({ jobId, wordId });
          return 'updated';
        },
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.id, 'word-above');
    assert.deepEqual(marked, [{ jobId: 'job-above', wordId: 'word-above' }]);
    assert.deepEqual(result.provenance, {
      sourceJobId: 'job-above',
      syncMarkerUpdated: true,
      syncMarkerStatus: 'updated',
      shouldRefreshWorkset: true,
    });
  });

  void it('keeps the Word save successful when provenance recording fails', async () => {
    const result = await saveWordWithProvenance({
      req: { id: 'req-1' },
      yaml: 'yield:\n  lemma: above\n',
      forceUpdate: false,
      sourceJobId: 'missing-job',
      saveWord: async () => ({
        success: true,
        id: 'word-above',
        status: 'created',
      }),
      syncMarkerWriter: {
        markWorksetJobSynced() {
          return 'not-found';
        },
      },
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.provenance, {
      sourceJobId: 'missing-job',
      syncMarkerUpdated: false,
      syncMarkerStatus: 'not-found',
      shouldRefreshWorkset: true,
      provenanceWarning: 'source-job-not-found',
    });
  });

  void it('does not record provenance when the Word save does not succeed', async () => {
    let markerCalls = 0;

    const result = await saveWordWithProvenance({
      req: { id: 'req-1' },
      yaml: 'yield:\n  lemma: above\n',
      forceUpdate: false,
      sourceJobId: 'job-above',
      saveWord: async () => ({
        status: 'conflict',
        oldData: {},
        newData: {},
      }),
      syncMarkerWriter: {
        markWorksetJobSynced() {
          markerCalls += 1;
          return 'updated';
        },
      },
    });

    assert.equal(result.status, 'conflict');
    assert.equal(markerCalls, 0);
    assert.deepEqual(result.provenance, {
      sourceJobId: 'job-above',
      syncMarkerUpdated: false,
      syncMarkerStatus: 'skipped',
      shouldRefreshWorkset: true,
    });
  });
});
