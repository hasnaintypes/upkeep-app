import { z } from "zod";

/** Matches `api_keys_label_not_blank` (rejects whitespace-only labels) --
 * the DB constraint is the source of truth, this is the same bound
 * surfaced early client-side, mirroring features/projects/lib/validation.ts's
 * `createProjectSchema.name`. */
export const apiKeyLabelSchema = z
  .string()
  .trim()
  .min(1, "Label is required.")
  .max(200, "Label must be 200 characters or less.");
