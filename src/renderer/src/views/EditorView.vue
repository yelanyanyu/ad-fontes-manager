<template>
  <div class="workspace-inner">
    <div class="panel" style="max-width: 900px; margin: 0 auto;">
      <div class="panel-head">
        <div class="panel-title">
          <strong>Generate Entry</strong>
          <span>AI-powered</span>
        </div>
      </div>
      <div class="panel-body">
        <div class="placeholder-text">
          Enter a word and configure generation options to create a YAML entry.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-inner {
  min-height: calc(100vh - 88px);
  padding: 8px 0;
}

.panel {
  min-height: 0;
  overflow: hidden;
  background: var(--surface-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.panel-head {
  height: 48px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, #fffefa, #fbf8f2);
}

[data-theme="dark"] .panel-head {
  background: linear-gradient(180deg, #2a261f, #221f1a);
}

.panel-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.panel-title strong {
  font-size: 14px;
  font-weight: 740;
  letter-spacing: 0.055em;
  color: #2f2b26;
  text-transform: uppercase;
}

[data-theme="dark"] .panel-title strong {
  color: #eee8de;
}

.panel-title span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
}

.panel-title span::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--blue);
  box-shadow: 0 0 0 3px rgba(36, 91, 216, 0.08);
}

.panel-body {
  padding: 40px 24px;
}

.placeholder-text {
  color: var(--muted);
  font-size: 14px;
  text-align: center;
}
</style>
