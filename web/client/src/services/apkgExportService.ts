import type { AnkiExportPayload } from '@/types/anki';
import { downloadPayloadsAsApkg } from '@/services/ankiConnectService';

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
  // Revoke too early can produce truncated files in some browsers.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30_000);
};

const hasZipEocdSignature = async (blob: Blob): Promise<boolean> => {
  if (blob.size < 22) return false;
  const tailWindow = Math.min(blob.size, 66_000);
  const start = blob.size - tailWindow;
  const tail = new Uint8Array(await blob.slice(start).arrayBuffer());

  // EOCD signature: 0x50 0x4b 0x05 0x06
  for (let i = tail.length - 4; i >= 0; i -= 1) {
    if (
      tail[i] === 0x50 &&
      tail[i + 1] === 0x4b &&
      tail[i + 2] === 0x05 &&
      tail[i + 3] === 0x06
    ) {
      return true;
    }
  }

  return false;
};

const downloadApkgViaBackend = async (
  payloads: AnkiExportPayload[],
  outputFileName: string
): Promise<{ ok: boolean; fileName: string }> => {
  const normalizedFileName = sanitizeFileName(outputFileName);
  const apkgBlob = await downloadPayloadsAsApkg(payloads, normalizedFileName);
  const validZip = await hasZipEocdSignature(apkgBlob);
  if (!validZip) {
    throw new Error('Downloaded .apkg is invalid (missing ZIP EOCD). Please retry export.');
  }
  triggerBrowserDownload(apkgBlob, normalizedFileName);
  return { ok: true, fileName: normalizedFileName };
};

export const exportApkgViaAnkiConnect = async (
  payload: AnkiExportPayload,
  outputFileName: string
): Promise<{ ok: boolean; fileName: string }> => {
  return downloadApkgViaBackend([payload], outputFileName);
};

export const exportBatchApkgViaAnkiConnect = async (
  payloads: AnkiExportPayload[],
  outputFileName: string
): Promise<{ ok: boolean; fileName: string }> => {
  return downloadApkgViaBackend(payloads, outputFileName);
};
