import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { AddProjectForm, getProjects } from "@/features/projects";

async function NewProjectFormLoader() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  const { data: projects } = await getProjects();
  const existingCollections = Array.from(
    new Set(
      (projects ?? [])
        .map((project) => project.collection)
        .filter((collection): collection is string => !!collection?.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return <AddProjectForm existingCollections={existingCollections} />;
}

export default function NewProjectPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-12">
      <div className="w-full max-w-2xl">
        <Suspense>
          <NewProjectFormLoader />
        </Suspense>
      </div>
    </div>
  );
}
