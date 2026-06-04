import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

void describe('AI Flavor Markers', () => {
  void it('returns structured hits and a prompt-ready summary', () => {
    const { buildAiFlavorMarkerEvidence, findMarkerHits } =
      require('./aiFlavorMarkers') as typeof import('./aiFlavorMarkers');
    const yamlText = [
      'etymology:',
      '  visual_imagery_zh: 测试字段包含不只是这个硬标识。',
      '  meaning_evolution_zh: 测试字段没有命中。',
    ].join('\n');

    const markers = [
      {
        id: 'not-phrase-prefix',
        label: '不是/不只是/不仅是/不止是',
        pattern: '不(?:是|只是|仅是|止是)',
      },
    ];
    const hits = findMarkerHits(yamlText, markers);

    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.field, 'etymology.visual_imagery_zh');
    assert.equal(hits[0]?.markerId, 'not-phrase-prefix');
    assert.equal(hits[0]?.match, '不只是');

    const evidence = buildAiFlavorMarkerEvidence(
      {
        word: 'dignity',
        context: '',
        language: 'en',
        notes: '',
        fullYaml: yamlText,
      },
      markers
    );

    assert.equal(evidence.hits.length, 1);
    assert.match(evidence.summaryText, /机械检测发现 1 处/);
  });
});
