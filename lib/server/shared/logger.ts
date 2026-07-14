import { Buffer } from 'node:buffer';
import { SystemClock, type Clock } from './clock';

const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';
const SQL_PATTERN = /\b(?:select|insert|update|delete|replace|alter|drop|create|truncate)\b[\s\S]*/i;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+={0,2}/gi;
const EMBEDDED_URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>\\]+/gi;
const QUERY_SECRET_PATTERN =
  /([?&](?:token|password|secret|api[_-]?key|access[_-]?token|auth|credential|key|session)=)([^&\s#]+)/gi;

const SENSITIVE_KEY_PARTS = new Set([
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'api',
  'access',
  'private',
  'credential',
  'sql',
  'query',
  'statement',
]);

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Readonly<Record<string, unknown>>;

export type LogRecord = Readonly<{
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  data?: unknown;
}>;

export type LogSink = (record: LogRecord) => void;

export type RedactionOptions = Readonly<{
  secrets?: readonly string[];
}>;

export type LoggerOptions = RedactionOptions & Readonly<{
  clock?: Clock;
  context?: LogContext;
  sink?: LogSink;
}>;

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  child(context: LogContext): Logger;
}

function normalizeKey(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSensitiveKey(key: string): boolean {
  const parts = normalizeKey(key);
  return (
    (parts.includes('database') && parts.includes('url'))
    || parts.some((part) => SENSITIVE_KEY_PARTS.has(part))
  );
}

function redactKnownSecrets(value: string, secrets: readonly string[]): string {
  let redacted = value.replace(BEARER_PATTERN, `Bearer ${REDACTED}`);

  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join(REDACTED);
  }

  return redacted;
}

function redactUrl(value: string, secrets: readonly string[]): string {
  let redacted = value.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/gi,
    `$1${REDACTED}@`,
  );

  try {
    const url = new URL(redacted);
    if (url.username || url.password) {
      url.username = REDACTED;
      url.password = '';
    }
    for (const [key, item] of url.searchParams.entries()) {
      url.searchParams.set(
        key,
        isSensitiveKey(key) ? REDACTED : redactKnownSecrets(item, secrets),
      );
    }
    redacted = url.toString();
  } catch {
    // Fall through to query-parameter scrubbing for partial URLs.
  }

  return redacted.replace(QUERY_SECRET_PATTERN, `$1${REDACTED}`);
}

function redactString(value: string, secrets: readonly string[]): string {
  let current = redactKnownSecrets(value, secrets);
  current = current.replace(EMBEDDED_URL_PATTERN, (match) => redactUrl(match, secrets));
  current = current.replace(QUERY_SECRET_PATTERN, `$1${REDACTED}`);
  return current.replace(SQL_PATTERN, REDACTED);
}

function binaryLength(value: object): number | undefined {
  if (Buffer.isBuffer(value)) {
    return value.byteLength;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  return undefined;
}

export function redact(
  value: unknown,
  options: RedactionOptions = {},
): unknown {
  const secrets = options.secrets ?? [];
  const seen = new WeakSet<object>();

  const visit = (current: unknown): unknown => {
    if (typeof current === 'string') {
      return redactString(current, secrets);
    }
    if (
      current === null
      || typeof current === 'number'
      || typeof current === 'boolean'
      || typeof current === 'undefined'
    ) {
      return current;
    }
    if (typeof current === 'bigint') {
      return current.toString();
    }
    if (typeof current === 'symbol') {
      return current.description ? `[Symbol ${current.description}]` : '[Symbol]';
    }
    if (typeof current === 'function') {
      return current.name ? `[Function ${current.name}]` : '[Function]';
    }

    const objectValue = current as object;
    const bytes = binaryLength(objectValue);
    if (bytes !== undefined) {
      return `[Binary ${bytes} bytes]`;
    }
    if (current instanceof Date) {
      return Number.isNaN(current.getTime()) ? '[Invalid Date]' : current.toISOString();
    }
    if (current instanceof URL) {
      return redactString(current.toString(), secrets);
    }
    if (seen.has(objectValue)) {
      return CIRCULAR;
    }
    seen.add(objectValue);

    if (current instanceof Error) {
      const output: Record<string, unknown> = {
        name: redactString(current.name, secrets),
        message: redactString(current.message, secrets),
      };
      if (current.stack) {
        output.stack = redactString(current.stack, secrets);
      }
      if ('cause' in current && current.cause !== undefined) {
        output.cause = visit(current.cause);
      }
      for (const key of Object.keys(current)) {
        output[key] = isSensitiveKey(key)
          ? REDACTED
          : visit((current as unknown as Record<string, unknown>)[key]);
      }
      return output;
    }

    if (Array.isArray(current)) {
      return current.map((item) => visit(item));
    }
    if (current instanceof Map) {
      return [...current.entries()].map(([key, item]) => [visit(key), visit(item)]);
    }
    if (current instanceof Set) {
      return [...current].map((item) => visit(item));
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(current as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? REDACTED : visit(item);
    }
    return output;
  };

  return visit(value);
}

const defaultSink: LogSink = (record) => {
  const stream = record.level === 'error' ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(record)}\n`);
};

function asContext(value: unknown): LogContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as LogContext;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const clock = options.clock ?? new SystemClock();
  const sink = options.sink ?? defaultSink;
  const secrets = [...(options.secrets ?? [])];
  const context = { ...(options.context ?? {}) };

  const write = (level: LogLevel, message: string, data?: unknown) => {
    try {
      let timestamp: string;
      try {
        timestamp = clock.now().toISOString();
      } catch {
        timestamp = new Date(0).toISOString();
      }

      const record: LogRecord = {
        timestamp,
        level,
        message: String(redact(message, { secrets })),
        context: asContext(redact(context, { secrets })),
        ...(data === undefined ? {} : { data: redact(data, { secrets }) }),
      };

      try {
        sink(record);
      } catch {
        // Logging must never break the request path.
      }
    } catch {
      // Redaction/clock failures are swallowed intentionally.
    }
  };

  return {
    debug: (message, data) => write('debug', message, data),
    info: (message, data) => write('info', message, data),
    warn: (message, data) => write('warn', message, data),
    error: (message, data) => write('error', message, data),
    child: (childContext) => createLogger({
      clock,
      sink,
      secrets,
      context: { ...context, ...childContext },
    }),
  };
}
