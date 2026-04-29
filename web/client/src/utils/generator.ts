type Dict = Record<string, unknown>;

interface CognateItem {
  word?: string;
  german_equivalent?: string;
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
  connotation_difference?: string;
}

interface MorphologicalComponent {
  element?: string;
  type?: string;
  de_meaning?: string;
}

const getByPath = (obj: Dict, path: string, fallback: unknown = ''): unknown => {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Dict)[key];
    }
    return undefined;
  }, obj);
  return value !== undefined && value !== null ? value : fallback;
};

const trimText = (value: unknown): string => (value ? String(value).trim() : '');

function isGerman(data: Dict): boolean {
  return !!(data.yield && (data.yield as Dict).contextual_meaning && ((data.yield as Dict).contextual_meaning as Dict).de);
}

// ==============================================================================
// Shared CSS constants
// ==============================================================================
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
  infoBox: `background: #f0f7ff; padding: 12px; border-radius: 6px; font-size: 14px; border-left: 4px solid #3182ce; margin-top: 10px; color: #2a4365;`,
  grid: `display: grid; grid-template-columns: 1fr; gap: 10px;`,
};

// ==============================================================================
// Yield Section
// ==============================================================================
function renderYieldCard(data: Dict): string {
  const de = isGerman(data);
  const genus = trimText(getByPath(data, 'yield.genus'));
  const kasus = trimText(getByPath(data, 'yield.kasus'));
  const meaningLang = de ? 'de' : 'en';
  const meaning = trimText(getByPath(data, `yield.contextual_meaning.${meaningLang}`));
  const meaningZh = trimText(getByPath(data, 'yield.contextual_meaning.zh'));

  let extraInfo = `${trimText(getByPath(data, 'yield.syllabification'))} · ${trimText(getByPath(data, 'yield.part_of_speech'))}`;
  if (de && genus) extraInfo += ` · ${genus}`;
  if (de && kasus) extraInfo += ` · ${kasus}`;

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

  return `
    <div style="${s.section}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="${s.sub}">${extraInfo}</div>
          <h1 style="${s.h1}">${trimText(getByPath(data, 'yield.lemma'))}</h1>
          <div style="font-size: 14px; color: #a0aec0; margin-top: 4px;">User context: "${trimText(getByPath(data, 'yield.user_word'))}"</div>
        </div>
      </div>
      <div style="margin-top: 15px;">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">${meaning || meaningZh}</div>
        <div style="font-size: 16px; color: #4a5568;">${meaningZh}</div>
      </div>
      ${otherMeaningsHtml}
    </div>`;
}

// ==============================================================================
// Etymology Section
// ==============================================================================
function renderEtymologyCard(data: Dict): string {
  const de = isGerman(data);
  const etymData = (data.etymology as Dict | undefined) || {};

  if (de) {
    return renderGermanEtymologyCard(etymData);
  }
  return renderEnglishEtymologyCard(etymData);
}

function renderEnglishEtymologyCard(etymData: Dict): string {
  const roots = (etymData.root_and_affixes as Dict | undefined) || {};
  const origins = (etymData.historical_origins as Dict | undefined) || {};

  return `<div style="${s.section.replace('background: white;', '')} border-bottom: 1px solid ${c.border};">
    <h2 style="${s.h2}">Etymology: Deep Analysis</h2>
    <div style="display:flex; gap: 5px; margin-bottom: 15px; font-family: monospace; font-size: 13px;">
      ${roots.prefix && roots.prefix !== 'N/A' ? `<span style="${s.tag}">PRE: ${String(roots.prefix)}</span>` : ''}
      <span style="${s.tag} background: #ebf8ff; color: #2b6cb0;">ROOT: ${String(roots.root ?? '')}</span>
      ${roots.suffix && roots.suffix !== 'N/A' ? `<span style="${s.tag}">SUF: ${String(roots.suffix)}</span>` : ''}
    </div>
    <p style="${s.p} font-size: 14px;"><strong>Structure:</strong> ${String(roots.structure_analysis ?? '')}</p>
    <p style="${s.p} font-size: 14px;"><strong>Source:</strong> ${String(origins.source_word ?? '')} <span style="color:${c.accent}">(${String(origins.pie_root ?? '')})</span></p>
    ${origins.history_myth && origins.history_myth !== 'N/A' ? `<div style="${s.mythBox}"><strong>History:</strong> ${String(origins.history_myth)}</div>` : ''}
    <div style="margin-top: 15px;"><div style="${s.h3}">Visual Imagery</div><div style="${s.textBlock}">${trimText(etymData.visual_imagery_zh)}</div></div>
    <div style="margin-top: 15px;"><div style="${s.h3}">Meaning Evolution</div><div style="${s.textBlock}">${trimText(etymData.meaning_evolution_zh)}</div></div>
  </div>`;
}

