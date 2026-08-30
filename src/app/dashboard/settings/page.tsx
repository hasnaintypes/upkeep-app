import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardGridSkeleton } from "@/components/ui/loading-skeletons";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ChannelList, getNotificationChannels } from "@/features/notifications";

/**
 * App-level settings page: a single scrolling page of Card sections, one
 * per settings area -- "Appearance" (theme toggle, PRD §5.6) and
 * "Notifications" (channel management, relocated from the old standalone
 * /dashboard/notifications route -- #45's `ChannelList` itself is
 * unchanged, only its consumer moved). Future settings sections should be
 * added the same way: another `Card` below this one, not a new top-level
 * route.
 */
async function NotificationsSectionLoader() {
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

export default function SettingsPage() {
  return (
    <div className="flex flex-1 w-full flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          App-level configuration for your account.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how the dashboard looks on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Discord webhooks, email addresses, and generic webhooks you can attach to
            projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<CardGridSkeleton count={3} />}>
            <NotificationsSectionLoader />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
