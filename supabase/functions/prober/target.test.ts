// Unit tests for target.ts's parseTcpTarget -- pure, no network/Deno API
// access needed.
import { assertEquals } from "@std/assert";
import { parseTcpTarget } from "./target.ts";

Deno.test("parseTcpTarget: valid host:port", () => {
  assertEquals(parseTcpTarget("db.example.com:5432"), {
    hostname: "db.example.com",
    port: 5432,
  });
});

Deno.test("parseTcpTarget: valid bare IPv4:port", () => {
  assertEquals(parseTcpTarget("127.0.0.1:22"), { hostname: "127.0.0.1", port: 22 });
});

Deno.test("parseTcpTarget: missing port -> null", () => {
  assertEquals(parseTcpTarget("db.example.com"), null);
});

Deno.test("parseTcpTarget: empty host -> null", () => {
  assertEquals(parseTcpTarget(":5432"), null);
});

Deno.test("parseTcpTarget: trailing colon, no port -> null", () => {
  assertEquals(parseTcpTarget("db.example.com:"), null);
});

Deno.test("parseTcpTarget: non-numeric port -> null", () => {
  assertEquals(parseTcpTarget("db.example.com:abc"), null);
});

Deno.test("parseTcpTarget: port out of range (0) -> null", () => {
  assertEquals(parseTcpTarget("db.example.com:0"), null);
});

Deno.test("parseTcpTarget: port out of range (70000) -> null", () => {
  assertEquals(parseTcpTarget("db.example.com:70000"), null);
});
