type Dict = Record<string, unknown>;

interface CognateItem {
  word?: string;
  logic?: string;
}

interface ExampleItem {
  type?: string;
  sentence?: string;
  translation_zh?: string;
}

interface SynonymItem {
  word?: string;
  meaning_zh?: string;
}

const getByPath = (obj: Dict, path: string, fallback: unknown = ''): unknown => {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Dict)[key];
    }
    return undefined;
  }, obj);

  return value || fallback;
};

const trimText = (value: unknown): string => (value ? String(value).trim() : '');

export function generateCardHTML(data: Dict): string {
  const c = {
    bg: '#fcfbf9',
    textMain: '#2d3748',
    textSub: '#718096',
    accent: '#b7791f',
    accentLight: '#faf5ff',
    border: '#e2e8f0',
    sectionHeader: '#2c5282',
  };

  const s = {
    card: `font-family: 'Noto Sans SC', sans-serif; max-width: 650px; margin: 0 auto; background-color: ${c.bg}; color: ${c.textMain}; border: 1px solid ${c.border}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);`,
    section: `padding: 20px; border-bottom: 1px solid ${c.border}; background: white;`,
    h1: `font-family: 'Noto Serif SC', serif; font-size: 32px; font-weight: 700; color: ${c.sectionHeader}; margin: 0; line-height: 1.2;`,
    h2: `font-family: 'Noto Serif SC', serif; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${c.accent}; margin-bottom: 12px; border-left: 4px solid ${c.accent}; padding-left: 10px;`,
    h3: `font-family: 'Noto Serif SC', serif; font-size: 14px; font-weight: 700; color: ${c.sectionHeader}; margin-top: 18px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid ${c.border}; display: block;`,
    sub: `font-size: 14px; color: ${c.textSub}; margin-bottom: 8px;`,
    p: `font-size: 15px; line-height: 1.6; margin: 0 0 8px 0;`,
    tag: `display: inline-block; background: ${c.accentLight}; color: ${c.sectionHeader}; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-right: 5px; border: 1px solid #e2e8f0;`,
    mythBox: `background: #fff5f5; padding: 12px; border-radius: 6px; font-size: 14px; border-left: 4px solid #e53e3e; margin-top: 10px; color: #742a2a;`,
    textBlock: `background: #fffaf0; padding: 15px; border-radius: 6px; border: 1px dashed ${c.accent}; color: #2d3748; font-family: 'Lora', serif; white-space: pre-line; line-height: 1.6;`,
    grid: `display: grid; grid-template-columns: 1fr; gap: 10px;`,
  };

  const otherMeanings = getByPath(data, 'yield.other_common_meanings', []) as unknown[];
  let otherMeaningsHtml = '';
  if (Array.isArray(otherMeanings) && otherMeanings.length > 0) {
    otherMeaningsHtml = `
        <div style="margin-top: 15px; padding-top: 12px; border-top: 1px dashed ${c.border};">
            <div style="font-size: 13px; font-weight: 700; color: ${c.sectionHeader}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Other Common Meanings:</div>
            <ul style="list-style-type: disc; padding-left: 18px; margin: 0; color: ${c.textSub}; font-size: 14px; line-height: 1.5;">
                ${otherMeanings.map(m => `<li style="margin-bottom: 4px; padding-left: 4px;">${String(m ?? '')}</li>`).join('')}
            </ul>
        </div>`;
  }

  const yieldSec = `
    <div style="${s.section}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <div style="${s.sub}">${String(getByPath(data, 'yield.syllabification'))} · ${String(getByPath(data, 'yield.part_of_speech'))}</div>
                <h1 style="${s.h1}">${String(getByPath(data, 'yield.lemma'))}</h1>
                <div style="font-size: 14px; color: #a0aec0; margin-top: 4px;">User context: "${String(getByPath(data, 'yield.user_word'))}"</div>
            </div>
        </div>
        <div style="margin-top: 15px;">
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">${String(getByPath(data, 'yield.contextual_meaning.en'))}</div>
            <div style="font-size: 16px; color: #4a5568;">${String(getByPath(data, 'yield.contextual_meaning.zh'))}</div>
        </div>
        ${otherMeaningsHtml}
    </div>`;

  const etymData = (data.etymology as Dict | undefined) || {};
  const roots = (etymData.root_and_affixes as Dict | undefined) || {};
  const etymSec = `<div style="${s.section.replace('background: white;', '')} border-bottom: 1px solid ${c.border};"><h2 style="${s.h2}">Etymology: Deep Analysis</h2><div style="display:flex; gap: 5px; margin-bottom: 15px; font-family: monospace; font-size: 13px;">${roots.prefix && roots.prefix !== 'N/A' ? `<span style="${s.tag}">PRE: ${String(roots.prefix)}</span>` : ''}<span style="${s.tag} background: #ebf8ff; color: #2b6cb0;">ROOT: ${String(roots.root ?? '')}</span>${roots.suffix && roots.suffix !== 'N/A' ? `<span style="${s.tag}">SUF: ${String(roots.suffix)}</span>` : ''}</div><p style="${s.p} font-size: 14px;"><strong>Structure:</strong> ${String(roots.structure_analysis ?? '')}</p><p style="${s.p} font-size: 14px;"><strong>Source:</strong> ${String((etymData.historical_origins as Dict | undefined)?.source_word ?? '')} <span style="color:${c.accent}">(${String((etymData.historical_origins as Dict | undefined)?.pie_root ?? '')})</span></p>${(etymData.historical_origins as Dict | undefined)?.history_myth && (etymData.historical_origins as Dict).history_myth !== 'N/A' ? `<div style="${s.mythBox}"><strong>History:</strong> ${String((etymData.historical_origins as Dict).history_myth)}</div>` : ''}<div style="margin-top: 15px;"><div style="${s.h3}">Visual Imagery</div><div style="${s.textBlock}">${trimText(etymData.visual_imagery_zh)}</div></div><div style="margin-top: 15px;"><div style="${s.h3}">Meaning Evolution</div><div style="${s.textBlock}">${trimText(etymData.meaning_evolution_zh)}</div></div></div>`;

  const cognates = getByPath(data, 'cognate_family.cognates', []) as CognateItem[];
  const linkSec = `<div style="${s.section.replace('background: white;', '')} background: #fffdfa;"><h2 style="${s.h2}">Link: Cognate Family</h2><p style="font-size:13px; color: ${c.textSub}; margin-bottom: 10px;">${String(getByPath(data, 'cognate_family.instruction'))}</p><div style="${s.grid}">${cognates.map(cog => `<div style="background: white; border: 1px solid ${c.border}; padding: 10px; border-radius: 6px;"><span style="font-weight: 700; color: ${c.sectionHeader}; font-size: 15px;">${String(cog.word ?? '')}</span><div style="font-size: 13px; color: #4a5568; margin-top: 4px; border-top: 1px solid #f7fafc; padding-top: 4px;">${String(cog.logic ?? '')}</div></div>`).join('')}</div></div>`;

  const examples = getByPath(data, 'application.selected_examples', []) as ExampleItem[];
  const appSec = `<div style="${s.section.replace('background: white;', '')}"><h2 style="${s.h2}">Application: Practice</h2><div style="display: flex; flex-direction: column; gap: 12px;">${examples.map(ex => `<div style="border-left: 3px solid #cbd5e0; padding-left: 12px;"><div style="font-size: 11px; font-weight: bold; color: ${c.accent}; text-transform: uppercase; margin-bottom: 2px;">${String(ex.type ?? '')}</div><div style="font-family: 'Lora', serif; font-size: 15px; color: #1a202c; margin-bottom: 2px;">${String(ex.sentence ?? '')}</div><div style="font-size: 13px; color: #718096;">${String(ex.translation_zh ?? '')}</div></div>`).join('')}</div></div>`;

  const synonyms = getByPath(data, 'nuance.synonyms', []) as SynonymItem[];
  const nuanceSec = `<div style="${s.section.replace('background: white;', '')} border-bottom: none;"><h2 style="${s.h2}">Nuance: Synonyms</h2><ul style="list-style: none; padding: 0; margin: 0 0 15px 0;">${synonyms.map(syn => `<li style="margin-bottom: 6px; font-size: 14px;"><span style="font-weight: 700; color: ${c.textMain};">${String(syn.word ?? '')}</span>: <span style="color: #4a5568;">${String(syn.meaning_zh ?? '')}</span></li>`).join('')}</ul><div style="background: #edf2f7; padding: 12px; border-radius: 6px; font-size: 14px; border-left: 4px solid ${c.sectionHeader}; margin-top: 10px;"><strong style="display:block; margin-bottom: 6px; font-size: 13px; color: ${c.sectionHeader};">Image Differentiation:</strong><div style="white-space: pre-line; line-height: 1.6;">${trimText(getByPath(data, 'nuance.image_differentiation_zh'))}</div></div></div>`;

  return `<div style="${s.card}">${yieldSec}${etymSec}${linkSec}${appSec}${nuanceSec}</div>`;
}

