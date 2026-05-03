import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAppStore } from '@/stores/appStore';
import {
  configureRateLimitPerMinute,
  parseRetryAfterMs,
  pauseRateLimitedQueue,
  scheduleRateLimitedRequest,
} from '@/utils/requestRateLimit';
import { attachWriteAuthHeader, resolveWriteAuthTokenFromRuntime } from '@/utils/writeAuth';

interface PublicConfigResponse {
  rateLimitPerMinute?: number;
}

interface InternalRequestConfig<D = unknown> extends AxiosRequestConfig<D> {
  skipErrorToast?: boolean;
  __rateLimitRetried?: boolean;
}

export interface RequestConfig<D = unknown> extends AxiosRequestConfig<D> {
  skipErrorToast?: boolean;
}

interface ErrorPayload {
  message?: string;
}

interface RequestClient {
  get<T = any>(url: string, config?: RequestConfig): Promise<T>;
  post<T = any>(url: string, data?: unknown, config?: RequestConfig): Promise<T>;
  put<T = any>(url: string, data?: unknown, config?: RequestConfig): Promise<T>;
  delete<T = any>(url: string, config?: RequestConfig): Promise<T>;
}

const service = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

const withRateLimit = <T>(task: () => Promise<T>): Promise<T> => {
  return scheduleRateLimitedRequest(task);
};

const updateRateLimitFromConfig = (config: PublicConfigResponse | null | undefined): void => {
  if (!config || typeof config.rateLimitPerMinute !== 'number') return;
  configureRateLimitPerMinute(config.rateLimitPerMinute);
};

export const bootstrapRequestRateLimit = async (): Promise<void> => {
  try {
    const response = await fetch('/api/config', { method: 'GET' });
    if (!response.ok) return;
    const payload = (await response.json()) as PublicConfigResponse;
    updateRateLimitFromConfig(payload);
  } catch {
    // Keep default limiter settings when bootstrap request fails.
  }
};

service.interceptors.request.use(
  (config: InternalAxiosRequestConfig & { skipErrorToast?: boolean }) => {
    const token = resolveWriteAuthTokenFromRuntime();
    return attachWriteAuthHeader(config, token);
  },
  error => Promise.reject(error)
);

service.interceptors.response.use(
  response => {
    if (response.config.url === '/config') {
      updateRateLimitFromConfig(response.data as PublicConfigResponse);
    }
    return response.data;
  },
  async (error: AxiosError<ErrorPayload>) => {
    const status = error.response?.status;
    const originalConfig = (error.config || {}) as InternalRequestConfig;

    if (status === 429 && !originalConfig.__rateLimitRetried) {
      const retryAfterRaw = error.response?.headers?.['retry-after'];
      const retryAfterMs = Math.max(1000, parseRetryAfterMs(retryAfterRaw));
      pauseRateLimitedQueue(retryAfterMs);
      originalConfig.__rateLimitRetried = true;

      return withRateLimit(() => service.request(originalConfig));
    }

    const appStore = useAppStore();
    const message = error.response?.data?.message || error.message || 'Error';
    const skipErrorToast = Boolean(originalConfig.skipErrorToast);

    if (!skipErrorToast) {
      appStore.addToast(message, 'error');
    }

    return Promise.reject(error);
  }
);

const request: RequestClient = {
  get<T = any>(url: string, config?: RequestConfig): Promise<T> {
    return withRateLimit(() => service.get(url, config as InternalRequestConfig)) as Promise<T>;
  },

  post<T = any>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return withRateLimit(() =>
      service.post(url, data, config as InternalRequestConfig)
    ) as Promise<T>;
  },

  put<T = any>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return withRateLimit(() =>
      service.put(url, data, config as InternalRequestConfig)
    ) as Promise<T>;
  },

  delete<T = any>(url: string, config?: RequestConfig): Promise<T> {
    return withRateLimit(() => service.delete(url, config as InternalRequestConfig)) as Promise<T>;
  },
};

export default request;
