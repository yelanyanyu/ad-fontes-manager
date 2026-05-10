import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Tests whether the OS has locked a file by attempting to rename it.
 * Returns { locked: boolean, error?: string }.
 */
export function checkFileRenameLock(filePath) {
  if (!fs.existsSync(filePath)) {
    return { locked: false };
  }

  const probePath = `${filePath}.lock-check-${process.pid}`;

  try {
    fs.renameSync(filePath, probePath);
    fs.renameSync(probePath, filePath);
    return { locked: false };
  } catch (error) {
    // Restore if the first rename succeeded but the second failed.
    if (fs.existsSync(probePath) && !fs.existsSync(filePath)) {
      try {
        fs.renameSync(probePath, filePath);
      } catch {
        // Best effort.
      }
    }

    const code = error && typeof error === 'object' ? error.code : '';
    return {
      locked: true,
      error: code || String(error),
    };
  }
}

/**
 * Finds processes that have loaded the given file into their address space.
 * On Windows, uses PowerShell to enumerate process modules.
 * Returns Array<{ pid: number, name: string, path?: string }>.
 */
export function findProcessesLoadingFile(filePath) {
  if (process.platform !== 'win32') return [];

  const absPath = path.resolve(filePath);
  const escapedPath = absPath.replaceAll("'", "''");
  const powershell = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  );
  const command = `
$target = '${escapedPath}';
Get-Process -Name node, electron | ForEach-Object {
  $proc = $_;
  try {
    $proc.Modules | Where-Object { $_.FileName -eq $target } | ForEach-Object {
      [pscustomobject]@{ pid = $proc.Id; name = $proc.ProcessName; path = $proc.Path }
    }
  } catch {}
} | ConvertTo-Json -Compress
`;
  const result = spawnSync(powershell, ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0 || !result.stdout.trim()) return [];

  try {
    const parsed = JSON.parse(result.stdout);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    // Normalize keys from PascalCase (PowerShell) to camelCase (JS).
    return list.map(entry => ({
      pid: entry.pid ?? entry.Id,
      name: entry.name ?? entry.ProcessName ?? '',
      path: entry.path ?? entry.Path,
    }));
  } catch {
    return [];
  }
}

/**
 * Kills processes by PID. Returns the number of successfully killed processes.
 */
export function killProcesses(pids) {
  if (pids.length === 0) return 0;

  const args = ['/F', '/PID', ...pids.map(String)];
  const result = spawnSync('taskkill', args, {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  // taskkill exits 0 on success; count successes by checking output.
  if (result.status !== 0) return 0;

  const output = result.stdout || '';
  const matches = output.match(/SUCCESS/g);
  return matches ? matches.length : pids.length;
}

/**
 * Combined lock check: rename probe + process detection.
 * Returns { locked: boolean, processes: Array, reason: string }.
 */
export function checkFileLocked(filePath) {
  const renameResult = checkFileRenameLock(filePath);
  if (!renameResult.locked) {
    const processes = findProcessesLoadingFile(filePath);
    if (processes.length > 0) {
      return {
        locked: true,
        processes,
        reason: `File is loaded by ${processes.length} process(es) but renames succeeded.`,
      };
    }
    return { locked: false, processes: [], reason: '' };
  }

  const processes = findProcessesLoadingFile(filePath);
  return {
    locked: true,
    processes,
    reason:
      processes.length > 0
        ? `File is loaded by ${processes.length} process(es) and rename failed: ${renameResult.error}`
        : `Rename failed: ${renameResult.error}`,
  };
}