export function generateMarkdown(data: Dict): string {
  let md = '';

  md += `### Yield: 单词解析 (Context & Meaning)\n\n`;
  md += `* **用户单词**：${trimText(getByPath(data, 'yield.user_word'))}\n`;
  md += `* **音节划分**：${trimText(getByPath(data, 'yield.syllabification'))}\n`;
  md += `* **用户语境**："${trimText(getByPath(data, 'yield.user_context_sentence'))}"\n`;
  md += `* **词性**：${trimText(getByPath(data, 'yield.part_of_speech'))}\n`;
  md += `* **语境释义 (Contextual Meaning)**：\n`;
  md += `    * EN: ${trimText(getByPath(data, 'yield.contextual_meaning.en'))}\n`;
  md += `    * ZH: ${trimText(getByPath(data, 'yield.contextual_meaning.zh'))}\n`;

  const otherMeanings = getByPath(data, 'yield.other_common_meanings', []) as unknown[];
  if (Array.isArray(otherMeanings) && otherMeanings.length > 0) {
    md += `* **其他常见意思(基于 Lemma "${trimText(getByPath(data, 'yield.lemma'))}")**：\n`;
    otherMeanings.forEach((item, index) => {
      md += `    ${index + 1}. ${trimText(item)}\n`;
    });
  }
  md += `\n---\n\n`;

  md += `### Etymology: 深度分析 (Deep Analysis)\n\n`;
  const roots = getByPath(data, 'etymology.root_and_affixes', {}) as Dict;
  md += `* **Root & Affixes**【English Only】\n`;
  md += `    * Prefix: ${trimText(roots.prefix) || 'N/A'}\n`;
  md += `    * Root: **${trimText(roots.root)}**\n`;
  md += `    * Suffix: ${trimText(roots.suffix) || 'N/A'}\n`;
  md += `    * Structure Analysis: ${trimText(roots.structure_analysis)}\n\n`;

  const history = getByPath(data, 'etymology.historical_origins', {}) as Dict;
  md += `* **Historical Origins**【English Only / Verified via Search】\n`;
  md += `    * History/Myth: ${trimText(history.history_myth) || 'N/A'}\n`;
  md += `    * Source Word: ${trimText(history.source_word)}\n`;
  md += `    * PIE Root: ${trimText(history.pie_root)}\n\n`;

  const imagery = trimText(getByPath(data, 'etymology.visual_imagery_zh'));
  md += `* **词源画面**【中文描写】\n`;
  if (imagery) {
    imagery.split('\n').forEach(line => {
      if (line.trim()) md += `    ${line.trim()}\n`;
    });
  }
  md += `\n`;

  const evolution = trimText(getByPath(data, 'etymology.meaning_evolution_zh'));
  md += `* **词义演变**【中文描写】：\n`;
  if (evolution) {
    evolution.split('\n').forEach(line => {
      if (line.trim()) md += `    * ${line.trim()}\n`;
    });
  }
  md += `\n---\n\n`;

  md += `### Link: 构词法家族 (Cognate Family)\n\n`;
  md += `* **核心逻辑**：${trimText(getByPath(data, 'cognate_family.instruction'))}\n\n`;
  const cognates = getByPath(data, 'cognate_family.cognates', []) as CognateItem[];
  cognates.forEach((cog, index) => {
    md += `${index + 1}. **${trimText(cog.word)}**: ${trimText(cog.logic)}\n`;
  });
  md += `\n---\n\n`;

  md += `### Application: 应用 (Practice)\n\n`;
  const examples = getByPath(data, 'application.selected_examples', []) as ExampleItem[];
  if (examples.length > 0) {
    md += `* **精选例句 (Selected Examples)**：\n`;
    examples.forEach((ex, index) => {
      md += `    ${index + 1}. (${trimText(ex.type)})：${trimText(ex.sentence)}\n`;
      md += `        * (${trimText(ex.translation_zh)})\n`;
    });
  }
  md += `\n---\n\n`;

  md += `### Nuance: 近义词辨析 (Synonym Nuances)\n\n`;
  const synonyms = getByPath(data, 'nuance.synonyms', []) as SynonymItem[];
  if (synonyms.length > 0) {
    md += `* **近义词 (Synonyms)**：\n`;
    synonyms.forEach(syn => {
      md += `    * **${trimText(syn.word)}**: ${trimText(syn.meaning_zh)}\n`;
    });
  }
  md += `\n`;

  const diff = trimText(getByPath(data, 'nuance.image_differentiation_zh'));
  md += `* **画面辨析 (Image-based Differentiation)**:\n`;
  if (diff) {
    diff.split('\n').forEach(line => {
      if (line.trim()) md += `    * ${line.trim()}\n`;
    });
  }

  return md;
}
