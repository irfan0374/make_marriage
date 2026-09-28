import 'server-only';

// Structured JSON logs, one line per entry, readable in Vercel function logs.
// Never log passwords, tokens, session IDs or email bodies. Two layers guard against accidents:
// values under secret-looking keys are masked, and every string is scrubbed for credentials,
// bearer tokens and long random URL segments (invite links, presigned URL signatures).

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT_KEY =
  /pass(word)?|token|secret|cookie|authorization|session|api[-_]?key|body|uri|url|link|signature|hash|credential/i;
const MAX_DEPTH = 5;
const REDACTED = '[redacted]';

const SCRUBBERS: [RegExp, string][] = [
  // Credentials in connection strings: mongodb+srv://user:pass@host → mongodb+srv://[redacted]@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${REDACTED}@`],
  // Authorization header values.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, `$1 ${REDACTED}`],
  // Long random segments after '/' or '=' (guest/gallery tokens, reset tokens, URL signatures).
  [/(?<=[/=])[A-Za-z0-9_-]{20,}/g, REDACTED],
];

export function scrub(text: string): string {
  return SCRUBBERS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  return LEVELS[configured ?? 'info'] ?? LEVELS.info;
}

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrub(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrub(value.message),
      stack: value.stack ? scrub(value.stack) : undefined,
      ...(value.cause !== undefined && depth < MAX_DEPTH
        ? { cause: redact(value.cause, depth + 1) }
        : {}),
    };
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Fields = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = REDACT_KEY.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return out;
}

function write(level: Level, msg: string, fields?: Fields): void {
  if (LEVELS[level] < threshold()) return;
  const entry = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: scrub(msg),
    ...(fields ? (redact(fields) as Fields) : {}),
  });
  if (level === 'error' || level === 'warn') console.error(entry);
  else console.log(entry);
}

export const logger = {
  debug: (msg: string, fields?: Fields) => write('debug', msg, fields),
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};