function renderGermanEtymologyCard(etymData: Dict): string {
  const morph = (etymData.morphological_analysis as Dict | undefined) || {};
  const components = (morph.components as MorphologicalComponent[] | undefined) || [];
  const origins = (etymData.historical_origins as Dict | undefined) || {};
  const phonology = (etymData.historical_phonology as Dict | undefined) || {};
  const semantics = (etymData.historical_semantics as Dict | undefined) || {};

  let html = `<div style="${s.section.replace('background: white;', '')} border-bottom: 1px solid ${c.border};">
    <h2 style="${s.h2}">Etymologie: Morphologische Analyse</h2>
    <p style="${s.p} font-size: 14px;"><strong>Wortbildung:</strong> ${trimText(morph.word_formation)}</p>`;

  // Components
  if (components.length > 0) {
    html += `<div style="display:flex; flex-wrap:wrap; gap: 6px; margin-bottom: 12px; font-family: monospace; font-size: 13px;">`;
    for (const comp of components) {
      const label = [comp.type, comp.de_meaning].filter(Boolean).join(': ');
      html += `<span style="${s.tag} background: #ebf8ff; color: #2b6cb0;">${trimText(comp.element)}</span>`;
    }
    html += `</div>`;
    html += `<div style="${s.grid} margin-bottom: 12px;">`;
    for (const comp of components) {
      html += `<div style="background: #f7fafc; border: 1px solid ${c.border}; padding: 8px 10px; border-radius: 6px;">
        <span style="font-weight: 700; color: ${c.sectionHeader};">${trimText(comp.element)}</span>
        <span style="font-size: 12px; color: ${c.textSub}; margin-left: 6px;">${trimText(comp.type)}</span>
        <div style="font-size: 13px; color: #4a5568; margin-top: 2px;">${trimText(comp.de_meaning)}</div>
      </div>`;
    }
    html += `</div>`;
  }

  html += `<p style="${s.p} font-size: 14px;"><strong>Strukturanalyse:</strong> ${trimText(morph.structure_analysis)}</p>`;

  // Historical origins
  html += `<div style="margin-top: 12px;"><div style="${s.h3}">Historische Ursprünge</div>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>Früheste Bezeugung:</strong> ${trimText(origins.earliest_attestation)}</p>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>Quellform:</strong> ${trimText(origins.source_form)}</p>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>PGmc Wurzel:</strong> <span style="color:${c.accent}">${trimText(origins.pgmc_root)}</span></p>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>PIE Wurzel:</strong> <span style="color:${c.accent}">${trimText(origins.pie_root)}</span></p>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>Lautverschiebungen:</strong> ${trimText(origins.sound_changes)}</p>`;
  html += `</div>`;

  // Historical phonology
  if (phonology.pie_root || phonology.proto_germanic) {
    html += `<div style="margin-top: 12px;"><div style="${s.h3}">Historische Phonologie</div>`;
    html += `<p style="${s.p} font-size: 14px;"><strong>PIE:</strong> ${trimText(phonology.pie_root)} → <strong>PGmc:</strong> ${trimText(phonology.proto_germanic)}</p>`;
    if (trimText(phonology.grimm_step)) html += `<p style="${s.p} font-size: 14px;"><strong>Grimm:</strong> ${trimText(phonology.grimm_step)}</p>`;
    if (trimText(phonology.verner_law)) html += `<p style="${s.p} font-size: 14px;"><strong>Verner:</strong> ${trimText(phonology.verner_law)}</p>`;
    html += `<p style="${s.p} font-size: 14px;"><strong>OHG:</strong> ${trimText(phonology.old_high_german)} · <strong>MHG:</strong> ${trimText(phonology.middle_high_german)}</p>`;
    if (trimText(phonology.consonant_shift)) html += `<p style="${s.p} font-size: 14px;"><strong>Konsonantenverschiebung:</strong> ${trimText(phonology.consonant_shift)}</p>`;
    html += `</div>`;
  }

  // Historical semantics
  if (semantics.proto_meaning || semantics.semantic_shifts) {
    html += `<div style="margin-top: 12px;"><div style="${s.h3}">Historische Semantik</div>`;
    if (trimText(semantics.proto_meaning)) html += `<p style="${s.p} font-size: 14px;"><strong>Urbedeutung:</strong> ${trimText(semantics.proto_meaning)}</p>`;
    if (trimText(semantics.semantic_shifts)) html += `<p style="${s.p} font-size: 14px;"><strong>Bedeutungsverschiebungen:</strong> ${trimText(semantics.semantic_shifts)}</p>`;
    html += `</div>`;
  }

  // Visual imagery & meaning evolution
  html += `<div style="margin-top: 15px;"><div style="${s.h3}">Visual Imagery (画面)</div><div style="${s.textBlock}">${trimText(etymData.visual_imagery_zh)}</div></div>`;
  html += `<div style="margin-top: 15px;"><div style="${s.h3}">Meaning Evolution (词义演变)</div><div style="${s.textBlock}">${trimText(etymData.meaning_evolution_zh)}</div></div>`;
  html += `</div>`;

  return html;
}

