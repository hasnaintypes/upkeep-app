import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { CardGridSkeleton } from "@/components/ui/loading-skeletons";
import { ChannelList, getNotificationChannels } from "@/features/notifications";

/**
 * Notification channel management page (PRD §5.5, Phase 6, #45): create,
 * edit, activate/deactivate, and delete this user's `notification_channels`
 * -- the prerequisite for the per-project notification rules panel on
 * src/app/dashboard/projects/[id]/page.tsx, which only attaches channels
 * created here.
 */
async function NotificationsLoader() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const { data: channels, error } = await getNotificationChannels();

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load notification channels: {error}
      </p>
    );
  }

  return <ChannelList initialChannels={channels ?? []} />;
}

export default function NotificationsPage() {
  return (
    <div className="flex flex-1 w-full flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Discord webhooks, email addresses, and generic webhooks you can attach to
          projects.
        </p>
      </div>
      <Suspense fallback={<CardGridSkeleton count={3} />}>
        <NotificationsLoader />
      </Suspense>
    </div>
  );
}
