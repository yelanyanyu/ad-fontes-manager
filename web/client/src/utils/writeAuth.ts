import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export const ADMIN_TOKEN_STORAGE_KEY = 'ad_fontes_admin_token';
export const DEV_WRITE_TOKEN_FALLBACK = 'dev-token-not-for-production';

interface WriteAuthTokenSources {
  localStorageToken?: string | null;
  envToken?: string | null;
  isDev: boolean;
}

const normalizeToken = (value: string | null | undefined): string => String(value || '').trim();

export const isWriteMethod = (method: string | undefined): boolean => {
  if (!method) return false;
  return WRITE_METHODS.has(method.toLowerCase());
};

export const resolveWriteAuthToken = (sources: WriteAuthTokenSources): string => {
  const localToken = normalizeToken(sources.localStorageToken);
  if (localToken) return localToken;

  const envToken = normalizeToken(sources.envToken);
  if (envToken) return envToken;

  if (sources.isDev) return DEV_WRITE_TOKEN_FALLBACK;

  return '';
};

export const resolveWriteAuthTokenFromRuntime = (): string => {
  let localStorageToken = '';

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorageToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
    } catch {
      localStorageToken = '';
    }
  }

  return resolveWriteAuthToken({
    localStorageToken,
    envToken: import.meta.env.VITE_ADMIN_TOKEN,
    isDev: Boolean(import.meta.env.DEV),
  });
};

export const attachWriteAuthHeader = (
  config: InternalAxiosRequestConfig,
  token: string
): InternalAxiosRequestConfig => {
  if (!isWriteMethod(config.method)) return config;

  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return config;

  const headers = AxiosHeaders.from(config.headers || {});
  if (!headers.has('X-Admin-Token')) {
    headers.set('X-Admin-Token', normalizedToken);
  }

  config.headers = headers;
  return config;
};

