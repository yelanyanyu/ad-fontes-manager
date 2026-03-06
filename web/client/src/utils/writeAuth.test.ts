import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import {
  attachWriteAuthHeader,
  resolveWriteAuthToken,
  DEV_WRITE_TOKEN_FALLBACK,
  isWriteMethod,
} from './writeAuth';

describe('writeAuth', () => {
  it('detects write methods correctly', () => {
    expect(isWriteMethod('post')).toBe(true);
    expect(isWriteMethod('PUT')).toBe(true);
    expect(isWriteMethod('patch')).toBe(true);
    expect(isWriteMethod('delete')).toBe(true);
    expect(isWriteMethod('get')).toBe(false);
    expect(isWriteMethod(undefined)).toBe(false);
  });

  it('prefers local token over env token', () => {
    const token = resolveWriteAuthToken({
      localStorageToken: 'local-token',
      envToken: 'env-token',
      isDev: true,
    });

    expect(token).toBe('local-token');
  });

  it('falls back to dev token in development when no token is provided', () => {
    const token = resolveWriteAuthToken({
      localStorageToken: '',
      envToken: '',
      isDev: true,
    });

    expect(token).toBe(DEV_WRITE_TOKEN_FALLBACK);
  });

  it('returns empty token in production when no token is provided', () => {
    const token = resolveWriteAuthToken({
      localStorageToken: '',
      envToken: '',
      isDev: false,
    });

    expect(token).toBe('');
  });

  it('attaches admin token header for write requests', () => {
    const config = {
      method: 'post',
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig;

    const updated = attachWriteAuthHeader(config, 'token-123');
    const headers = updated.headers as AxiosHeaders;

    expect(headers.get('X-Admin-Token')).toBe('token-123');
  });

  it('does not attach admin token header for read requests', () => {
    const config = {
      method: 'get',
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig;

    const updated = attachWriteAuthHeader(config, 'token-123');
    const headers = updated.headers as AxiosHeaders;

    expect(headers.get('X-Admin-Token')).toBeUndefined();
  });
});

