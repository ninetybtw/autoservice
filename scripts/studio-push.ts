/**
 * Публикует студию из файла studios/<slug>/studio.json в Supabase:
 *  - проверяет файл по схеме;
 *  - загружает локальные фото (логотип, главное фото, работы, иконки) в хранилище;
 *  - создаёт или обновляет студию;
 *  - создаёт владельцу вход по почте и паролю и привязывает к студии.
 *
 *   pnpm studio:push <slug> [--force] [--password=...]
 *
 * --force перезаписывает настройки, если студия уже есть (правки владельца из кабинета будут потеряны).
 * Нужны переменные SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY и APP_URL (в .env или окружении).
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { studioFileSchema, type StudioSettings } from '../shared/schema.ts';

function loadDotEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  const force = args.includes('--force');
  const password = args.find((a) => a.startsWith('--password='))?.slice('--password='.length) || randomBytes(9).toString('base64url');
  if (!slug) throw new Error('Укажите slug: pnpm studio:push motor-service');

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  if (!url || !key) throw new Error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (см. .env.example)');

  const dir = join('studios', slug);
  const file = studioFileSchema.parse(JSON.parse(readFileSync(join(dir, 'studio.json'), 'utf8')));
  if (file.slug !== slug) throw new Error(`slug в файле (${file.slug}) не совпадает с папкой (${slug})`);
  const { $schema: _schema, slug: _slug, owner, ...settings } = file;

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: existing } = await db.from('studios').select('id').eq('slug', slug).maybeSingle();
  if (existing && !force) {
    throw new Error(`Автосервис ${slug} уже опубликован. Чтобы перезаписать настройки, добавьте --force (правки владельца будут потеряны).`);
  }
  let studioId = existing?.id as string | undefined;
  if (!studioId) {
    const { data, error } = await db.from('studios').insert({ slug, settings }).select('id').single();
    if (error) throw error;
    studioId = data.id as string;
  }

  const upload = async (value: string | undefined): Promise<string | undefined> => {
    if (!value || /^(https?:|data:|\/)/.test(value)) return value;
    const path = join(dir, value);
    if (!existsSync(path)) throw new Error(`Файл не найден: ${path}`);
    const target = `${studioId}/${value}`;
    const { error } = await db.storage
      .from('studio-media')
      .upload(target, readFileSync(path), { upsert: true, contentType: MIME[extname(value).toLowerCase()] ?? 'application/octet-stream', cacheControl: '31536000' });
    if (error) throw error;
    // Версия в адресе сбрасывает кэш браузера при повторной загрузке
    return `${db.storage.from('studio-media').getPublicUrl(target).data.publicUrl}?v=${Date.now().toString(36)}`;
  };

  const published: StudioSettings = {
    ...settings,
    branding: {
      logo: (await upload(settings.branding.logo)) ?? '',
      hero: (await upload(settings.branding.hero)) ?? '',
      heroFallback: await upload(settings.branding.heroFallback),
      icon192: await upload(settings.branding.icon192),
      icon512: await upload(settings.branding.icon512),
    },
    works: await Promise.all(
      settings.works.map(async (w) => ({ ...w, image: (await upload(w.image)) ?? w.image, fallback: await upload(w.fallback) })),
    ),
  };
  const { error: updError } = await db.from('studios').update({ settings: published }).eq('id', studioId);
  if (updError) throw updError;

  // Владелец
  let userId: string | undefined;
  let created = false;
  for (let page = 1; page < 50 && !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === owner.email.toLowerCase())?.id;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({ email: owner.email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    created = true;
  } else if (args.some((a) => a.startsWith('--password='))) {
    await db.auth.admin.updateUserById(userId, { password });
    created = true;
  }
  const { error: linkError } = await db.from('studio_owners').upsert({ studio_id: studioId, user_id: userId });
  if (linkError) throw linkError;

  console.log(`\n✓ Автосервис «${settings.name}» опубликован\n`);
  console.log(`  Ссылка для клиентов: ${appUrl}/${slug}`);
  console.log(`  Кабинет владельца:   ${appUrl}/${slug}/admin`);
  console.log(`  Логин:               ${owner.email}`);
  console.log(created ? `  Пароль:              ${password}` : '  Пароль:              прежний (сменить: --password=новый)');
  console.log('');
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : JSON.stringify(err)}`);
  process.exit(1);
});
