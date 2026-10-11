/**
 * Minimal Sentry stub — no @sentry/* dependency.
 * Wire into error boundaries: import this module from error.tsx /
 * global-error.tsx so exceptions never land in the console only.
 *
 * Isu #69 ("observability no-op"): dulu captureException() benar-benar
 * membuang event saat SENTRY_DSN kosong, sehingga kegagalan produksi tak
 * pernah tercatat di mana pun. Sekarang jalur tanpa DSN SELALU menulis
 * baris JSON terstruktur lewat logger bersama — `wrangler tail --format json`
 * dan log drain Cloudflare tetap punya jejak error.message + stack + ctx.
 * Yang bisa di-no-op hanya lompatan jaringan ke Sentry.
 */

import { logger } from './logger';

let sentryDsn: string | undefined;

/** Sembunyikan kredensial DSN sebelum ditulis ke log (host saja yang perlu). */
function dsnHost(dsn: string): string {
  try {
    return new URL(dsn).host;
  } catch {
    return 'invalid-dsn';
  }
}

export function initSentry(dsn?: string): void {
  sentryDsn = dsn ?? process.env.SENTRY_DSN;
  // Tanpa DSN tidak ada hop jaringan — tapi state dicatat sekali agar operator
  // tahu pelaporan error murni lewat log terstruktur (isu #69).
  if (!sentryDsn) {
    logger.info('sentry_disabled', {
      reason: 'SENTRY_DSN not set — errors stay in structured logs',
    });
    return;
  }
  // State dicatat sekali; per-event tetap best-effort (lihat captureException).
  logger.info('sentry_enabled', { host: dsnHost(sentryDsn), transport: 'dynamic-import' });
}

/** Apakah pelaporan ke Sentry aktif (DSN tersedia)? */
export function isSentryEnabled(): boolean {
  return Boolean(sentryDsn);
}

/**
 * Laporkan exception. TANPA SENTRY_DSN tetap memuat event sebagai JSON
 * terstruktur (tidak lagi dibuang) supaya insiden bisa ditelusuri; dengan DSN
 * event diteruskan ke @sentry/nextjs bila paket itu terpasang, dan jatuh ke
 * log terstruktur yang sama bila tidak.
 */
export function captureException(err: Error, ctx?: Record<string, unknown>): void {
  const payload: Record<string, unknown> = {
    error: err?.message ?? String(err),
    stack: err?.stack,
    ...ctx,
  };

  if (!sentryDsn) {
    logger.error('captureException', payload);
    return;
  }

  // Best-effort: if @sentry/* is present, use it; otherwise structured log only.
  // @ts-expect-error @sentry/nextjs not installed (optional dependency)
  import(/* webpackIgnore: true */ '@sentry/nextjs')
    .then((Sentry: { captureException?: (e: Error, o?: { extra?: unknown }) => void }) => {
      if (Sentry?.captureException) {
        Sentry.captureException(err, { extra: ctx });
        return;
      }
      // Fallback: structured log for observability pipelines
      logger.error('captureException', { ...payload, sentry: 'unavailable' });
    })
    .catch(() => {
      // @sentry/* not installed — fallback to structured log
      logger.error('captureException', { ...payload, sentry: 'unavailable' });
    });
}
