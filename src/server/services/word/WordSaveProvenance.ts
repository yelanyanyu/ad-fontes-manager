export type SyncMarkerStatus = 'updated' | 'not-found' | 'word-not-found';
export type ProvenanceWarning = 'source-job-not-found' | 'word-not-found';

export interface WorksetSyncMarkerWriter {
  markWorksetJobSynced(jobId: string, wordId: string): SyncMarkerStatus;
}

export interface WordSaveProvenance {
  sourceJobId: string | null;
  syncMarkerUpdated: boolean;
  syncMarkerStatus: SyncMarkerStatus | 'skipped';
  shouldRefreshWorkset: boolean;
  provenanceWarning?: ProvenanceWarning;
}

export interface SaveWordWithProvenanceParams<Req = unknown> {
  req: Req;
  yaml: string;
  forceUpdate?: boolean;
  sourceJobId?: string | null;
  saveWord: (
    req: Req,
    yaml: string,
    forceUpdate?: boolean,
    options?: { source?: 'import' }
  ) => Promise<Record<string, unknown>>;
  syncMarkerWriter: WorksetSyncMarkerWriter;
  source?: 'import';
}

export type SaveWordWithProvenanceResult = Record<string, unknown> & {
  provenance: WordSaveProvenance;
};

function toSourceJobId(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

function warningForStatus(status: SyncMarkerStatus): ProvenanceWarning | undefined {
  if (status === 'not-found') return 'source-job-not-found';
  if (status === 'word-not-found') return 'word-not-found';
  return undefined;
}

export async function saveWordWithProvenance<Req = unknown>(
  params: SaveWordWithProvenanceParams<Req>
): Promise<SaveWordWithProvenanceResult> {
  const result = await params.saveWord(params.req, params.yaml, params.forceUpdate, {
    source: params.source,
  });
  const sourceJobId = toSourceJobId(params.sourceJobId);
  const provenance: WordSaveProvenance = {
    sourceJobId,
    syncMarkerUpdated: false,
    syncMarkerStatus: 'skipped',
    shouldRefreshWorkset: Boolean(sourceJobId),
  };

  if (sourceJobId && result.success === true && typeof result.id === 'string' && result.id.trim()) {
    const syncMarkerStatus = params.syncMarkerWriter.markWorksetJobSynced(sourceJobId, result.id);
    provenance.syncMarkerStatus = syncMarkerStatus;
    provenance.syncMarkerUpdated = syncMarkerStatus === 'updated';
    const warning = warningForStatus(syncMarkerStatus);
    if (warning) provenance.provenanceWarning = warning;
  }

  return { ...result, provenance };
}
