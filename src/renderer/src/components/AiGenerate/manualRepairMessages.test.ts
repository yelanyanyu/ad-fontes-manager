import { describe, expect, it } from 'vitest';

import { buildManualRepairMessage } from './manualRepairMessages';

describe('manual repair messages', () => {
  it('selects Word structure copy for schema diagnostics', () => {
    const message = buildManualRepairMessage({
      locale: 'zh',
      changed: true,
      diagnostics: [{ code: 'schema.invalid', path: 'etymology.historical_origins' }],
      summary: 'etymology.historical_origins is required',
    });

    expect(message.title).toBe('词条结构需要手动修复');
    expect(message.diagnosis).toBe('缺少必填字段：etymology.historical_origins');
    expect(message.rawPath).toBe('etymology.historical_origins');
    expect(message.primaryFillLabel).toBe('填入最小修复版');
    expect(message.originalFillLabel).toBe('填入原始 YAML');
  });

  it('selects YAML syntax copy for parse diagnostics', () => {
    const message = buildManualRepairMessage({
      locale: 'en',
      changed: false,
      diagnostics: [{ code: 'yaml.parse_error', path: 'root' }],
      summary: 'YAML parse error',
    });

    expect(message.title).toBe('YAML syntax needs manual repair');
    expect(message.primaryFillTooltip).toContain('safer formatting repairs');
    expect(message.originalFillTooltip).toContain('original model output');
  });

  it('does not report root as missing when schema rejects an unknown nested key', () => {
    const message = buildManualRepairMessage({
      locale: 'zh',
      changed: true,
      diagnostics: [
        {
          code: 'schema.invalid',
          path: 'root',
          message: 'root: Unrecognized key: "historical_origins_alt"',
        },
      ],
      summary: 'root: Unrecognized key: "historical_origins_alt"',
    });

    expect(message.diagnosis).toBe('存在不支持的字段：historical_origins_alt');
    expect(message.rawPath).toBe('historical_origins_alt');
  });
});
