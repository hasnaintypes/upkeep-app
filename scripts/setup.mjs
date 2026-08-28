#!/usr/bin/env node
// Guided self-hosting setup wizard (PRD §5.10, Phase 11, issue #68).
//
// Automates everything that's actually scriptable end-to-end: writing
// .env.local, linking the Supabase project, applying every migration,
// regenerating types, deploying every Edge Function, and creating the two
// pg_cron vault secrets every scheduled function (prober/notifier/digest/
// rollup/prune) shares. Two things genuinely can't be automated
// headlessly, and are only prompted/explained here, not run
// automatically: `supabase login`'s OAuth browser flow, and generating
// the Publishable/Secret/service_role key values themselves (dashboard-
// only -- see the README's own "Environment variables" table for exactly
// where each one comes from).
//
// Safe to re-run: every step either checks first (.env.local, project
// link, vault secrets) before doing anything, or is naturally idempotent
// on its own (`db push`, `gen:types`, `functions deploy` all tolerate
// being run again with nothing new to apply).
//
// Plain Node (no TypeScript build step, no extra dependency) so it runs
// identically on every platform `pnpm` itself runs on, invoked via
// `pnpm setup` (see package.json).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envLocalPath = path.join(repoRoot, ".env.local");
const envExamplePath = path.join(repoRoot, ".env.example");
const projectRefPath = path.join(repoRoot, "supabase", ".temp", "project-ref");
const typesOutputPath = path.join(repoRoot, "src", "lib", "supabase", "types.ts");

/** Every scheduled Edge Function, in the order their own cron jobs were
 * introduced -- see supabase/config.toml for the authoritative list. */
const EDGE_FUNCTIONS = ["prober", "notifier", "digest", "rollup", "prune"];

/** The CLI is a pinned devDependency (see AGENTS.md/README -- never a
 * global install), so this resolves the exact same binary `pnpm
 * supabase ...` would, just invoked directly (not through pnpm's own
 * wrapper) so captured stdout is never mixed with pnpm's own "> @
 * supabase ..." banner line. */
const supabaseBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "supabase.CMD" : "supabase",
);

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => resolve(answer.trim() || defaultValue));
  });
}

