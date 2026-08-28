// Unit tests for rollup.ts, using a fake RollupClient -- no real Supabase
// project or network access required (same convention as
// ../digest/digest.test.ts).
import { assertEquals } from "@std/assert";
import {
  previousDayStart,
  previousHourStart,
  runRollup,
  type RollupClient,
} from "./rollup.ts";

Deno.test("previousHourStart: truncates to the top of the previous UTC hour", () => {
  const now = new Date("2026-08-28T14:37:22.123Z");
  assertEquals(previousHourStart(now).toISOString(), "2026-08-28T13:00:00.000Z");
});

Deno.test("previousHourStart: crosses a UTC day boundary correctly", () => {
  const now = new Date("2026-08-28T00:04:00.000Z");
  assertEquals(previousHourStart(now).toISOString(), "2026-08-27T23:00:00.000Z");
});

Deno.test("previousDayStart: truncates to midnight UTC of the previous day", () => {
  const now = new Date("2026-08-28T00:10:00.000Z");
  assertEquals(previousDayStart(now).toISOString(), "2026-08-27T00:00:00.000Z");
});

Deno.test("previousDayStart: crosses a UTC month boundary correctly", () => {
  const now = new Date("2026-09-01T00:10:00.000Z");
  assertEquals(previousDayStart(now).toISOString(), "2026-08-31T00:00:00.000Z");
});

/** A configurable fake RollupClient -- mirrors digest.test.ts's own
 * `fakeDigestClient` factory (canned data per RPC, dispatched on the `fn`
 * argument at runtime). */
function fakeRollupClient(options: {
  rolledUp?: number | null;
  error?: string;
  capturedArgs?: Record<string, unknown>[];
}): RollupClient {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      options.capturedArgs?.push(args);
      if (options.error) {
        return Promise.resolve({ data: null, error: { message: options.error } });
      }
      if (fn !== "rollup_hourly_checks" && fn !== "rollup_daily_checks") {
        throw new Error(`unexpected rpc: ${fn}`);
      }
      return Promise.resolve({ data: options.rolledUp === undefined ? 0 : options.rolledUp, error: null });
    },
  } as unknown as RollupClient;
}

Deno.test("runRollup: hourly calls rollup_hourly_checks with the previous completed hour", async () => {
  const capturedArgs: Record<string, unknown>[] = [];
  const client = fakeRollupClient({ rolledUp: 3, capturedArgs });

  const summary = await runRollup(client, "hourly", new Date("2026-08-28T14:05:00.000Z"));

  assertEquals(capturedArgs[0].p_period_start, "2026-08-28T13:00:00.000Z");
  assertEquals(summary.period_type, "hourly");
  assertEquals(summary.period_start, "2026-08-28T13:00:00.000Z");
  assertEquals(summary.rolled_up, 3);
  assertEquals(summary.error, undefined);
});

Deno.test("runRollup: daily calls rollup_daily_checks with the previous completed UTC day", async () => {
  const capturedArgs: Record<string, unknown>[] = [];
  const client = fakeRollupClient({ rolledUp: 12, capturedArgs });

  const summary = await runRollup(client, "daily", new Date("2026-08-28T00:10:00.000Z"));

  assertEquals(capturedArgs[0].p_period_start, "2026-08-27T00:00:00.000Z");
  assertEquals(summary.period_type, "daily");
  assertEquals(summary.rolled_up, 12);
});

Deno.test("runRollup: a null rolled-up count (no projects had checks that period) reports zero, not an error", async () => {
  const client = fakeRollupClient({ rolledUp: null });

  const summary = await runRollup(client, "hourly", new Date("2026-08-28T14:05:00.000Z"));

  assertEquals(summary.rolled_up, 0);
  assertEquals(summary.error, undefined);
});

Deno.test("runRollup: RPC failure is reported in the summary, not thrown", async () => {
  const client = fakeRollupClient({ error: "connection reset" });

  const summary = await runRollup(client, "daily", new Date("2026-08-28T00:10:00.000Z"));

  assertEquals(summary.rolled_up, 0);
  assertEquals(summary.error, "connection reset");
});
