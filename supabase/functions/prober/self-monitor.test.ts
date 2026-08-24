// Unit tests for self-monitor.ts, using a fake RpcClient -- no real Supabase
// project needed.
import { assertEquals } from "@std/assert";
import { recordProberSuccess, type RpcClient } from "./self-monitor.ts";

function fakeClient(): {
  client: RpcClient;
  calledWith: string[];
} {
  const calledWith: string[] = [];
  return {
    calledWith,
    client: {
      rpc: (fn: string) => {
        calledWith.push(fn);
        return Promise.resolve({ error: null });
      },
    },
  };
}

Deno.test("recordProberSuccess: calls the record_prober_success RPC", async () => {
  const { client, calledWith } = fakeClient();
  await recordProberSuccess(client);
  assertEquals(calledWith, ["record_prober_success"]);
});

Deno.test("recordProberSuccess: never throws when the RPC returns an error", async () => {
  const failingClient: RpcClient = {
    rpc: () => Promise.resolve({ error: { message: "connection reset" } }),
  };

  await recordProberSuccess(failingClient);
});
