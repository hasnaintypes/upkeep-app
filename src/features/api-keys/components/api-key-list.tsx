"use client";

import { useState } from "react";
import { KeyRoundIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { notify } from "@/lib/toast";
import { ApiKeyTable } from "./api-key-table";
import { GenerateApiKeyDialog } from "./generate-api-key-dialog";
import { revokeApiKey } from "../lib/actions";
import type { ApiKey } from "../types";

/**
 * API key management (#47): generate, list, and revoke this user's keys.
 * Rendered on /dashboard/api-keys. Owns state/mutations (create/revoke) and
 * delegates the actual table rendering to `ApiKeyTable` (the same TanStack
 * Table v9 shell as the projects page, minus row selection/bulk actions) --
 * same parent-owns-mutations/child-owns-table-view split as
 * `ProjectList`/`ProjectTable`. The `AlertDialog` revoke-confirmation
 * pattern mirrors `ChannelList`'s delete flow -- revoking a key is just as
 * irreversible as deleting a channel.
 */
export function ApiKeyList({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [revokingKey, setRevokingKey] = useState<ApiKey | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  function handleCreated(created: ApiKey) {
    setKeys((prev) => [created, ...prev]);
  }

  async function handleConfirmRevoke() {
    if (!revokingKey) return;
    setRevokeError(null);
    setPendingId(revokingKey.id);
    try {
      const { data, error } = await revokeApiKey(revokingKey.id);
      if (error || !data) {
        const message = error ?? "Something went wrong.";
        setRevokeError(message);
        notify.error("Couldn't revoke key", message);
        return;
      }
      setKeys((prev) => prev.map((k) => (k.id === data.id ? data : k)));
      notify.success("Key revoked");
      setRevokingKey(null);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex justify-end">
        <GenerateApiKeyDialog onCreated={handleCreated} />
      </div>

      {keys.length === 0 ? (
        <EmptyState
          icon={KeyRoundIcon}
          title="No API keys yet"
          description="Generate one to authenticate programmatic project registration."
        />
      ) : (
        <ApiKeyTable
          keys={keys}
          pendingId={pendingId}
          onRequestRevoke={(key) => {
            setRevokeError(null);
            setRevokingKey(key);
          }}
        />
      )}

      <AlertDialog open={!!revokingKey} onOpenChange={(open) => !open && setRevokingKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &quot;{revokingKey?.label}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Any request using this key will start being rejected immediately. This can&apos;t
              be undone -- you&apos;ll need to generate a new key instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError && <p className="text-sm text-destructive">{revokeError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingId === revokingKey?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingId === revokingKey?.id}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmRevoke();
              }}
            >
              {pendingId === revokingKey?.id ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
