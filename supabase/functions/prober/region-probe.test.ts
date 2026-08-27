// Unit tests for region-probe.ts (#60). parseRegionProbeProjects and
// deriveConsensusStatus are pure and tested directly; fanOutToRegions is
// tested against an injected fake `fetch` (no real self-invocation, no
// network access needed) and runRegionProbe against a stubbed
// runHealthChecksWithRetry-shaped fetch (see check.test.ts's own
// withFakeFetch precedent).
import { assertEquals } from "@std/assert";
import {
  deriveConsensusStatus,
  fanOutToRegions,
  parseRegionProbeProjects,
  runRegionProbe,
  type RegionVote,
} from "./region-probe.ts";
import type { CheckResult, DueProject } from "./check.ts";

function fakeProject(overrides: Partial<DueProject> = {}): DueProject {
  return {
    id: "test-project",
    health_url: "https://example.test/health",
    method: "GET",
    headers: null,
    timeout_ms: 5000,
    body: null,
    retry_count: 0,
    expected_status: 200,
    check_type: "http",
    expected_body_match: null,
    expected_json_path: null,
    expected_json_value: null,
    ...overrides,
  };
}

function fakeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    project_id: "test-project",
    http_status: 200,
    response_time_ms: 100,
    response_snippet: null,
    error_message: null,
    timed_out: false,
    attempts: 1,
    ...overrides,
  };
}

function vote(overrides: Partial<RegionVote> = {}): RegionVote {
  return {
    region: "us-east-1",
    status: "up",
    result: fakeResult(),
    probeFailed: false,
    ...overrides,
  };
}

// --- parseRegionProbeProjects -----------------------------------------------

Deno.test("parseRegionProbeProjects: valid shape -> the projects array", () => {
  const projects = [fakeProject()];
  assertEquals(parseRegionProbeProjects({ region_probe: { projects } }), projects);
});

Deno.test("parseRegionProbeProjects: missing region_probe key -> null", () => {
  assertEquals(parseRegionProbeProjects({ project_id: "abc" }), null);
});

Deno.test("parseRegionProbeProjects: null body -> null", () => {
  assertEquals(parseRegionProbeProjects(null), null);
});

Deno.test("parseRegionProbeProjects: region_probe present but projects isn't an array -> null", () => {
  assertEquals(parseRegionProbeProjects({ region_probe: { projects: "nope" } }), null);
});

Deno.test("parseRegionProbeProjects: empty projects array is still a valid (empty) match", () => {
  assertEquals(parseRegionProbeProjects({ region_probe: { projects: [] } }), []);
});

// --- runRegionProbe ----------------------------------------------------------

Deno.test("runRegionProbe: reports 'unknown' region when SB_REGION isn't available (no --allow-env under deno test)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("ok", { status: 200 }))) as typeof fetch;

  try {
    const { region, results } = await runRegionProbe([fakeProject()]);
    assertEquals(region, "unknown");
    assertEquals(results.length, 1);
    assertEquals(results[0].http_status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("runRegionProbe: empty project list -> empty results, no fetch calls", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;

  try {
    const { results } = await runRegionProbe([]);
    assertEquals(results, []);
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- fanOutToRegions ---------------------------------------------------------

Deno.test("fanOutToRegions: fires exactly one request per configured region, with the right shape", async () => {
  const seenRequests: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    seenRequests.push({
      url,
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(init!.body as string),
    });
    const region = (init!.headers as Record<string, string>)["x-region"];
    return Promise.resolve(
      new Response(JSON.stringify({ region, results: [] }), { status: 200 }),
    );
  }) as typeof fetch;

  const projects = [fakeProject()];
  const batches = await fanOutToRegions(projects, {
    proberUrl: "https://example.test/functions/v1/prober",
    secretKey: "sb_secret_abc",
    regions: ["us-east-1", "eu-west-2"],
    fetchImpl,
  });

  assertEquals(batches.length, 2);
  assertEquals(seenRequests.length, 2);
  assertEquals(seenRequests[0].url, "https://example.test/functions/v1/prober");
  assertEquals(seenRequests[0].headers.apikey, "sb_secret_abc");
  assertEquals(seenRequests[0].headers["x-region"], "us-east-1");
  assertEquals(seenRequests[0].body, { region_probe: { projects } });
  assertEquals(batches.map((b) => b.region), ["us-east-1", "eu-west-2"]);
  assertEquals(batches.every((b) => !b.probeFailed), true);
});

Deno.test("fanOutToRegions: trusts the response body's own region over the requested one", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ region: "us-east-1-actual", results: [] }), { status: 200 }),
    )) as typeof fetch;

  const batches = await fanOutToRegions([fakeProject()], {
    proberUrl: "https://example.test/functions/v1/prober",
    secretKey: "sb_secret_abc",
    regions: ["us-east-1"],
    fetchImpl,
  });

  assertEquals(batches[0].region, "us-east-1-actual");
});

