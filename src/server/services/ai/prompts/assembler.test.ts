import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { PipelineContext, PipelineStage } from '../types';

void describe('prompt assembler', () => {
  void it('keeps format fixer rules and schema in system while putting YAML errors in user', () => {
    const { assemblePrompt } = require('./assembler') as typeof import('./assembler');
    const stage: PipelineStage = {
      id: 'format-fixing',
      description: 'Fix YAML shape',
      type: 'llm',
      systemPromptFile: 'format-fixer.md',
      schemaFile: 'english-schema.md',
    };
    const ctx: PipelineContext = {
      word: 'dignity',
      context: '',
      language: 'en',
      notes: '',
      fullYaml: 'yield:\n  lemma: dignity',
      revisionNotes: 'yield.language is required',
    };

    const prompt = assemblePrompt(stage, ctx);

    assert.match(prompt.system, /# Role: YAML Format Fixer/);
    assert.match(prompt.system, /yield:/);
    assert.doesNotMatch(prompt.system, /lemma: dignity/);
    assert.doesNotMatch(prompt.system, /yield\.language is required/);
    assert.match(prompt.user, /lemma: dignity/);
    assert.match(prompt.user, /yield\.language is required/);
    assert.equal(prompt.system.includes('{{schema}}'), false);
    assert.equal(prompt.user.includes('{{yaml}}'), false);
  });

  void it('keeps legacy single-part prompts compatible with the old short user message', () => {
    const { assemblePrompt } = require('./assembler') as typeof import('./assembler');
    const stage: PipelineStage = {
      id: 'searching',
      description: 'Search',
      type: 'llm',
      systemPromptFile: 'english-structural.md',
    };
    const ctx: PipelineContext = {
      word: 'conduct',
      context: 'His conduct was calm.',
      language: 'en',
      notes: 'prefer Latin history',
    };

    const prompt = assemblePrompt(stage, ctx);

    assert.match(prompt.system, /conduct/);
    assert.match(prompt.system, /His conduct was calm/);
    assert.equal(prompt.user, 'Generate the searching output for "conduct".');
  });

  void it('moves content review inputs into the user message', () => {
    const { assemblePrompt } = require('./assembler') as typeof import('./assembler');
    const stage: PipelineStage = {
      id: 'auditing',
      description: 'Audit',
      type: 'llm',
      systemPromptFile: 'content-reviewer.md',
    };
    const ctx: PipelineContext = {
      word: 'dignity',
      context: '',
      language: 'en',
      notes: 'make it less ornate',
      fullYaml: 'yield:\n  lemma: dignity\netymology:\n  visual_imagery_zh: 测试',
      userScore: 5,
    };

    const prompt = assemblePrompt(stage, ctx);

    assert.match(prompt.system, /# Role: YAML Content Reviewer/);
    assert.doesNotMatch(prompt.system, /lemma: dignity/);
    assert.doesNotMatch(prompt.system, /make it less ornate/);
    assert.match(prompt.user, /lemma: dignity/);
    assert.match(prompt.user, /make it less ornate/);
    assert.match(prompt.user, /用户评分：5/);
  });
});
