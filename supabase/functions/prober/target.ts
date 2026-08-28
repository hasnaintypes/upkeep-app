// Shared "host:port" target parsing (PRD §5.2, Phase 9, issues #55/#57) --
// used by both tcp.ts and ssl.ts, since both check types overload
// `health_url` as the same "host:port" format (ssl.ts additionally reuses
// this rather than duplicating it, per that module's own comment).

/**
 * Parses `check_type = 'tcp'`/`'ssl'`'s overloaded `health_url` value as
 * "host:port" (e.g. "db.example.com:5432") -- exported for direct unit
 * testing (target.test.ts), and deliberately syntax-only: it does not
 * resolve the host or attempt a connection, just like the app-side
 * lib/validation.ts's tcpTargetSchema it mirrors (duplicated, not shared --
 * see check.ts's own comment on why an Edge Function can't import from
 * the Next.js app). Returns `null` for anything that isn't unambiguously
 * "non-empty host, colon, 1-65535 port" -- callers turn a `null` here into
 * a regular (non-thrown) CheckResult failure, not an exception.
 */
export function parseTcpTarget(target: string): { hostname: string; port: number } | null {
  const separatorIndex = target.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex === target.length - 1) {
    return null;
  }

  const hostname = target.slice(0, separatorIndex);
  const port = Number(target.slice(separatorIndex + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return { hostname, port };
}
