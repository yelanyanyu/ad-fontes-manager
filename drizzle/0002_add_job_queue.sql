CREATE TABLE job_queue (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT,
  job_type TEXT NOT NULL CHECK(job_type IN ('generate', 'fix', 'audit-fix')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high')),
  status TEXT NOT NULL DEFAULT 'queued',
  word TEXT,
  language TEXT,
  context TEXT,
  notes TEXT,
  target_job_id TEXT,
  target_word_id TEXT,
  provider_id TEXT,
  result_yaml TEXT,
  result_scores TEXT,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_job_queue_batch_id ON job_queue(batch_id);
CREATE INDEX idx_job_queue_status ON job_queue(status);
CREATE INDEX idx_job_queue_priority_created ON job_queue(priority, created_at);
