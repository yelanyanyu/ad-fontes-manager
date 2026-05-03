import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export const ADMIN_TOKEN_STORAGE_KEY = 'ad_fontes_admin_token';
export const DEV_WRITE_TOKEN_FALLBACK = 'dev-token-not-for-production';

interface WriteAuthTokenSources {
  localStorageToken?: string | null;
  envToken?: string | null;
  electronToken?: string | null;
  isDev: boolean;
}

const normalizeToken = (value: string | null | undefined): string => String(value || '').trim();

export const isWriteMethod = (method: string | undefined): boolean => {
  if (!method) return false;
  return WRITE_METHODS.has(method.toLowerCase());
};

export const resolveWriteAuthToken = (sources: WriteAuthTokenSources): string => {
  const localToken = normalizeToken(sources.localStorageToken);
  const envToken = normalizeToken(sources.envToken);
  const electronToken = normalizeToken(sources.electronToken);
  if (sources.isDev) {
    if (localToken) return localToken;
    if (electronToken) return electronToken;
    if (envToken) return envToken;
    return DEV_WRITE_TOKEN_FALLBACK;
  }

  if (envToken) return envToken;
  if (localToken) return localToken;
  if (electronToken) return electronToken;

  return '';
};

export const resolveWriteAuthTokenFromRuntime = (): string => {
  let localStorageToken = '';
  let electronToken = '';

  if (typeof window !== 'undefined') {
    try {
      localStorageToken = window.localStorage?.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
    } catch {
      localStorageToken = '';
    }

    try {
      electronToken = window.electronAPI?.adminToken || '';
    } catch {
      electronToken = '';
    }
  }

  return resolveWriteAuthToken({
    localStorageToken,
    envToken: import.meta.env.VITE_ADMIN_TOKEN,
    electronToken,
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