// ==============================================================================
// Cognate Section
// ==============================================================================
function renderCognateCard(data: Dict): string {
  const de = isGerman(data);
  const cognates = getByPath(data, 'cognate_family.cognates', []) as CognateItem[];
  const instruction = trimText(getByPath(data, 'cognate_family.instruction'));

  let html = `<div style="${s.section.replace('background: white;', '')} background: #fffdfa;">
    <h2 style="${s.h2}">${de ? 'Kognatenfamilie' : 'Link: Cognate Family'}</h2>`;
  if (instruction) {
    html += `<p style="font-size:13px; color: ${c.textSub}; margin-bottom: 10px;">${instruction}</p>`;
  }
  html += `<div style="${s.grid}">`;
  for (const cog of cognates) {
    const label = de && cog.german_equivalent
      ? `${trimText(cog.word)} → ${trimText(cog.german_equivalent)}`
      : trimText(cog.word);
    html += `<div style="background: white; border: 1px solid ${c.border}; padding: 10px; border-radius: 6px;">
      <span style="font-weight: 700; color: ${c.sectionHeader}; font-size: 15px;">${label}</span>
      <div style="font-size: 13px; color: #4a5568; margin-top: 4px; border-top: 1px solid #f7fafc; padding-top: 4px;">${trimText(cog.logic)}</div>
    </div>`;
  }
  html += `</div></div>`;
  return html;
}

// ==============================================================================
// Application Section (shared)
// ==============================================================================
function renderApplicationCard(data: Dict): string {
  const examples = getByPath(data, 'application.selected_examples', []) as ExampleItem[];
  return `<div style="${s.section.replace('background: white;', '')}"><h2 style="${s.h2}">Application: Practice</h2><div style="display: flex; flex-direction: column; gap: 12px;">${examples.map(ex => `<div style="border-left: 3px solid #cbd5e0; padding-left: 12px;"><div style="font-size: 11px; font-weight: bold; color: ${c.accent}; text-transform: uppercase; margin-bottom: 2px;">${trimText(ex.type)}</div><div style="font-family: 'Lora', serif; font-size: 15px; color: #1a202c; margin-bottom: 2px;">${trimText(ex.sentence)}</div><div style="font-size: 13px; color: #718096;">${trimText(ex.translation_zh)}</div></div>`).join('')}</div></div>`;
}

