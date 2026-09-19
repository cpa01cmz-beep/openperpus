/* ============================================================
 * src/lib/api-utils.ts — helper API server bersama (dedup).
 * Menggantikan salinan lokal isUuid/writeLog yang tersebar di
 * belasan route (loans, members, reservations, menus, books/[id],
 * fines, categories, pages, banners, articles, racks, faqs,
 * testimonials). Bentuk respons error TETAP milik
 * src/lib/supabase/auth.ts (jsonError) — modul ini hanya
 * me-re-export agar route bisa impor dari satu pintu.
 * Dipakai HANYA di server (route handlers); bukan untuk client.
 * ============================================================ */

import type { createClient } from '@/lib/supabase/server';

/** UUID check kanonis — implementasi tunggal di validation.ts. */
export { isUuid } from './validation';

/** Bentuk respons error dimiliki auth.ts — re-export saja, JANGAN duplikasi. */
export { jsonError, jsonErrorMsg, parsePaging } from './supabase/auth';

type SupabaseServerClient = ReturnType<typeof createClient>;

type AuditRow = {
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
};

async function insertLog(supabase: SupabaseServerClient, row: AuditRow): Promise<void> {
  try {
    await supabase.from('activity_logs').insert(row);
  } catch {
    /* best-effort: jangan gagalkan request bila log gagal */
  }
}

export type WriteLogArgs = {
  userId: string | null | undefined;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

/** Audit-log generik (best-effort). Untuk call-site lama yang stabil,
 *  pakai createWriteLog(entityType) agar argumen posisional tak berubah. */
export async function writeLog(supabase: SupabaseServerClient, args: WriteLogArgs): Promise<void> {
  const { userId, action, entityType, entityId, metadata = {} } = args;
  await insertLog(supabase, {
    user_id: userId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

/** Pabrik logger per-entity: `const writeLog = createWriteLog('loans')`
 *  menghasilkan fungsi (supabase, userId, action, entityId, metadata?)
 *  yang identik dengan salinan lokal lama di tiap route. */
export function createWriteLog(entityType: string) {
  return async function writeEntityLog(
    supabase: SupabaseServerClient,
    userId: string | null | undefined,
    action: string,
    entityId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await insertLog(supabase, {
      user_id: userId ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  };
}
