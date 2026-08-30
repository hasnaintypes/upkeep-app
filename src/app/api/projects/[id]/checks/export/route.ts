import { NextResponse } from "next/server";
import Papa from "papaparse";

import { createClient } from "@/lib/supabase/server";
import { getProjectChecksForExport } from "@/features/dashboard";

/**
 * GET /api/projects/[id]/checks/export?format=csv|json
 *
 * Downloads one project's full raw check history (PRD §5.3, Phase 10,
 * #64) -- the escape hatch for keeping data past #63's 7-day raw
 * retention window, and the export counterpart to the paginated
 * `CheckLogTable` on the project detail page (same columns, same
 * `project_id` scope, just every row instead of one page).
 *
 * Auth: browser/cookie session, not an API key -- this is a same-origin
 * download link on the dashboard (unlike `POST /api/projects/register`,
 * a genuine external caller), so the check is `auth.getClaims()` against
 * the signed-in user's own session, same as every Server Component page
 * under `/dashboard/*`. Ownership scoping itself needs no explicit check
 * here at all: `getProjectChecksForExport` uses the regular RLS-scoped
 * client, so a signed-in user requesting another user's project id gets
 * back zero rows (`checks_select_own`'s policy, joined through
 * `projects.user_id`), never another user's data -- no service-role
 * bypass anywhere in this route.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "csv" && format !== "json") {
    return NextResponse.json(
      { error: 'query param "format" must be "csv" or "json".' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: projectId } = await params;
  const { data: rows, error } = await getProjectChecksForExport(projectId);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const filename = `checks-${projectId}-${new Date().toISOString().slice(0, 10)}.${format}`;
  const body =
    format === "json"
      ? JSON.stringify(rows ?? [], null, 2)
      : Papa.unparse({ fields: CHECK_EXPORT_CSV_COLUMNS, data: rows ?? [] });

  return new NextResponse(body, {
    headers: {
      "Content-Type": format === "json" ? "application/json" : "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Explicit column order for the CSV export -- `Papa.unparse` would
 * otherwise derive columns from the first row's own key order, which
 * would silently omit every column if `rows` happens to be empty (a
 * project with no checks yet still gets a header-only CSV, not a
 * zero-byte file). Matches `CheckLogRow`'s own field order. */
const CHECK_EXPORT_CSV_COLUMNS = [
  "id",
  "status",
  "http_status",
  "response_time_ms",
  "error_message",
  "response_snippet",
  "checked_at",
  "is_rate_limited",
  "region",
  "is_consensus",
];
