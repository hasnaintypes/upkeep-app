"use client";

import { useState } from "react";
import { Ban, KeyRoundIcon } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/toast";
import { GenerateApiKeyDialog } from "./generate-api-key-dialog";
import { revokeApiKey } from "../lib/actions";
import type { ApiKey } from "../types";

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

/**
 * API key management (#47): generate, list, and revoke this user's keys.
 * Rendered on /dashboard/api-keys. Mirrors the empty-state/`Card`+`Table`
 * shape of `GlobalIncidentTable` and the `AlertDialog` revoke-confirmation
 * pattern of `ChannelList`'s delete flow -- revoking a key is just as
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
        <Card>
          <CardContent className="flex flex-col gap-4 px-4 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  <TableHead className="hidden sm:table-cell">Last used</TableHead>
                  <TableHead className="text-right sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const isRevoked = !!key.revoked_at;
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.label}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {key.key_prefix}...
                      </TableCell>
                      <TableCell>
                        <Badge variant={isRevoked ? "outline" : "secondary"}>
                          {isRevoked ? "Revoked" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {formatTimestamp(key.created_at)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {formatTimestamp(key.last_used_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isRevoked && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Revoke key"
                            disabled={pendingId === key.id}
                            onClick={() => {
                              setRevokeError(null);
                              setRevokingKey(key);
                            }}
                          >
                            <Ban className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
