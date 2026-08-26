import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { ApiKeyList, getApiKeys } from "@/features/api-keys";

/**
 * API key management page (PRD §5.7, Phase 6, #47): generate, list, and
 * revoke this user's API keys, used to authenticate `POST
 * /api/projects/register` (#19) -- replaces that route's old
 * `UPKEEP_REGISTRATION_SECRET` shared-secret stub.
 */
async function ApiKeysLoader() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const { data: keys, error } = await getApiKeys();

  if (error) {
    return <p className="text-sm text-destructive">Failed to load API keys: {error}</p>;
  }

  return <ApiKeyList initialKeys={keys ?? []} />;
}

export default function ApiKeysPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Generate keys to authenticate programmatic project registration.
        </p>
      </div>
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading API keys...</p>}
      >
        <ApiKeysLoader />
      </Suspense>
    </div>
  );
}
