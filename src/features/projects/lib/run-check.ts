"use server";

import { createClient } from "@/lib/supabase/server";
import { MANUAL_CHECK_COOLDOWN_SECONDS } from "../constants";
import type { ManualCheckResult, RunCheckActionResult } from "../types";

/**
 * Invokes the deployed `prober` Edge Function's manual-check path
 * (supabase/functions/prober/manual-check.ts) using a Supabase **secret
 * key** -- the same `auth: "secret"` service-to-service auth pg_cron
 * itself uses (see `SUPABASE_SECRET_KEY` in `.env.example`/README.md).
 * Deliberately a plain `fetch`, not a `@supabase/supabase-js` client: this
 * is a single one-shot server-to-server call, not something that needs
 * sessions/realtime/storage, and reaching for a full client here would
 * risk it getting reused somewhere RLS-scoped by mistake.
 *
 * Only ever called after `runProjectCheckNow` has already verified the
 * caller owns the project and claimed the manual-check cooldown via RLS --
 * this function itself has no per-user identity, exactly like the Edge
 * Function it calls (see that module's own comment on the trust boundary).
 */
async function invokeManualCheck(projectId: string): Promise<RunCheckActionResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    return {
      data: null,
      error: "Server is not configured to run manual checks (SUPABASE_SECRET_KEY is unset).",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${url}/functions/v1/prober`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: secretKey },
      body: JSON.stringify({ project_id: projectId }),
    });
  } catch {
    return { data: null, error: "Could not reach the check runner. Please try again." };
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Check runner responded with ${response.status}.`;
    return { data: null, error: message };
  }

  return { data: payload as ManualCheckResult, error: null };
}

/**
 * Manually triggers an immediate health check for one of the current
 * user's projects (PRD §5.2/§3, issue #28) -- backs the "run check now"
 * button on the project list. Shares its check/retry/classification/
 * persistence logic entirely with the scheduled batch prober tick (see
 * supabase/functions/prober/manual-check.ts); this function's own job is
 * the two things a Server Action can do that the secret-authenticated Edge
 * Function can't -- verify the caller actually owns this project, and
 * atomically rate-limit repeated triggers -- before invoking it. A
 * successful call still writes a real `checks` row (via the Edge
 * Function), so manual runs contribute to history/uptime % like any
 * scheduled one.
 */
export async function runProjectCheckNow(
  projectId: string,
): Promise<RunCheckActionResult> {
  const supabase = await createClient();

  // Ownership + existence, checked up front purely so a bad/foreign id
  // gets a precise "not found" message. The RLS-scoped
  // try_claim_manual_check RPC below enforces the same ownership
  // restriction regardless (via projects_update_own), so this check alone
  // is never the only thing standing between another user's project and
  // this action.
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("id, last_manual_check_at")
    .eq("id", projectId)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return { data: null, error: "Project not found." };
    }
    return { data: null, error: fetchError.message };
  }

  // Atomic claim (see supabase/migrations/*_add_manual_check_rate_limit.sql) --
  // guards against a user accidentally hammering their own or a monitored
  // project's endpoint via repeated manual triggers (double-clicks, two
  // open tabs, etc.), the same way try_acquire_prober_lock guards the
  // scheduled batch tick against overlapping runs.
  const { data: claimed, error: claimError } = await supabase.rpc(
    "try_claim_manual_check",
    { p_project_id: projectId, p_cooldown_seconds: MANUAL_CHECK_COOLDOWN_SECONDS },
  );

  if (claimError) {
    return { data: null, error: claimError.message };
  }

  if (!claimed) {
    const elapsedMs = project.last_manual_check_at
      ? Date.now() - new Date(project.last_manual_check_at).getTime()
      : 0;
    const remainingSeconds = Math.max(
      1,
      Math.ceil(MANUAL_CHECK_COOLDOWN_SECONDS - elapsedMs / 1000),
    );
    return {
      data: null,
      error: `Please wait ${remainingSeconds}s before running another manual check on this project.`,
    };
  }

  return invokeManualCheck(projectId);
}
