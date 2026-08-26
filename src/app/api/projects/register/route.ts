import { NextResponse } from "next/server";
import { verifyApiKey } from "@/features/api-keys/lib/verify";
import { registerProject } from "@/features/projects/lib/register";

/**
 * POST /api/projects/register
 *
 * Lets a project self-register its health endpoint at deploy time (PRD
 * §5.1), instead of requiring manual dashboard entry -- e.g. call this from
 * a CI/CD deploy step.
 *
 * Authenticated by a real per-user API key (#47), sent as
 * `Authorization: Bearer <key>` and generated from /dashboard/api-keys.
 * `verifyApiKey` resolves the key to its owning user, and every project
 * registered with it is created under that user's account -- replacing the
 * old `UPKEEP_REGISTRATION_SECRET`/`UPKEEP_REGISTRATION_OWNER_USER_ID`
 * shared-secret stub (single fixed secret, single fixed owner), which is
 * now fully removed.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const providedKey = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  const verified = providedKey ? await verifyApiKey(providedKey) : null;
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await registerProject(body, verified.userId);

  if (result.status !== 201) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ project: result.data }, { status: 201 });
}
