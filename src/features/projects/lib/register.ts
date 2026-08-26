import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { createProjectSchema } from "./validation";
import { maskProjectHeaders } from "./headers";
import type { Project } from "../types";

/**
 * Programmatic project registration (PRD §5.1: "a project can self-register
 * its health endpoint at deploy time"), for the API-key-authenticated
 * POST /api/projects/register route.
 *
 * Deliberately NOT exported from lib/actions.ts and does not have a
 * "use server" directive: actions.ts functions are Server Actions, each
 * auto-exposed as its own client-callable RPC endpoint by Next.js. This
 * function bypasses RLS via the service-role client and must only ever run
 * after the route handler has already verified the caller's API key --
 * keeping it out of the Server Actions mechanism entirely removes any
 * chance of it being reachable without that check.
 *
 * `ownerId` comes from the verified key (`verifyApiKey`, #47), not a static
 * env var -- each user's own keys register projects into their own
 * account, replacing the old single-shared-secret/single-fixed-owner stub.
 */
export type RegisterProjectResult =
  | { status: 201; data: Project }
  | { status: 400 | 500; error: string };

export async function registerProject(
  body: unknown,
  ownerId: string,
): Promise<RegisterProjectResult> {
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
