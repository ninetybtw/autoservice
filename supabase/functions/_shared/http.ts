import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { studioSettingsSchema, type Studio } from './domain/schema.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function fail(message: string, status = 400, code?: string): Response {
  return json({ error: message, code }, status);
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadStudio(db: SupabaseClient, by: { slug?: string; id?: string }): Promise<Studio | null> {
  const q = db.from('studios').select('id, slug, settings');
  const { data, error } = await (by.id ? q.eq('id', by.id) : q.eq('slug', by.slug ?? '')).maybeSingle();
  if (error || !data) return null;
  const parsed = studioSettingsSchema.safeParse(data.settings);
  if (!parsed.success) {
    console.error('studio settings invalid', data.slug, parsed.error.issues);
    return null;
  }
  return { id: data.id, slug: data.slug, settings: parsed.data };
}

/** Пользователь из заголовка Authorization (для кабинета владельца). */
export async function ownerOf(db: SupabaseClient, req: Request, studioId: string): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  const uid = data.user?.id;
  if (!uid) return null;
  const { data: link } = await db.from('studio_owners').select('user_id').eq('studio_id', studioId).eq('user_id', uid).maybeSingle();
  return link ? uid : null;
}
