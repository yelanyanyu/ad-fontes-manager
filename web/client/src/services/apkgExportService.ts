import type {
  AnkiApkgExportByIdsRequest,
  AnkiApkgExportRequest,
  AnkiExportOptions,
  AnkiExportPayload,
  AnkiModelTemplate,
  FieldMappingConfig,
} from '@/types/anki';
import { downloadPayloadsAsApkg } from '@/services/ankiConnectService';
import request from '@/utils/request';

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
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      return true;
    }
  }

  return false;
};

const downloadApkgViaBackend = async (
  payloads: AnkiExportPayload[],
  outputFileName: string,
  modelFields: string[],
  selectedTemplate: AnkiModelTemplate,
  css: string
): Promise<{ ok: boolean; fileName: string }> => {
  if (!css.trim()) {
    console.warn('Model CSS is empty. The exported .apkg will use Anki default styling.');
  }
  const normalizedFileName = sanitizeFileName(outputFileName);
  const requestPayload: AnkiApkgExportRequest = {
    fileName: normalizedFileName,
    payloads,
    modelFields,
    selectedTemplate,
    css,
  };
  const apkgBlob = await downloadPayloadsAsApkg(requestPayload);
  const validZip = await hasZipEocdSignature(apkgBlob);
  if (!validZip) {
    throw new Error('Downloaded .apkg is invalid (missing ZIP EOCD). Please retry export.');
  }
  triggerBrowserDownload(apkgBlob, normalizedFileName);
  return { ok: true, fileName: normalizedFileName };
};

export const exportApkgViaAnkiConnect = async (
  payload: AnkiExportPayload,
  outputFileName: string,
  modelFields: string[],
  selectedTemplate: AnkiModelTemplate,
  css: string
): Promise<{ ok: boolean; fileName: string }> => {
  return downloadApkgViaBackend([payload], outputFileName, modelFields, selectedTemplate, css);
};

export const exportBatchApkgViaAnkiConnect = async (
  payloads: AnkiExportPayload[],
  outputFileName: string,
  modelFields: string[],
  selectedTemplate: AnkiModelTemplate,
  css: string
): Promise<{ ok: boolean; fileName: string }> => {
  return downloadApkgViaBackend(payloads, outputFileName, modelFields, selectedTemplate, css);
};

export const exportApkgByIds = async (
  wordIds: string[],
  fieldMapping: FieldMappingConfig,
  options: AnkiExportOptions,
  modelFields: string[],
  selectedTemplate: AnkiModelTemplate,
  css: string,
  outputFileName: string
): Promise<{ ok: boolean; fileName: string }> => {
  if (!wordIds.length) {
    throw new Error('At least one word id is required for .apkg export');
  }

  if (!css.trim()) {
    console.warn('Model CSS is empty. The exported .apkg will use Anki default styling.');
  }

  const normalizedFileName = sanitizeFileName(outputFileName);
  const requestPayload: AnkiApkgExportByIdsRequest = {
    wordIds,
    fieldMapping,
    options,
    modelFields,
    selectedTemplate,
    css,
    fileName: normalizedFileName,
  };
  const apkgBlob = await request.post<Blob>('/anki/export-apkg-by-ids', requestPayload, {
    responseType: 'blob',
    skipErrorToast: true,
  });
  const validZip = await hasZipEocdSignature(apkgBlob);
  if (!validZip) {
    throw new Error('Downloaded .apkg is invalid (missing ZIP EOCD). Please retry export.');
  }
  triggerBrowserDownload(apkgBlob, normalizedFileName);
  return { ok: true, fileName: normalizedFileName };
};
