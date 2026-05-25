import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = fileURLToPath(new URL('./ConflictModal.vue', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');

describe('ConflictModal responsive layout', () => {
  it('keeps the dialog bounded and close button accessible on small screens', () => {
    expect(source).toContain('max-h-[calc(100vh-2rem)]');
    expect(source).toMatch(/conflict-modal[^"]*\bflex\b[^"]*\bflex-col\b/);
    expect(source).toContain('min-h-0');
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('md:grid-cols-2');
    expect(source).toContain('shrink-0');
  });
});
