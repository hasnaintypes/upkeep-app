// Unit tests for check-types.ts's plugin registry -- no network access
// needed. Each check type's own run()/classify()/isAttemptSuccessful()
// logic is covered in its own test file (http.test.ts/tcp.test.ts/
// dns.test.ts/ssl.test.ts); this file only asserts on the registry shape
// itself and that every entry actually implements the full contract --
// same convention as notifier/dispatch.test.ts.
import { assertEquals } from "@std/assert";
import { CHECK_TYPES } from "./check-types.ts";

Deno.test("CHECK_TYPES: has an entry for every check type projects.check_type allows", () => {
  assertEquals(Object.keys(CHECK_TYPES).sort(), ["dns", "http", "ssl", "tcp"]);
});

Deno.test("CHECK_TYPES: every entry implements the full CheckTypeModule contract", () => {
  for (const [type, module] of Object.entries(CHECK_TYPES)) {
    assertEquals(typeof module.run, "function", `${type}.run`);
    assertEquals(typeof module.classify, "function", `${type}.classify`);
    assertEquals(typeof module.isAttemptSuccessful, "function", `${type}.isAttemptSuccessful`);
  }
});
