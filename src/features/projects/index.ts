// Public API of the projects feature. Import from "@/features/projects" instead
// of reaching into internal files (components/lib/constants/types) directly.
//
// components/ and lib/ don't exist yet -- this module is schema/scaffold-only
// for now (Phase 2, issue #12). They'll be added by the Phase 2 issues that
// need their first real component or query/action function, per this repo's
// "only add subfolders with real content" convention.

export * from "./constants";
export * from "./types";
