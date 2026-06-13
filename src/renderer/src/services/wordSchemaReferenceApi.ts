import type { LanguageCode } from '@/stores/appStore';
import request from '@/utils/request';

export interface WordSchemaReferenceResponse {
  language: LanguageCode;
  version: number;
  yaml: string;
}

export function fetchWordSchemaReference(
  language: LanguageCode
): Promise<WordSchemaReferenceResponse> {
  return request.get(`/v2/words/schema-reference?language=${encodeURIComponent(language)}`, {
    skipErrorToast: true,
  });
}
