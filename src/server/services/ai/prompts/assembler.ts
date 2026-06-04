import type { PipelineContext, PipelineStage } from '../types';

const { injectVariables, loadPromptTemplate, loadSchema } = require('./loader') as {
  injectVariables: (template: string, variables: Record<string, string>) => string;
  loadPromptTemplate: (filename: string) => string;
  loadSchema: (filename: string) => string;
};
const { buildAiFlavorMarkerReport } = require('../aiFlavorMarkers') as {
  buildAiFlavorMarkerReport: (ctx: PipelineContext) => string;
};

export interface AssembledPrompt {
  system: string;
  user: string;
}

const USER_MESSAGE_HEADING = '# User Message';

function buildPromptVariables(stage: PipelineStage, ctx: PipelineContext): Record<string, string> {
  const vars: Record<string, string> = {
    word: ctx.word,
    context: ctx.context || '',
    language: ctx.language,
    notes: ctx.notes || '',
    yaml: ctx.fullYaml || ctx.researchYaml || '',
    errors: ctx.revisionNotes || '',
    revisionNotes: ctx.revisionNotes || ctx.notes || '',
    stage: stage.id,
    researchYaml: ctx.researchYaml || '',
    searchSummary: ctx.searchSummary || '',
    userScore: ctx.userScore !== undefined ? String(ctx.userScore) : '',
    mechanicalAiFlavorReport: buildAiFlavorMarkerReport(ctx),
  };

  if (stage.schemaFile) {
    vars.schema = loadSchema(stage.schemaFile);
  }

  return vars;
}

function splitPrompt(template: string): { systemTemplate: string; userTemplate?: string } {
  const delimiterIndex = template.indexOf(USER_MESSAGE_HEADING);
  if (delimiterIndex === -1) {
    return { systemTemplate: template };
  }

  return {
    systemTemplate: template.slice(0, delimiterIndex).trimEnd(),
    userTemplate: template.slice(delimiterIndex + USER_MESSAGE_HEADING.length).trimStart(),
  };
}

export function assemblePrompt(stage: PipelineStage, ctx: PipelineContext): AssembledPrompt {
  const vars = buildPromptVariables(stage, ctx);
  const promptFile = stage.systemPromptFile || 'content-reviewer.md';
  const fullPrompt = loadPromptTemplate(promptFile);
  const { systemTemplate, userTemplate } = splitPrompt(fullPrompt);

  if (!userTemplate) {
    return {
      system: injectVariables(systemTemplate, vars),
      user: `Generate the ${stage.id} output for "${ctx.word}".`,
    };
  }

  return {
    system: injectVariables(systemTemplate, vars),
    user: injectVariables(userTemplate, vars),
  };
}

module.exports = { assemblePrompt };
