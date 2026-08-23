import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { createProjectSchema } from "./validation";
import { maskProjectHeaders } from "./headers";
import type { Project } from "../types";

/**
 * Programmatic project registration (PRD §5.1: "a project can self-register
 * its health endpoint at deploy time"), for the shared-secret-authenticated
 * POST /api/projects/register route.
 *
 * Deliberately NOT exported from lib/actions.ts and does not have a
 * "use server" directive: actions.ts functions are Server Actions, each
 * auto-exposed as its own client-callable RPC endpoint by Next.js. This
 * function bypasses RLS via the service-role client and must only ever run
 * after the route handler has already verified the shared secret -- keeping
 * it out of the Server Actions mechanism entirely removes any chance of it
 * being reachable without that check.
 *
 * v1 STUB: there's no per-user API key yet (that's Phase 6), so every
 * request that presents the one shared secret creates a project owned by
 * the single account in UPKEEP_REGISTRATION_OWNER_USER_ID. This only makes
 * sense for this app's current single-owner deployment model (PRD §5.7) --
 * revisit this whole function once Phase 6 ships real per-user keys, at
 * which point the owner should come from the key, not a static env var.
 */
export type RegisterProjectResult =
  | { status: 201; data: Project }
  | { status: 400 | 500; error: string };

export async function registerProject(
  body: unknown,
): Promise<RegisterProjectResult> {
  const ownerId = process.env.UPKEEP_REGISTRATION_OWNER_USER_ID;
  if (!ownerId) {
    return {
      status: 500,
      error:
        "Server is not configured for programmatic registration (UPKEEP_REGISTRATION_OWNER_USER_ID is unset).",
    };
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      status: 400,
      error: firstIssue
        ? `${firstIssue.path.join(".") || "value"}: ${firstIssue.message}`
        : "Invalid project.",
    };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, user_id: ownerId })
    .select()
    .single();

  if (error) {
    return { status: 500, error: error.message };
  }

  return { status: 201, data: maskProjectHeaders(data) };
}
