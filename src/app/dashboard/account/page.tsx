import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangeEmailForm, ChangePasswordForm, DeleteAccountSection } from "@/features/account";

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
      <Card>
        <CardHeader>
          <CardTitle>Change email</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm currentEmail={email} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
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
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
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
