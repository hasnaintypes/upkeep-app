/**
 * Shared display helpers for a project's check target -- kept here (not
 * duplicated across project-list.tsx / dashboard/projects/[id]/page.tsx /
 * overview-table.tsx, the three places it's rendered) so a future check
 * type doesn't need its own three-way find-and-replace.
 */

/**
 * Whatever precedes the target string when a project's check is displayed
 * (e.g. "GET https://..." or "TCP db.example.com:5432"). For `check_type =
 * "tcp"` this is always the literal "TCP", not `method` -- the `method`
 * column still holds its unused `'GET'` default on a tcp-type project (see
 * the add_tcp_check_type migration's comment on why there's no separate
 * tcp_host/tcp_port pair), so showing it as-is would misleadingly imply an
 * HTTP verb was actually sent.
 */
export function checkTargetPrefix(checkType: string, method: string): string {
  return checkType === "tcp" ? "TCP" : method;
}