// ==============================================================================
// Nuance Section
// ==============================================================================
function renderNuanceCard(data: Dict): string {
  const de = isGerman(data);
  const synonyms = getByPath(data, 'nuance.synonyms', []) as SynonymItem[];
  const imageDiff = trimText(getByPath(data, 'nuance.image_differentiation_zh'));

  let html = `<div style="${s.section.replace('background: white;', '')} border-bottom: none;">
    <h2 style="${s.h2}">${de ? 'Nuance: Synonyme' : 'Nuance: Synonyms'}</h2>
    <ul style="list-style: none; padding: 0; margin: 0 0 15px 0;">`;

  for (const syn of synonyms) {
    html += `<li style="margin-bottom: 8px; font-size: 14px;">
      <span style="font-weight: 700; color: ${c.textMain};">${trimText(syn.word)}</span>: <span style="color: #4a5568;">${trimText(syn.meaning_zh)}</span>`;
    if (de && syn.connotation_difference) {
      html += `<div style="font-size: 12px; color: ${c.textSub}; margin-top: 2px; padding-left: 4px; border-left: 2px solid ${c.border};">${trimText(syn.connotation_difference)}</div>`;
    }
    html += `</li>`;
  }

  html += `</ul>`;

  if (imageDiff) {
    html += `<div style="background: #edf2f7; padding: 12px; border-radius: 6px; font-size: 14px; border-left: 4px solid ${c.sectionHeader}; margin-top: 10px;">
      <strong style="display:block; margin-bottom: 6px; font-size: 13px; color: ${c.sectionHeader};">Image Differentiation:</strong>
      <div style="white-space: pre-line; line-height: 1.6;">${imageDiff}</div>
    </div>`;
  }

  // Germanic differentiation (German only)
  if (de) {
    const germDiff = trimText(getByPath(data, 'nuance.germanic_differentiation_zh'));
    if (germDiff) {
      html += `<div style="${s.infoBox} margin-top: 10px;">
        <strong style="display:block; margin-bottom: 4px;">Germanische Differenzierung:</strong>
        <div style="white-space: pre-line; line-height: 1.6;">${germDiff}</div>
      </div>`;
    }
  }

  // Dialectal notes (German only)
  if (de && data.dialectal_notes) {
    const notes = data.dialectal_notes as Dict;
    const entries = Object.entries(notes).filter(([, v]) => v);
    if (entries.length > 0) {
      html += `<div style="margin-top: 12px;"><div style="${s.h3}">Dialektale Anmerkungen</div>`;
      html += `<div style="${s.grid}">`;
      for (const [dialect, note] of entries) {
        const label = dialect.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        html += `<div style="background: #f7fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid ${c.border};">
          <span style="font-weight: 700; font-size: 13px; color: ${c.sectionHeader};">${label}</span>
          <div style="font-size: 13px; color: #4a5568; margin-top: 2px;">${trimText(note)}</div>
        </div>`;
      }
      html += `</div></div>`;
    }
  }

  // Observations (German only)
  if (de && data.observations) {
    const obs = data.observations as Dict;
    const hasObs = obs.register || obs.false_friends || obs.calque_status;
    if (hasObs) {
      html += `<div style="margin-top: 12px;"><div style="${s.h3}">Beobachtungen</div>`;
      html += `<div style="background: #f7fafc; padding: 12px; border-radius: 6px; border: 1px solid ${c.border};">`;
      if (trimText(obs.register)) html += `<p style="${s.p} font-size: 13px;"><strong>Register:</strong> ${trimText(obs.register)}</p>`;
      if (trimText(obs.false_friends)) html += `<p style="${s.p} font-size: 13px;"><strong>False Friends:</strong> ${trimText(obs.false_friends)}</p>`;
      if (trimText(obs.calque_status)) html += `<p style="${s.p} font-size: 13px;"><strong>Calque Status:</strong> ${trimText(obs.calque_status)}</p>`;
      html += `</div></div>`;
    }
  }

  html += `</div>`;
  return html;
}

// ==============================================================================
// Public API
// ==============================================================================
export function generateCardHTML(data: Dict): string {
  return `<div style="${s.card}">${renderYieldCard(data)}${renderEtymologyCard(data)}${renderCognateCard(data)}${renderApplicationCard(data)}${renderNuanceCard(data)}</div>`;
}

