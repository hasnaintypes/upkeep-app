// Unit tests for prune.ts, using a fake PruneClient -- no real Supabase
// project or network access required (same convention as
// ../rollup/rollup.test.ts).
import { assertEquals } from "@std/assert";
import { DEFAULT_RETENTION_DAYS, runPrune, type PruneClient } from "./prune.ts";

/** A configurable fake PruneClient -- mirrors rollup.test.ts's own
 * `fakeRollupClient` factory. */
function fakePruneClient(options: {
  deleted?: number | null;
  error?: string;
  capturedArgs?: Record<string, unknown>[];
}): PruneClient {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      options.capturedArgs?.push(args);
      if (options.error) {
        return Promise.resolve({ data: null, error: { message: options.error } });
      }
      if (fn !== "prune_raw_checks") {
        throw new Error(`unexpected rpc: ${fn}`);
      }
      return Promise.resolve({ data: options.deleted === undefined ? 0 : options.deleted, error: null });
    },
  } as unknown as PruneClient;
}

Deno.test("runPrune: defaults to the decided 7-day retention window when no override is given", async () => {
  const capturedArgs: Record<string, unknown>[] = [];
  const client = fakePruneClient({ deleted: 5, capturedArgs });

  const summary = await runPrune(client);

  assertEquals(capturedArgs[0].p_retention_days, DEFAULT_RETENTION_DAYS);
  assertEquals(summary.retention_days, 7);
  assertEquals(summary.deleted, 5);
  assertEquals(summary.error, undefined);
});

Deno.test("runPrune: an explicit retention_days override is passed through to the RPC", async () => {
  const capturedArgs: Record<string, unknown>[] = [];
  const client = fakePruneClient({ deleted: 0, capturedArgs });

  const summary = await runPrune(client, 14);

  assertEquals(capturedArgs[0].p_retention_days, 14);
  assertEquals(summary.retention_days, 14);
});

Deno.test("runPrune: a null deleted count (nothing eligible this run) reports zero, not an error", async () => {
  const client = fakePruneClient({ deleted: null });

  const summary = await runPrune(client);

  assertEquals(summary.deleted, 0);
  assertEquals(summary.error, undefined);
});

Deno.test("runPrune: RPC failure is reported in the summary, not thrown", async () => {
  const client = fakePruneClient({ error: "connection reset" });

  const summary = await runPrune(client);

  assertEquals(summary.deleted, 0);
  assertEquals(summary.error, "connection reset");
});
