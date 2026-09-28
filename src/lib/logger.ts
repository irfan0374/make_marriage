import 'server-only';

// Structured JSON logs, one line per entry, readable in Vercel function logs.
// Never log passwords, tokens, session IDs or email bodies: keys matching REDACT_KEY are masked.

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT_KEY = /pass(word)?|token|secret|cookie|authorization|session|api[-_]?key|body|uri/i;
const MAX_DEPTH = 5;

function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  return LEVELS[configured ?? 'info'] ?? LEVELS.info;
}

export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Fields = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = REDACT_KEY.test(key) ? '[redacted]' : redact(item, depth + 1);
  }
  return out;
}

function write(level: Level, msg: string, fields?: Fields): void {
  if (LEVELS[level] < threshold()) return;
  const entry = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
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
