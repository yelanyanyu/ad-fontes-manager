type Dict = Record<string, unknown>;

type AnkiDataSource =
  | 'lemma'
  | 'user_context_sentence'
  | 'other_common_meanings'
  | 'selected_examples_sentence'
  | 'selected_examples_translation'
  | 'synonyms_word'
  | 'synonyms_meaning'
  | 'rendered_html';

type FieldMappingEntry = {
  source: AnkiDataSource;
  target: string;
};

type FieldMappingConfig = FieldMappingEntry[];

type AnkiTargetFields = Record<string, string>;

// ============================================================
// Utility
// ============================================================

const getByPath = (obj: Dict, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Dict)[key];
    }
    return undefined;
  }, obj);

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const asRecord = (value: unknown): Dict | null =>
  value && typeof value === 'object' ? (value as Dict) : null;

function isGerman(data: Dict): boolean {
  return !!(
    data.yield &&
    (data.yield as Dict).contextual_meaning &&
    ((data.yield as Dict).contextual_meaning as Dict).de
  );
}

// ============================================================
// CSS constants (from client/src/utils/generator.ts)
// ============================================================

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

// ============================================================
// Render functions (from client/src/utils/generator.ts)
// ============================================================

function renderYieldCard(data: Dict): string {
  const de = isGerman(data);
  const genus = toText(getByPath(data, 'yield.genus'));
  const kasus = toText(getByPath(data, 'yield.kasus'));
  const meaningLang = de ? 'de' : 'en';
  const meaning = toText(getByPath(data, `yield.contextual_meaning.${meaningLang}`));
  const meaningZh = toText(getByPath(data, 'yield.contextual_meaning.zh'));

  let extraInfo = `${toText(getByPath(data, 'yield.syllabification'))} · ${toText(getByPath(data, 'yield.part_of_speech'))}`;
  if (de && genus) extraInfo += ` · ${genus}`;
  if (de && kasus) extraInfo += ` · ${kasus}`;

  const otherMeanings = getByPath(data, 'yield.other_common_meanings');
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
          <h1 style="${s.h1}">${toText(getByPath(data, 'yield.lemma'))}</h1>
          <div style="font-size: 14px; color: #a0aec0; margin-top: 4px;">User context: "${toText(getByPath(data, 'yield.user_word'))}"</div>
        </div>
      </div>
      <div style="margin-top: 15px;">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">${meaning || meaningZh}</div>
        <div style="font-size: 16px; color: #4a5568;">${meaningZh}</div>
      </div>
      ${otherMeaningsHtml}
    </div>`;
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
    <div style="margin-top: 15px;"><div style="${s.h3}">Visual Imagery</div><div style="${s.textBlock}">${toText(etymData.visual_imagery_zh)}</div></div>
    <div style="margin-top: 15px;"><div style="${s.h3}">Meaning Evolution</div><div style="${s.textBlock}">${toText(etymData.meaning_evolution_zh)}</div></div>
  </div>`;
}

