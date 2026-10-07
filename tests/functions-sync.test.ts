import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('серверные функции', () => {
  it('используют актуальную копию shared/ (pnpm functions:sync)', () => {
    const src = files('shared').filter((f) => f.endsWith('.ts'));
    const dst = 'supabase/functions/_shared/domain';
    expect(files(dst).map((f) => relative(dst, f)).sort()).toEqual(src.map((f) => relative('shared', f)).sort());
    for (const f of src) {
      const copy = readFileSync(join(dst, relative('shared', f)), 'utf8').split('\n').slice(1).join('\n');
      expect(copy, f).toBe(readFileSync(f, 'utf8'));
    }
  });
});