export function generateMarkdown(data: Dict): string {
  const de = isGerman(data);
  let md = '';

  // Yield
  md += `### Yield: 单词解析 (Context & Meaning)\n\n`;
  md += `* **用户单词**：${trimText(getByPath(data, 'yield.user_word'))}\n`;
  md += `* **音节划分**：${trimText(getByPath(data, 'yield.syllabification'))}\n`;
  md += `* **词性**：${trimText(getByPath(data, 'yield.part_of_speech'))}\n`;
  if (de) {
    const genus = trimText(getByPath(data, 'yield.genus'));
    const kasus = trimText(getByPath(data, 'yield.kasus'));
    if (genus) md += `* **Genus**：${genus}\n`;
    if (kasus) md += `* **Kasus**：${kasus}\n`;
  }
  md += `* **用户语境**："${trimText(getByPath(data, 'yield.user_context_sentence'))}"\n`;
  md += `* **语境释义 (Contextual Meaning)**：\n`;
  md += `    * ${de ? 'DE' : 'EN'}: ${trimText(getByPath(data, de ? 'yield.contextual_meaning.de' : 'yield.contextual_meaning.en'))}\n`;
  md += `    * ZH: ${trimText(getByPath(data, 'yield.contextual_meaning.zh'))}\n`;

  const otherMeanings = getByPath(data, 'yield.other_common_meanings', []) as unknown[];
  if (Array.isArray(otherMeanings) && otherMeanings.length > 0) {
    md += `* **其他常见意思**：\n`;
    otherMeanings.forEach((item, index) => {
      md += `    ${index + 1}. ${trimText(item)}\n`;
    });
  }
  md += `\n---\n\n`;

  // Etymology
  md += `### Etymology: 深度分析 (Deep Analysis)\n\n`;
  if (de) {
    const etymData = (data.etymology as Dict | undefined) || {};
    const morph = (etymData.morphological_analysis as Dict | undefined) || {};
    const components = (morph.components as MorphologicalComponent[] | undefined) || [];
    const origins = (etymData.historical_origins as Dict | undefined) || {};
    const phonology = (etymData.historical_phonology as Dict | undefined) || {};
    const semantics = (etymData.historical_semantics as Dict | undefined) || {};

    md += `* **Morphologische Analyse**\n`;
    md += `    * Wortbildung: ${trimText(morph.word_formation)}\n`;
    md += `    * Strukturanalyse: ${trimText(morph.structure_analysis)}\n`;
    if (components.length > 0) {
      md += `    * Komponenten:\n`;
      for (const comp of components) {
        md += `        - ${trimText(comp.element)} (${trimText(comp.type)}): ${trimText(comp.de_meaning)}\n`;
      }
    }
    md += `\n* **Historische Ursprünge**\n`;
    md += `    * Früheste Bezeugung: ${trimText(origins.earliest_attestation)}\n`;
    md += `    * Quellform: ${trimText(origins.source_form)}\n`;
    md += `    * PGmc Wurzel: ${trimText(origins.pgmc_root)}\n`;
    md += `    * PIE Wurzel: ${trimText(origins.pie_root)}\n`;
    md += `    * Lautverschiebungen: ${trimText(origins.sound_changes)}\n`;

    if (phonology.pie_root || phonology.proto_germanic) {
      md += `\n* **Historische Phonologie**\n`;
      md += `    * PIE → PGmc: ${trimText(phonology.pie_root)} → ${trimText(phonology.proto_germanic)}\n`;
      if (trimText(phonology.grimm_step)) md += `    * Grimm: ${trimText(phonology.grimm_step)}\n`;
      if (trimText(phonology.verner_law)) md += `    * Verner: ${trimText(phonology.verner_law)}\n`;
      md += `    * OHG: ${trimText(phonology.old_high_german)} · MHG: ${trimText(phonology.middle_high_german)}\n`;
      if (trimText(phonology.consonant_shift)) md += `    * Konsonantenverschiebung: ${trimText(phonology.consonant_shift)}\n`;
    }

    if (semantics.proto_meaning || semantics.semantic_shifts) {
      md += `\n* **Historische Semantik**\n`;
      if (trimText(semantics.proto_meaning)) md += `    * Urbedeutung: ${trimText(semantics.proto_meaning)}\n`;
      if (trimText(semantics.semantic_shifts)) md += `    * Bedeutungsverschiebungen: ${trimText(semantics.semantic_shifts)}\n`;
    }
  } else {
    const roots = getByPath(data, 'etymology.root_and_affixes', {}) as Dict;
    md += `* **Root & Affixes**\n`;
    md += `    * Prefix: ${trimText(roots.prefix) || 'N/A'}\n`;
    md += `    * Root: **${trimText(roots.root)}**\n`;
    md += `    * Suffix: ${trimText(roots.suffix) || 'N/A'}\n`;
    md += `    * Structure Analysis: ${trimText(roots.structure_analysis)}\n\n`;

    const history = getByPath(data, 'etymology.historical_origins', {}) as Dict;
    md += `* **Historical Origins**\n`;
    md += `    * History/Myth: ${trimText(history.history_myth) || 'N/A'}\n`;
    md += `    * Source Word: ${trimText(history.source_word)}\n`;
    md += `    * PIE Root: ${trimText(history.pie_root)}\n`;
  }

  const imagery = trimText(getByPath(data, 'etymology.visual_imagery_zh'));
  md += `\n* **词源画面**\n`;
  if (imagery) {
    imagery.split('\n').forEach(line => {
      if (line.trim()) md += `    ${line.trim()}\n`;
    });
  }

  const evolution = trimText(getByPath(data, 'etymology.meaning_evolution_zh'));
  md += `\n* **词义演变**\n`;
  if (evolution) {
    evolution.split('\n').forEach(line => {
      if (line.trim()) md += `    * ${line.trim()}\n`;
    });
  }
  md += `\n---\n\n`;

  // Cognates
  md += `### Link: 构词法家族 (Cognate Family)\n\n`;
  const cogInstruction = trimText(getByPath(data, 'cognate_family.instruction'));
  if (cogInstruction) md += `* **核心逻辑**：${cogInstruction}\n\n`;
  const cognates = getByPath(data, 'cognate_family.cognates', []) as CognateItem[];
  cognates.forEach((cog, index) => {
    const label = de && cog.german_equivalent
      ? `${trimText(cog.word)} → ${trimText(cog.german_equivalent)}`
      : trimText(cog.word);
    md += `${index + 1}. **${label}**: ${trimText(cog.logic)}\n`;
  });
  md += `\n---\n\n`;

  // Application
  md += `### Application: 应用 (Practice)\n\n`;
  const examples = getByPath(data, 'application.selected_examples', []) as ExampleItem[];
  if (examples.length > 0) {
    md += `* **精选例句**：\n`;
    examples.forEach((ex, index) => {
      md += `    ${index + 1}. (${trimText(ex.type)})：${trimText(ex.sentence)}\n`;
      md += `        * (${trimText(ex.translation_zh)})\n`;
    });
  }
  md += `\n---\n\n`;

  // Nuance
  md += `### Nuance: 近义词辨析 (Synonym Nuances)\n\n`;
  const synonyms = getByPath(data, 'nuance.synonyms', []) as SynonymItem[];
  if (synonyms.length > 0) {
    md += `* **近义词**：\n`;
    synonyms.forEach(syn => {
      md += `    * **${trimText(syn.word)}**: ${trimText(syn.meaning_zh)}\n`;
      if (de && syn.connotation_difference) {
        md += `        - ${trimText(syn.connotation_difference)}\n`;
      }
    });
  }
  md += `\n`;

  const diff = trimText(getByPath(data, 'nuance.image_differentiation_zh'));
  if (diff) {
    md += `* **画面辨析**:\n`;
    diff.split('\n').forEach(line => {
      if (line.trim()) md += `    * ${line.trim()}\n`;
    });
  }

  // German-specific markdown sections
  if (de) {
    const germDiff = trimText(getByPath(data, 'nuance.germanic_differentiation_zh'));
    if (germDiff) {
      md += `\n* **日耳曼语支差异**:\n`;
      germDiff.split('\n').forEach(line => {
        if (line.trim()) md += `    * ${line.trim()}\n`;
      });
    }

    if (data.dialectal_notes) {
      const notes = data.dialectal_notes as Dict;
      const entries = Object.entries(notes).filter(([, v]) => v);
      if (entries.length > 0) {
        md += `\n* **方言注释 (Dialektale Anmerkungen)**\n`;
        for (const [dialect, note] of entries) {
          const label = dialect.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          md += `    * ${label}: ${trimText(note)}\n`;
        }
      }
    }

    if (data.observations) {
      const obs = data.observations as Dict;
      if (trimText(obs.register) || trimText(obs.false_friends) || trimText(obs.calque_status)) {
        md += `\n* **语体观察 (Beobachtungen)**\n`;
        if (trimText(obs.register)) md += `    * Register: ${trimText(obs.register)}\n`;
        if (trimText(obs.false_friends)) md += `    * False Friends: ${trimText(obs.false_friends)}\n`;
        if (trimText(obs.calque_status)) md += `    * Calque Status: ${trimText(obs.calque_status)}\n`;
      }
    }
  }

  return md;
}
