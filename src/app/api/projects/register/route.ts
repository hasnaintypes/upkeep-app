import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { registerProject } from "@/features/projects/lib/register";

/**
 * POST /api/projects/register
 *
 * Lets a project self-register its health endpoint at deploy time (PRD
 * §5.1), instead of requiring manual dashboard entry -- e.g. call this from
 * a CI/CD deploy step.
 *
 * v1 STUB AUTH: authenticated by a single shared secret
 * (UPKEEP_REGISTRATION_SECRET) sent as `Authorization: Bearer <secret>`, not
 * real per-user API keys -- that's Phase 6 (roadmap: "API key generation").
 * Every caller that knows the one secret can register a project, and every
 * project it creates is owned by the single account configured in
 * UPKEEP_REGISTRATION_OWNER_USER_ID (see lib/register.ts). This is
 * explicitly tracked tech debt to replace once Phase 6 ships, not a
 * permanent design -- acceptable for now because this app's current
 * deployment model is single-owner (PRD §5.7).
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.UPKEEP_REGISTRATION_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Server is not configured for programmatic registration." },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const providedSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await registerProject(body);

  if (result.status !== 201) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ project: result.data }, { status: 201 });
}

/** Constant-time secret comparison -- a naive `===` leaks the secret's
 * length/prefix via response-timing differences. */
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
