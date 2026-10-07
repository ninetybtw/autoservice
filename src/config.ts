export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';
/** Демо-режим: без Supabase все данные хранятся в браузере. */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY || import.meta.env.VITE_DEMO === '1';
export const DEFAULT_STUDIO = import.meta.env.VITE_DEFAULT_STUDIO ?? '';
