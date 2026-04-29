import { z } from 'zod';

const net = require('net') as typeof import('net');
const { URL } = require('node:url') as typeof import('node:url');

const SupportedEnvSchema = z.enum(['development', 'test', 'production']);

const isValidHost = (host: string): boolean => {
  const normalized = host.trim();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '0.0.0.0') return true;
  if (net.isIP(normalized) !== 0) return true;
  return /^[a-z0-9.-]+$/i.test(normalized);
};

const CorsOriginsSchema = z.preprocess(
  value => {
    if (Array.isArray(value)) {
      return value.map(item => String(item).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
      const normalized = value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      return normalized.length > 0 ? normalized : ['*'];
    }

    return value;
  },
  z
    .array(z.string().trim().min(1, 'CORS origin must not be empty'))
    .min(1, 'at least one CORS origin is required')
);

const DatabaseUrlSchema = z
  .string()
  .trim()
  .url('DATABASE_URL must be a valid URL')
  .refine(value => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'postgres:' || protocol === 'postgresql:';
    } catch {
      return false;
    }
  }, 'DATABASE_URL protocol must be postgres or postgresql');

const ConfigSchema = z
  .object({
    core: z.object({
      env: SupportedEnvSchema,
      admin_token: z.string().trim().min(1, 'ADMIN_TOKEN must not be empty'),
    }),
    server: z.object({
      port: z.number().int().min(1).max(65535),
      host: z
        .string()
        .trim()
        .min(1)
        .refine(isValidHost, 'server.host must be localhost, 0.0.0.0, an IP, or a domain'),
      cors_origins: CorsOriginsSchema,
      rate_limit: z.number().int().min(0),
      timeout_ms: z.number().int().min(1000),
    }),
    database: z.object({
      url: DatabaseUrlSchema,
      ssl: z.boolean(),
      pool_size: z.number().int().positive().nullable(),
    }),
    client: z.object({
      dev_port: z.number().int().min(1).max(65535),
    }),
    anki: z.object({
      host: z
        .string()
        .trim()
        .min(1)
        .refine(isValidHost, 'anki.host must be localhost, 0.0.0.0, an IP, or a domain'),
      port: z.number().int().min(1).max(65535),
    }),
    storage: z.object({
      max_items: z.number().int().positive(),
    }),
    logging: z.object({
      level: z.string().trim().min(1),
      dir: z.string().trim().min(1),
      rotation: z.object({
        interval: z.string().trim().min(1),
        max_size: z.string().trim().min(1),
        max_files: z.number().int().positive(),
      }),
    }),
    security: z.object({
      helmet: z.boolean(),
      hsts: z.boolean(),
    }),
  })
  .superRefine((config, ctx) => {
    if (config.core.env === 'production' && config.core.admin_token.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ADMIN_TOKEN must be at least 32 chars in production',
        path: ['core', 'admin_token'],
      });
    }
  });

module.exports = {
  SupportedEnvSchema,
  ConfigSchema,
};
