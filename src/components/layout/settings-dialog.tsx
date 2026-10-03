"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { BellIcon, ServerIcon, SettingsIcon, ShieldIcon, UserIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
// Bypasses the "@/features/notifications" and "@/features/platform-accounts" barrels -- both
// also re-export a lib/queries.ts, which depends on next/headers and can't be bundled into this
// Client Component (same reasoning as add-project-form.tsx's own barrel bypasses).
import { ChannelList } from "@/features/notifications/components/channel-list";
import type { NotificationChannel } from "@/features/notifications/types";
import { PlatformAccountList } from "@/features/platform-accounts/components/platform-account-list";
import type {
  HostingPlatformWithTiers,
  PlatformAccountWithUsage,
} from "@/features/platform-accounts/types";
import {
  AvatarUpload,
  ChangeEmailForm,
  ChangePasswordForm,
  DeleteAccountSection,
  ProfileForm,
} from "@/features/account";
// Direct file import, not a barrel -- the dashboard feature owns this one "use server" action
// (it's the natural home for "what does the dashboard-wide settings UI need"), but this
// component itself lives outside any single feature (see this file's own doc comment), so it
// can't import the dashboard barrel without risking a cycle the way notifications's own
// project-notification-rules.tsx importing *this* file already requires avoiding.
import { getSettingsDialogData } from "@/features/dashboard/lib/actions";

type SettingsSection = "general" | "account" | "security" | "notifications" | "hosting";

const NAV_ITEMS: { value: SettingsSection; label: string; icon: typeof SettingsIcon }[] = [
  { value: "general", label: "General", icon: SettingsIcon },
  { value: "account", label: "Account", icon: UserIcon },
  { value: "security", label: "Security", icon: ShieldIcon },
  { value: "notifications", label: "Notifications", icon: BellIcon },
  { value: "hosting", label: "Hosting Accounts", icon: ServerIcon },
];

/** Opens the settings dialog, optionally jumping straight to one section -- e.g. the
 * per-project notification rules panel's "Add one" prompt opens straight to Notifications
 * instead of making the user navigate there themselves. Defaults to General when omitted. */
type OpenSettingsDialog = (section?: SettingsSection) => void;

const SettingsDialogContext = createContext<OpenSettingsDialog | null>(null);

/** Call from any Client Component under `SettingsDialogProvider` (anywhere in the dashboard --
 * it wraps the whole layout) to open the settings dialog, e.g. `useSettingsDialog()("account")`. */
export function useSettingsDialog(): OpenSettingsDialog {
  const openSettings = useContext(SettingsDialogContext);
  if (!openSettings) {
    throw new Error("useSettingsDialog must be used within a SettingsDialogProvider");
  }
  return openSettings;
}

function initialFor(label: string) {
  return label.charAt(0).toUpperCase();
}

/** Section heading matching the reference design's "Appearance" / "Voice" / "Notifications"
 * group labels -- a plain heading, not a `CardTitle`, since nothing below it is boxed. */
function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-semibold">{children}</h3>;
}

/** One label-left/control-right settings row with a bottom divider -- the reference design's
 * "Theme"/"Language"/"Log out of all devices" row shape. `divide-y` on the parent handles the
 * divider between rows; this only adds the row's own vertical padding. */
function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function GeneralSection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeading>Appearance</SectionHeading>
        <div className="divide-y">
          <SettingsRow label="Theme" description="Choose how the dashboard looks on this device.">
            <ThemeToggle />
          </SettingsRow>
        </div>
      </div>
    </div>
  );
}

function AccountSection({
  userId,
  email,
  fullName,
  username,
  avatarUrl,
  onAvatarUploaded,
  onProfileSaved,
}: {
  userId: string;
  email: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  onAvatarUploaded: (url: string) => void;
  onProfileSaved: (data: { fullName: string; username: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeading>Profile</SectionHeading>
        <div className="divide-y">
          <SettingsRow label="Profile photo" description="PNG, JPEG, or WebP, up to 10MB.">
            <AvatarUpload
              userId={userId}
              avatarUrl={avatarUrl}
              fallback={initialFor(username || fullName || email)}
              onUploaded={onAvatarUploaded}
            />
          </SettingsRow>
          <SettingsRow label="Signed in as">
            <span className="text-sm font-medium">{email}</span>
          </SettingsRow>
        </div>
        <div className="pt-4">
          <ProfileForm fullName={fullName} username={username} onSaved={onProfileSaved} />
        </div>
      </div>

      <div>
        <SectionHeading>Danger zone</SectionHeading>
        <div className="divide-y">
          <DeleteAccountSection email={email} />
        </div>
      </div>
    </div>
  );
}

function SecuritySection({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeading>Login</SectionHeading>
        <div className="divide-y">
          <SettingsRow label="Email" description={`Currently ${email}.`}>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Change email
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change email</DialogTitle>
                  <DialogDescription>
                    Update the address used to sign in and receive account notices.
                  </DialogDescription>
                </DialogHeader>
                <ChangeEmailForm currentEmail={email} />
              </DialogContent>
            </Dialog>
          </SettingsRow>
          <SettingsRow label="Password" description="Update the password used to sign in.">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Change password
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change password</DialogTitle>
                  <DialogDescription>Update the password used to sign in.</DialogDescription>
                </DialogHeader>
                <ChangePasswordForm email={email} />
              </DialogContent>
            </Dialog>
          </SettingsRow>
        </div>
      </div>
    </div>
  );
}

function NotificationsSection({ initialChannels }: { initialChannels: NotificationChannel[] }) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeading>Notifications</SectionHeading>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Discord webhooks, email addresses, and generic webhooks you can attach to projects.
        </p>
        <ChannelList initialChannels={initialChannels} />
      </div>
    </div>
  );
}

