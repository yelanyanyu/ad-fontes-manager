const fs = require('node:fs');

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  );
}

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function extractCommand(input) {
  return String(input.tool_input?.command || input.tool_input?.cmd || '');
}

function checkCommand(command) {
  if (!command.trim()) {
    return null;
  }

  const normalized = command.replace(/\s+/g, ' ').trim();

  if (/(^|[;&|()\s])rg(\.exe|\.cmd)?(\s|$)/i.test(normalized)) {
    return 'This project uses PowerShell Select-String for text search. Use Select-String instead of rg.';
  }

  const destructiveGitPatterns = [
    /\bgit\s+reset\s+--hard\b/i,
    /\bgit\s+clean\b/i,
    /\bgit\s+checkout\s+--\b/i,
    /\bgit\s+restore\b.*\s--source(?:=|\s)HEAD\b/i,
  ];

  if (destructiveGitPatterns.some(pattern => pattern.test(normalized))) {
    return 'Destructive git commands are blocked by this project hook unless the user explicitly asks.';
  }

  const destructiveFilePatterns = [
    /\brm\s+(-[A-Za-z]*r[A-Za-z]*f|-f[A-Za-z]*r|-r[A-Za-z]*f)\b/i,
    /\bRemove-Item\b.*\s-(Recurse|r)\b/i,
    /\bdel(?:ete)?\s+\/[sq]\b/i,
    /\brmdir\s+\/s\b/i,
  ];

  if (destructiveFilePatterns.some(pattern => pattern.test(normalized))) {
    return 'Recursive or force deletion is blocked by this project hook unless the user explicitly asks.';
  }

  const shellWritePatterns = [
    /(^|[^>])>(?!>)/,
    /(^|[^>])>>(?!=)/,
    /\bSet-Content\b/i,
    /\bOut-File\b/i,
  ];

  if (shellWritePatterns.some(pattern => pattern.test(normalized))) {
    return 'Manual file edits should use apply_patch in this project, not shell redirection.';
  }

  const sensitiveFilePatterns = [
    /(^|[\\/\s])\.env(\s|$|[\\/])/i,
    /(^|[\\/\s])config\.json(\s|$|[\\/])/i,
    /(^|[\\/\s])config\.yml(\s|$|[\\/])/i,
  ];

  if (sensitiveFilePatterns.some(pattern => pattern.test(normalized))) {
    return 'Commands that touch sensitive config files are blocked by project policy.';
  }

  return null;
}

function runFromStdin() {
  const input = readInput();
  const reason = checkCommand(extractCommand(input));

  if (reason) {
    deny(reason);
  }
}

if (require.main === module) {
  runFromStdin();
}

module.exports = {
  checkCommand,
  extractCommand,
  runFromStdin,
};
