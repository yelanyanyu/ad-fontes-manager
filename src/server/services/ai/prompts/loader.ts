const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

// 开发环境 cwd 为项目根目录，docs/prompts 存在；生产 ASAR 内回退到 __dirname
const cwdPromptsDir = path.resolve(process.cwd(), 'docs', 'prompts');
const promptsDir = fs.existsSync(cwdPromptsDir)
  ? cwdPromptsDir
  : path.resolve(__dirname, '..', '..', '..', 'prompts');
const schemasDir = path.join(promptsDir, 'schemas');
const templateCache = new Map<string, string>();

function loadPromptFile(filename: string): string {
  const filePath = path.join(promptsDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function loadSchemaFile(filename: string): string {
  const filePath = path.join(schemasDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt schema file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function getPrompt(filename: string): string {
  if (!templateCache.has(filename)) {
    templateCache.set(filename, loadPromptFile(filename));
  }
  return templateCache.get(filename)!;
}

function getSchema(filename: string): string {
  const cacheKey = `schemas/${filename}`;
  if (!templateCache.has(cacheKey)) {
    templateCache.set(cacheKey, loadSchemaFile(filename));
  }
  return templateCache.get(cacheKey)!;
}

function injectVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function loadSystemPrompt(filename: string, variables: Record<string, string>): string {
  return injectVariables(getPrompt(filename), variables);
}

function loadPromptTemplate(filename: string): string {
  return getPrompt(filename);
}

function loadSchema(filename: string): string {
  return getSchema(filename);
}

function clearCache(): void {
  templateCache.clear();
}

module.exports = { loadSystemPrompt, loadPromptTemplate, loadSchema, clearCache, injectVariables };