Deno.test("fanOutToRegions: a non-2xx response -> probeFailed true, synthetic down-shaped results, never throws", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response("Internal Server Error", { status: 500 }))) as typeof fetch;

  const projects = [fakeProject({ id: "p1" }), fakeProject({ id: "p2" })];
  const batches = await fanOutToRegions(projects, {
    proberUrl: "https://example.test/functions/v1/prober",
    secretKey: "sb_secret_abc",
    regions: ["us-east-1"],
    fetchImpl,
  });

  assertEquals(batches.length, 1);
  assertEquals(batches[0].probeFailed, true);
  assertEquals(batches[0].results.length, 2);
  assertEquals(batches[0].results.map((r) => r.project_id), ["p1", "p2"]);
  assertEquals(
    batches[0].results.every((r) => r.error_message?.startsWith("Region probe failed:")),
    true,
  );
});

Deno.test("fanOutToRegions: a rejected fetch (network error) -> probeFailed true, never throws", async () => {
  const fetchImpl = (() => Promise.reject(new Error("connection reset"))) as typeof fetch;

  const batches = await fanOutToRegions([fakeProject()], {
    proberUrl: "https://example.test/functions/v1/prober",
    secretKey: "sb_secret_abc",
    regions: ["us-east-1"],
    fetchImpl,
  });

  assertEquals(batches[0].probeFailed, true);
  assertEquals(batches[0].results[0].error_message, "Region probe failed: connection reset");
});

Deno.test("fanOutToRegions: a malformed response body -> probeFailed true, never throws", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response(JSON.stringify({ nonsense: true }), { status: 200 }))) as typeof fetch;

  const batches = await fanOutToRegions([fakeProject()], {
    proberUrl: "https://example.test/functions/v1/prober",
    secretKey: "sb_secret_abc",
    regions: ["us-east-1"],
    fetchImpl,
  });

  assertEquals(batches[0].probeFailed, true);
});

Deno.test("fanOutToRegions: independent per-region outcomes -- one failing region doesn't affect another", async () => {
  const fetchImpl = ((_url: string, init?: RequestInit) => {
    const region = (init!.headers as Record<string, string>)["x-region"];
    if (region === "eu-west-2") {
      return Promise.reject(new Error("network down"));
    }
    return Promise.resolve(new Response(JSON.stringify({ region, results: [] }), { status: 200 }));
  }) as typeof fetch;

  const batches = await fanOutToRegions([fakeProject()], {
    proberUrl: "https://example.test/functions/v1/prober",
    secretKey: "sb_secret_abc",
    regions: ["us-east-1", "eu-west-2", "ap-southeast-1"],
    fetchImpl,
  });

  const byRegion = new Map(batches.map((b) => [b.region, b]));
  assertEquals(byRegion.get("us-east-1")?.probeFailed, false);
  assertEquals(byRegion.get("eu-west-2")?.probeFailed, true);
  assertEquals(byRegion.get("ap-southeast-1")?.probeFailed, false);
});

// --- deriveConsensusStatus (#60's own acceptance criteria) -------------------

Deno.test("deriveConsensusStatus: all regions up -> up (primary region's own status)", () => {
  const outcome = deriveConsensusStatus([
    vote({ region: "us-east-1", status: "up" }),
    vote({ region: "eu-west-2", status: "up" }),
    vote({ region: "ap-southeast-1", status: "up" }),
  ]);
  assertEquals(outcome.status, "up");
  assertEquals(outcome.representative.region, "us-east-1");
});

Deno.test("deriveConsensusStatus: all regions down -> down (#60 AC: genuine outage opens an incident)", () => {
  const outcome = deriveConsensusStatus([
    vote({ region: "us-east-1", status: "down" }),
    vote({ region: "eu-west-2", status: "down" }),
    vote({ region: "ap-southeast-1", status: "down" }),
  ]);
  assertEquals(outcome.status, "down");
});