function HostingAccountsSection({
  initialAccounts,
  platforms,
}: {
  initialAccounts: PlatformAccountWithUsage[];
  platforms: HostingPlatformWithTiers[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeading>Hosting Accounts</SectionHeading>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Group projects by the real hosting account they run on, and see how much of its
          monthly free-tier usage is already allocated.
        </p>
        <PlatformAccountList initialAccounts={initialAccounts} platforms={platforms} />
      </div>
    </div>
  );
}

function SettingsContentSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

/**
 * App-level settings, as a single dialog with an internal section nav instead of the separate
 * `/dashboard/settings` and `/dashboard/account` pages those sections used to live on -- same
 * content (Appearance, Account identity/security/danger-zone, Notification channels), just
 * reachable without a navigation away from whatever page the user was on.
 *
 * Lives under `components/layout/` (cross-feature app chrome -- same convention as
 * `theme-toggle.tsx`), not inside the `dashboard` feature that renders it, deliberately: a
 * context (not a plain prop-drilled `open`/`onOpenChange` pair) because the trigger isn't only
 * `NavUser`'s dropdown (features/dashboard) -- `ProjectNotificationRules`' "Add one" prompt
 * (features/notifications), several component layers deep inside page content, needs to open
 * straight to the Notifications section too. If this lived inside the `dashboard` feature
 * (which already imports from `notifications` for the dialog's own content), `notifications`
 * importing it back would be a circular feature dependency.
 *
 * Needs no props at all: identity/profile fields, notification channels, and hosting accounts
 * are fetched lazily, on first open, via `getSettingsDialogData()`
 * (features/dashboard/lib/actions.ts) -- a "use server" action, not a `dashboard/layout.tsx`
 * server-fetch-and-pass-down the way `NavUser`'s own `email` prop works, so this provider
 * wrapping the *entire* dashboard layout doesn't force every single page load to pay for those
 * queries for visits that never open settings, and doesn't need a blocking `<Suspense>` around
 * the whole layout shell just to supply props.
 */
type DialogData = {
  userId: string;
  email: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  channels: NotificationChannel[];
  platformAccounts: PlatformAccountWithUsage[];
  hostingPlatforms: HostingPlatformWithTiers[];
};

export function SettingsDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("general");
  const [data, setData] = useState<DialogData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const openSettings: OpenSettingsDialog = (target = "general") => {
    setSection(target);
    setOpen(true);
    // Refetches on every open, not just the first -- a channel/profile/hosting-account change
    // made inside the dialog only updates that section's own local state, never this provider's
    // `data`, so a cached-after-first-load value would show stale content on the next open.
    // `data` is left in place (not cleared) while this runs, so a second-or-later open shows
    // the previous content instantly and swaps in the fresh result once it resolves, rather
    // than flashing the skeleton again every time -- only ever shown on the very first open.
    setIsLoading(true);
    void getSettingsDialogData().then((result) => {
      if (result.email && result.userId) {
        setData({
          userId: result.userId,
          email: result.email,
          fullName: result.fullName,
          username: result.username,
          avatarUrl: result.avatarUrl,
          channels: result.channels,
          platformAccounts: result.platformAccounts,
          hostingPlatforms: result.hostingPlatforms,
        });
      }
      setIsLoading(false);
    });
  };

  return (
    <SettingsDialogContext.Provider value={openSettings}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[44rem] max-h-[90vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <div className="flex flex-1 overflow-hidden">
            <nav className="flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/30 p-4">
              <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">Settings</p>
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSection(item.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    section === item.value && "bg-accent font-medium",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </button>
              ))}
            </nav>
            <div
              className={cn(
                "flex-1 overflow-y-auto p-8 transition-opacity",
                isLoading && data && "opacity-60",
              )}
            >
              {!data ? (
                <SettingsContentSkeleton />
              ) : (
                <>
                  {section === "general" && <GeneralSection />}
                  {section === "account" && (
                    <AccountSection
                      userId={data.userId}
                      email={data.email}
                      fullName={data.fullName}
                      username={data.username}
                      avatarUrl={data.avatarUrl}
                      onAvatarUploaded={(url) =>
                        setData((prev) => (prev ? { ...prev, avatarUrl: url } : prev))
                      }
                      onProfileSaved={({ fullName, username }) =>
                        setData((prev) => (prev ? { ...prev, fullName, username } : prev))
                      }
                    />
                  )}
                  {section === "security" && <SecuritySection email={data.email} />}
                  {section === "notifications" && (
                    <NotificationsSection initialChannels={data.channels} />
                  )}
                  {section === "hosting" && (
                    <HostingAccountsSection
                      initialAccounts={data.platformAccounts}
                      platforms={data.hostingPlatforms}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsDialogContext.Provider>
  );
}
