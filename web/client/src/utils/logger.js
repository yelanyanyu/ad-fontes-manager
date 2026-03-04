/**
 * ============================================================================
 * Logger - 统一日志管理模块
 * ============================================================================
 *
 * 【功能简介】
 * 本模块提供统一的日志管理功能，基于 Consola 实现。
 * 支持分模块日志记录、环境感知日志级别、美观的调试输出。
 *
 * 【使用方式】
 * import { wordLogger, syncLogger, apiLogger } from '@/utils/logger'
 * wordLogger.info('消息')
 * wordLogger.success('成功')
 * wordLogger.error('错误', error)
 *
 * 【日志级别】
 * - 0: Fatal (致命错误)
 * - 1: Error (错误)
 * - 2: Warn (警告)
 * - 3: Log (普通日志)
 * - 4: Info (信息)
 * - 5: Success (成功)
 * - 6: Debug (调试)
 * - 7: Trace (追踪)
 * ============================================================================
 */

import { createConsola } from 'consola';

const isDev = import.meta.env.DEV;

const baseConfig = {
  level: isDev ? 6 : 2,
  fancy: isDev,
  formatOptions: {
    date: isDev,
    colors: isDev,
  },
};

export const logger = createConsola(baseConfig);

export const wordLogger = logger.withTag('Word');
export const syncLogger = logger.withTag('Sync');
export const apiLogger = logger.withTag('API');
export const dbLogger = logger.withTag('DB');
export const uiLogger = logger.withTag('UI');

export default logger;
