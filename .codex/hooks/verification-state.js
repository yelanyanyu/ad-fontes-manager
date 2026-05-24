const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const mode = process.argv[2] || 'post';

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function repoRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
    }).trim();
  } catch {
    return cwd || process.cwd();
  }
}

function gitStatus(root) {
  try {
    return execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line =>
        line
          .slice(3)
          .replace(/^"|"$/g, '')
          .replace(/.* -> /, '')
      );
  } catch {
    return [];
  }
}

function isVerificationRelevant(file) {
  return (
    /^(src|scripts|tests|node|drizzle|\.codex\/hooks|\.claude\/hooks)\//.test(file) ||
    /^(package(-lock)?\.json|tsconfig.*\.json|vite\.config\..*|electron-builder\.yml)$/.test(file)
  );
}

function needsTypeCheck(file) {
  return (
    (/^(src|tests|node)\//.test(file) && /\.(ts|tsx|vue)$/.test(file)) ||
    /^(package(-lock)?\.json|tsconfig.*\.json)$/.test(file)
  );
}

function currentRequirements(root) {
  const files = gitStatus(root).filter(isVerificationRelevant);

  return {
    files,
    requiresLint: files.length > 0,
    requiresTypeCheck: files.some(needsTypeCheck),
  };
}

function readTranscript(input) {
  if (!input.transcript_path) {
    return '';
  }

  try {
    return fs.readFileSync(input.transcript_path, 'utf8');
  } catch {
    return '';
  }
}

function verificationAlreadyRan(transcript, commandName) {
  const escaped = commandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const commandPattern = new RegExp(`(?:npm|npm\\.cmd).*run\\s+${escaped}`, 'i');
  const successPattern = /Process exited with code 0/i;

  if (!commandPattern.test(transcript)) {
    return false;
  }

  const lastCommandIndex = transcript.search(commandPattern);
  return successPattern.test(transcript.slice(lastCommandIndex));
}

function outputSystemMessage(message) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: message,
    })
  );
}

function outputStop(reason) {
  process.stdout.write(
    JSON.stringify({
      continue: false,
      stopReason: reason,
      systemMessage: reason,
    })
  );
}

function post(input, root) {
  const requirements = currentRequirements(root);

  if (!requirements.requiresLint) {
    return;
  }

  const checks = ['cmd /c npm run lint'];

  if (requirements.requiresTypeCheck) {
    checks.push('cmd /c npm run type-check');
  }

  outputSystemMessage(`Verification required before final response: ${checks.join(' and ')}.`);
}

function stop(input, root) {
  const requirements = currentRequirements(root);

  if (!requirements.requiresLint) {
    return;
  }

  const transcript = readTranscript(input);
  const missing = [];

  if (!verificationAlreadyRan(transcript, 'lint')) {
    missing.push('cmd /c npm run lint');
  }

  if (requirements.requiresTypeCheck && !verificationAlreadyRan(transcript, 'type-check')) {
    missing.push('cmd /c npm run type-check');
  }

  if (missing.length > 0) {
    outputStop(`Run required verification before final response: ${missing.join(' and ')}.`);
  }
}

const input = readInput();
const root = repoRoot(input.cwd);

if (mode === 'stop') {
  stop(input, root);
} else {
  post(input, root);
}
