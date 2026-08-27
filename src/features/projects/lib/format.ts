/**
 * Shared display helpers for a project's check target -- kept here (not
 * duplicated across project-list.tsx / dashboard/projects/[id]/page.tsx /
 * overview-table.tsx, the three places it's rendered) so a future check
 * type doesn't need its own three-way find-and-replace.
 */

/**
 * Whatever precedes the target string when a project's check is displayed
 * (e.g. "GET https://...", "TCP db.example.com:5432", "DNS example.com",
 * or "SSL example.com:443"). For every non-http `check_type` this is
 * always a literal label, not `method` -- the `method` column still holds
 * its unused `'GET'` default on a non-http-type project (see the
 * add_tcp_check_type migration's comment on why there's no separate
 * tcp_host/tcp_port pair), so showing it as-is would misleadingly imply an
 * HTTP verb was actually sent.
 */
export function checkTargetPrefix(checkType: string, method: string): string {
  if (checkType === "tcp") return "TCP";
  if (checkType === "dns") return "DNS";
  if (checkType === "ssl") return "SSL";
  return method;
}
