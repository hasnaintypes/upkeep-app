-- JSON path/value assertion check (PRD §5.2, Phase 9, issue #59) -- a stricter sibling of #58's
-- plain keyword/content match: instead of "body contains this substring", "the value at this
-- JSON path in the parsed body equals this expected value" (e.g. `$.status` must equal "ok").
--
-- Two new nullable columns rather than reusing `expected_body_match` -- #58 already claimed that
-- column exclusively for plain substring matching (see check.ts's runHttpCheck), and a JSON path
-- assertion needs both a path *and* an expected value, which doesn't fit in a single text column
-- without an ad hoc delimiter/encoding scheme. Both null (the default for every existing project)
-- means "not configured", same backward-compatibility precedent as every other Phase 9 check-type
-- addition (#55/#56/#57/#58) -- unaffected until a project explicitly sets both.
alter table public.projects
  add column expected_json_path text,
  add column expected_json_value text;

comment on column public.projects.expected_json_path is 'Optional JSON path (e.g. "$.status") evaluated against the parsed HTTP response body (PRD §5.2, #59). Only meaningful for check_type = ''http''. Null means "not configured" -- the assertion is skipped entirely, matching every existing project''s current behavior.';
comment on column public.projects.expected_json_value is 'Expected value at expected_json_path, compared as a string against the resolved value''s String() representation (PRD §5.2, #59). Both columns must be non-null for the assertion to run -- either alone is treated as "not configured".';
