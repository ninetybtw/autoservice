#!/usr/bin/env node
/**
 * Копирует общую логику (shared/) в supabase/functions/_shared/domain,
 * чтобы серверные функции использовали тот же код, что и приложение.
 * Тест tests/functions-sync.test.ts проверяет, что копия актуальна.
 */
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = 'shared';
const dst = 'supabase/functions/_shared/domain';
rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) writeFileSync(p, `// СГЕНЕРИРОВАНО из shared/ командой pnpm functions:sync — не редактируйте.\n${readFileSync(p, 'utf8')}`);
  }
}
walk(dst);
console.log(`✓ ${src} → ${dst}`);
