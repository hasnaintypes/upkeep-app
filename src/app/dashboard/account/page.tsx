import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangeEmailForm, ChangePasswordForm, DeleteAccountSection } from "@/features/account";

/** First letter of the email, uppercased -- same convention as the
 * sidebar's own `NavUser` avatar (nav-user.tsx), reused here so the
 * account page's identity header and the sidebar's account menu read as
 * the same person, not two different avatar styles. */
function initialFor(email: string) {
  return email.charAt(0).toUpperCase();
}

/**
 * Account page: signed-in identity (email change, password change) and
 * account deletion. Distinct from Settings (/dashboard/settings) -- this
 * is about the user themselves, not app-level configuration.
 */
async function AccountLoader() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  const email = claims?.claims?.email;
  if (!email) {
    redirect("/auth/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card variant="soft">
        <CardContent className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="text-base">{initialFor(email)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Signed in as</span>
            <span className="font-medium">{email}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change email</CardTitle>
          <CardDescription>
            Update the address used to sign in and receive account notices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm currentEmail={email} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Update the password used to sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm email={email} />
        </CardContent>
      </Card>
      <DeleteAccountSection email={email} />
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card variant="soft">
        <CardContent className="flex items-center gap-3">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-40" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-9 w-36" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountPage() {
  return (
    <div className="flex flex-1 w-full flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-sm text-muted-foreground">
          Your email, password, and account deletion.
        </p>
      </div>
      <Suspense fallback={<AccountSkeleton />}>
        <AccountLoader />
      </Suspense>
    </div>
  );
}
