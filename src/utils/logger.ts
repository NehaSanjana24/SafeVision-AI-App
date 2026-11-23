import { getEnv } from './env';

/**
 * Central structured logger with automatic secret/credential redaction,
 * real browser performance telemetry (p50/p95), and optional Sentry forwarding.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACT_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z\-_]{20,}/g, // Google / Gemini / Firebase API keys
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-style keys
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, // Bearer tokens
  /(password|secret|token|apiKey|api_key)\s*[:=]\s*["']?[^"'\s,}]+["']?/gi,
];

export function redactSecrets(input: unknown): string {
  let str: string;
  if (typeof input === 'string') {
    str = input;
  } else if (input instanceof Error) {
    str = `${input.name}: ${input.message}\n${input.stack || ''}`;
  } else {
    try {
      str = JSON.stringify(input);
    } catch {
      str = String(input);
    }
  }

  for (const pattern of REDACT_PATTERNS) {
    str = str.replace(pattern, (match) => {
      if (match.toLowerCase().startsWith('bearer')) return 'Bearer [REDACTED]';
      if (match.includes('=') || match.includes(':')) {
        const keyPart = match.split(/[:=]/)[0];
        return `${keyPart}=[REDACTED]`;
      }
      return '[REDACTED_SECRET]';
    });
  }
  return str;
}

const METRIC_SAMPLES: Record<string, number[]> = {};

export function recordMetric(name: 'detect_image' | 'rag_retrieval' | 'report_pdf', durationMs: number): void {
  if (!METRIC_SAMPLES[name]) METRIC_SAMPLES[name] = [];
  METRIC_SAMPLES[name].push(Math.max(1, Math.round(durationMs)));
  if (METRIC_SAMPLES[name].length > 100) {
    METRIC_SAMPLES[name].shift();
  }
}

export function getMeasuredLatencyStats(name: 'detect_image' | 'rag_retrieval' | 'report_pdf'): {
  count: number;
  p50: number | null;
  p95: number | null;
} {
  const arr = METRIC_SAMPLES[name] || [];
  if (arr.length === 0) return { count: 0, p50: null, p95: null };
  const sorted = [...arr].sort((a, b) => a - b);
  const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)];
  const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
  return { count: sorted.length, p50, p95 };
}

class CentralLogger {
  private minLevel: LogLevel = import.meta.env?.DEV ? 'debug' : 'info';

  private shouldLog(level: LogLevel): boolean {
    const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return order[level] >= order[this.minLevel];
  }

  debug(context: string, message: string, data?: unknown) {
    if (!this.shouldLog('debug')) return;
    console.debug(`[SafeVision:DEBUG][${context}] ${redactSecrets(message)}`, data !== undefined ? redactSecrets(data) : '');
  }

  info(context: string, message: string, data?: unknown) {
    if (!this.shouldLog('info')) return;
    console.info(`[SafeVision:INFO][${context}] ${redactSecrets(message)}`, data !== undefined ? redactSecrets(data) : '');
  }

  warn(context: string, message: string, data?: unknown) {
    if (!this.shouldLog('warn')) return;
    console.warn(`[SafeVision:WARN][${context}] ${redactSecrets(message)}`, data !== undefined ? redactSecrets(data) : '');
  }

  error(context: string, message: string, err?: unknown) {
    if (!this.shouldLog('error')) return;
    const safeMsg = redactSecrets(message);
    const safeErr = err !== undefined ? redactSecrets(err) : '';
    console.error(`[SafeVision:ERROR][${context}] ${safeMsg}`, safeErr);

    // Optional Sentry hook if VITE_SENTRY_DSN is configured
    const sentryDsn = getEnv('VITE_SENTRY_DSN');
    if (sentryDsn && typeof window !== 'undefined' && (window as any).Sentry?.captureException) {
      try {
        (window as any).Sentry.captureException(new Error(`[${context}] ${safeMsg}`));
      } catch {}
    }
  }
}

export const logger = new CentralLogger();
