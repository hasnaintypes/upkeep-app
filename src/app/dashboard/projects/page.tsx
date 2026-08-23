import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getProjects, ProjectList } from "@/features/projects";

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
    <div className="flex-1 w-full flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Projects you&apos;re monitoring.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/projects/import">Import</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/projects/new">Add project</Link>
          </Button>
        </div>
      </div>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading projects...</p>
        }
      >
        <ProjectsLoader />
      </Suspense>
    </div>
  );
}
