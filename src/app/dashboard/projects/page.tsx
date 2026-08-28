import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { AddProjectTrigger, getProjects, ProjectList } from "@/features/projects";

async function ProjectsLoader() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const { data: projects, error } = await getProjects();

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load projects: {error}
      </p>
    );
  }

  return <ProjectList initialProjects={projects ?? []} />;
}

export default function ProjectsPage() {
  return (
    <div className="flex flex-1 w-full flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Projects you&apos;re monitoring.
          </p>
        </div>
        <Suspense fallback={<Button disabled>Add project</Button>}>
          <AddProjectTrigger trigger={<Button>Add project</Button>} />
        </Suspense>
      </div>
      <Suspense fallback={<DataTableSkeleton columnCount={7} rowCount={10} />}>
        <ProjectsLoader />
      </Suspense>
    </div>
  );
}
