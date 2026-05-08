const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const promptsDir = path.resolve(process.cwd(), 'docs', 'prompts');
const templateCache = new Map<string, string>();

function loadPromptFile(filename: string): string {
  const filePath = path.join(promptsDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function getPrompt(filename: string): string {
  if (!templateCache.has(filename)) {
    templateCache.set(filename, loadPromptFile(filename));
  }
  return templateCache.get(filename)!;
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

function clearCache(): void {
  templateCache.clear();
}

module.exports = { loadSystemPrompt, clearCache };