function renderGermanEtymologyCard(etymData: Dict): string {
  const morph = (etymData.morphological_analysis as Dict | undefined) || {};
  const components =
    (morph.components as
      | Array<{ element?: string; type?: string; de_meaning?: string }>
      | undefined) || [];
  const origins = (etymData.historical_origins as Dict | undefined) || {};
  const phonology = (etymData.historical_phonology as Dict | undefined) || {};
  const semantics = (etymData.historical_semantics as Dict | undefined) || {};

  let html = `<div style="${s.section.replace('background: white;', '')} border-bottom: 1px solid ${c.border};">
    <h2 style="${s.h2}">Etymologie: Morphologische Analyse</h2>
    <p style="${s.p} font-size: 14px;"><strong>Wortbildung:</strong> ${toText(morph.word_formation)}</p>`;

  if (components.length > 0) {
    html += `<div style="display:flex; flex-wrap:wrap; gap: 6px; margin-bottom: 12px; font-family: monospace; font-size: 13px;">`;
    for (const comp of components) {
      html += `<span style="${s.tag} background: #ebf8ff; color: #2b6cb0;">${toText(comp.element)}</span>`;
    }
    html += `</div>`;
    html += `<div style="${s.grid} margin-bottom: 12px;">`;
    for (const comp of components) {
      html += `<div style="background: #f7fafc; border: 1px solid ${c.border}; padding: 8px 10px; border-radius: 6px;">
        <span style="font-weight: 700; color: ${c.sectionHeader};">${toText(comp.element)}</span>
        <span style="font-size: 12px; color: ${c.textSub}; margin-left: 6px;">${toText(comp.type)}</span>
        <div style="font-size: 13px; color: #4a5568; margin-top: 2px;">${toText(comp.de_meaning)}</div>
      </div>`;
    }
    html += `</div>`;
  }

  html += `<p style="${s.p} font-size: 14px;"><strong>Strukturanalyse:</strong> ${toText(morph.structure_analysis)}</p>`;

  html += `<div style="margin-top: 12px;"><div style="${s.h3}">Historische Ursprünge</div>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>Früheste Bezeugung:</strong> ${toText(origins.earliest_attestation)}</p>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>Quellform:</strong> ${toText(origins.source_form)}</p>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>PGmc Wurzel:</strong> <span style="color:${c.accent}">${toText(origins.pgmc_root)}</span></p>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>PIE Wurzel:</strong> <span style="color:${c.accent}">${toText(origins.pie_root)}</span></p>`;
  html += `<p style="${s.p} font-size: 14px;"><strong>Lautverschiebungen:</strong> ${toText(origins.sound_changes)}</p>`;
  html += `</div>`;

  if (phonology.pie_root || phonology.proto_germanic) {
    html += `<div style="margin-top: 12px;"><div style="${s.h3}">Historische Phonologie</div>`;
    html += `<p style="${s.p} font-size: 14px;"><strong>PIE:</strong> ${toText(phonology.pie_root)} → <strong>PGmc:</strong> ${toText(phonology.proto_germanic)}</p>`;
    if (toText(phonology.grimm_step))
      html += `<p style="${s.p} font-size: 14px;"><strong>Grimm:</strong> ${toText(phonology.grimm_step)}</p>`;
    if (toText(phonology.verner_law))
      html += `<p style="${s.p} font-size: 14px;"><strong>Verner:</strong> ${toText(phonology.verner_law)}</p>`;
    html += `<p style="${s.p} font-size: 14px;"><strong>OHG:</strong> ${toText(phonology.old_high_german)} · <strong>MHG:</strong> ${toText(phonology.middle_high_german)}</p>`;
    if (toText(phonology.consonant_shift))
      html += `<p style="${s.p} font-size: 14px;"><strong>Konsonantenverschiebung:</strong> ${toText(phonology.consonant_shift)}</p>`;
    html += `</div>`;
  }

  if (semantics.proto_meaning || semantics.semantic_shifts) {
    html += `<div style="margin-top: 12px;"><div style="${s.h3}">Historische Semantik</div>`;
    if (toText(semantics.proto_meaning))
      html += `<p style="${s.p} font-size: 14px;"><strong>Urbedeutung:</strong> ${toText(semantics.proto_meaning)}</p>`;
    if (toText(semantics.semantic_shifts))
      html += `<p style="${s.p} font-size: 14px;"><strong>Bedeutungsverschiebungen:</strong> ${toText(semantics.semantic_shifts)}</p>`;
    html += `</div>`;
  }

  html += `<div style="margin-top: 15px;"><div style="${s.h3}">Visual Imagery (画面)</div><div style="${s.textBlock}">${toText(etymData.visual_imagery_zh)}</div></div>`;
  html += `<div style="margin-top: 15px;"><div style="${s.h3}">Meaning Evolution (词义演变)</div><div style="${s.textBlock}">${toText(etymData.meaning_evolution_zh)}</div></div>`;
  html += `</div>`;

  return html;
}

function renderEtymologyCard(data: Dict): string {
  const de = isGerman(data);
  const etymData = (data.etymology as Dict | undefined) || {};

  if (de) {
    return renderGermanEtymologyCard(etymData);
  }
  return renderEnglishEtymologyCard(etymData);
}

