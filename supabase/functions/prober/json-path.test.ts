// Unit tests for json-path.ts (#59). Pure functions -- no I/O, no
// network/Deno globals -- so these run without stubbing anything.
import { assertEquals } from "@std/assert";
import {
  evaluateJsonAssertion,
  parseJsonPathSegments,
  resolveJsonPath,
} from "./json-path.ts";

Deno.test("parseJsonPathSegments: top-level property", () => {
  assertEquals(parseJsonPathSegments("$.status"), ["status"]);
});

Deno.test("parseJsonPathSegments: nested properties", () => {
  assertEquals(parseJsonPathSegments("$.data.status"), ["data", "status"]);
});

Deno.test("parseJsonPathSegments: array index", () => {
  assertEquals(parseJsonPathSegments("$.items[0].status"), ["items", "0", "status"]);
});

Deno.test("parseJsonPathSegments: bare root", () => {
  assertEquals(parseJsonPathSegments("$"), []);
});

Deno.test("parseJsonPathSegments: leading root-level index", () => {
  assertEquals(parseJsonPathSegments("$[0]"), ["0"]);
});

Deno.test("parseJsonPathSegments: missing leading $ -> null", () => {
  assertEquals(parseJsonPathSegments("status"), null);
});

Deno.test("parseJsonPathSegments: missing dot before a property -> null", () => {
  assertEquals(parseJsonPathSegments("$status"), null);
});

Deno.test("parseJsonPathSegments: double dot -> null", () => {
  assertEquals(parseJsonPathSegments("$.data..status"), null);
});

Deno.test("parseJsonPathSegments: stray characters -> null", () => {
  assertEquals(parseJsonPathSegments("$.data status"), null);
});

Deno.test("resolveJsonPath: resolves a nested scalar", () => {
  assertEquals(resolveJsonPath({ data: { status: "ok" } }, "$.data.status"), {
    found: true,
    value: "ok",
  });
});

Deno.test("resolveJsonPath: resolves an array index", () => {
  assertEquals(resolveJsonPath({ items: [{ status: "ok" }] }, "$.items[0].status"), {
    found: true,
    value: "ok",
  });
});

Deno.test("resolveJsonPath: missing property -> not found, valid syntax", () => {
  assertEquals(resolveJsonPath({ other: "field" }, "$.status"), {
    found: false,
    invalidSyntax: false,
  });
});

Deno.test("resolveJsonPath: out-of-bounds array index -> not found, valid syntax", () => {
  assertEquals(resolveJsonPath({ items: [] }, "$.items[0]"), {
    found: false,
    invalidSyntax: false,
  });
});

Deno.test("resolveJsonPath: indexing into a scalar -> not found, valid syntax", () => {
  assertEquals(resolveJsonPath({ status: "ok" }, "$.status.nested"), {
    found: false,
    invalidSyntax: false,
  });
});

Deno.test("resolveJsonPath: invalid path syntax -> not found, invalidSyntax true", () => {
  assertEquals(resolveJsonPath({ status: "ok" }, "status"), {
    found: false,
    invalidSyntax: true,
  });
});

Deno.test("evaluateJsonAssertion: matching string value -> not failed", () => {
  assertEquals(
    evaluateJsonAssertion(JSON.stringify({ status: "ok" }), "$.status", "ok"),
    { failed: false },
  );
});

Deno.test("evaluateJsonAssertion: matching number value (compared as string) -> not failed", () => {
  assertEquals(
    evaluateJsonAssertion(JSON.stringify({ code: 200 }), "$.code", "200"),
    { failed: false },
  );
});

Deno.test("evaluateJsonAssertion: matching boolean value (compared as string) -> not failed", () => {
  assertEquals(
    evaluateJsonAssertion(JSON.stringify({ ok: true }), "$.ok", "true"),
    { failed: false },
  );
});

Deno.test("evaluateJsonAssertion: value mismatch -> failed with a specific message (#59 AC)", () => {
  assertEquals(
    evaluateJsonAssertion(JSON.stringify({ status: "degraded" }), "$.status", "ok"),
    { failed: true, message: 'JSON path "$.status" expected "ok", got "degraded".' },
  );
});

Deno.test("evaluateJsonAssertion: invalid JSON body -> failed with a parse-error message (#59 AC)", () => {
  const outcome = evaluateJsonAssertion("<html>not json</html>", "$.status", "ok");
  assertEquals(outcome.failed, true);
  assertEquals(
    outcome.failed && outcome.message.startsWith("Response body is not valid JSON"),
    true,
  );
});

Deno.test("evaluateJsonAssertion: path not found in body -> failed with a specific message (#59 AC)", () => {
  assertEquals(
    evaluateJsonAssertion(JSON.stringify({ other: "field" }), "$.status", "ok"),
    { failed: true, message: 'JSON path "$.status" not found in response body.' },
  );
});

Deno.test("evaluateJsonAssertion: path resolves to an object -> failed, not a silent pass", () => {
  const outcome = evaluateJsonAssertion(
    JSON.stringify({ status: { nested: "ok" } }),
    "$.status",
    "ok",
  );
  assertEquals(outcome.failed, true);
});

Deno.test("evaluateJsonAssertion: null value at path compares against the string \"null\"", () => {
  assertEquals(
    evaluateJsonAssertion(JSON.stringify({ status: null }), "$.status", "null"),
    { failed: false },
  );
});