Deno.test("deriveConsensusStatus: majority (2 of 3) down -> down", () => {
  const outcome = deriveConsensusStatus([
    vote({ region: "us-east-1", status: "up" }),
    vote({ region: "eu-west-2", status: "down" }),
    vote({ region: "ap-southeast-1", status: "down" }),
  ]);
  assertEquals(outcome.status, "down");
  // Representative should be one of the down-voting regions, not the
  // (outvoted) up-reporting primary -- more informative for
  // deriveIncidentCause than the primary's own "up" diagnostics would be.
  assertEquals(outcome.representative.status, "down");
});

Deno.test("deriveConsensusStatus: single-region failure (1 of 3 down) -> up, not down (#60 AC: no false incident)", () => {
  const outcome = deriveConsensusStatus([
    vote({ region: "us-east-1", status: "up" }),
    vote({ region: "eu-west-2", status: "down" }),
    vote({ region: "ap-southeast-1", status: "up" }),
  ]);
  assertEquals(outcome.status, "up");
});

Deno.test("deriveConsensusStatus: single-region failure when that region is configured first -> still up, not down (skips the down-voting region for the passthrough)", () => {
  const outcome = deriveConsensusStatus([
    vote({ region: "us-east-1", status: "down" }),
    vote({ region: "eu-west-2", status: "up" }),
    vote({ region: "ap-southeast-1", status: "up" }),
  ]);
  assertEquals(outcome.status, "up");
  assertEquals(outcome.representative.region, "eu-west-2");
});

Deno.test("deriveConsensusStatus: an exact tie (2 regions, 1 up 1 down) -> not a majority, stays up", () => {
  const outcome = deriveConsensusStatus([
    vote({ region: "us-east-1", status: "up" }),
    vote({ region: "eu-west-2", status: "down" }),
  ]);
  assertEquals(outcome.status, "up");
});

Deno.test("deriveConsensusStatus: a probeFailed region abstains -- doesn't count as a down vote", () => {
  const outcome = deriveConsensusStatus([
    vote({ region: "us-east-1", status: "up" }),
    vote({ region: "eu-west-2", status: "down", probeFailed: true }),
    vote({ region: "ap-southeast-1", status: "up" }),
  ]);
  // 0 of 2 *responding* regions down -- nowhere near a majority, even
  // though the raw array has a "down"-tagged entry.
  assertEquals(outcome.status, "up");
});

Deno.test("deriveConsensusStatus: with an abstained region excluded, 1 of 2 responding regions down is still not a majority -> up, skipping the down responder for the passthrough", () => {
  const outcome = deriveConsensusStatus([
    vote({ region: "us-east-1", status: "down" }),
    vote({ region: "eu-west-2", status: "down", probeFailed: true }),
    vote({ region: "ap-southeast-1", status: "up" }),
  ]);
  // 1 of 2 *responding* regions down is not > half -- not a majority --
  // so the passthrough skips over us-east-1's own down vote and reports
  // ap-southeast-1's "up" instead (see this function's own comment on why
  // it must never pick a down-voting region for the passthrough).
  assertEquals(outcome.status, "up");
  assertEquals(outcome.representative.region, "ap-southeast-1");
});

Deno.test("deriveConsensusStatus: every region abstains (probeFailed) -> unknown, never a false escalation or resolve", () => {
  const outcome = deriveConsensusStatus([
    vote({ region: "us-east-1", status: "down", probeFailed: true }),
    vote({ region: "eu-west-2", status: "down", probeFailed: true }),
    vote({ region: "ap-southeast-1", status: "down", probeFailed: true }),
  ]);
  assertEquals(outcome.status, "unknown");
});

Deno.test("deriveConsensusStatus: primary region's own degraded/waking/unknown status passes through unmodified when down isn't a majority", () => {
  assertEquals(
    deriveConsensusStatus([vote({ status: "degraded" }), vote({ status: "up" }), vote({ status: "up" })])
      .status,
    "degraded",
  );
  assertEquals(
    deriveConsensusStatus([vote({ status: "waking" }), vote({ status: "up" }), vote({ status: "up" })])
      .status,
    "waking",
  );
});
