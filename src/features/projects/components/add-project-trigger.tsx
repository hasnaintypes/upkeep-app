import type { ReactNode } from "react";
import { getExistingCollections } from "../lib/queries";
import { AddProjectSheet } from "./add-project-sheet";

/**
 * Server Component wrapper around `AddProjectSheet` for call sites that
 * don't already have a project list in memory to derive
 * `existingCollections` from (the sidebar's quick-add button, the
 * dashboard/projects-page header buttons) -- fetches it itself so every
 * "Add project" entry point gets the same Collection-field autocomplete.
 * Both call sites are fine falling back to `AddProjectSheet`'s default
 * `router.refresh()` behavior on success (neither holds its own local
 * project-list state to update directly), so `onSuccess` isn't threaded
 * through here.
 *
 * `ProjectList`'s own empty-state button intentionally does NOT use this:
 * it already has the full project list client-side and derives collections
 * from it directly, so wrapping it here would just be a redundant extra
 * round trip.
 *
 * Rendering this from a Client Component (e.g. `nav-main.tsx`) isn't
 * possible directly -- Client Components can't import a Server Component,
 * only receive one's rendered output via a prop from a Server Component
 * ancestor. Wrap this in `<Suspense>` at the call site either way, since it
 * does a live Supabase fetch (see AGENTS.md's Gotchas on `cacheComponents`).
 */
export async function AddProjectTrigger({ trigger }: { trigger: ReactNode }) {
  const { data: existingCollections } = await getExistingCollections();

  return <AddProjectSheet trigger={trigger} existingCollections={existingCollections ?? []} />;
}
