/** Supabase table name for platform accounts, for use in query/mutation builders. */
export const PLATFORM_ACCOUNTS_TABLE = "platform_accounts" as const;

/** Mirrors `platform_accounts.assumed_ms_per_request`'s DB default (see
 * supabase/migrations/*_create_platform_accounts_table.sql). */
export const PLATFORM_ACCOUNT_DEFAULTS = {
  assumedMsPerRequest: 300,
} as const;
