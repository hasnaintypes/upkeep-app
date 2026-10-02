"use client";

import { useState } from "react";
import {
  BellIcon,
  MessageSquareIcon,
  MailIcon,
  Pencil,
  Plus,
  Trash2,
  WebhookIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { InlineEmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { notify } from "@/lib/toast";
import { AddChannelForm } from "./add-channel-form";
import { deleteNotificationChannel, setChannelActive } from "../lib/actions";
import { describeChannelConfig } from "../lib/config-mask";
import { NOTIFICATION_CHANNEL_TYPE_LABELS } from "../constants";
import type { NotificationChannel, NotificationChannelType } from "../types";

/** Per-type icon for a channel card -- lucide has no literal Discord mark,
 * so `MessageSquareIcon` stands in for "a chat webhook" the same way this
 * app already avoids brand-specific iconography elsewhere. Gives each card
 * a distinct silhouette to scan by type instead of relying on the label
 * text alone. */
const CHANNEL_TYPE_ICON: Record<NotificationChannelType, typeof BellIcon> = {
  discord: MessageSquareIcon,
  email: MailIcon,
  webhook: WebhookIcon,
};

/**
 * Manages the current user's notification channels (create, edit config,
 * toggle active, delete) -- the prerequisite this issue's own acceptance
 * criteria assume ("attach one or more *existing* notification_channels to
 * a project"). Rendered in the Notifications section of the settings
 * dialog (components/layout/settings-dialog.tsx); the per-project rules
 * panel (project-notification-rules.tsx) only picks from what's created
 * here, it doesn't create channels itself.
 */
export function ChannelList({
  initialChannels,
}: {
  initialChannels: NotificationChannel[];
}) {
  const [channels, setChannels] = useState(initialChannels);
  const [addOpen, setAddOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [deletingChannel, setDeletingChannel] = useState<NotificationChannel | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleToggleActive(channel: NotificationChannel) {
    setToggleError(null);
    setPendingId(channel.id);
    try {
      const { data, error } = await setChannelActive(
        channel.id,
        channel.type as NotificationChannelType,
        !channel.is_active,
      );
      if (error || !data) {
        const message = error ?? "Something went wrong.";
        setToggleError(message);
        notify.error("Couldn't update channel", message);
        return;
      }
      setChannels((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      notify.success(data.is_active ? "Channel activated" : "Channel deactivated");
    } finally {
      setPendingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingChannel) return;
    setDeleteError(null);
    setPendingId(deletingChannel.id);
    try {
      const { error } = await deleteNotificationChannel(deletingChannel.id);
      if (error) {
        setDeleteError(error);
        notify.error("Couldn't delete channel", error);
        return;
      }
      setChannels((prev) => prev.filter((c) => c.id !== deletingChannel.id));
      notify.success("Channel deleted");
      setDeletingChannel(null);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {channels.length === 0
            ? "No channels yet"
            : `${channels.length} channel${channels.length === 1 ? "" : "s"}`}
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Add channel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add notification channel</DialogTitle>
              <DialogDescription>
                Configure a destination to alert when a project&apos;s status changes.
              </DialogDescription>
            </DialogHeader>
            <AddChannelForm
              onCancel={() => setAddOpen(false)}
              onSuccess={(created) => {
                setChannels((prev) => [...prev, created]);
                setAddOpen(false);
                notify.success("Channel added");
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {toggleError && <p className="text-sm text-destructive">{toggleError}</p>}

      {channels.length === 0 ? (
        <InlineEmptyState
          icon={BellIcon}
          title="No notification channels yet"
          description="Add a channel here, then attach it to a project from that project's page."
        />
      ) : (
        <div className="divide-y">
          {channels.map((channel) => {
            const Icon = CHANNEL_TYPE_ICON[channel.type as NotificationChannelType];
            return (
              <div
                key={channel.id}
                className={cn(
                  "flex items-center justify-between gap-4 py-3",
                  !channel.is_active && "opacity-60",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {NOTIFICATION_CHANNEL_TYPE_LABELS[channel.type as NotificationChannelType]}
                      </p>
                      {!channel.is_active && (
                        <Badge variant="secondary" className="text-[10px]">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {describeChannelConfig(channel)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    aria-label={channel.is_active ? "Deactivate channel" : "Activate channel"}
                    checked={channel.is_active}
                    disabled={pendingId === channel.id}
                    onCheckedChange={() => handleToggleActive(channel)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit channel"
                    onClick={() => setEditingChannel(channel)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete channel"
                    onClick={() => {
                      setDeleteError(null);
                      setDeletingChannel(channel);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingChannel} onOpenChange={(open) => !open && setEditingChannel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit {editingChannel && NOTIFICATION_CHANNEL_TYPE_LABELS[editingChannel.type as NotificationChannelType]}
            </DialogTitle>
            <DialogDescription>Replace this channel&apos;s configuration.</DialogDescription>
          </DialogHeader>
          {editingChannel && (
            <AddChannelForm
              channel={editingChannel}
              onCancel={() => setEditingChannel(null)}
              onSuccess={(updated) => {
                setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
                setEditingChannel(null);
                notify.success("Channel updated");
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingChannel}
        onOpenChange={(open) => !open && setDeletingChannel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this{" "}
              {deletingChannel &&
                NOTIFICATION_CHANNEL_TYPE_LABELS[deletingChannel.type as NotificationChannelType]}{" "}
              channel?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This also removes it from every project it&apos;s attached to. This can&apos;t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingId === deletingChannel?.id}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendingId === deletingChannel?.id}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {pendingId === deletingChannel?.id ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
