/**
 * Манифест PWA для конкретной студии: своё название, цвет и иконка на главном экране.
 * GET /api/manifest?slug=<slug>          — манифест
 * GET /api/manifest?slug=<slug>&icon=1   — перенаправление на иконку (apple-touch-icon для iPhone)
 * Данные берутся из Supabase (публичная таблица studios), а без Supabase — из studios/<slug>/studio.json.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PublicStudio {
  name: string;
  tagline?: string;
  branding?: { icon192?: string; icon512?: string; logo?: string };
}

const SLUG = /^[a-z0-9-]{2,40}$/;

async function loadStudio(slug: string): Promise<PublicStudio | null> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (url && key && process.env.VITE_DEMO !== '1') {
    const res = await fetch(`${url}/rest/v1/studios?slug=eq.${slug}&select=settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { settings: PublicStudio }[];
    return rows[0]?.settings ?? null;
  }
  const file = join(process.cwd(), 'studios', slug, 'studio.json');
  if (!existsSync(file)) return null;
  const s = JSON.parse(readFileSync(file, 'utf8')) as PublicStudio;
  // Локальные иконки копируются при сборке в /studio-icons/<slug>/
  const local = (v?: string) => (v && !/^(https?:|\/)/.test(v) ? `/studio-icons/${slug}/${v}` : v);
  return { ...s, branding: { icon192: local(s.branding?.icon192), icon512: local(s.branding?.icon512) } };
}

export function buildManifest(slug: string | null, studio: PublicStudio | null) {
  const base = slug ? `/${slug}` : '/';
  const icon192 = studio?.branding?.icon192 || '/icons/icon-192.png';
  const icon512 = studio?.branding?.icon512 || '/icons/icon-512.png';
  const name = studio?.name ?? 'Запись в автостудию';
  return {
    id: base,
    name,
    short_name: name.length > 14 ? name.slice(0, 14).trim() : name,
    description: studio?.tagline || 'Онлайн-запись в автостудию',
    lang: 'ru',
    start_url: base,
    scope: base,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get('slug');
  const valid = slug && SLUG.test(slug) ? slug : null;
  const studio = valid ? await loadStudio(valid).catch(() => null) : null;
  const manifest = buildManifest(studio ? valid : null, studio);
  if (new URL(request.url).searchParams.has('icon')) {
    const target = new URL(manifest.icons[0].src, request.url);
    return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'public, max-age=300' } });
  }
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