function renderCognateCard(data: Dict): string {
  const de = isGerman(data);
  const cognates = getByPath(data, 'cognate_family.cognates');
  const cognateArr: Array<{ word?: string; german_equivalent?: string; logic?: string }> =
    Array.isArray(cognates) ? cognates : [];
  const instruction = toText(getByPath(data, 'cognate_family.instruction'));

  let html = `<div style="${s.section.replace('background: white;', '')} background: #fffdfa;">
    <h2 style="${s.h2}">${de ? 'Kognatenfamilie' : 'Link: Cognate Family'}</h2>`;
  if (instruction) {
    html += `<p style="font-size:13px; color: ${c.textSub}; margin-bottom: 10px;">${instruction}</p>`;
  }
  html += `<div style="${s.grid}">`;
  for (const cog of cognateArr) {
    const label =
      de && cog.german_equivalent
        ? `${toText(cog.word)} → ${toText(cog.german_equivalent)}`
        : toText(cog.word);
    html += `<div style="background: white; border: 1px solid ${c.border}; padding: 10px; border-radius: 6px;">
      <span style="font-weight: 700; color: ${c.sectionHeader}; font-size: 15px;">${label}</span>
      <div style="font-size: 13px; color: #4a5568; margin-top: 4px; border-top: 1px solid #f7fafc; padding-top: 4px;">${toText(cog.logic)}</div>
    </div>`;
  }
  html += `</div></div>`;
  return html;
}

function renderApplicationCard(data: Dict): string {
  const examples = getByPath(data, 'application.selected_examples');
  const exampleArr: Array<{ type?: string; sentence?: string; translation_zh?: string }> =
    Array.isArray(examples) ? examples : [];
  return `<div style="${s.section.replace('background: white;', '')}"><h2 style="${s.h2}">Application: Practice</h2><div style="display: flex; flex-direction: column; gap: 12px;">${exampleArr.map(ex => `<div style="border-left: 3px solid #cbd5e0; padding-left: 12px;"><div style="font-size: 11px; font-weight: bold; color: ${c.accent}; text-transform: uppercase; margin-bottom: 2px;">${toText(ex.type)}</div><div style="font-family: 'Lora', serif; font-size: 15px; color: #1a202c; margin-bottom: 2px;">${toText(ex.sentence)}</div><div style="font-size: 13px; color: #718096;">${toText(ex.translation_zh)}</div></div>`).join('')}</div></div>`;
}

