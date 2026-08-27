// Permission-safe `Deno.env.get` wrapper, shared across this function's own
// modules (index.ts/manual-check.ts/region-probe.ts) -- unlike the
// near-identical `readEnv` helpers duplicated across the notifier/digest
// *Edge Functions* (each its own separate deployment/module graph, so
// there's nothing to import from), everything in this file lives inside
// the single `prober` function and can share one copy directly.
//
// `Deno.env.get` throws (not returns `undefined`) when the `env`
// permission for that specific variable hasn't been granted -- true for a
// plain `deno test` run with no `--allow-env` flag, which this project's
// documented workflow (AGENTS.md) deliberately doesn't require. The
// deployed Edge Function runtime grants access to its own configured/
// default secrets (SB_REGION, SUPABASE_URL, SUPABASE_SECRET_KEYS, etc.)
// automatically, so this only ever falls back to `undefined` locally
// under `deno test`/`deno check` -- exactly the same "not available" state
// every caller here already handles gracefully (see region-probe.ts's
// getSecretKey-equivalent callers and manual-check.ts's own region tag).
export function readEnv(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}
