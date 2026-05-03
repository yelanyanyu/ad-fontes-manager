import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApp } from '../src/server/app';

const listMatchedRouterPrefixes = (pathname: string): string[] => {
  const app = createApp({
    dbPath: ':memory:',
    isProduction: false,
  });

  const router = app.router as
    | {
        stack?: Array<{
          name?: string;
          matchers?: Array<(input: string) => false | { path: string }>;
        }>;
      }
    | undefined;
  return (router?.stack ?? [])
    .filter(layer => layer.name === 'router')
    .map(layer => layer.matchers?.[0]?.(pathname))
    .filter((match): match is { path: string } => Boolean(match))
    .map(match => match.path);
};

void test('server exposes words only under the v2 API prefix', () => {
  const v2Matches = listMatchedRouterPrefixes('/api/v2/words');
  const legacyMatches = listMatchedRouterPrefixes('/api/words');

  assert(v2Matches.includes('/api/v2/words'));
  assert(!legacyMatches.includes('/api/words'));
});
