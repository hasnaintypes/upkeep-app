/** Result of `deleteAccount` (lib/actions.ts). No `data` payload -- a
 * successful call means the account (and, via cascade, everything it
 * owns) no longer exists. */
export type DeleteAccountResult = {
  error: string | null;
};
