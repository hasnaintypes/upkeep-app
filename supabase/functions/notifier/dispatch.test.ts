// Unit tests for dispatch.ts's plugin registry -- no real Supabase project
// or network access needed (discord's/webhook's own dispatch logic is
// covered in discord.test.ts/webhook.test.ts; this file only asserts on
// the registry shape itself).
import { assertEquals } from "@std/assert";
import { DISPATCHERS, type NotificationChannel, type NotificationEvent } from "./dispatch.ts";

function fakeChannel(overrides: Partial<NotificationChannel> = {}): NotificationChannel {
  return {
    id: "channel-1",
    type: "email",
    config: {},
    ...overrides,
  };
}

function fakeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    kind: "opened",
    project: { id: "project-1", name: "Test Project" },
    incident: {
      id: "incident-1",
      started_at: "2026-08-25T00:00:00Z",
      resolved_at: null,
      cause: "timeout",
    },
    ...overrides,
  };
}

Deno.test("DISPATCHERS: has an entry for every channel type the notification_channels table allows", () => {
  assertEquals(Object.keys(DISPATCHERS).sort(), ["discord", "email", "webhook"]);
});

// discord (#41) and webhook (#43) are real implementations now -- see
// discord.test.ts/webhook.test.ts. email (#44) remains a documented stub.
// Telegram (#42) was descoped entirely, not stubbed -- see dispatch.ts's
// own top comment.
for (const type of ["email"] as const) {
  Deno.test(`DISPATCHERS.${type}: reports itself as not yet implemented, never throws`, async () => {
    const result = await DISPATCHERS[type](fakeChannel({ type }), fakeEvent());
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.includes(type), true);
    }
  });
}
