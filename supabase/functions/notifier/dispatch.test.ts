// Unit tests for dispatch.ts's plugin registry -- no real Supabase project
// or network access needed. Each dispatcher's own logic is covered in its
// own test file (discord.test.ts/webhook.test.ts/email.test.ts); this file
// only asserts on the registry shape itself, and that importing it never
// throws even without env permissions (see dispatch.ts's own `readEnv`
// comment -- a plain `deno test` run with no `--allow-env` flag must still
// work, per this project's documented workflow).
import { assertEquals } from "@std/assert";
import { DISPATCHERS } from "./dispatch.ts";

Deno.test("DISPATCHERS: has an entry for every channel type the notification_channels table allows", () => {
  assertEquals(Object.keys(DISPATCHERS).sort(), ["discord", "email", "webhook"]);
});
