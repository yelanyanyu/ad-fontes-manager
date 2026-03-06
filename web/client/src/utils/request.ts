import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAppStore } from '@/stores/appStore';
import { attachWriteAuthHeader, resolveWriteAuthTokenFromRuntime } from '@/utils/writeAuth';

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

service.interceptors.request.use(
  (config: InternalAxiosRequestConfig & { skipErrorToast?: boolean }) => {
    const token = resolveWriteAuthTokenFromRuntime();
    return attachWriteAuthHeader(config, token);
  },
  error => Promise.reject(error)
);

service.interceptors.response.use(
  response => response.data,
  (error: AxiosError<ErrorPayload>) => {
    const appStore = useAppStore();
    const message = error.response?.data?.message || error.message || 'Error';
    const skipErrorToast = Boolean((error.config as RequestConfig | undefined)?.skipErrorToast);

    if (!skipErrorToast) {
      appStore.addToast(message, 'error');
    }

    return Promise.reject(error);
  }
);

const request: RequestClient = {
  get<T = any>(url: string, config?: RequestConfig): Promise<T> {
    return service.get(url, config) as unknown as Promise<T>;
  },

  post<T = any>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return service.post(url, data, config) as unknown as Promise<T>;
  },

  put<T = any>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return service.put(url, data, config) as unknown as Promise<T>;
  },

  delete<T = any>(url: string, config?: RequestConfig): Promise<T> {
    return service.delete(url, config) as unknown as Promise<T>;
  },
};

export default request;