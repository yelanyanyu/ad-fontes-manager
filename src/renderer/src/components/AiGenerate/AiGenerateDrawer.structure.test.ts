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
});
