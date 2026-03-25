import type { AnkiExportPayload } from '@/types/anki';
import { downloadDeckAsApkg } from '@/services/ankiConnectService';

const DEFAULT_FILE_NAME = 'ad-fontes-export.apkg';

const sanitizeFileName = (value: string): string => {
  const normalized = value.replace(/[\\/]/g, '_').trim();
  if (!normalized) return DEFAULT_FILE_NAME;
  return normalized.toLowerCase().endsWith('.apkg') ? normalized : `${normalized}.apkg`;
};

const triggerBrowserDownload = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const exportApkgViaAnkiConnect = async (
  payload: AnkiExportPayload,
  outputFileName: string
): Promise<{ ok: boolean; fileName: string }> => {
  const normalizedFileName = sanitizeFileName(outputFileName);
  const apkgBlob = await downloadDeckAsApkg(payload.options.deckName, normalizedFileName);
  triggerBrowserDownload(apkgBlob, normalizedFileName);
  return { ok: true, fileName: normalizedFileName };
};
