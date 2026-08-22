import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { AddProjectForm } from "@/features/projects";

async function AuthGuard() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return null;
}

export default function NewProjectPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-12">
      <Suspense>
        <AuthGuard />
      </Suspense>
      <div className="w-full max-w-2xl">
        <AddProjectForm />
      </div>
    </div>
  );
}
