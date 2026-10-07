#!/usr/bin/env node
/**
 * Создаёт папку новой студии из шаблона: studios/<slug>/studio.json + демо-фото.
 *   pnpm studio:new my-studio "Название студии"
 * Дальше: отредактируйте studio.json, замените фото своими и выполните pnpm studio:push my-studio
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [slug, name = 'Новая студия'] = process.argv.slice(2);
if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug)) {
  console.error('Использование: pnpm studio:new <slug> "Название"  (slug — латиница, цифры, дефис)');
  process.exit(1);
}
const dir = `studios/${slug}`;
if (existsSync(`${dir}/studio.json`)) {
  console.error(`${dir}/studio.json уже существует`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
const tpl = JSON.parse(readFileSync('studios/_template/studio.json', 'utf8'));
tpl.slug = slug;
tpl.name = name;
writeFileSync(`${dir}/studio.json`, JSON.stringify(tpl, null, 2) + '\n');
const logo = name.replace(/[^A-Za-zА-Яа-я0-9]/g, '').slice(0, 6).toUpperCase() || 'AUTO';
execFileSync('node', ['scripts/generate-demo-images.mjs', slug, '#ff1f2d', logo], { stdio: 'inherit' });
console.log(`\n✓ ${dir}/studio.json создан. Заполните его и замените фото в ${dir}/`);
