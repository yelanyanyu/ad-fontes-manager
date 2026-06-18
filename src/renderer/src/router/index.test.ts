import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('router', () => {
  it('exposes a test route for experimental editor components', () => {
    const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

    expect(source).toContain("const TestView = () => import('@/views/TestView.vue')");
    expect(source).toContain("path: '/test'");
    expect(source).toContain("name: 'test-lab'");
  });
});
