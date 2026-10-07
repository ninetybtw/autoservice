import { IS_DEMO } from '../config.ts';
import type { Backend } from './backend.ts';
import { createDemoBackend } from './demo.ts';
import { createSupabaseBackend } from './supabase.ts';

export const backend: Backend = IS_DEMO ? createDemoBackend() : createSupabaseBackend();
export { UserError } from './backend.ts';
export type { Backend, OwnerBookingDraft } from './backend.ts';
