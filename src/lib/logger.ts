/**
 * Structured JSON logger — single source untuk semua logging app.
 *
 * Format: satu baris JSON per event: { ts, level, msg, requestId, ...ctx }.
 * Di Cloudflare Workers, stdout JSON otomatis terindeks dan bisa dibaca
 * via `wrangler tail --format json` (Tail integration) tanpa perubahan kode.
 *
 * Sentry (opsional): set `SENTRY_DSN` — event level `error`/`fatal`
 * diteruskan ke Sentry via `captureException`. Tanpa DSN, no-op.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

type LogContext = Record<string, unknown>;

let sentryDsn: string | undefined;
try {
  // eslint-disable-next-line no-undef
  sentryDsn = typeof process !== 'undefined' ? process.env?.SENTRY_DSN : undefined;
} catch {
  sentryDsn = undefined;
}

function emit(level: LogLevel, msg: string, requestId: string | undefined, ctx?: LogContext): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(requestId ? { requestId } : {}),
    ...ctx,
  });
  if (level === 'error' || level === 'fatal') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

async function reportToSentry(
  level: 'error' | 'fatal',
  msg: string,
  ctx?: LogContext
): Promise<void> {
  if (!sentryDsn) return;
  // Integrasi Sentry: pasang `@sentry/nextjs` + set SENTRY_DSN untuk
  // meneruskan error ke Sentry. Tanpa dep tersebut, event tetap tercatat
  // sebagai JSON (dibaca via `wrangler tail --format json`).
  try {
    // @ts-expect-error — @sentry/nextjs opsional, hanya bila SENTRY_DSN diset
    const mod = (await import('@sentry/nextjs').catch(() => null)) as {
      captureException?: (err: Error, opts?: { level?: string }) => void;
    } | null;
    if (mod && typeof mod.captureException === 'function') {
      const err = (ctx?.error instanceof Error ? ctx.error : new Error(msg)) as Error;
      mod.captureException(err, { level: level === 'fatal' ? 'fatal' : 'error' });
    }
  } catch {
    // Sentry tidak boleh memecahkan request — telan kegagalan report.
  }
}

export function createLogger(requestId?: string) {
  const rid = requestId;
  return {
    requestId: rid,
    debug(msg: string, ctx?: LogContext): void {
      emit('debug', msg, rid, ctx);
    },
    info(msg: string, ctx?: LogContext): void {
      emit('info', msg, rid, ctx);
    },
    warn(msg: string, ctx?: LogContext): void {
      emit('warn', msg, rid, ctx);
    },
    error(msg: string, ctx?: LogContext): void {
      emit('error', msg, rid, ctx);
      void reportToSentry('error', msg, ctx);
    },
    fatal(msg: string, ctx?: LogContext): void {
      emit('fatal', msg, rid, ctx);
      void reportToSentry('fatal', msg, ctx);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;

/** Logger default tanpa request-id (kode client / skrip). */
export const logger = createLogger();

/**
 * Ambil/buat request-id dari Headers (dipakai di route handler):
 * hormati `x-request-id` bila sudah ada (tracing hulu), else random UUID.
 */
export function requestIdFromHeaders(headers: Headers): string {
  const incoming = headers.get('x-request-id');
  if (incoming && incoming.trim()) return incoming.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}
