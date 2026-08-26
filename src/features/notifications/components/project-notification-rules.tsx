"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createNotificationRule,
  deleteNotificationRule,
  setNotificationRuleMuted,
  updateNotificationRule,
} from "../lib/actions";
import { describeChannelConfig } from "../lib/config-mask";
import {
  DEFAULT_ESCALATION_THRESHOLD,
  ESCALATION_THRESHOLD_INPUT_MAX,
  NOTIFICATION_CHANNEL_TYPE_LABELS,
  NOTIFIER_MAX_EFFECTIVE_ESCALATION_THRESHOLD,
} from "../constants";
import type {
  NotificationChannel,
  NotificationChannelType,
  NotificationRuleWithChannel,
} from "../types";

/**
 * Per-project notification rules panel (this issue, #45): attach/detach
 * channels, set each rule's `escalation_threshold`, toggle `digest_only`,
 * and mute/unmute -- rendered on the project detail page
 * (src/app/dashboard/projects/[id]/page.tsx). `allChannels` comes from
 * `getNotificationChannels()` (this user's full channel list, not just
 * ones already attached here) so the "attach a channel" picker can offer
 * whatever isn't attached to *this* project yet.
 */
export function ProjectNotificationRules({
  projectId,
  initialRules,
  allChannels,
}: {
  projectId: string;
  initialRules: NotificationRuleWithChannel[];
  allChannels: NotificationChannel[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [newThreshold, setNewThreshold] = useState(String(DEFAULT_ESCALATION_THRESHOLD));
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const attachedChannelIds = useMemo(
    () => new Set(rules.map((rule) => rule.channel_id)),
    [rules],
  );
  const unattachedChannels = allChannels.filter((c) => !attachedChannelIds.has(c.id));

  function setRuleError(id: string, message: string | null) {
    setRowError((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  async function handleAttach() {
    if (!selectedChannelId) return;
    setAttachError(null);
    setIsAttaching(true);
    try {
      const threshold = Number(newThreshold) || DEFAULT_ESCALATION_THRESHOLD;
      const { data, error } = await createNotificationRule(
        projectId,
        selectedChannelId,
        threshold,
      );
      if (error || !data) {
        setAttachError(error ?? "Something went wrong.");
        return;
      }
      const channel = allChannels.find((c) => c.id === selectedChannelId);
      if (channel) {
        setRules((prev) => [...prev, { ...data, notification_channels: channel }]);
      }
      setSelectedChannelId("");
      setNewThreshold(String(DEFAULT_ESCALATION_THRESHOLD));
    } finally {
      setIsAttaching(false);
    }
  }

  async function handleThresholdBlur(rule: NotificationRuleWithChannel, value: string) {
    const threshold = Number(value);
    if (!Number.isFinite(threshold) || threshold === rule.escalation_threshold) return;

    setRuleError(rule.id, null);
    setPendingId(rule.id);
    try {
      const { data, error } = await updateNotificationRule(rule.id, {
        escalation_threshold: threshold,
      });
      if (error || !data) {
        setRuleError(rule.id, error ?? "Something went wrong.");
        return;
      }
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, escalation_threshold: data.escalation_threshold } : r)),
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleDigestOnly(rule: NotificationRuleWithChannel) {
    setRuleError(rule.id, null);
    setPendingId(rule.id);
    try {
      const { data, error } = await updateNotificationRule(rule.id, {
        digest_only: !rule.digest_only,
      });
      if (error || !data) {
        setRuleError(rule.id, error ?? "Something went wrong.");
        return;
      }
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, digest_only: data.digest_only } : r)));
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleMuted(rule: NotificationRuleWithChannel) {
    setRuleError(rule.id, null);
    setPendingId(rule.id);
    try {
      const { data, error } = await setNotificationRuleMuted(rule.id, !rule.is_muted);
      if (error || !data) {
        setRuleError(rule.id, error ?? "Something went wrong.");
        return;
      }
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_muted: data.is_muted } : r)));
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(rule: NotificationRuleWithChannel) {
    setRuleError(rule.id, null);
    setPendingId(rule.id);
    try {
      const { error } = await deleteNotificationRule(rule.id);
      if (error) {
        setRuleError(rule.id, error);
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Alert a channel when this project&apos;s status changes (PRD §5.5). Changes take
          effect on the next incident dispatch -- no redeploy needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notification channels attached yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {
                        NOTIFICATION_CHANNEL_TYPE_LABELS[
                          rule.notification_channels.type as NotificationChannelType
                        ]
                      }
                    </Badge>
                    {rule.is_muted && (
                      <Badge variant="secondary" className="gap-1">
                        <BellOff className="size-3" /> Muted
                      </Badge>
                    )}
                    {!rule.notification_channels.is_active && (
                      <Badge variant="outline">Channel deactivated</Badge>
                    )}
                  </div>
                  <span className="truncate text-sm text-muted-foreground">
                    {describeChannelConfig(rule.notification_channels)}
                  </span>
                  {rowError[rule.id] && (
                    <p className="text-xs text-destructive">{rowError[rule.id]}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Field orientation="horizontal" className="w-auto gap-2">
                    <FieldLabel htmlFor={`threshold-${rule.id}`} className="text-xs">
                      Threshold
                    </FieldLabel>
                    <Input
                      id={`threshold-${rule.id}`}
                      type="number"
                      min={1}
                      max={ESCALATION_THRESHOLD_INPUT_MAX}
                      defaultValue={rule.escalation_threshold}
                      disabled={pendingId === rule.id}
                      className="w-16"
                      onBlur={(e) => handleThresholdBlur(rule, e.target.value)}
                    />
                  </Field>

                  <Field orientation="horizontal" className="w-auto gap-2">
                    <FieldLabel htmlFor={`digest-${rule.id}`} className="text-xs">
                      Digest only
                    </FieldLabel>
                    <Switch
                      id={`digest-${rule.id}`}
                      checked={rule.digest_only}
                      disabled={pendingId === rule.id}
                      onCheckedChange={() => handleToggleDigestOnly(rule)}
                    />
                  </Field>

                  <Field orientation="horizontal" className="w-auto gap-2">
                    <FieldLabel htmlFor={`mute-${rule.id}`} className="text-xs">
                      Muted
                    </FieldLabel>
                    <Switch
                      id={`mute-${rule.id}`}
                      checked={rule.is_muted}
                      disabled={pendingId === rule.id}
                      onCheckedChange={() => handleToggleMuted(rule)}
                    />
                  </Field>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove notification rule"
                    disabled={pendingId === rule.id}
                    onClick={() => handleRemove(rule)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {allChannels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No notification channels configured yet.{" "}
            <Link href="/dashboard/notifications" className="underline underline-offset-4">
              Add one
            </Link>{" "}
            to start alerting on this project&apos;s status.
          </p>
        ) : unattachedChannels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every notification channel you&apos;ve created is already attached to this
            project.
          </p>
        ) : (
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex flex-wrap items-end gap-2">
              <Field className="w-auto min-w-48">
                <FieldLabel htmlFor="attach-channel" className="text-xs">
                  Channel
                </FieldLabel>
                <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                  <SelectTrigger id="attach-channel">
                    <SelectValue placeholder="Select a channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {unattachedChannels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        {NOTIFICATION_CHANNEL_TYPE_LABELS[channel.type as NotificationChannelType]}{" "}
                        &mdash; {describeChannelConfig(channel)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className="w-20">
                <FieldLabel htmlFor="attach-threshold" className="text-xs">
                  Threshold
                </FieldLabel>
                <Input
                  id="attach-threshold"
                  type="number"
                  min={1}
                  max={ESCALATION_THRESHOLD_INPUT_MAX}
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(e.target.value)}
                />
              </Field>
              <Button
                type="button"
                disabled={!selectedChannelId || isAttaching}
                onClick={handleAttach}
              >
                <Plus className="size-4" /> Attach
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Thresholds above {NOTIFIER_MAX_EFFECTIVE_ESCALATION_THRESHOLD} currently never
              fire (a documented v1 limit of the prober&apos;s fixed incident-open threshold).
            </p>
            {attachError && <p className="text-sm text-destructive">{attachError}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
