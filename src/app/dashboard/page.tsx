import { redirect } from "next/navigation";
import { InfoIcon } from "lucide-react";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";

async function AuthGuard() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return null;
}

export default function DashboardPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-12">
      <Suspense>
        <AuthGuard />
      </Suspense>
      <div className="w-full">
        <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-center">
          <InfoIcon size="16" strokeWidth={2} />
          This is a protected page that you can only see as an authenticated
          user
        </div>
      </div>
    </div>
  );
}