function renderNuanceCard(data: Dict): string {
  const de = isGerman(data);
  const synonyms = getByPath(data, 'nuance.synonyms');
  const synonymArr: Array<{ word?: string; meaning_zh?: string; connotation_difference?: string }> =
    Array.isArray(synonyms) ? synonyms : [];
  const imageDiff = toText(getByPath(data, 'nuance.image_differentiation_zh'));

  let html = `<div style="${s.section.replace('background: white;', '')} border-bottom: none;">
    <h2 style="${s.h2}">${de ? 'Nuance: Synonyme' : 'Nuance: Synonyms'}</h2>
    <ul style="list-style: none; padding: 0; margin: 0 0 15px 0;">`;

  for (const syn of synonymArr) {
    html += `<li style="margin-bottom: 8px; font-size: 14px;">
      <span style="font-weight: 700; color: ${c.textMain};">${toText(syn.word)}</span>: <span style="color: #4a5568;">${toText(syn.meaning_zh)}</span>`;
    if (de && syn.connotation_difference) {
      html += `<div style="font-size: 12px; color: ${c.textSub}; margin-top: 2px; padding-left: 4px; border-left: 2px solid ${c.border};">${toText(syn.connotation_difference)}</div>`;
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

  if (de) {
    const germDiff = toText(getByPath(data, 'nuance.germanic_differentiation_zh'));
    if (germDiff) {
      html += `<div style="${s.infoBox} margin-top: 10px;">
        <strong style="display:block; margin-bottom: 4px;">Germanische Differenzierung:</strong>
        <div style="white-space: pre-line; line-height: 1.6;">${germDiff}</div>
      </div>`;
    }
  }

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
          <div style="font-size: 13px; color: #4a5568; margin-top: 2px;">${toText(note)}</div>
        </div>`;
      }
      html += `</div></div>`;
    }
  }

  if (de && data.observations) {
    const obs = data.observations as Dict;
    const hasObs = obs.register || obs.false_friends || obs.calque_status;
    if (hasObs) {
      html += `<div style="margin-top: 12px;"><div style="${s.h3}">Beobachtungen</div>`;
      html += `<div style="background: #f7fafc; padding: 12px; border-radius: 6px; border: 1px solid ${c.border};">`;
      if (toText(obs.register))
        html += `<p style="${s.p} font-size: 13px;"><strong>Register:</strong> ${toText(obs.register)}</p>`;
      if (toText(obs.false_friends))
        html += `<p style="${s.p} font-size: 13px;"><strong>False Friends:</strong> ${toText(obs.false_friends)}</p>`;
      if (toText(obs.calque_status))
        html += `<p style="${s.p} font-size: 13px;"><strong>Calque Status:</strong> ${toText(obs.calque_status)}</p>`;
      html += `</div></div>`;
    }
  }

  html += `</div>`;
  return html;
}

function generateCardHTML(data: Dict): string {
  return `<div style="${s.card}">${renderYieldCard(data)}${renderEtymologyCard(data)}${renderCognateCard(data)}${renderApplicationCard(data)}${renderNuanceCard(data)}</div>`;
}

// ============================================================
// 8 field extractors
// ============================================================

const extractLemma = (data: Dict): string => toText(getByPath(data, 'yield.lemma'));

const extractUserContextSentence = (data: Dict): string =>
  toText(getByPath(data, 'yield.user_context_sentence'));

const extractOtherCommonMeanings = (data: Dict): string => {
  const arr = getByPath(data, 'yield.other_common_meanings');
  return Array.isArray(arr) ? arr.map(String).join('||') : '';
};

const extractSelectedExamplesSentence = (data: Dict): string => {
  const arr = getByPath(data, 'application.selected_examples');
  return Array.isArray(arr)
    ? arr
        .map(example => toText(asRecord(example)?.sentence))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractSelectedExamplesTranslation = (data: Dict): string => {
  const arr = getByPath(data, 'application.selected_examples');
  return Array.isArray(arr)
    ? arr
        .map(example => toText(asRecord(example)?.translation_zh))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractSynonymsWord = (data: Dict): string => {
  const arr = getByPath(data, 'nuance.synonyms');
  return Array.isArray(arr)
    ? arr
        .map(synonym => toText(asRecord(synonym)?.word))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractSynonymsMeaning = (data: Dict): string => {
  const arr = getByPath(data, 'nuance.synonyms');
  return Array.isArray(arr)
    ? arr
        .map(synonym => toText(asRecord(synonym)?.meaning_zh))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractRenderedHtml = (data: Dict): string => generateCardHTML(data);

const extractors: Record<AnkiDataSource, (input: Dict) => string> = {
  lemma: extractLemma,
  user_context_sentence: extractUserContextSentence,
  other_common_meanings: extractOtherCommonMeanings,
  selected_examples_sentence: extractSelectedExamplesSentence,
  selected_examples_translation: extractSelectedExamplesTranslation,
  synonyms_word: extractSynonymsWord,
  synonyms_meaning: extractSynonymsMeaning,
  rendered_html: extractRenderedHtml,
};

const extractBySource = (source: AnkiDataSource, data: Dict): string => {
  return extractors[source](data);
};

const buildAnkiFields = (data: Dict, mapping: FieldMappingConfig): AnkiTargetFields => {
  const fields: AnkiTargetFields = {};
  for (const { source, target } of mapping) {
    const normalizedTarget = target.trim();
    if (!normalizedTarget) continue;
    fields[normalizedTarget] = extractBySource(source, data);
  }
  return fields;
};

module.exports = {
  buildAnkiFields,
  extractBySource,
  generateCardHTML,
};
