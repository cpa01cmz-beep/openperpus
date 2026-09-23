/**
 * Minimal Sentry stub — no @sentry/* dependency.
 * Wire into error boundaries: import if SENTRY_DSN exists, no-op otherwise.
 */

let sentryDsn: string | undefined;

export function initSentry(dsn?: string): void {
  sentryDsn = dsn ?? process.env.SENTRY_DSN;
  // No-op when no DSN — keeps bundle clean without @sentry/* deps
  if (!sentryDsn) return;
  // If DSN provided but @sentry/* not installed, silently no-op
  // (avoid throwing in production when dependency missing)
}

export function captureException(err: Error, ctx?: Record<string, unknown>): void {
  if (!sentryDsn) return;
  // Best-effort: if @sentry/* is present, use it; otherwise log only
  // @ts-expect-error @sentry/nextjs not installed (optional dependency)
  import('@sentry/nextjs')
    .then((Sentry) => {
      if (Sentry?.captureException) {
        Sentry.captureException(err, { extra: ctx });
        return;
      }
      // Fallback: structured log for observability pipelines
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          msg: 'captureException',
          error: err.message,
          stack: err.stack,
          ...ctx,
        })
      );
    })
    .catch(() => {
      // @sentry/* not installed — fallback to console
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          msg: 'captureException',
          error: err.message,
          stack: err.stack,
          ...ctx,
        })
      );
    });
}