async function confirm(question, defaultYes) {
  const answer = await ask(`${question} (${defaultYes ? "Y/n" : "y/N"})`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

function step(n, total, title) {
  console.log(`\n[${n}/${total}] ${title}`);
}

/** Runs a `supabase` subcommand. `silent: true` pipes output back as a
 * string (for gen:types/db query, whose stdout this script needs to
 * parse/write itself) instead of streaming it straight to the terminal
 * (every other command, so the user sees the CLI's own real-time
 * progress/errors exactly as `pnpm supabase ...` would show them). */
function runSupabase(args, { silent = false } = {}) {
  return execFileSync(supabaseBin, args, {
    cwd: repoRoot,
    stdio: silent ? "pipe" : "inherit",
    encoding: "utf8",
    // `.bin/supabase` is a `.CMD` shim on Windows (pnpm-generated) --
    // Node can't exec a `.cmd`/`.bat` file directly via CreateProcess
    // without going through a shell (fails with EINVAL otherwise); a
    // plain shebang script on every other platform needs no shell at
    // all. Every argument here is still passed as its own array element
    // (never string-concatenated), so Node's own arg-to-command-line
    // quoting handles spaces/special characters -- this script never
    // hand-builds a shell command string.
    shell: process.platform === "win32",
  });
}

/** Runs one SQL statement against the linked project and returns its rows
 * as parsed JSON -- used only for the vault-secret existence check below,
 * not a general-purpose query runner.
 *
 * Written to a temp file and passed via `--file`, not as an inline
 * positional argument -- a SQL string containing spaces/quotes/
 * parentheses can't survive `shell: true`'s cmd.exe quoting on Windows
 * (verified: it gets word-split into several separate arguments,
 * producing a CLI usage error instead of running the query) -- a bare
 * file path has none of those characters, so this sidesteps the escaping
 * problem entirely rather than trying to out-quote it.
 *
 * Slices out the `[...]` substring rather than `JSON.parse`-ing stdout
 * directly, since the CLI still writes its own non-JSON status lines
 * (e.g. "Initialising login role...") to the same stream ahead of the
 * actual result. */
function runQueryJson(sql) {
  const tempFile = path.join(os.tmpdir(), `upkeep-setup-${randomUUID()}.sql`);
  writeFileSync(tempFile, sql);
  try {
    const output = runSupabase(["db", "query", "--linked", "--output-format", "json", "--file", tempFile], {
      silent: true,
    });
    const start = output.indexOf("[");
    const end = output.lastIndexOf("]");
    if (start === -1 || end === -1) return [];
    return JSON.parse(output.slice(start, end + 1));
  } finally {
    unlinkSync(tempFile);
  }
}

function escapeSqlLiteral(value) {
  return value.replace(/'/g, "''");
}

async function main() {
  console.log("Upkeep self-hosting setup\n" + "=".repeat(25));
  console.log("Ctrl+C at any point to stop -- every step so far is safe to leave as-is and resume later.\n");
  const totalSteps = 7;

  // 1. .env.local
  step(1, totalSteps, "Environment variables (.env.local)");
  if (existsSync(envLocalPath)) {
    console.log("Found an existing .env.local -- leaving it as-is (edit it by hand if a value changed).");
  } else {
    console.log("These all come from your Supabase project's dashboard: Settings > API.");
    const url = await ask("NEXT_PUBLIC_SUPABASE_URL (Project URL)");
    const publishableKey = await ask("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (Publishable key, same page)");
    const serviceRoleKey = await ask("SUPABASE_SERVICE_ROLE_KEY (service_role secret, same page)");
    const secretKey = await ask(
      "SUPABASE_SECRET_KEY (Settings > API Keys > Secret keys -- generate one if you only see the legacy service_role key)",
    );

    const contents = readFileSync(envExamplePath, "utf8")
      .replace("your-project-url", url || "your-project-url")
      .replace("your-publishable-or-anon-key", publishableKey || "your-publishable-or-anon-key")
      .replace("your-service-role-key", serviceRoleKey || "your-service-role-key")
      .replace("your-secret-key", secretKey || "your-secret-key");
    writeFileSync(envLocalPath, contents);
    console.log("Wrote .env.local.");
  }

  // 2. supabase login -- an OAuth browser flow, genuinely can't be
  // scripted headlessly, so this just gates on the user confirming it
  // themselves rather than guessing at login state from a side-effecting
  // probe command.
  step(2, totalSteps, "Supabase CLI login");
  const loggedIn = await confirm("Have you already run `pnpm supabase login`?", true);
  if (!loggedIn) {
    console.log("\nRun `pnpm supabase login` (opens your browser to authenticate), then re-run `pnpm setup`.");
    rl.close();
    return;
  }

  // 3. link
  step(3, totalSteps, "Link your Supabase project");
  if (existsSync(projectRefPath)) {
    const linkedRef = readFileSync(projectRefPath, "utf8").trim();
    console.log(`Already linked to project "${linkedRef}".`);
    if (await confirm("Link a different project instead?", false)) {
      const ref = await ask("Project ref (from your dashboard URL: supabase.com/dashboard/project/<ref>)");
      runSupabase(["link", "--project-ref", ref]);
    }
  } else {
    const ref = await ask("Project ref (from your dashboard URL: supabase.com/dashboard/project/<ref>)");
    runSupabase(["link", "--project-ref", ref]);
  }

  // 4. schema + types
  step(4, totalSteps, "Apply the database schema");
  runSupabase(["db", "push"]);
  console.log("Regenerating src/lib/supabase/types.ts ...");
  const generatedTypes = runSupabase(["gen", "types", "typescript", "--linked"], { silent: true });
  writeFileSync(typesOutputPath, generatedTypes);

  // 5. edge functions
  step(5, totalSteps, "Deploy Edge Functions");
  for (const fn of EDGE_FUNCTIONS) {
    console.log(`  Deploying ${fn}...`);
    runSupabase(["functions", "deploy", fn, "--use-api"]);
  }

  // 6. vault secrets -- vault.create_secret errors on a duplicate name,
  // so unlike every step above this genuinely isn't idempotent by
  // itself; check first and only create whichever of the two is missing.
  step(6, totalSteps, "Cron authentication secrets (Postgres Vault)");
  const existingSecretNames = runQueryJson(
    "select name from vault.decrypted_secrets where name in ('project_url','prober_secret_key');",
  ).map((row) => row.name);

  if (existingSecretNames.length === 2) {
    console.log("Both vault secrets already exist -- skipping.");
  } else {
    console.log(
      "Every scheduled job (prober/notifier/digest/rollup/prune) authenticates its pg_cron-" +
        "triggered call with these two secrets, shared across all five -- see the schedule_prober_cron migration.",
    );
    const projectUrl = existingSecretNames.includes("project_url")
      ? null
      : await ask("Your project's URL (Settings > API > Project URL)");
    const secretKeyForVault = existingSecretNames.includes("prober_secret_key")
      ? null
      : await ask("The same SUPABASE_SECRET_KEY value from step 1 (used by pg_cron to invoke Edge Functions)");

    if (projectUrl) {
      runQueryJson(`select vault.create_secret('${escapeSqlLiteral(projectUrl)}', 'project_url') as id;`);
    }
    if (secretKeyForVault) {
      runQueryJson(
        `select vault.create_secret('${escapeSqlLiteral(secretKeyForVault)}', 'prober_secret_key') as id;`,
      );
    }
    console.log("Vault secrets created.");
  }

  // 7. optional email notifications
  step(7, totalSteps, "Email notifications (optional)");
  if (await confirm("Set up email notifications via Resend now?", false)) {
    const resendKey = await ask("RESEND_API_KEY (resend.com dashboard > API Keys)");
    if (resendKey) {
      runSupabase(["secrets", "set", `RESEND_API_KEY=${resendKey}`]);
      console.log(
        "Set. Emails send from Resend's shared onboarding@resend.dev until you verify your own domain " +
          '(then set RESEND_FROM_ADDRESS the same way -- see the README\'s "Email notifications" section).',
      );
    }
  } else {
    console.log('Skipped -- run `pnpm supabase secrets set RESEND_API_KEY=<key>` any time later to enable this.');
  }

  console.log("\nSetup complete. Run `pnpm dev`, open http://localhost:3000, and add your first project.");
  rl.close();
}

main().catch((err) => {
  console.error("\nSetup failed:", err instanceof Error ? err.message : err);
  rl.close();
  process.exitCode = 1;
});
