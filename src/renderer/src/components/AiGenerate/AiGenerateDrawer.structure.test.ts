import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AiGenerateDrawer structure', () => {
  it('keeps Single and Batch mode tabs outside the scrollable drawer body', () => {
    const source = readFileSync(resolve(__dirname, 'AiGenerateDrawer.vue'), 'utf8');

    const modeTabsIndex = source.indexOf('class="mode-tabs"');
    const drawerBodyIndex = source.indexOf('class="drawer-body"');

    expect(modeTabsIndex).toBeGreaterThan(-1);
    expect(drawerBodyIndex).toBeGreaterThan(-1);
    expect(modeTabsIndex).toBeLessThan(drawerBodyIndex);
  });

  it('uses close plus explicit YAML fill choices for manual repair recovery', () => {
    const source = readFileSync(resolve(__dirname, 'AiGenerateDrawer.vue'), 'utf8');

    expect(source).toContain('buildManualRepairMessage');
    expect(source).toContain('manualRepairDialog.primaryFillLabel');
    expect(source).toContain('manualRepairDialog.originalFillLabel');
    expect(source).toContain('class="manual-repair-diagnosis"');
    expect(source).toContain('class="manual-repair-tip"');
    expect(source).not.toContain('Keep Reviewing');
    expect(source).not.toContain('cancelLabel');
    expect(source).not.toContain(':title="manualRepairDialog');
  });
});
